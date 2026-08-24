import assert from "node:assert/strict";
import test from "node:test";
import * as homeController from "../../outputs/js/home/home-controller.js";

test("a continuação visual permanece ativa até o fim programado", () => {
  assert.equal(typeof homeController.holdEntryHandoff, "function");
  const { holdEntryHandoff } = homeController;
  const classes = new Set();
  const root = {
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
    },
  };
  let scheduled;
  const schedule = (callback, delay) => {
    scheduled = { callback, delay };
    return 17;
  };

  const timer = holdEntryHandoff(root, { duration: 1450, schedule });

  assert.equal(timer, 17);
  assert.ok(classes.has("entry-from-arrival"));
  assert.equal(scheduled.delay, 1450);
  scheduled.callback();
  assert.ok(!classes.has("entry-from-arrival"));
});
