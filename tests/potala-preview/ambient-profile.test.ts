import assert from "node:assert/strict";
import test from "node:test";
import { selectAmbientProfile } from "../../features/potala-journey/lib/ambient-profile";

test("seleciona perfis conservadores com DPR e orcamentos definidos", () => {
  assert.deepEqual(selectAmbientProfile({ width: 1440, devicePixelRatio: 2, cores: 12, mobile: false, reducedMotion: false }), { id: "high", pixelRatio: 2, dust: 120, motes: 30, foreground: 7, fogLayers: 3, shafts: 2, parallax: true, fps: 60 });
  assert.deepEqual(selectAmbientProfile({ width: 1024, devicePixelRatio: 1, cores: 4, mobile: false, reducedMotion: false }), { id: "medium", pixelRatio: 1.5, dust: 70, motes: 16, foreground: 4, fogLayers: 2, shafts: 1, parallax: true, fps: 45 });
  assert.deepEqual(selectAmbientProfile({ width: 390, devicePixelRatio: 3, cores: 8, mobile: true, reducedMotion: false }), { id: "low", pixelRatio: 1, dust: 35, motes: 8, foreground: 2, fogLayers: 1, shafts: 1, parallax: false, fps: 30 });
});

test("reduced motion retorna composição estática sem loop ambiental", () => {
  assert.equal(selectAmbientProfile({ width: 1440, devicePixelRatio: 2, cores: 12, mobile: false, reducedMotion: true }).fps, 0);
});
