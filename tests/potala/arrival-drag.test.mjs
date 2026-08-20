import assert from "node:assert/strict";
import test from "node:test";

import { dragProgress } from "../../outputs/js/chegada/drag-controller.js";

test("o drag limita o progresso entre o começo e o fim da trilha", () => {
  assert.equal(dragProgress(-30, 100), 0);
  assert.equal(dragProgress(50, 100), 0.5);
  assert.equal(dragProgress(160, 100), 1);
});

test("o drag permanece seguro quando não existe espaço de movimento", () => {
  assert.equal(dragProgress(40, 0), 0);
});
