import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import sharp from "sharp";

const assets = [
  ["../../outputs/media/home-travessia.webp", 2048, 1152, 1_800_000],
  ["../../outputs/media/home-travessia-mobile.webp", 1080, 1440, 1_300_000],
];

for (const [relativePath, width, height, maximum] of assets) {
  test(relativePath, async () => {
    const url = new URL(relativePath, import.meta.url);
    const info = await stat(url);
    const metadata = await sharp(fileURLToPath(url)).metadata();

    assert.equal(metadata.width, width);
    assert.equal(metadata.height, height);
    assert.ok(info.size <= maximum, `${relativePath} excedeu ${maximum} bytes`);
  });
}
