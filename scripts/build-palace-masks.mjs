import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE = path.join(ROOT, "assets-source", "potala-interior");

/**
 * O facho de luz do vão da porta.
 *
 * Nenhuma outra área da cena junta brilho alto com profundidade baixa: as
 * colunas são claras mas próximas, o chão é claro mas próximo, e o fundo do
 * corredor é distante mas escuro. O cruzamento das duas condições isola o vão
 * sem máscara pintada à mão — mesma técnica da máscara de céu da Chegada.
 */
export const LIGHT_MASK_SETTINGS = {
  minLuma: 150,
  maxDepth: 0.22,
  feather: 6,
};

export async function buildLightMask({
  sourceDir = SOURCE,
  settings = LIGHT_MASK_SETTINGS,
  outputFile = path.join(SOURCE, "potala-interior-light-mask.png"),
} = {}) {
  const plate = await sharp(path.join(sourceDir, "potala-interior-plate-1024x576.png"))
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const depth = await sharp(path.join(sourceDir, "potala-interior-depth-1024x576.png"))
    .greyscale().raw().toBuffer({ resolveWithObject: true });

  const { width, height, channels } = plate.info;
  if (depth.info.width !== width || depth.info.height !== height) {
    throw new Error("a profundidade do palácio não compartilha a dimensão da placa");
  }

  const mask = Buffer.alloc(width * height);
  let covered = 0;
  for (let i = 0; i < width * height; i += 1) {
    const luma = 0.299 * plate.data[i * channels]
      + 0.587 * plate.data[i * channels + 1]
      + 0.114 * plate.data[i * channels + 2];
    const near = depth.data[i] / 255;
    const lit = luma >= settings.minLuma && near <= settings.maxDepth;
    mask[i] = lit ? 255 : 0;
    if (lit) covered += 1;
  }

  await sharp(mask, { raw: { width, height, channels: 1 } })
    .blur(settings.feather)
    .toColourspace("b-w")
    .png()
    .toFile(outputFile);

  return { width, height, coverage: covered / (width * height), outputFile };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);

if (isMain) {
  const result = await buildLightMask();
  console.log(`Facho do palácio: ${result.width}×${result.height} — cobertura ${(result.coverage * 100).toFixed(1)}%`);
}
