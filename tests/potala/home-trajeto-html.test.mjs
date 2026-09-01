import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { mountHomeJourney } from "../../outputs/js/home/home-controller.js";
import { mountJourney } from "../../outputs/js/home/home-scenes.js";

test("Home aponta o navegador para o módulo Three.js local", async () => {
  const html = await readFile(new URL("../../outputs/transcendido.html", import.meta.url), "utf8");
  assert.match(html, /type="importmap"/);
  assert.match(html, /\.\/vendor\/three\.module\.min\.js/);
});

test("fim editorial não contém subida nem destino automático", () => {
  const root = { innerHTML: "", querySelectorAll() { return []; } };
  mountJourney(root, { regions: [], discoveries: [] });
  assert.doesNotMatch(root.innerHTML, /journey-ascent|palacio\.html/i);
  assert.match(root.innerHTML, /journey-continuation/);
});

test("montagem solicita somente blocos publicados e os entrega ao controlador", async () => {
  const requested = [];
  const published = [{ id: "quem-somos", title: "Quem somos", side: "left" }];
  const root = {};
  const canvas = {};
  let received;
  const controller = { destroy() {} };

  const result = await mountHomeJourney({
    repository: {
      async list(options) {
        requested.push(options);
        return published;
      },
    },
    elements: { root, canvas },
    controllerFactory(options) {
      received = options;
      return controller;
    },
    lifecycle: false,
  });

  assert.deepEqual(requested, [{ publishedOnly: true }]);
  assert.equal(received.root, root);
  assert.equal(received.canvas, canvas);
  assert.equal(received.blocks, published);
  assert.equal(result, controller);
});


test("o bloco editorial tem fundo próprio, não a paisagem por baixo", async () => {
  const css = await readFile(new URL("../../outputs/css/home-journey.css", import.meta.url), "utf8");

  // Regex literal por token: montar a expressão com `new RegExp` e string
  // obriga a escapar duas vezes, e um escape a menos passa despercebido
  // porque a busca simplesmente devolve nada.
  const alfa = (regex, nome) => {
    const achado = css.match(regex);
    assert.ok(achado, `${nome} sumiu do CSS`);
    return Number(achado[1]);
  };


  /*
   * A .82 a paisagem atravessava o bloco: o texto ficava sobre montanha, água e
   * névoa ao mesmo tempo, e o contraste mudava de linha para linha conforme o
   * que passava por trás. Um painel de leitura precisa de fundo próprio; o
   * pouco de transparência que resta serve para ele pertencer à cena, não para
   * a cena ser lida através dele.
   */
  assert.ok(alfa(/--journey-panel:\s*rgba\([^)]*,\s*([\d.]+)\s*\)/, "--journey-panel") >= .92, "o bloco fechado está transparente demais para ler");
  assert.ok(alfa(/--journey-panel-open:\s*rgba\([^)]*,\s*([\d.]+)\s*\)/, "--journey-panel-open") >= .95, "o bloco aberto está transparente demais para ler");

  // Sem desfoque de fundo: o bloco escala e translada, e desfocar superfície
  // grande em movimento é caro em toda máquina.
  const conteudo = css.slice(css.indexOf(".region-content {"), css.indexOf("}", css.indexOf(".region-content {")));
  assert.doesNotMatch(conteudo, /backdrop-filter/);
});
