import assert from "node:assert/strict";
import test from "node:test";

import * as arrivalScene from "../../outputs/js/chegada/arrival-scene.js";

const { computeArrivalState } = arrivalScene;

test("a Chegada começa contemplativa, com névoa e caminho oculto", () => {
  assert.deepEqual(computeArrivalState({}), {
    camera: 0,
    depth: 0.18,
    fog: 0.76,
    light: 0.34,
    path: 0,
  });
});

test("o avanço abre a paisagem e revela completamente o caminho", () => {
  const state = computeArrivalState({ scrollProgress: 1 });

  assert.ok(state.camera > 0.85);
  assert.ok(state.fog < 0.35);
  assert.equal(state.path, 1);
});

test("a paisagem respira com intensidade discreta", () => {
  const inhale = computeArrivalState({ scrollProgress: 0.35, phase: "inhale" });
  const exhale = computeArrivalState({ scrollProgress: 0.35, phase: "exhale" });

  assert.ok(inhale.light > exhale.light);
  assert.ok(inhale.depth > exhale.depth);
  assert.ok(inhale.light - exhale.light < 0.2);
});

test("as folhas caem em pequenos grupos a partir da copa", () => {
  const leaves = arrivalScene.createLeafGroup?.({ seed: 0.42, count: 4 });

  assert.equal(leaves?.length, 4);
  for (const leaf of leaves) {
    assert.ok(leaf.x >= 0.04 && leaf.x <= 0.46);
    assert.ok(leaf.y >= -0.08 && leaf.y <= 0.2);
    assert.ok(leaf.delay >= 0 && leaf.delay <= 0.72);
  }
});

test("cada folha desce, oscila e desaparece sem saltos", () => {
  const leaf = {
    x: 0.24,
    y: 0.08,
    drift: 0.1,
    fall: 0.72,
    sway: 0.035,
    spin: 2.4,
    phase: 0.7,
    delay: 0,
  };

  const start = arrivalScene.computeLeafFrame?.(leaf, 0);
  const middle = arrivalScene.computeLeafFrame?.(leaf, 0.5);
  const end = arrivalScene.computeLeafFrame?.(leaf, 1);

  assert.equal(start?.opacity, 0);
  assert.ok(middle?.y > start?.y);
  assert.ok(Math.abs(middle?.x - start?.x) < 0.18);
  assert.ok(middle?.opacity > 0.7);
  assert.ok(end?.y > middle?.y);
  assert.equal(end?.opacity, 0);
  assert.notEqual(middle?.rotation, start?.rotation);
});

test("a correnteza avança somente quando movimento está permitido", () => {
  assert.equal(arrivalScene.computeRiverTime?.({ elapsed: 2.5 }), 2.5);
  assert.equal(arrivalScene.computeRiverTime?.({ elapsed: 2.5, reducedMotion: true }), 0);
  assert.equal(arrivalScene.computeRiverTime?.({ elapsed: -1 }), 0);
});

test("a correnteza só corre com energia da interação", () => {
  assert.equal(typeof arrivalScene.computeRiverFlowState, "function");

  assert.deepEqual(arrivalScene.computeRiverFlowState({ elapsed: 2.5 }), {
    time: 0,
    intensity: 0,
  });

  const moving = arrivalScene.computeRiverFlowState({ elapsed: 2.5, energy: 1 });
  const reduced = arrivalScene.computeRiverFlowState({
    elapsed: 2.5,
    energy: 1,
    reducedMotion: true,
  });

  assert.ok(moving.time > 0);
  assert.ok(moving.intensity > 0);
  assert.deepEqual(reduced, { time: 0, intensity: 0 });
});

test("a cena vertical carrega a paisagem e a profundidade mobile", () => {
  assert.deepEqual(arrivalScene.selectArrivalAssets?.({ width: 390, height: 844 }), {
    imageUrl: "media/chegada-landscape-mobile.webp",
    depthUrl: "media/chegada-depth-mobile.webp",
    waterUrl: "",
    canopyUrl: "",
  });

  assert.deepEqual(arrivalScene.selectArrivalAssets?.({ width: 1280, height: 720 }), {
    imageUrl: "media/chegada-landscape.webp",
    depthUrl: "media/chegada-depth.webp",
    waterUrl: "media/chegada-water.webp",
    canopyUrl: "media/chegada-canopy.webp",
  });
});
