import assert from "node:assert/strict";
import test from "node:test";
import { buildJourneyLayout } from "../../outputs/js/home/journey-layout.js";
import { JOURNEY_REGIONS } from "../../outputs/js/home/journey-data.js";

test("cada região fica no centro de um trecho reto", () => {
  const layout = buildJourneyLayout(JOURNEY_REGIONS, { width: 1440, height: 900 });
  for (const checkpoint of layout.checkpoints) {
    assert.equal(checkpoint.segmentKind, "straight");
    assert.ok(checkpoint.clearance >= 900 * 0.62);
  }
});

test("segmentos se conectam sem lacunas", () => {
  const layout = buildJourneyLayout(JOURNEY_REGIONS, { width: 1440, height: 900 });
  layout.segments.slice(1).forEach((segment, index) => {
    assert.deepEqual(segment.from, layout.segments[index].to);
  });
});

test("mobile mantém painel e estrada em lados opostos", () => {
  const layout = buildJourneyLayout(JOURNEY_REGIONS, { width: 390, height: 844 });
  for (const checkpoint of layout.checkpoints) {
    assert.notEqual(Math.sign(checkpoint.roadOffsetX), Math.sign(checkpoint.panelOffsetX));
  }
});
