import assert from "node:assert/strict";
import { stat } from "node:fs/promises";

const budgets = new Map([
  ["outputs/media/chegada-landscape.webp", 1_800_000],
  ["outputs/media/chegada-depth.webp", 900_000],
  ["outputs/media/chegada-landscape-mobile.webp", 1_200_000],
  ["outputs/media/journey-quem-somos.webp", 900_000],
  ["outputs/media/journey-cuidado.webp", 900_000],
  ["outputs/media/journey-cultura.webp", 900_000],
  ["outputs/media/journey-inspiracao.webp", 900_000],
]);

for (const [file, maximum] of budgets) {
  const info = await stat(file);
  assert.ok(info.size > 10_000, file + " está vazio ou inválido");
  assert.ok(info.size <= maximum, file + " excede " + maximum + " bytes");
}

console.log("Assets essenciais da Travessia dentro do orçamento.");
