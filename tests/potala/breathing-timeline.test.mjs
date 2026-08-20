import assert from "node:assert/strict";
import test from "node:test";
import { getBreathFrame } from "../../outputs/js/chegada/breathing-timeline.js";

test("mapeia as três fases de 3 segundos", () => {
  assert.equal(getBreathFrame(0).phase, "inhale");
  assert.equal(getBreathFrame(2_999).phase, "inhale");
  assert.equal(getBreathFrame(3_000).phase, "hold");
  assert.equal(getBreathFrame(6_000).phase, "exhale");
  assert.equal(getBreathFrame(9_000).cycle, 2);
});

test("completa exatamente oito ciclos", () => {
  const last = getBreathFrame(71_999);
  assert.equal(last.complete, false);
  const complete = getBreathFrame(72_000);
  assert.equal(complete.complete, true);
  assert.equal(complete.cycle, 8);
  assert.equal(complete.progress, 1);
});

test("a contagem restante é 3, 2, 1", () => {
  assert.equal(getBreathFrame(0).remainingSeconds, 3);
  assert.equal(getBreathFrame(1_001).remainingSeconds, 2);
  assert.equal(getBreathFrame(2_001).remainingSeconds, 1);
});
