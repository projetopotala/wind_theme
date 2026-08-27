import assert from "node:assert/strict";
import test from "node:test";
import * as controller from "../../outputs/js/home/home-controller.js";

test("a passagem ao palácio só dispara no fim da subida, com a trava armada", () => {
  assert.equal(typeof controller.shouldCrossToPalace, "function");
  const alto = { scrollHeight: 10000, viewportHeight: 900 };

  assert.equal(controller.shouldCrossToPalace({ scrollTop: 0, ...alto, armed: true }), false);
  assert.equal(controller.shouldCrossToPalace({ scrollTop: 5000, ...alto, armed: true }), false);
  assert.equal(controller.shouldCrossToPalace({ scrollTop: 8500, ...alto, armed: true }), false);
  assert.equal(controller.shouldCrossToPalace({ scrollTop: 9100, ...alto, armed: true }), true);
});

test("no fim, com a trava desarmada, a passagem não dispara", () => {
  // Este é o caso do retorno pelo bfcache: a página reaparece já rolada no
  // fim; se a trava não tivesse sido desarmada no `pageshow`, a passagem
  // dispararia sozinha e prenderia o visitante num laço entre Home e palácio.
  const noFim = { scrollTop: 9100, scrollHeight: 10000, viewportHeight: 900 };
  assert.equal(controller.shouldCrossToPalace({ ...noFim, armed: false }), false);
});

test("a margem de 8px é a fronteira real do disparo", () => {
  const base = { scrollHeight: 10000, viewportHeight: 900, armed: true };
  // máximo de rolagem = 10000 - 900 = 9100
  assert.equal(controller.shouldCrossToPalace({ ...base, scrollTop: 9092 }), true); // maximo - 8
  assert.equal(controller.shouldCrossToPalace({ ...base, scrollTop: 9091 }), false); // maximo - 9
});

test("documento sem rolagem não dispara passagem, armada ou não", () => {
  const semRolagem = { scrollTop: 0, scrollHeight: 800, viewportHeight: 900 };
  assert.equal(controller.shouldCrossToPalace({ ...semRolagem, armed: true }), false);
  assert.equal(controller.shouldCrossToPalace({ ...semRolagem, armed: false }), false);
});
