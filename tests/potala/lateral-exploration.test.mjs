import assert from "node:assert/strict";
import test from "node:test";
import { elasticOffset } from "../../outputs/js/home/lateral-exploration.js";

test("mantém deslocamento dentro do limite com resistência", () => {
  assert.equal(elasticOffset(0, 300), 0);
  assert.ok(elasticOffset(600, 300) < 300);
  assert.ok(elasticOffset(-600, 300) > -300);
});

test("é simétrico", () => {
  assert.equal(elasticOffset(180, 300), -elasticOffset(-180, 300));
});
