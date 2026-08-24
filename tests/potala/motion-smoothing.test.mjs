import assert from "node:assert/strict";
import test from "node:test";
import * as math from "../../outputs/js/core/math.js";
import * as homeController from "../../outputs/js/home/home-controller.js";

test("o movimento se aproxima do scroll sem saltar nem criar uma cauda longa", () => {
  assert.equal(typeof math.damp, "function");
  const { damp } = math;
  const firstFrame = damp(0, 1, 16, 90);
  const after160ms = damp(firstFrame, 1, 144, 90);

  assert.ok(firstFrame > .1 && firstFrame < .25);
  assert.ok(after160ms > .8 && after160ms < .9);
  assert.equal(damp(0, 1, 16, 0), 1);
  assert.ok(damp(.8, 1, 1000, 90) <= 1);
  assert.ok(damp(.2, 0, 1000, 90) >= 0);
});

test("a câmera percorre uma rolagem grande sem pular a narrativa nem deixar cauda longa", () => {
  assert.equal(typeof homeController.smoothJourneyScroll, "function");
  const { smoothJourneyScroll } = homeController;
  let position = 0;
  for (let frame = 0; frame < 10; frame += 1) {
    position = smoothJourneyScroll(position, 3000, 16);
  }

  assert.ok(position > 1700 && position < 2200);

  for (let frame = 0; frame < 40; frame += 1) {
    position = smoothJourneyScroll(position, 3000, 16);
  }

  assert.ok(position > 2970 && position <= 3000);
  assert.equal(smoothJourneyScroll(120, 900, 16, { reducedMotion: true }), 900);
});

test("as informações entram e saem com fade mesmo quando o alvo muda de uma vez", () => {
  assert.equal(typeof homeController.smoothRegionPresence, "function");
  const { smoothRegionPresence } = homeController;
  let presence = smoothRegionPresence(0, 1, 16);
  assert.ok(presence > .02 && presence < .05);

  for (let frame = 1; frame < 40; frame += 1) {
    presence = smoothRegionPresence(presence, 1, 16);
  }
  assert.ok(presence > .72 && presence < .85);

  const leaving = smoothRegionPresence(presence, 0, 16);
  assert.ok(leaving > 0 && leaving < presence);
  assert.equal(smoothRegionPresence(.2, 1, 16, { reducedMotion: true }), 1);
});

test("a informação entra em direção ao centro e nunca é empurrada para fora da tela", () => {
  assert.equal(typeof homeController.motionOffsetForRegion, "function");
  const fromRight = homeController.motionOffsetForRegion({
    roadSide: "left",
    signedDistance: 720,
    viewportWidth: 1440,
    viewportHeight: 720,
  });
  const fromLeft = homeController.motionOffsetForRegion({
    roadSide: "right",
    signedDistance: 720,
    viewportWidth: 1440,
    viewportHeight: 720,
  });

  assert.ok(fromRight.x <= 0 && Math.abs(fromRight.x) <= 48);
  assert.ok(fromLeft.x >= 0 && Math.abs(fromLeft.x) <= 48);
  assert.deepEqual(homeController.motionOffsetForRegion({
    roadSide: "left",
    signedDistance: 0,
    viewportWidth: 1440,
    viewportHeight: 720,
  }), { x: 0, y: 0 });
  assert.deepEqual(homeController.motionOffsetForRegion({
    roadSide: "left",
    signedDistance: 720,
    viewportWidth: 1440,
    viewportHeight: 720,
    reducedMotion: true,
  }), { x: 0, y: 0 });
});

test("o indicador acompanha todo o documento e retorna quando a página sobe", () => {
  assert.equal(typeof math.scrollProgressForDocument, "function");
  const { scrollProgressForDocument } = math;

  assert.equal(scrollProgressForDocument({
    scrollTop: 0,
    scrollHeight: 1800,
    viewportHeight: 800,
  }), 0);
  assert.equal(scrollProgressForDocument({
    scrollTop: 500,
    scrollHeight: 1800,
    viewportHeight: 800,
  }), .5);
  assert.equal(scrollProgressForDocument({
    scrollTop: 1000,
    scrollHeight: 1800,
    viewportHeight: 800,
  }), 1);
  assert.equal(scrollProgressForDocument({
    scrollTop: 250,
    scrollHeight: 1800,
    viewportHeight: 800,
  }), .25);
  assert.equal(scrollProgressForDocument({
    scrollTop: -80,
    scrollHeight: 600,
    viewportHeight: 800,
  }), 0);
});

test("o indicador fica parado na Chegada e só responde ao progresso na Home", () => {
  assert.equal(typeof math.scrollCuePosition, "function");
  const { scrollCuePosition } = math;

  assert.equal(scrollCuePosition({ progress: 0, movable: false }), "0.00%");
  assert.equal(scrollCuePosition({ progress: 1, movable: false }), "0.00%");
  assert.equal(scrollCuePosition({ progress: .64, movable: true }), "64.00%");
});
