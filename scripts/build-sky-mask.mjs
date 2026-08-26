import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE = path.join(ROOT, "assets-source", "arrival-v2");

// A serra distante e o céu compartilham profundidade ~0.04 no mapa de depth e
// energia de textura equivalente (a névoa atmosférica alisa a rocha), então nem
// profundidade nem alta frequência encontram a cumeada. O que separa os dois é a
// luminância relativa dentro da coluna: o céu clareia de forma monótona até o
// horizonte e a serra quebra essa subida. A máscara resultante é o recorte que
// falta para as nuvens passarem atrás das montanhas e à frente do sol.
export const SKY_MASK_SETTINGS = {
  maxDepth: 0.22, // acima disso é copa, templo ou primeiro plano
  dropLimit: 28, // queda de luminância que denuncia a cumeada
  reference: 8, // linhas de céu que formam a referência móvel de brilho
  searchTop: 0.02,
  searchBottom: 0.42, // o horizonte mais baixo da placa; abaixo disso é mata
  sustain: 3,
  medianSpan: 90, // colunas de cada lado que definem o horizonte consensual
  medianTolerance: 0.02, // fração da altura que uma coluna pode furar esse consenso
  columnSmoothing: 5,
  featherPx: 4,
};

function readLuminance({ data, width, height, channels }) {
  const luminance = new Float32Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    luminance[i] =
      0.299 * data[i * channels] + 0.587 * data[i * channels + 1] + 0.114 * data[i * channels + 2];
  }
  return luminance;
}

/**
 * Para cada coluna, desce comparando cada linha com a média das últimas linhas
 * aceitas como céu. A primeira queda sustentada abaixo dessa referência é o topo
 * da serra. A referência é móvel, e não o brilho máximo da coluna, para que o
 * disco do sol não deixe todo o resto do céu parecendo uma queda. Linhas de copa
 * e templo são puladas, não encerram a busca, porque o céu aberto reaparece
 * abaixo das folhas.
 */
export function detectRidge({ luminance, depth, width, height, settings = SKY_MASK_SETTINGS }) {
  const top = Math.round(height * settings.searchTop);
  const bottom = Math.round(height * settings.searchBottom);
  const raw = new Float32Array(width);

  for (let x = 0; x < width; x += 1) {
    const trail = [];
    let run = 0;
    let ridge = bottom;

    for (let y = top; y <= bottom; y += 1) {
      const index = y * width + x;
      if (depth[index] >= settings.maxDepth) continue;

      const lum = luminance[index];
      if (trail.length < settings.reference) {
        trail.push(lum);
        continue;
      }

      const reference = trail.reduce((total, value) => total + value, 0) / trail.length;
      if (reference - lum > settings.dropLimit) {
        run += 1;
        if (run >= settings.sustain) {
          ridge = y - settings.sustain;
          break;
        }
      } else {
        run = 0;
        trail.push(lum);
        trail.shift();
      }
    }
    raw[x] = ridge;
  }

  // Nas colunas atravessadas pelo sol a luminância nunca cai, e a cumeada
  // escorre até o fundo da busca. A mediana larga descreve o horizonte que as
  // colunas vizinhas concordam em ver; nenhuma coluna pode furar isso por muito.
  const clamped = new Float32Array(width);
  const span = settings.medianSpan;
  const tolerance = height * settings.medianTolerance;
  for (let x = 0; x < width; x += 1) {
    const window = [];
    for (let k = -span; k <= span; k += 1) {
      const sx = x + k;
      if (sx < 0 || sx >= width) continue;
      window.push(raw[sx]);
    }
    window.sort((a, b) => a - b);
    const median = window[Math.floor(window.length / 2)];
    clamped[x] = Math.min(raw[x], median + tolerance);
  }

  const smooth = new Float32Array(width);
  const radius = settings.columnSmoothing;
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    let count = 0;
    for (let k = -radius; k <= radius; k += 1) {
      const sx = x + k;
      if (sx < 0 || sx >= width) continue;
      sum += clamped[sx];
      count += 1;
    }
    smooth[x] = sum / count;
  }
  return smooth;
}

export async function buildSkyMask({
  sourceDir = SOURCE,
  settings = SKY_MASK_SETTINGS,
  outputFile = path.join(SOURCE, "arrival-sky-mask.png"),
} = {}) {
  const masterRaw = await sharp(path.join(sourceDir, "arrival-master.png"))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const depthRaw = await sharp(path.join(sourceDir, "arrival-depth.png"))
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = masterRaw.info;
  if (depthRaw.info.width !== width || depthRaw.info.height !== height) {
    throw new Error("arrival-depth.png não compartilha a dimensão da master");
  }

  const luminance = readLuminance({ ...masterRaw.info, data: masterRaw.data });
  const depth = new Float32Array(width * height);
  for (let i = 0; i < depth.length; i += 1) depth[i] = depthRaw.data[i] / 255;

  const ridge = detectRidge({ luminance, depth, width, height, settings });

  const mask = Buffer.alloc(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      mask[index] = y < ridge[x] && depth[index] < settings.maxDepth ? 255 : 0;
    }
  }

  await sharp(mask, { raw: { width, height, channels: 1 } })
    .blur(settings.featherPx)
    .toColourspace("b-w")
    .png()
    .toFile(outputFile);

  let covered = 0;
  for (let i = 0; i < mask.length; i += 1) if (mask[i] > 127) covered += 1;

  return {
    width,
    height,
    outputFile,
    coverage: covered / (width * height),
    ridgeTop: Math.min(...ridge) / height,
    ridgeBottom: Math.max(...ridge) / height,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);

if (isMain) {
  const result = await buildSkyMask();
  console.log(
    `Máscara de céu: ${result.width}×${result.height} — cobertura ${(result.coverage * 100).toFixed(1)}% ` +
      `— cumeada entre ${result.ridgeTop.toFixed(3)} e ${result.ridgeBottom.toFixed(3)}`,
  );
}
