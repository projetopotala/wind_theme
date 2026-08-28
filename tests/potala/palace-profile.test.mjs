import assert from "node:assert/strict";
import test from "node:test";
import { PALACE_PROFILE, selectPalaceAssets } from "../../outputs/js/palacio/palace-profile.js";

test("o perfil aponta para os assets do palácio em 2K", () => {
  const assets = selectPalaceAssets();
  assert.match(assets.imageUrl, /palacio-master\.webp$/);
  assert.match(assets.depthUrl, /palacio-depth\.webp$/);
  assert.deepEqual(PALACE_PROFILE.plate, { width: 2048, height: 1152 });
});

test("cena interior não carrega céu, água nem cachoeira", () => {
  const assets = selectPalaceAssets();
  // Sem máscara de céu o shader zera a nuvem sozinho, via uHasSkyMask.
  assert.equal(assets.skyMaskUrl, "");
  assert.equal(assets.waterMaskUrl, "");
  assert.equal(assets.waterfallMaskUrl, "");
});

test("o sol é zerado porque o termo de céu do shader acende o rodapé", () => {
  assert.equal(PALACE_PROFILE.world.sun, 0);
  assert.ok(PALACE_PROFILE.world.mist > 0, "o facho precisa de névoa para aparecer");
});

test("o movimento herda a Chegada mas sem nuvem", () => {
  assert.equal(PALACE_PROFILE.motion.cloudAmount, 0);
  assert.ok(PALACE_PROFILE.motion.nearParallax > 0);
});
