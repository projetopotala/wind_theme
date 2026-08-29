import assert from "node:assert/strict";
import test from "node:test";

import { JOURNEY_CONTENT, PRIMARY_CONTENT_IDS } from "../../features/potala-journey/data/journey-content";
import {
  JOURNEY_CHECKPOINTS,
  JOURNEY_MEDIA,
  activeCheckpointForProgress,
  progressForCheckpoint,
  timeForJourneyProgress,
} from "../../features/potala-journey/data/journey-timeline";

test("mantem a midia de desenvolvimento isolada no manifesto", () => {
  assert.deepEqual(JOURNEY_MEDIA, {
    src: "/media/potala-journey.mp4",
    poster: "/media/potala-journey-poster.webp",
    duration: 155,
    fps: 24,
    development: true,
  });
});

test("timeline aponta somente para conteudo existente", () => {
  for (const checkpoint of JOURNEY_CHECKPOINTS) assert.ok(JOURNEY_CONTENT[checkpoint.contentId], checkpoint.contentId);
});

test("timeline inclui exatamente as oito regioes como checkpoints primarios", () => {
  assert.deepEqual(
    JOURNEY_CHECKPOINTS.filter((item) => item.importance === "primary").map((item) => item.contentId),
    PRIMARY_CONTENT_IDS,
  );
});

test("checkpoints sao ordenados, validos e terminam antes do ultimo frame", () => {
  const safeEnd = 155 - 1 / 24;
  let previousEnd = 0;
  for (const checkpoint of JOURNEY_CHECKPOINTS) {
    assert.ok(checkpoint.videoStart >= previousEnd);
    assert.ok(checkpoint.videoStart <= checkpoint.videoFocus);
    assert.ok(checkpoint.videoFocus <= checkpoint.videoEnd);
    assert.ok(checkpoint.videoEnd <= safeEnd);
    assert.ok(checkpoint.scrollWeight > 0);
    previousEnd = checkpoint.videoEnd;
  }
});

test("progress linear nunca busca alem do ultimo frame seguro", () => {
  assert.equal(timeForJourneyProgress(-1), 0);
  assert.equal(timeForJourneyProgress(0), 0);
  assert.equal(timeForJourneyProgress(1), 155 - 1 / 24);
  assert.equal(timeForJourneyProgress(2), 155 - 1 / 24);
});

test("progress crescente e reverso produzem timestamps deterministicos", () => {
  const first = timeForJourneyProgress(0.25);
  const middle = timeForJourneyProgress(0.5);
  const later = timeForJourneyProgress(0.75);
  assert.ok(first < middle && middle < later);
  assert.ok(timeForJourneyProgress(0.3) < timeForJourneyProgress(0.7));
});

test("navegacao resolve progresso e checkpoint sem depender de componentes", () => {
  const progress = progressForCheckpoint("programacao");
  assert.ok(progress > 0 && progress < 1);
  assert.equal(activeCheckpointForProgress(progress)?.contentId, "programacao");
});
