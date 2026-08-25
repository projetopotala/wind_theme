import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import {
  inspectArrivalSource,
  prepareArrivalV2Assets,
} from "../../scripts/prepare-arrival-v2-assets.mjs";

const SOURCE = path.resolve("assets-source/arrival-v2");

test("os assets V2 da Chegada compartilham a mesma dimensão da master", async () => {
  const master = await inspectArrivalSource(path.join(SOURCE, "arrival-master.png"));
  assert.equal(master.width, 1024);
  assert.equal(master.height, 576);

  for (const file of [
    "arrival-depth.png",
    "arrival-water-mask.png",
    "arrival-waterfall-mask.png",
    "arrival-canopy-mask.png",
    "arrival-mist-mask.png",
    "arrival-canopy-overlay.png",
  ]) {
    const meta = await inspectArrivalSource(path.join(SOURCE, file));
    assert.equal(meta.width, master.width, file);
    assert.equal(meta.height, master.height, file);
  }
});

test("o pipeline recusa máscara com dimensão diferente da master", async () => {
  const dir = await mkdir(path.join(os.tmpdir(), `arrival-v2-${Date.now()}`), { recursive: true });
  try {
    const names = [
      "arrival-master.png",
      "arrival-depth.png",
      "arrival-water-mask.png",
      "arrival-waterfall-mask.png",
      "arrival-canopy-mask.png",
      "arrival-mist-mask.png",
      "arrival-canopy-overlay.png",
    ];
    for (const name of names) {
      const size = name === "arrival-water-mask.png" ? { width: 800, height: 450 } : { width: 64, height: 36 };
      await sharp({
        create: { ...size, channels: 3, background: name.includes("master") ? "#334" : "#000" },
      }).png().toFile(path.join(dir, name));
    }
    await assert.rejects(
      () => prepareArrivalV2Assets({ sourceDir: dir, outputDir: path.join(dir, "out") }),
      /desalinhados|está 800/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("o pipeline recusa asset inexistente e arquivo vazio", async () => {
  const dir = await mkdir(path.join(os.tmpdir(), `arrival-v2-missing-${Date.now()}`), { recursive: true });
  try {
    await assert.rejects(
      () => prepareArrivalV2Assets({ sourceDir: dir, outputDir: path.join(dir, "out") }),
      /ausente/,
    );
    await writeFile(path.join(dir, "arrival-master.png"), "");
    await assert.rejects(
      () => inspectArrivalSource(path.join(dir, "arrival-master.png")),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
