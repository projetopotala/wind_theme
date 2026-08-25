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
    assert.ok(leaf.x >= 0.04 && leaf.x <= 0.28);
    assert.ok(leaf.y >= 0.02 && leaf.y <= 0.22);
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

test("a correnteza já corre ao abrir e só para com reduced motion", () => {
  assert.equal(typeof arrivalScene.computeRiverFlowState, "function");

  assert.deepEqual(arrivalScene.computeRiverFlowState({ elapsed: 2.5 }), {
    time: 2.5,
    intensity: 1,
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

test("a água do poço ganha ondulação sem deslocar a foto", () => {
  const start = arrivalScene.computeRippleFrame?.({ x: 0.16, y: 0.88, born: 0, start: 0.004, spread: 0.02, life: 2 }, 0);
  const later = arrivalScene.computeRippleFrame?.({ x: 0.16, y: 0.88, born: 0, start: 0.004, spread: 0.02, life: 2 }, 1);
  assert.ok(later.radius > start.radius);
  assert.ok(later.opacity < start.opacity);
});

test("pessoas só se deslocam no lugar, em milímetros", () => {
  const play = arrivalScene.computePersonIdle?.({ x: 0.16, y: 0.88, kind: "play" }, 1.4);
  const rest = arrivalScene.computePersonIdle?.({ x: 0.5, y: 0.74, kind: "walk" }, 1.4);
  assert.ok(Math.hypot(play.x - 0.16, play.y - 0.88) < 0.01);
  assert.ok(Math.hypot(rest.x - 0.5, rest.y - 0.74) < 0.006);
  assert.ok(Math.hypot(play.x - 0.16, play.y - 0.88) > 0);
});

test("a cena vertical carrega a paisagem e a profundidade mobile", () => {
  const mobile = arrivalScene.selectArrivalAssets?.({ width: 390, height: 844 });
  const desktop = arrivalScene.selectArrivalAssets?.({ width: 1280, height: 720 });

  assert.equal(mobile.imageUrl, "media/chegada-landscape-mobile.webp");
  assert.equal(mobile.depthUrl, "media/chegada-depth-mobile.webp");
  assert.equal(mobile.waterUrl, "");
  assert.equal(mobile.canopyUrl, "");

  assert.equal(desktop.imageUrl, "media/chegada-v2-master.webp");
  assert.equal(desktop.depthUrl, "media/chegada-v2-depth.webp");
  assert.equal(desktop.waterUrl, "media/chegada-v2-water-mask.webp");
  assert.equal(desktop.canopyUrl, "media/chegada-v2-canopy-mask.webp");
});
