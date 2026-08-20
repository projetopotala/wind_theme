import assert from "node:assert/strict";
import test from "node:test";

import { computeArrivalState } from "../../outputs/js/chegada/arrival-scene.js";

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
