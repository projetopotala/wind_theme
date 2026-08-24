import assert from "node:assert/strict";
import test from "node:test";

let ambientSound = {};
try {
  ambientSound = await import("../../outputs/js/chegada/ambient-sound.js");
} catch {
  // RED: the implementation does not exist before this regression test.
}

test("o primeiro clique começa audível mesmo se o fade ainda não executar", () => {
  assert.equal(typeof ambientSound.planSoundToggle, "function");
  const plan = ambientSound.planSoundToggle({ enabled: false, paused: true });

  assert.equal(plan.action, "enable");
  assert.ok(plan.startVolume >= .1);
  assert.ok(plan.targetVolume > plan.startVolume);
});

test("estado ligado com mídia pausada retoma em um clique", () => {
  assert.equal(typeof ambientSound.planSoundToggle, "function");
  assert.equal(ambientSound.planSoundToggle({ enabled: true, paused: true }).action, "enable");
  assert.equal(ambientSound.planSoundToggle({ enabled: true, paused: false }).action, "disable");
});
