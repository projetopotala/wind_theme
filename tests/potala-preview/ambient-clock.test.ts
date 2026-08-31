import assert from "node:assert/strict";
import test from "node:test";

import { advanceAmbientClock, createAmbientClock, suspendAmbientClock } from "../../features/potala-journey/lib/ambient-clock";

test("clock ambiental avanca em tempo real sem depender da jornada", () => {
  const started = createAmbientClock();
  const first = advanceAmbientClock(started, 1_000);
  const later = advanceAmbientClock(first, 1_500);
  assert.equal(later.elapsedMs, 500);
});

test("suspensao de visibilidade nao acumula salto ao retomar", () => {
  const running = advanceAmbientClock(advanceAmbientClock(createAmbientClock(), 1_000), 1_500);
  const suspended = suspendAmbientClock(running);
  const resumed = advanceAmbientClock(suspended, 50_000);
  assert.equal(resumed.elapsedMs, 500);
});
