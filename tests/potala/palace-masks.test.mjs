import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { buildLightMask, LIGHT_MASK_SETTINGS } from "../../scripts/build-palace-masks.mjs";

test("os limiares ficam explícitos para ajuste futuro", () => {
  assert.equal(typeof LIGHT_MASK_SETTINGS.minLuma, "number");
  assert.ok(LIGHT_MASK_SETTINGS.maxDepth <= 0.3);
});

test("a máscara isola o vão da porta e ignora colunas e chão", async () => {
  const outputFile = "assets-source/potala-interior/potala-interior-light-mask.png";
  const result = await buildLightMask({ outputFile });

  assert.equal(result.width, 1024);
  assert.equal(result.height, 576);
  assert.ok(result.coverage > 0.01 && result.coverage < 0.25, `cobertura ${result.coverage}`);

  const mask = await sharp(outputFile).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = mask.info;
  const at = (u, v) => mask.data[Math.round(v * (height - 1)) * width + Math.round(u * (width - 1))] / 255;

  // Sem estes limites o facho vaza para a pedra e a poeira aparece onde não há luz.
  assert.ok(at(0.5, 0.45) > 0.6, "o vão da porta precisa entrar na máscara");
  assert.ok(at(0.06, 0.6) < 0.2, "a coluna próxima não pode entrar");
  assert.ok(at(0.5, 0.95) < 0.3, "o chão em primeiro plano não pode entrar");
});
