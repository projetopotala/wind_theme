import assert from "node:assert/strict";
import test from "node:test";
import * as math from "../../outputs/js/core/math.js";

test("o movimento se aproxima do scroll sem saltar nem criar uma cauda longa", () => {
  assert.equal(typeof math.damp, "function");
  const { damp } = math;
  const firstFrame = damp(0, 1, 16, 90);
  const after160ms = damp(firstFrame, 1, 144, 90);

  assert.ok(firstFrame > .1 && firstFrame < .25);
  assert.ok(after160ms > .8 && after160ms < .9);
  assert.equal(damp(0, 1, 16, 0), 1);
  assert.ok(damp(.8, 1, 1000, 90) <= 1);
  assert.ok(damp(.2, 0, 1000, 90) >= 0);
});
