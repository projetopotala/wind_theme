import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  applyWorldAction,
  createWorldState,
  feedProximity,
} from "../../outputs/js/chegada/arrival-world.js";

/*
 * Enquanto o poema fala, ele é a única coisa na tela. O véu é translúcido de
 * propósito — a paisagem continua atrás dos versos — e é justamente por isso
 * que qualquer coisa acesa por cima dele compete com o texto.
 */

test("o mundo e a sua legenda somem junto com o resto enquanto o poema fala", async () => {
  const css = await readFile("outputs/css/chegada-scene.css", "utf8");
  const inicio = css.indexOf("body.is-poem-open .journey-scroll-cue");
  assert.notEqual(inicio, -1, "a regra do poema aberto sumiu");
  const seletores = css.slice(inicio, css.indexOf("{", inicio));

  // Faltando aqui, o anel do elemento clicado fica aceso sobre o próprio verso
  // que ele abriu — foi assim que o defeito apareceu.
  assert.match(seletores, /body\.is-poem-open \.arrival-world/);
  assert.match(seletores, /body\.is-poem-open \.world-prompt/);

  // `pointer-events: none` no contêiner não basta: os botões repõem `auto`.
  const atores = css.indexOf("body.is-poem-open .world-actor");
  assert.notEqual(atores, -1, "os botões precisam parar de responder ao ponteiro");
  assert.match(css.slice(atores, css.indexOf("}", atores)), /pointer-events:\s*none/);
});

test("fechar o poema apaga o realce sem apagar a memória do que foi tocado", () => {
  const ator = { id: "tree", action: "wind", x: 0.2, y: 0.3, cue: "…", label: "A árvore" };
  const despertado = applyWorldAction(createWorldState(), ator, 0);
  assert.equal(despertado.attentionId, "tree");

  const solto = feedProximity(despertado, null);

  // O anel de aproximação some…
  assert.equal(solto.attentionId, null);
  // …mas a marca de já ter sido acordado fica: é memória do caminho percorrido.
  assert.deepEqual(solto.awakened, ["tree"]);
});

test("o motor solta a atenção quando o poema se fecha", async () => {
  const motor = await readFile("outputs/js/chegada/arrival-engine.js", "utf8");
  const controlador = await readFile("outputs/js/chegada/arrival-controller.js", "utf8");

  assert.match(motor, /releaseAttention\(\)\s*\{/, "o motor precisa expor o gesto");

  /*
   * Sem esta chamada o anel só apagaria no próximo movimento do ponteiro — e
   * depois de ler três versos o ponteiro costuma estar parado, então ele ficava
   * aceso indefinidamente, como se o cursor ainda estivesse sobre o elemento.
   */
  const aoFechar = controlador.slice(
    controlador.indexOf("const aoFechar"),
    controlador.indexOf("poem?.show(actor"),
  );
  assert.match(aoFechar, /releaseAttention\(\)/);
  assert.match(controlador, /onClose: aoFechar/);
});
