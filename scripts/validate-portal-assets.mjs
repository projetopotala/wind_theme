import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import sharp from "sharp";

const budgets = [
  { file: "outputs/media/chegada-landscape.webp", maximum: 1_800_000 },
  { file: "outputs/media/chegada-depth.webp", maximum: 900_000 },
  { file: "outputs/media/chegada-landscape-mobile.webp", maximum: 1_200_000, width: 1440, height: 2160 },
  { file: "outputs/media/chegada-depth-mobile.webp", maximum: 700_000, width: 1440, height: 2160 },
  { file: "outputs/media/chegada-v2-master.webp", maximum: 2_200_000, width: 2048, height: 1152 },
  { file: "outputs/media/chegada-v2-depth.webp", maximum: 1_000_000, width: 2048, height: 1152 },
  { file: "outputs/media/chegada-v2-water-mask.webp", maximum: 700_000, width: 2048, height: 1152 },
  { file: "outputs/media/chegada-v2-waterfall-mask.webp", maximum: 700_000, width: 2048, height: 1152 },
  { file: "outputs/media/chegada-v2-canopy-mask.webp", maximum: 900_000, width: 2048, height: 1152 },
  { file: "outputs/media/chegada-v2-mist-mask.webp", maximum: 900_000, width: 2048, height: 1152 },
  { file: "outputs/media/chegada-v2-sky-mask.webp", maximum: 700_000, width: 2048, height: 1152 },
  { file: "outputs/media/chegada-v2-canopy-overlay.webp", maximum: 1_500_000, width: 2048, height: 1152 },
  { file: "outputs/media/journey-quem-somos.webp", maximum: 900_000 },
  { file: "outputs/media/journey-cuidado.webp", maximum: 900_000 },
  { file: "outputs/media/journey-cultura.webp", maximum: 900_000 },
  { file: "outputs/media/journey-inspiracao.webp", maximum: 900_000 },
  { file: "outputs/media/palacio-master.webp", maximum: 2_200_000, width: 2048, height: 1152 },
  { file: "outputs/media/palacio-depth.webp", maximum: 1_200_000, width: 2048, height: 1152 },
  { file: "outputs/media/palacio-light-mask.webp", maximum: 700_000, width: 2048, height: 1152 },
];

for (const asset of budgets) {
  const info = await stat(asset.file);
  assert.ok(info.size > 10_000, asset.file + " está vazio ou inválido");
  assert.ok(info.size <= asset.maximum, asset.file + " excede " + asset.maximum + " bytes");
  if (asset.width && asset.height) {
    const meta = await sharp(asset.file).metadata();
    assert.equal(meta.width, asset.width, asset.file + " largura inesperada");
    assert.equal(meta.height, asset.height, asset.file + " altura inesperada");
  }
}

console.log("Assets essenciais da Travessia dentro do orçamento.");
