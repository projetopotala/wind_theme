// Pipeline dos assets do interior do Palácio Potala.
// Espelha scripts/prepare-arrival-v2-assets.mjs (o pipeline irmão da Chegada): mesma
// resolução de saída, mesmo kernel de reamostragem e a mesma recusa dura quando um mapa
// não compartilha a dimensão da placa — um mapa de profundidade fora de registro desloca
// o parallax no motor sem lançar erro nenhum, então a checagem precisa acontecer aqui.
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE = path.join(ROOT, "assets-source", "potala-interior");
const OUTPUT = path.join(ROOT, "outputs", "media");
const OUTPUT_SIZE = { width: 2048, height: 1152 };

const FILES = [
  { source: "potala-interior-plate-1024x576.png", output: "palacio-master.webp", kind: "master" },
  { source: "potala-interior-depth-1024x576.png", output: "palacio-depth.webp", kind: "map" },
];

export async function inspectPalaceSource(file) {
  const info = await sharp(file).metadata();
  if (!info.width || !info.height) {
    throw new Error(`${file} não possui dimensão válida`);
  }
  return { width: info.width, height: info.height, format: info.format };
}

export async function preparePalaceAssets({ sourceDir = SOURCE, outputDir = OUTPUT } = {}) {
  const prepared = [];
  let plateSize = null;

  // Primeiro passe: só inspeciona e valida. Nada é escrito em disco até que todos os
  // arquivos de entrada existam e compartilhem a mesma dimensão da placa.
  for (const file of FILES) {
    const input = path.join(sourceDir, file.source);
    try {
      await stat(input);
    } catch {
      throw new Error(`Asset do palácio ausente: ${file.source}`);
    }
    const meta = await inspectPalaceSource(input);
    if (!plateSize) plateSize = { width: meta.width, height: meta.height };
    if (meta.width !== plateSize.width || meta.height !== plateSize.height) {
      throw new Error(
        `${file.source} está ${meta.width}×${meta.height}, mas a placa é ${plateSize.width}×${plateSize.height}. `
          + "Mapas desalinhados deslocam a profundidade e quebram o parallax.",
      );
    }
    prepared.push({ ...file, input });
  }

  await mkdir(outputDir, { recursive: true });

  for (const file of prepared) {
    const pipeline = sharp(file.input).resize({
      ...OUTPUT_SIZE,
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    });
    const output = path.join(outputDir, file.output);
    if (file.kind === "master") {
      // sharpen só na placa: o reamostro por lanczos3 amolece bordas finas (talha,
      // colunas), e é a única camada que o visitante vê em cores — os mapas de
      // profundidade são dados de posicionamento, não imagem, então sharpen neles
      // introduziria ruído falso na leitura de profundidade.
      await pipeline.sharpen({ sigma: 0.6 }).webp({ quality: 90, smartSubsample: true, effort: 5 }).toFile(output);
    } else {
      // Mapas gravados sem perdas: compressão com perdas cria bandas na profundidade,
      // e o motor lê o mapa como dado (gradiente de cinza), não como imagem decorativa.
      await pipeline.webp({ lossless: true, effort: 4 }).toFile(output);
    }
  }

  return { plate: { ...OUTPUT_SIZE }, files: prepared.map((file) => file.output) };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);

if (isMain) {
  const result = await preparePalaceAssets();
  console.log(`Palácio pronto: ${result.plate.width}×${result.plate.height} → ${result.files.join(", ")}`);
}
