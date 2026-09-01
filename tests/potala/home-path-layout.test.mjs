import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_HOME_BLOCKS } from "../../outputs/js/home/journey-data.js";
import { buildHomePathLayout } from "../../outputs/js/home/home-path-layout.js";

test("checkpoints seguem a ordem editorial e preservam os lados", () => {
  const layout = buildHomePathLayout(DEFAULT_HOME_BLOCKS.slice(0, 4));

  assert.deepEqual(layout.checkpoints.map(({ side }) => side), ["left", "right", "left", "right"]);
  assert.ok(layout.checkpoints.every((checkpoint, index, all) => (
    index === 0 || checkpoint.progress > all[index - 1].progress
  )));
});

test("trajeto mantém curvas discretas dentro da faixa central", () => {
  const layout = buildHomePathLayout(DEFAULT_HOME_BLOCKS);

  assert.ok(layout.points.length > layout.checkpoints.length);
  assert.ok(layout.points.every(({ x }) => Math.abs(x) <= 0.42));
  assert.ok(layout.points[0].y > layout.checkpoints[0].y);
  assert.ok(layout.points.at(-1).y < layout.checkpoints.at(-1).y);
});

