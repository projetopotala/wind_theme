import assert from "node:assert/strict";
import test from "node:test";

import {
  arrivalProgress,
  mountArrivalPlate,
  pointerOffset,
  shouldEnterHome,
} from "../../outputs/js/chegada/arrival-plate-controller.js";

test("o progresso da Chegada percorre a placa inteira sem ultrapassar os limites", () => {
  assert.equal(arrivalProgress({ scrollTop: -30, travel: 1000 }), 0);
  assert.equal(arrivalProgress({ scrollTop: 500, travel: 1000 }), .5);
  assert.equal(arrivalProgress({ scrollTop: 1200, travel: 1000 }), 1);
  assert.equal(arrivalProgress({ scrollTop: 50, travel: 0 }), 1);
});

test("o movimento de ponteiro permanece ambiental e limitado", () => {
  assert.deepEqual(pointerOffset({ clientX: 0, clientY: 0, width: 1000, height: 500 }), { x: -6, y: -6 });
  assert.deepEqual(pointerOffset({ clientX: 500, clientY: 250, width: 1000, height: 500 }), { x: 0, y: 0 });
  assert.deepEqual(pointerOffset({ clientX: 1000, clientY: 500, width: 1000, height: 500 }), { x: 6, y: 6 });
});

test("a passagem acontece apenas no final e pode ser rearmada depois de voltar", () => {
  assert.equal(shouldEnterHome({ progress: .984, entered: false }), false);
  assert.equal(shouldEnterHome({ progress: .985, entered: false }), true);
  assert.equal(shouldEnterHome({ progress: 1, entered: true }), false);
});

/**
 * Dublês mínimos de janela e documento.
 *
 * A placa não desenha nada: ela escreve variáveis CSS, ouve rolagem e entrega a
 * travessia. Tudo isso é observável sem navegador, e é por isso que os dois
 * defeitos abaixo — passagem repetida e ouvinte vazado — cabem em teste.
 */
function ambiente({ altura = 4000, tela = 800 } = {}) {
  const ouvintes = new Map();
  const registrar = (alvo) => ({
    addEventListener: (nome, fn) => {
      if (!ouvintes.has(alvo)) ouvintes.set(alvo, new Map());
      ouvintes.get(alvo).set(nome, fn);
    },
    removeEventListener: (nome) => ouvintes.get(alvo)?.delete(nome),
  });
  const classList = { add() {}, remove() {}, contains: () => false };
  const janela = {
    scrollY: 0,
    innerWidth: 1280,
    innerHeight: tela,
    setTimeout() {},
    ...registrar("janela"),
  };
  const documento = {
    documentElement: { style: { setProperty() {} }, classList, dataset: {} },
    body: { classList },
    querySelector: () => null,
    ...registrar("documento"),
  };
  return {
    janela,
    documento,
    arrival: { offsetHeight: altura },
    visual: { style: { setProperty() {} }, dataset: {} },
    disparar: (alvo, nome, evento = {}) => ouvintes.get(alvo)?.get(nome)?.(evento),
    registrados: (alvo) => [...(ouvintes.get(alvo)?.keys() || [])].sort(),
  };
}

test("a passagem para a Home dispara uma vez só, mesmo com a rolagem parada no fim", () => {
  const env = ambiente();
  let quadro = null;
  const entradas = [];

  mountArrivalPlate({
    arrival: env.arrival,
    visual: env.visual,
    windowRef: env.janela,
    documentRef: env.documento,
    schedule: (fn) => { quadro = fn; return 1; },
    cancel: () => { quadro = null; },
    enter: (opcoes) => entradas.push(opcoes),
  });

  quadro?.();
  assert.equal(entradas.length, 0, "no topo não se atravessa nada");

  // Fim da placa. Cada quadro seguinte volta a ver progresso 1 — sem a trava,
  // a Home seria chamada repetidamente enquanto a rolagem descansasse ali.
  env.janela.scrollY = env.arrival.offsetHeight - env.janela.innerHeight;
  env.disparar("janela", "scroll");
  quadro?.();
  env.disparar("janela", "scroll");
  quadro?.();

  assert.equal(entradas.length, 1);
  assert.equal(entradas[0].entry, "scroll");
});

test("sair de vez desmonta a placa; sair para o bfcache não", () => {
  const env = ambiente();
  mountArrivalPlate({
    arrival: env.arrival,
    visual: env.visual,
    windowRef: env.janela,
    documentRef: env.documento,
    schedule: () => 1,
    cancel: () => {},
    enter: () => {},
  });

  const antes = env.registrados("janela");
  assert.ok(antes.includes("scroll") && antes.includes("pagehide"));

  // Persistida: a página volta do cache e precisa continuar ouvindo, senão
  // volta viva mas surda — a rolagem não pinta e a passagem nunca dispara.
  env.disparar("janela", "pagehide", { persisted: true });
  assert.deepEqual(env.registrados("janela"), antes);

  // Definitiva: os ouvintes de window ficariam presos a este documento.
  env.disparar("janela", "pagehide", { persisted: false });
  assert.deepEqual(env.registrados("janela"), []);
  assert.deepEqual(env.registrados("documento"), []);
});
