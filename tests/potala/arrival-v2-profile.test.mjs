import assert from "node:assert/strict";
import test from "node:test";
import {
  ARRIVAL_SCENE_PROFILES,
  computeArrivalQuality,
  computeCameraZoom,
  computeParallaxAmplitude,
  isArrivalDebugEnabled,
  isPortraitMobile,
  selectArrivalAssets,
  selectArrivalProfile,
} from "../../outputs/js/chegada/arrival-scene-profile.js";

test("o desktop usa o profile V2 com plate explícita da master", () => {
  const profile = selectArrivalProfile({ width: 1280, height: 720 });
  assert.equal(profile.id, "desktop-v2");
  assert.equal(profile.plate.width, 1024);
  assert.equal(profile.plate.height, 576);
  assert.notEqual(profile.plate.width, profile.assets.waterMaskUrl ? 16 : 9);
});

test("a seleção de assets desktop aponta para os mapas V2 alinhados", () => {
  const assets = selectArrivalAssets({ width: 1440, height: 900 });
  assert.equal(assets.imageUrl, "media/chegada-v2-master.webp");
  assert.equal(assets.depthUrl, "media/chegada-v2-depth.webp");
  assert.equal(assets.waterMaskUrl, "media/chegada-v2-water-mask.webp");
  assert.equal(assets.waterfallMaskUrl, "media/chegada-v2-waterfall-mask.webp");
  assert.equal(assets.canopyMaskUrl, "media/chegada-v2-canopy-mask.webp");
  assert.equal(assets.mistMaskUrl, "media/chegada-v2-mist-mask.webp");
  assert.equal(assets.plate.width, 1024);
  assert.equal(assets.plate.height, 576);
});

test("portrait mobile continua no profile legado sem inferir plate pela água", () => {
  assert.equal(isPortraitMobile({ width: 390, height: 844 }), true);
  const assets = selectArrivalAssets({ width: 390, height: 844 });
  assert.equal(assets.imageUrl, "media/chegada-landscape-mobile.webp");
  assert.equal(assets.depthUrl, "media/chegada-depth-mobile.webp");
  assert.equal(assets.waterMaskUrl, "");
  assert.equal(assets.waterfallMaskUrl, "");
  assert.equal(assets.plate.width, 9);
  assert.equal(assets.plate.height, 16);
  assert.ok(assets.plate.width !== Boolean(assets.waterUrl));
});

test("o profile de qualidade limita o DPR sem user-agent", () => {
  const desktop = computeArrivalQuality({
    width: 1920,
    height: 1080,
    devicePixelRatio: 3,
    profile: ARRIVAL_SCENE_PROFILES.desktopV2,
  });
  const mobile = computeArrivalQuality({
    width: 390,
    height: 844,
    devicePixelRatio: 3,
    profile: ARRIVAL_SCENE_PROFILES.mobileLegacy,
  });
  assert.equal(desktop.maxDpr, 1.5);
  assert.equal(desktop.dpr, 1.5);
  assert.equal(mobile.maxDpr, 1.25);
  assert.equal(mobile.dpr, 1.25);
});

test("o parallax e o zoom da câmera permanecem em amplitudes pequenas", () => {
  assert.ok(computeParallaxAmplitude(0.1) <= 0.0015);
  assert.ok(computeParallaxAmplitude(0.9) <= 0.01);
  assert.ok(computeCameraZoom(1) >= 0.97);
  assert.equal(computeCameraZoom(0), 1);
  assert.equal(isArrivalDebugEnabled("?arrivalDebug=1"), true);
  assert.equal(isArrivalDebugEnabled(""), false);
});
