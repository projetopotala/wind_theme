import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_HOME_BLOCKS } from "../../outputs/js/home/journey-data.js";
import { buildHomePathLayout } from "../../outputs/js/home/home-path-layout.js";

test("há um ponto de curva por PAR, na ordem editorial", () => {
  /*
   * As seções passaram a andar aos pares — uma de cada lado do trajeto,
   * dividindo a mesma passagem de rolagem. Um ponto por bloco daria à curva
   * duas dobras onde o visitante percorre uma só: a linha serpentearia duas
   * vezes por tela enquanto a página anda uma.
   *
   * O `side` do checkpoint deixou de dizer algo sobre o trajeto — cada par tem
   * os dois lados — e por isso não é mais afirmado aqui.
   */
  const quatro = buildHomePathLayout(DEFAULT_HOME_BLOCKS.slice(0, 4));
  assert.equal(quatro.checkpoints.length, 2);

  const cinco = buildHomePathLayout(DEFAULT_HOME_BLOCKS.slice(0, 5));
  assert.equal(cinco.checkpoints.length, 3, "um par incompleto ainda é uma passagem");

  assert.ok(cinco.checkpoints.every((checkpoint, index, all) => (
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

test("trajeto muda de direção sem guinadas laterais", () => {
  const { checkpoints } = buildHomePathLayout(DEFAULT_HOME_BLOCKS);
  const deslocamentos = checkpoints.slice(1).map((point, index) => (
    Math.abs(point.x - checkpoints[index].x)
  ));

  assert.ok(Math.max(...deslocamentos) <= 0.18, "curvas consecutivas precisam formar uma passagem calma");
});
