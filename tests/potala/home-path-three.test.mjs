import assert from "node:assert/strict";
import test from "node:test";

import {
  drawRangeForProgress,
  qualityForViewport,
} from "../../outputs/js/home/home-path-three.js";

test("revelação nunca ultrapassa os índices disponíveis", () => {
  assert.equal(drawRangeForProgress(-1, 120), 0);
  assert.equal(drawRangeForProgress(0.5, 120), 60);
  assert.equal(drawRangeForProgress(2, 120), 120);
});

test("qualidade limita densidade de pixels no desktop e no mobile", () => {
  assert.deepEqual(qualityForViewport({ width: 1440, devicePixelRatio: 2.5 }), {
    dpr: 1.5,
    tubularSegments: 320,
    radialSegments: 8,
  });
  assert.deepEqual(qualityForViewport({ width: 390, devicePixelRatio: 3 }), {
    dpr: 1.25,
    tubularSegments: 220,
    radialSegments: 6,
  });
});

test("movimento reduzido usa geometria mais leve", () => {
  const quality = qualityForViewport({
    width: 1440,
    devicePixelRatio: 2,
    reducedMotion: true,
  });

  assert.equal(quality.dpr, 1);
  assert.equal(quality.tubularSegments, 160);
  assert.equal(quality.radialSegments, 6);
});

