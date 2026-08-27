import assert from "node:assert/strict";
import test from "node:test";
import * as controller from "../../outputs/js/home/home-controller.js";

test("a passagem ao palácio só dispara no fim da subida, descendo", () => {
  assert.equal(typeof controller.shouldCrossToPalace, "function");
  const alto = { scrollHeight: 10000, viewportHeight: 900 };

  assert.equal(controller.shouldCrossToPalace({ scrollTop: 0, ...alto, movingDown: true }), false);
  assert.equal(controller.shouldCrossToPalace({ scrollTop: 5000, ...alto, movingDown: true }), false);
  assert.equal(controller.shouldCrossToPalace({ scrollTop: 8500, ...alto, movingDown: true }), false);
  assert.equal(controller.shouldCrossToPalace({ scrollTop: 9100, ...alto, movingDown: true }), true);
});

test("no fim, parado, a passagem não dispara", () => {
  const noFim = { scrollTop: 9100, scrollHeight: 10000, viewportHeight: 900 };
  assert.equal(controller.shouldCrossToPalace({ ...noFim, movingDown: false }), false);
});

test("no fim, subindo, a passagem não dispara", () => {
  // Este é o caso do retorno pelo bfcache: a página reaparece já rolada no
  // fim, mas parada ou subindo — sem exigir `movingDown`, ela dispararia de
  // novo na hora e prenderia o visitante num laço entre Home e palácio.
  const noFim = { scrollTop: 9100, scrollHeight: 10000, viewportHeight: 900 };
  assert.equal(controller.shouldCrossToPalace({ ...noFim, movingDown: false }), false);
});

test("a margem de 8px é a fronteira real do disparo", () => {
  const base = { scrollHeight: 10000, viewportHeight: 900, movingDown: true };
  // máximo de rolagem = 10000 - 900 = 9100
  assert.equal(controller.shouldCrossToPalace({ ...base, scrollTop: 9092 }), true); // maximo - 8
  assert.equal(controller.shouldCrossToPalace({ ...base, scrollTop: 9091 }), false); // maximo - 9
});

test("documento sem rolagem não dispara passagem", () => {
  assert.equal(
    controller.shouldCrossToPalace({
      scrollTop: 0,
      scrollHeight: 800,
      viewportHeight: 900,
      movingDown: true,
    }),
    false,
  );
});
