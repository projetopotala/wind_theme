import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { shouldCloseOnScroll } from "../../outputs/js/home/home-controller.js";

test("tremor não fecha o bloco; gesto fecha", () => {
  const base = { openedAt: 1200, viewportHeight: 800 };

  /*
   * O limiar separa decisão de tremor: um toque no trackpad, o repique de uma
   * rolagem por inércia ou o ajuste de meia linha não podem fechar o que a
   * pessoa está lendo. Com tela de 800px o limiar é 144.
   */
  assert.equal(shouldCloseOnScroll({ ...base, scrollTop: 1240 }), false, "40px é ajuste");
  assert.equal(shouldCloseOnScroll({ ...base, scrollTop: 1340 }), false, "140px ainda não decidiu");
  assert.equal(shouldCloseOnScroll({ ...base, scrollTop: 1400 }), true, "200px é seguir em frente");

  // Fecha nos dois sentidos: subir também é seguir em frente.
  assert.equal(shouldCloseOnScroll({ ...base, scrollTop: 1000 }), true);
  assert.equal(shouldCloseOnScroll({ ...base, scrollTop: 1160 }), false);
});

test("o limiar é uma fração da tela, com um piso", () => {
  /*
   * A mesma distância que é um empurrão num monitor é meia página num celular,
   * por isso a fração; o piso existe para telas muito baixas, onde 18% seria
   * pequeno demais para distinguir do tremor.
   */
  const alto = shouldCloseOnScroll({ openedAt: 0, scrollTop: 200, viewportHeight: 1400 });
  const baixo = shouldCloseOnScroll({ openedAt: 0, scrollTop: 200, viewportHeight: 700 });
  assert.equal(alto, false, "numa tela alta, 200px ainda é pouco");
  assert.equal(baixo, true, "numa tela baixa, 200px já é decisão");

  // Piso: numa tela de 300px, 18% daria 54 — perto demais do tremor.
  assert.equal(shouldCloseOnScroll({ openedAt: 0, scrollTop: 80, viewportHeight: 300 }), false);
  assert.equal(shouldCloseOnScroll({ openedAt: 0, scrollTop: 120, viewportHeight: 300 }), true);
});

test("a rolagem que o próprio clique dispara não fecha o que ele abriu", async () => {
  const controlador = await readFile(
    new URL("../../outputs/js/home/home-controller.js", import.meta.url),
    "utf8",
  );

  /*
   * O menu e o convite ABREM um bloco e rolam até ele. Sem a trégua, essa
   * própria rolagem passaria do limiar e fecharia o bloco no mesmo gesto que o
   * trouxe — o clique pareceria não funcionar.
   *
   * A origem acompanha o movimento enquanto a rolagem programada está em
   * curso, e só congela quando os eventos param de chegar.
   */
  assert.match(controlador, /armAutoClose\(\{ programmatic: true \}\)/);
  assert.match(controlador, /if \(awaitingScroll\) \{[\s\S]*openScrollY = scrollY;/);

  // E o relógio de repouso é desligado ao destruir.
  const limpeza = controlador.slice(controlador.indexOf("destroy() {"));
  assert.match(limpeza, /clearTimeout\(settleTimer\)/);
});
