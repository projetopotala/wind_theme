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

test("o bloco fica cheio antes de chegar ao centro da tela", async () => {
  const css = await readFile(new URL("../../outputs/css/home-journey.css", import.meta.url), "utf8");
  const { presenceForRegionBounds } = await import("../../outputs/js/home/home-scenes.js");

  const regra = css.slice(
    css.indexOf(".journey-region.is-present .region-content {"),
    css.indexOf("}", css.indexOf(".journey-region.is-present .region-content {")),
  );
  const fator = Number(regra.match(/--region-presence[^)]*\)\s*\*\s*([\d.]+)/)?.[1]);
  assert.ok(fator >= 2, `a curva de opacidade precisa saturar cedo; achei ${fator || "nenhum fator"}`);

  /*
   * Sem a saturação, a opacidade seguia a presença: um bloco a meio caminho do
   * centro ficava a meia opacidade, e a paisagem atravessava o painel bem na
   * hora da leitura. O aparecer e o desaparecer continuam — nas pontas, onde
   * são efeito — mas o miolo da passagem fica cheio.
   */
  const viewport = 720;
  const meioCaminho = presenceForRegionBounds({ top: 250, bottom: 1930, viewportHeight: viewport });
  assert.ok(meioCaminho > 0.2 && meioCaminho < 0.9, "o caso medido precisa ser um meio-termo");
  assert.ok(meioCaminho * fator >= 1, "a meio caminho do centro o bloco já devia estar opaco");
});

test("ao abrir, a folga vem da margem externa e o bloco se centra nela", async () => {
  const css = await readFile(new URL("../../outputs/css/home-journey.css", import.meta.url), "utf8");

  const palcoAberto = css.slice(
    css.indexOf(".journey-region.is-expanded .region-stage {"),
    css.indexOf("}", css.indexOf(".journey-region.is-expanded .region-stage {")),
  );
  const blocoAberto = css.slice(
    css.indexOf(".journey-region.is-expanded .region-content {"),
    css.indexOf("}", css.indexOf(".journey-region.is-expanded .region-content {")),
  );

  /*
   * A folga tem de sair do recuo EXTERNO, nunca do vão do meio. O trajeto é
   * desenhado num canvas fixo, posicionado pela câmera e não pela grade:
   * estreitar a coluna central para alargar a lateral moveria o vão sem mover
   * a linha, e o bloco passaria por cima dela. Medido a 1280px: aberto, o
   * bloco vai de 439 para 498px e para exatamente na borda do vão.
   */
  assert.match(palcoAberto, /padding-inline:/, "o recuo externo é que cede espaço");
  assert.doesNotMatch(palcoAberto, /grid-template-columns/, "o vão do trajeto não pode se mexer");

  // E o bloco deixa de ficar encostado no vão para ocupar o meio do espaço.
  assert.match(blocoAberto, /justify-self:\s*center/);
});
