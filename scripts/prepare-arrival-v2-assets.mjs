import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE = path.join(ROOT, "assets-source", "arrival-v2");
const OUTPUT = path.join(ROOT, "outputs", "media");
const DESKTOP_OUTPUT_SIZE = { width: 2048, height: 1152 };

const FILES = [
  { source: "arrival-master.png", output: "chegada-v2-master.webp", kind: "master" },
  { source: "arrival-depth.png", output: "chegada-v2-depth.webp", kind: "map" },
  { source: "arrival-water-mask.png", output: "chegada-v2-water-mask.webp", kind: "map" },
  { source: "arrival-waterfall-mask.png", output: "chegada-v2-waterfall-mask.webp", kind: "map" },
  { source: "arrival-canopy-mask.png", output: "chegada-v2-canopy-mask.webp", kind: "map" },
  { source: "arrival-mist-mask.png", output: "chegada-v2-mist-mask.webp", kind: "map" },
  { source: "arrival-canopy-overlay.png", output: "chegada-v2-canopy-overlay.webp", kind: "overlay" },
];

export async function inspectArrivalSource(file) {
  const info = await sharp(file).metadata();
  if (!info.width || !info.height) {
    throw new Error(`${file} não possui dimensão válida`);
  }
  return { width: info.width, height: info.height, format: info.format };
}

export async function prepareArrivalV2Assets({ sourceDir = SOURCE, outputDir = OUTPUT } = {}) {
  const prepared = [];
  let masterSize = null;

  for (const file of FILES) {
    const input = path.join(sourceDir, file.source);
    try {
      await stat(input);
    } catch {
      throw new Error(`Asset V2 ausente: ${file.source}`);
    }
    const meta = await inspectArrivalSource(input);
    if (!masterSize) masterSize = { width: meta.width, height: meta.height };
    if (meta.width !== masterSize.width || meta.height !== masterSize.height) {
      throw new Error(
        `${file.source} está ${meta.width}×${meta.height}, mas a master é ${masterSize.width}×${masterSize.height}. Não redimensionar mapas desalinhados.`,
      );
    }
    prepared.push({ ...file, input, meta });
  }

  await mkdir(outputDir, { recursive: true });

  for (const file of prepared) {
    const output = path.join(outputDir, file.output);
    const pipeline = sharp(file.input).resize({
      ...DESKTOP_OUTPUT_SIZE,
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    });
    if (file.kind === "master" || file.kind === "overlay") {
      await pipeline
        .sharpen({ sigma: 0.65 })
        .webp({ quality: 90, smartSubsample: true, effort: 5 })
        .toFile(output);
    } else {
      await pipeline.webp({ lossless: true, effort: 4 }).toFile(output);
    }
  }

  return {
    plate: { ...DESKTOP_OUTPUT_SIZE },
    files: prepared.map((file) => file.output),
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);

if (isMain) {
  const result = await prepareArrivalV2Assets();
  console.log(
    `Arrival V2 pronto: ${result.plate.width}×${result.plate.height} → ${result.files.join(", ")}`,
  );
}
