import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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


test("o trajeto é um fio fino com halo largo, não um traço grosso", async () => {
  const fonte = await readFile(
    new URL("../../outputs/js/home/home-path-three.js", import.meta.url),
    "utf8",
  );
  const raios = [...fonte.matchAll(/TubeGeometry\([^)]*?,\s*(0\.\d+),/g)].map((m) => Number(m[1]));
  assert.equal(raios.length, 2, "esperava o núcleo e o halo");

  const [nucleo, halo] = raios;

  /*
   * O que faz a linha parecer LUZ é a razão entre as duas partes: um núcleo
   * estreito o bastante para o olho ler como brilho, e um halo várias vezes
   * mais largo e quase transparente em volta. Engrossar o núcleo — a tentação
   * óbvia quando se quer a linha "mais visível" — a transforma num tubo dourado
   * desenhado sobre a paisagem: some a luz e sobra o objeto.
   */
  assert.ok(nucleo <= 0.02, `núcleo grosso demais: ${nucleo}`);
  assert.ok(halo / nucleo >= 3, `halo estreito demais para o núcleo: ${(halo / nucleo).toFixed(1)}×`);
  assert.ok(halo <= 0.09, `halo largo demais: ${halo}`);
});
