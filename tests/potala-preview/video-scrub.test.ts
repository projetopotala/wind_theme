import assert from "node:assert/strict";
import test from "node:test";

import { createVideoScrubController } from "../../features/potala-journey/hooks/video-scrub-controller";

function createVideo() {
  return {
    currentTime: 0,
    paused: true,
    readyState: 4,
    seeking: false,
    play() { throw new Error("video.play() nao pode ser chamado"); },
    pause() {},
  };
}

test("scroll crescente e reverso atualizam currentTime sem reproduzir", () => {
  const video = createVideo();
  const controller = createVideoScrubController({ duration: 155, fps: 24, maxSeeksPerSecond: 30 });
  controller.sync(video, 0.5, 100);
  const middle = video.currentTime;
  controller.sync(video, 0.25, 200);
  assert.ok(middle > 77 && middle < 78);
  assert.ok(video.currentTime < middle);
  assert.equal(video.paused, true);
});

test("limita seeks e preserva apenas o alvo mais recente durante seeking", () => {
  const video = createVideo();
  const controller = createVideoScrubController({ duration: 155, fps: 24, maxSeeksPerSecond: 30 });
  assert.equal(controller.sync(video, 0.1, 100), false);
  video.seeking = true;
  assert.equal(controller.sync(video, 0.4, 110), false);
  assert.equal(controller.sync(video, 0.8, 120), false);
  assert.ok(video.currentTime < 20);
  video.seeking = false;
  controller.onSeeked(video, 150);
  assert.ok(video.currentTime > 123 && video.currentTime < 125);
});

test("ignora diferencas menores que meio frame", () => {
  const video = createVideo();
  video.currentTime = 40;
  const controller = createVideoScrubController({ duration: 155, fps: 24, maxSeeksPerSecond: 30 });
  const matchingProgress = 40 / (155 - 1 / 24);
  assert.equal(controller.sync(video, matchingProgress + 1e-7, 100), false);
  assert.equal(video.currentTime, 40);
});
