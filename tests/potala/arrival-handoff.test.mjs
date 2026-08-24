import assert from "node:assert/strict";
import test from "node:test";
import * as transitionHandoff from "../../outputs/js/chegada/transition-handoff.js";

test("a navegação aguarda a animação visual da Chegada terminar", () => {
  assert.equal(typeof transitionHandoff.handoffDelayForMotion, "function");
  assert.equal(transitionHandoff.handoffDelayForMotion({ reducedMotion: false }), 850);
  assert.equal(transitionHandoff.handoffDelayForMotion({ reducedMotion: true }), 80);
});
