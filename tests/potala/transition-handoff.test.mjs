import assert from "node:assert/strict";
import test from "node:test";
import * as handoff from "../../outputs/js/chegada/transition-handoff.js";

test("crossTo existe e enterHome continua sendo o caminho da Chegada", () => {
  assert.equal(typeof handoff.crossTo, "function");
  assert.equal(typeof handoff.enterHome, "function");
});

test("o atraso da passagem encurta em movimento reduzido", () => {
  assert.equal(handoff.handoffDelayForMotion({ reducedMotion: false }), 850);
  assert.equal(handoff.handoffDelayForMotion({ reducedMotion: true }), 80);
});
