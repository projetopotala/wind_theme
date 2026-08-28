import assert from "node:assert/strict";
import test from "node:test";
import * as controller from "../../outputs/js/home/home-controller.js";

// A subida (`.journey-ascent`) vai de 8000 a 9200 (altura 1200); a viewport
// mede 900. `maximo` = 9200 - 900 = 8300 é o scrollTop em que a base da
// subida encosta na base da viewport — o mesmo "fim da subida" que o
// controlador usa para acionar `crossTo`.
const subida = { ascentStart: 8000, ascentEnd: 9200, viewportHeight: 900 };

test("a passagem ao palácio só dispara no fim da subida, com a trava armada", () => {
  assert.equal(typeof controller.shouldCrossToPalace, "function");

  assert.equal(controller.shouldCrossToPalace({ scrollTop: 0, ...subida, armed: true }), false);
  // Dentro da subida, bem antes do fim dela.
  assert.equal(controller.shouldCrossToPalace({ scrollTop: 8100, ...subida, armed: true }), false);
  assert.equal(controller.shouldCrossToPalace({ scrollTop: 8291, ...subida, armed: true }), false); // maximo - 9
  // No fim da subida.
  assert.equal(controller.shouldCrossToPalace({ scrollTop: 8300, ...subida, armed: true }), true);
});

test("no fim da subida, com a trava desarmada, a passagem não dispara", () => {
  // Este é o caso do retorno pelo bfcache: a página reaparece já rolada no
  // fim da subida; se a trava não tivesse sido desarmada no `pageshow`, a
  // passagem dispararia sozinha e prenderia o visitante num laço entre Home
  // e palácio.
  assert.equal(controller.shouldCrossToPalace({ scrollTop: 8300, ...subida, armed: false }), false);
});

test("a margem de 8px é a fronteira real do disparo", () => {
  const base = { ...subida, armed: true };
  assert.equal(controller.shouldCrossToPalace({ ...base, scrollTop: 8292 }), true); // maximo - 8
  assert.equal(controller.shouldCrossToPalace({ ...base, scrollTop: 8291 }), false); // maximo - 9
});

test("depois da subida, já dentro da continuação, a passagem não dispara", () => {
  // Ponto central da regressão: antes, o disparo era ancorado no fim do
  // documento, então qualquer rolagem dentro de `.journey-continuation` (ou
  // `.journey-footer`, com o link "Voltar à Chegada" e o CTA do Instituto)
  // continuava satisfazendo a condição e disparava a passagem de novo — o
  // que tornava esses dois blocos inalcançáveis. Ancorado na subida, uma vez
  // que o topo da viewport já passou do fim dela (`ascentEnd`), a passagem
  // para de disparar.
  const base = { ...subida, armed: true };
  assert.equal(controller.shouldCrossToPalace({ ...base, scrollTop: 9200 }), false); // == ascentEnd
  assert.equal(controller.shouldCrossToPalace({ ...base, scrollTop: 9800 }), false); // dentro da continuação
});

test("subida sem espaço de rolagem (menor que a viewport) não dispara passagem", () => {
  const semRolagem = { scrollTop: 0, ascentStart: 8000, ascentEnd: 8300, viewportHeight: 900 };
  assert.equal(controller.shouldCrossToPalace({ ...semRolagem, armed: true }), false);
  assert.equal(controller.shouldCrossToPalace({ ...semRolagem, armed: false }), false);
});
