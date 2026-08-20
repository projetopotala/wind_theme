import assert from "node:assert/strict";
import test from "node:test";
import { dragProgress } from "../../outputs/js/chegada/drag-controller.js";

test("limita o drag entre zero e um", () => {
  assert.equal(dragProgress(0, 100, 50, 200), 0);
  assert.equal(dragProgress(0, 100, 400, 200), 1);
});

test("continua a partir do progresso atual", () => {
  assert.equal(dragProgress(0.25, 100, 150, 200), 0.5);
});
