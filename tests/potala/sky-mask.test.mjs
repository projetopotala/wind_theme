import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { detectRidge, SKY_MASK_SETTINGS } from "../../scripts/build-sky-mask.mjs";

// A busca vai de searchTop a searchBottom (2% a 42% da altura), então as placas
// sintéticas precisam ser altas o bastante para a queda cair dentro da janela.
const WIDTH = 8;
const HEIGHT = 200;
const DROP_ROW = 60;

function synthetic({ canopyRows = 0 } = {}) {
  const luminance = new Float32Array(WIDTH * HEIGHT);
  const depth = new Float32Array(WIDTH * HEIGHT);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const canopy = y < canopyRows;
      luminance[y * WIDTH + x] = canopy ? 30 : y < DROP_ROW ? 100 + y * 0.5 : 60;
      depth[y * WIDTH + x] = canopy ? 0.7 : 0.05;
    }
  }
  return { luminance, depth, width: WIDTH, height: HEIGHT };
}

test("a cumeada é encontrada na queda de luminância da coluna", () => {
  const ridge = detectRidge(synthetic());
  for (let x = 0; x < WIDTH; x += 1) {
    assert.ok(
      Math.abs(ridge[x] - DROP_ROW) <= 4,
      `coluna ${x} marcou a cumeada em ${ridge[x]}, esperado perto de ${DROP_ROW}`,
    );
  }
});

test("linhas de copa não encerram a busca pelo céu aberto abaixo delas", () => {
  const ridge = detectRidge(synthetic({ canopyRows: 20 }));
  for (let x = 0; x < WIDTH; x += 1) {
    assert.ok(
      ridge[x] > 45,
      `a copa encerrou a coluna ${x} cedo demais (${ridge[x]})`,
    );
  }
});

test("a máscara publicada separa céu de serra, templo e copa", async () => {
  const file = "outputs/media/chegada-v2-sky-mask.webp";
  const image = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = image.info;

  assert.equal(width, 2048);
  assert.equal(height, 1152);

  const at = (u, v) => image.data[Math.round(v * (height - 1)) * width + Math.round(u * (width - 1))] / 255;

  // Sem estes limites a nuvem passaria por cima da montanha e perderia a
  // leitura de profundidade que a cena inteira depende.
  assert.ok(at(0.58, 0.10) > 0.9, "céu aberto deveria receber nuvem");
  assert.ok(at(0.5, 0.16) > 0.9, "céu aberto deveria receber nuvem");
  assert.ok(at(0.62, 0.3) < 0.1, "a serra não pode receber nuvem");
  assert.ok(at(0.55, 0.32) < 0.15, "a serra não pode receber nuvem");
  assert.ok(at(0.88, 0.22) < 0.1, "o templo não pode receber nuvem");
  assert.ok(at(0.2, 0.1) < 0.1, "a copa da árvore não pode receber nuvem");
  assert.ok(at(0.4, 0.8) < 0.1, "o primeiro plano não pode receber nuvem");

  let covered = 0;
  for (let i = 0; i < image.data.length; i += 1) if (image.data[i] > 127) covered += 1;
  const coverage = covered / (width * height);
  assert.ok(coverage > 0.08 && coverage < 0.3, `cobertura de céu fora do esperado: ${coverage}`);
});

test("os limiares ficam explícitos para ajuste futuro", () => {
  assert.equal(SKY_MASK_SETTINGS.maxDepth, 0.22);
  assert.ok(SKY_MASK_SETTINGS.searchBottom <= 0.5);
});
