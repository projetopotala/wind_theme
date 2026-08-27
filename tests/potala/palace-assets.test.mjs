import assert from "node:assert/strict";
import { mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import {
  inspectPalaceSource,
  preparePalaceAssets,
} from "../../scripts/prepare-palace-assets.mjs";

const SOURCE = path.resolve("assets-source/potala-interior");

test("placa e profundidade do palácio compartilham a dimensão", async () => {
  const plate = await inspectPalaceSource(path.join(SOURCE, "potala-interior-plate-1024x576.png"));
  const depth = await inspectPalaceSource(path.join(SOURCE, "potala-interior-depth-1024x576.png"));
  assert.equal(plate.width, 1024);
  assert.equal(plate.height, 576);
  assert.equal(depth.width, plate.width);
  assert.equal(depth.height, plate.height);
});

test("o pipeline entrega as camadas em 2K alinhado", async () => {
  const outputDir = path.join(os.tmpdir(), `palace-${Date.now()}`);
  await mkdir(outputDir, { recursive: true });
  try {
    const result = await preparePalaceAssets({ outputDir });
    assert.deepEqual(result.plate, { width: 2048, height: 1152 });
    for (const file of result.files) {
      // Lê o arquivo para um buffer antes de inspecionar (em vez de passar o caminho
      // direto para sharp): no Windows, sharp mantém um descritor aberto sobre o
      // caminho até a coleta de lixo, e o rm() do finally abaixo colide com esse
      // descritor (EBUSY) antes que o SO libere o arquivo. Mesmo padrão já usado em
      // tests/potala/arrival-v2-assets.test.mjs para o pipeline irmão.
      const meta = await sharp(await readFile(path.join(outputDir, file))).metadata();
      assert.equal(meta.width, 2048, file);
      assert.equal(meta.height, 1152, file);
    }
  } finally {
    await rm(outputDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 80 });
  }
});

test("o pipeline recusa profundidade desalinhada da placa", async () => {
  const dir = path.join(os.tmpdir(), `palace-bad-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  try {
    await sharp({ create: { width: 1024, height: 576, channels: 3, background: "#333" } })
      .png().toFile(path.join(dir, "potala-interior-plate-1024x576.png"));
    await sharp({ create: { width: 800, height: 450, channels: 3, background: "#000" } })
      .png().toFile(path.join(dir, "potala-interior-depth-1024x576.png"));
    await assert.rejects(
      () => preparePalaceAssets({ sourceDir: dir, outputDir: path.join(dir, "out") }),
      /desalinhad|está 800/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 80 });
  }
});
