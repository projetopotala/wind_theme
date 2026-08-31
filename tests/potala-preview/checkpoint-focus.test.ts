import assert from "node:assert/strict";
import test from "node:test";

import { checkpointVisibility } from "../../features/potala-journey/lib/journey-navigation";

test("faz o portal entrar, focar e sair apenas nos limites definidos", () => {
  const range = { start: 0.2, focus: 0.3, end: 0.5 };
  assert.equal(checkpointVisibility(0.19, range).active, false);
  assert.equal(checkpointVisibility(0.3, range).active, true);
  assert.equal(checkpointVisibility(0.3, range).opacity, 1);
  assert.equal(checkpointVisibility(0.51, range).active, false);
});
