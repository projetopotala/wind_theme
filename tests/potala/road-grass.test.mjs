import assert from "node:assert/strict";
import test from "node:test";
import {
  GRASS_DEFAULTS,
  grassSwayOffset,
  grassTuftsForRange,
} from "../../outputs/js/home/road-grass.js";

test("os tufos cobrem o intervalo pedido com o espaçamento pedido", () => {
  const tufts = grassTuftsForRange({ from: 0, to: 200, spacing: 25, seed: 7 });
  const distancias = [...new Set(tufts.map((t) => t.distance))].sort((a, b) => a - b);
  assert.deepEqual(distancias, [0, 25, 50, 75, 100, 125, 150, 175, 200]);
  // Os dois lados da estrada recebem tufo em cada posição.
  assert.equal(tufts.length, distancias.length * 2);
  assert.deepEqual([...new Set(tufts.map((t) => t.side))].sort(), [-1, 1]);
});

test("a mesma semente devolve exatamente os mesmos tufos", () => {
  const a = grassTuftsForRange({ from: 100, to: 300, spacing: 25, seed: 3 });
  const b = grassTuftsForRange({ from: 100, to: 300, spacing: 25, seed: 3 });
  assert.deepEqual(a, b);
});

test("a semente muda o resultado, e a posição não depende do intervalo pedido", () => {
  const a = grassTuftsForRange({ from: 0, to: 100, spacing: 25, seed: 1 });
  const b = grassTuftsForRange({ from: 0, to: 100, spacing: 25, seed: 2 });
  assert.notDeepEqual(a, b);

  // Um tufo em 75 tem que sair igual pedindo 0-100 ou 50-150: a estrada rola e
  // o intervalo visível muda a cada quadro, mas a grama não pode se mexer.
  const largo = grassTuftsForRange({ from: 0, to: 100, spacing: 25, seed: 5 });
  const estreito = grassTuftsForRange({ from: 50, to: 150, spacing: 25, seed: 5 });
  const de = (lista, distancia, side) =>
    lista.find((t) => t.distance === distancia && t.side === side);
  assert.deepEqual(de(largo, 75, 1), de(estreito, 75, 1));
  assert.deepEqual(de(largo, 75, -1), de(estreito, 75, -1));
});

test("altura e inclinação ficam dentro da faixa declarada", () => {
  const tufts = grassTuftsForRange({ from: 0, to: 2000, spacing: 20, seed: 11 });
  const [minima, maxima] = GRASS_DEFAULTS.height;
  for (const tuft of tufts) {
    assert.ok(tuft.height >= minima && tuft.height <= maxima, `altura ${tuft.height}`);
    assert.ok(Math.abs(tuft.lean) <= GRASS_DEFAULTS.lean, `inclinação ${tuft.lean}`);
    assert.ok(tuft.phase >= 0 && tuft.phase < Math.PI * 2, `fase ${tuft.phase}`);
  }
});

test("intervalo inválido devolve lista vazia em vez de estourar", () => {
  assert.deepEqual(grassTuftsForRange({ from: 300, to: 100, spacing: 25, seed: 1 }), []);
  assert.deepEqual(grassTuftsForRange({ from: 0, to: 100, spacing: 0, seed: 1 }), []);
});

test("a oscilação é limitada e some quando a fase não anda", () => {
  const [tuft] = grassTuftsForRange({ from: 0, to: 0, spacing: 25, seed: 9 });
  assert.equal(grassSwayOffset(tuft, 0), grassSwayOffset(tuft, 0));
  for (const phase of [0, 0.7, 1.9, 4.2, 12.5]) {
    assert.ok(Math.abs(grassSwayOffset(tuft, phase)) <= GRASS_DEFAULTS.sway * tuft.height);
  }
});
