import assert from "node:assert/strict";
import test from "node:test";

import { checkpointMotionState } from "../../features/potala-journey/lib/checkpoint-motion";

test("micro animacao so fica viva em checkpoint focado sem reduced motion", () => {
  assert.equal(checkpointMotionState({ active: true, reducedMotion: false }), "live");
  assert.equal(checkpointMotionState({ active: false, reducedMotion: false }), "static");
  assert.equal(checkpointMotionState({ active: true, reducedMotion: true }), "static");
});
