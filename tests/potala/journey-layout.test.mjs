import assert from "node:assert/strict";
import test from "node:test";
import * as journeyLayout from "../../outputs/js/home/journey-layout.js";
import { JOURNEY_REGIONS } from "../../outputs/js/home/journey-data.js";

const { buildJourneyLayout, sampleSegment } = journeyLayout;

const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const normalize = (vector) => {
  const length = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / length, y: vector.y / length };
};
const dot = (a, b) => a.x * b.x + a.y * b.y;

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
    assert.equal(checkpoint.panelPlacement, {
      left: "right",
      right: "left",
      top: "bottom",
      bottom: "top",
    }[checkpoint.roadPlacement]);
  }
});

test("cada trecho reserva uma borda compatível com a direção da estrada", () => {
  const layout = buildJourneyLayout(JOURNEY_REGIONS, { width: 896, height: 958 });
  for (const checkpoint of layout.checkpoints) {
    const segment = layout.segments.find(({ id }) => id === checkpoint.segmentId);
    const horizontal = Math.abs(segment.direction.x) > Math.abs(segment.direction.y);
    if (horizontal) {
      assert.ok(["top", "bottom"].includes(checkpoint.roadPlacement), checkpoint.id);
      assert.equal(checkpoint.roadOffsetX, 0);
      assert.notEqual(checkpoint.roadOffsetY, 0);
    } else {
      assert.ok(["left", "right"].includes(checkpoint.roadPlacement), checkpoint.id);
      assert.notEqual(checkpoint.roadOffsetX, 0);
      assert.equal(checkpoint.roadOffsetY, 0);
    }
  }
});

test("curvas encontram os trechos retos sem quebra de direção", () => {
  const layout = buildJourneyLayout(JOURNEY_REGIONS, { width: 896, height: 958 });
  layout.segments.forEach((segment, index) => {
    if (segment.kind !== "curve") return;
    const previous = layout.segments[index - 1];
    const next = layout.segments[index + 1];
    const start = sampleSegment(segment, 0);
    const nearStart = sampleSegment(segment, .001);
    const nearEnd = sampleSegment(segment, .999);
    const end = sampleSegment(segment, 1);
    assert.ok(dot(normalize({ x: nearStart.x - start.x, y: nearStart.y - start.y }), previous.direction) > .995);
    assert.ok(dot(normalize({ x: end.x - nearEnd.x, y: end.y - nearEnd.y }), next.direction) > .995);
  });
});

test("câmera percorre cada curva em passos quase uniformes", () => {
  const layout = buildJourneyLayout(JOURNEY_REGIONS, { width: 896, height: 958 });
  for (const segment of layout.segments.filter(({ kind }) => kind === "curve")) {
    const steps = [];
    let previous = sampleSegment(segment, 0);
    for (let index = 1; index <= 20; index += 1) {
      const current = sampleSegment(segment, index / 20);
      steps.push(distance(previous, current));
      previous = current;
    }
    assert.ok(Math.max(...steps) / Math.min(...steps) < 1.18, segment.id);
  }
});

test("deslocamento da estrada fica estável na seção e muda somente no silêncio", () => {
  assert.equal(typeof journeyLayout.roadOffsetForPathSection, "function");
  const checkpoints = [
    { roadOffsetX: 240, roadOffsetY: 0 },
    { roadOffsetX: 0, roadOffsetY: -210 },
  ];
  assert.deepEqual(journeyLayout.roadOffsetForPathSection(0, .7, checkpoints), { x: 240, y: 0 });
  assert.deepEqual(journeyLayout.roadOffsetForPathSection(2, .2, checkpoints), { x: 0, y: -210 });
  assert.deepEqual(journeyLayout.roadOffsetForPathSection(1, .5, checkpoints), { x: 120, y: -105 });
});

test("frase de transição ocupa o lado oposto ao centro da estrada", () => {
  assert.equal(typeof journeyLayout.silenceCopyPlacementForRoadOffset, "function");
  assert.equal(journeyLayout.silenceCopyPlacementForRoadOffset({ x: -240, y: 0 }), "right");
  assert.equal(journeyLayout.silenceCopyPlacementForRoadOffset({ x: 240, y: 0 }), "left");
  assert.equal(journeyLayout.silenceCopyPlacementForRoadOffset({ x: 0, y: -210 }), "bottom");
  assert.equal(journeyLayout.silenceCopyPlacementForRoadOffset({ x: 0, y: 210 }), "top");
});
