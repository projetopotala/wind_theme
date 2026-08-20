import assert from "node:assert/strict";
import test from "node:test";
import { presenceForDistance } from "../../outputs/js/home/home-scenes.js";

test("mantém um platô estável ao redor do centro", () => {
  assert.equal(presenceForDistance(0, 900), 1);
  assert.equal(presenceForDistance(300, 900), 1);
});

test("desaparece progressivamente longe do centro", () => {
  const near = presenceForDistance(450, 900);
  const far = presenceForDistance(780, 900);
  assert.ok(near > far);
  assert.equal(presenceForDistance(900, 900), 0);
});
