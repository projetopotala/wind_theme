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

/*
 * A regra CSS que apagava o mundo e a legenda enquanto o poema falava saiu com
 * a cena antiga: a Chegada virou uma composição única com chegada.png, sem
 * atores nem versos, e a regra passou a não ter a que se aplicar. O teste dela
 * saiu junto — guardar um seletor que não pode existir só produziria uma
 * falha permanente sem defeito por trás.
 *
 * O que continua abaixo testa os módulos em si, que seguem no repositório e
 * seguem coerentes: soltar a atenção sem apagar a memória do que foi tocado.
 */

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
