import assert from "node:assert/strict";
import test from "node:test";
import { ambientFrame } from "../../features/potala-journey/lib/ambient-motion";

test("tempo ambiente avança sem depender do progresso da jornada", () => {
  const first = ambientFrame(0, 0.4, "medium");
  const later = ambientFrame(10_000, 0.4, "medium");
  assert.notDeepEqual(later, first);
  assert.equal(later.journeyProgress, 0.4);
});

test("limpa a atmosfera ao aproximar o Palacio sem congelar o vento", () => {
  const middle = ambientFrame(8_000, 0.6, "high");
  const palace = ambientFrame(8_000, 0.96, "high");
  assert.ok(palace.effectIntensity < middle.effectIntensity);
  assert.notEqual(palace.windX, 0);
});
