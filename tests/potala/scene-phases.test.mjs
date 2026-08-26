import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceScenePhases,
  createScenePhases,
} from "../../outputs/js/chegada/arrival-scene.js";
import { ARRIVAL_FRAGMENT_SHADER } from "../../outputs/js/chegada/shaders/arrival-fragment.js";

const step = (phases, options) => advanceScenePhases(phases, { dt: 16, ...options });

test("as fases começam em zero e avançam sozinhas", () => {
  const start = createScenePhases();
  assert.deepEqual(start, { river: 0, fall: 0, drift: [0, 0] });

  const next = step(start);
  assert.ok(next.fall > start.fall);
  assert.ok(next.river > start.river);
  assert.ok(next.drift[0] > start.drift[0]);
});

test("mudar a energia da água não salta a fase da queda — só a inclinação", () => {
  // Este é o defeito que fazia a cachoeira piscar quando o ponteiro encostava num
  // lugar: a fase era reconstruída como tempo × velocidade, então qualquer
  // mudança de velocidade reescrevia todo o passado acumulado de uma vez.
  let calm = createScenePhases();
  for (let frame = 0; frame < 600; frame += 1) calm = step(calm, { riverMotion: 0.5 });

  const continued = step(calm, { riverMotion: 0.5 });
  const excited = step(calm, { riverMotion: 1 });
  const framePerCalmFrame = continued.fall - calm.fall;

  assert.ok(excited.fall > continued.fall, "a queda acelera com a energia");
  assert.ok(
    excited.fall - calm.fall < framePerCalmFrame * 3,
    "um quadro nunca pode avançar mais que alguns quadros de uma vez",
  );
});

test("mudar a direção do vento não teleporta as nuvens", () => {
  let drifted = createScenePhases();
  for (let frame = 0; frame < 600; frame += 1) {
    drifted = step(drifted, { windDir: [0.32, 0.08] });
  }

  const turned = step(drifted, { windDir: [-1, 1] });
  const travelled = Math.hypot(
    turned.drift[0] - drifted.drift[0],
    turned.drift[1] - drifted.drift[1],
  );

  // Um quadro de 16 ms a 0,12 célula/s anda 0,002 célula. Antes, virar o vento
  // reescrevia os 600 quadros anteriores e a nuvem pulava células inteiras.
  assert.ok(travelled < 0.01, `nuvem andou ${travelled} de uma vez`);
  assert.ok(travelled > 0);
});

test("movimento reduzido congela as fases sem perder o que já andou", () => {
  const moved = step(createScenePhases());
  const frozen = step(moved, { reducedMotion: true });

  assert.deepEqual(frozen, { river: moved.river, fall: moved.fall, drift: [...moved.drift] });
  assert.notEqual(frozen.drift, moved.drift, "a deriva é copiada, não compartilhada");
});

test("quadros sem tempo decorrido não movem nada", () => {
  const moved = step(createScenePhases());
  assert.deepEqual(advanceScenePhases(moved, { dt: 0 }).fall, moved.fall);
  assert.deepEqual(advanceScenePhases(moved, { dt: -50 }).fall, moved.fall);
});

test("o shader recebe fase pronta e não tem como remultiplicar por tempo", () => {
  assert.match(ARRIVAL_FRAGMENT_SHADER, /uniform float uFallPhase;/);
  assert.match(ARRIVAL_FRAGMENT_SHADER, /uniform vec2 uCloudDrift;/);
  assert.match(ARRIVAL_FRAGMENT_SHADER, /uniform float uRiverPhase;/);

  // A velocidade da queda e a da nuvem não existem mais dentro do shader, então
  // ninguém consegue reintroduzir o produto sem passar por advanceScenePhases.
  assert.doesNotMatch(ARRIVAL_FRAGMENT_SHADER, /uCloudSpeed/);
  assert.doesNotMatch(ARRIVAL_FRAGMENT_SHADER, /uTime\s*\*\s*[\d.]+\s*\*\s*max\(uRiverMotion/);

  // Fases que crescem a sessão inteira precisam de highp para não virar degraus.
  assert.match(ARRIVAL_FRAGMENT_SHADER, /GL_FRAGMENT_PRECISION_HIGH/);
});

test("a queda é lida em três partes: lábio, corpo e pé", () => {
  assert.match(ARRIVAL_FRAGMENT_SHADER, /float fallLip\b/);
  assert.match(ARRIVAL_FRAGMENT_SHADER, /float fallBody\b/);
  assert.match(ARRIVAL_FRAGMENT_SHADER, /float fallBasin\b/);
});

test("a água cai para baixo na tela, não para cima", () => {
  // O vértice faz vUv = aPosition * 0.5 + 0.5 a partir do clip space, onde
  // y = +1 é o topo, e as texturas sobem com UNPACK_FLIP_Y_WEBGL. Resultado:
  // uv.y = 1 é o TOPO da tela e descer é DIMINUIR uv.y — o oposto da intuição.
  // Escrever a queda direto em uv.y foi o que a fez subir; medido no navegador,
  // o padrão andava -6 px por quadro, e com fallY anda +6 px.
  assert.match(ARRIVAL_FRAGMENT_SHADER, /float fallY\s*=\s*-uv\.y\s*;/);

  const camadas = ["veil", "strand", "spray", "churn"];
  for (const camada of camadas) {
    const linha = ARRIVAL_FRAGMENT_SHADER
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.startsWith(`float ${camada} = noise(`));
    assert.ok(linha, `não achei a camada ${camada}`);
    assert.match(linha, /fallY/, `${camada} precisa correr em fallY`);
    assert.doesNotMatch(
      linha,
      /uv\.y/,
      `${camada} usa uv.y direto e vai subir em vez de cair`,
    );
  }
});

test("pé e lábio da queda ficam de fato embaixo e em cima na tela", () => {
  const linha = (nome) => ARRIVAL_FRAGMENT_SHADER
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith(`float ${nome} =`));

  // Com uv.y crescendo para cima, "abaixo na tela" é SUBTRAIR de uv.y.
  assert.match(linha("fallBelow"), /uv\s*-\s*vec2\(0\.0,/);
  assert.match(linha("fallAbove"), /uv\s*\+\s*vec2\(0\.0,/);
});
