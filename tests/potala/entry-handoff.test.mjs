import assert from "node:assert/strict";
import test from "node:test";
import * as homeController from "../../outputs/js/home/home-controller.js";

test("a continuação visual permanece ativa pelo tempo necessário para concluir a entrada", () => {
  assert.equal(typeof homeController.holdEntryHandoff, "function");
  const { holdEntryHandoff } = homeController;
  const classes = new Set(["entry-pending"]);
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

  const timer = holdEntryHandoff(root, { schedule });

  assert.equal(timer, 17);
  assert.ok(classes.has("entry-from-arrival"));
  assert.ok(classes.has("entry-pending"));
  assert.equal(scheduled.delay, 1800);
  scheduled.callback();
  assert.ok(!classes.has("entry-from-arrival"));
  assert.ok(!classes.has("entry-pending"));
});
