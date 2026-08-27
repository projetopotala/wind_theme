import assert from "node:assert/strict";
import test from "node:test";
import * as controller from "../../outputs/js/home/home-controller.js";

test("a passagem ao palácio só dispara no fim da subida", () => {
  assert.equal(typeof controller.shouldCrossToPalace, "function");
  const alto = { scrollHeight: 10000, viewportHeight: 900 };

  assert.equal(controller.shouldCrossToPalace({ scrollTop: 0, ...alto }), false);
  assert.equal(controller.shouldCrossToPalace({ scrollTop: 5000, ...alto }), false);
  assert.equal(controller.shouldCrossToPalace({ scrollTop: 8500, ...alto }), false);
  assert.equal(controller.shouldCrossToPalace({ scrollTop: 9100, ...alto }), true);
});

test("documento sem rolagem não dispara passagem", () => {
  assert.equal(
    controller.shouldCrossToPalace({ scrollTop: 0, scrollHeight: 800, viewportHeight: 900 }),
    false,
  );
});
