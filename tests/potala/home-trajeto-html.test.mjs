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

test("ao abrir, a página desloca o vão e o trajeto é avisado", async () => {
  const css = await readFile(new URL("../../outputs/css/home-journey.css", import.meta.url), "utf8");
  const controlador = await readFile(new URL("../../outputs/js/home/home-controller.js", import.meta.url), "utf8");

  /*
   * As colunas ficam desiguais de propósito: é assim que a tela cede espaço
   * para o lado do bloco, em vez de o bloco apenas engordar dentro da metade
   * dele — o que passava despercebido.
   */
  assert.match(css, /is-expanded\[data-side="left"\] \.region-stage \{[^}]*grid-template-columns/);
  assert.match(css, /is-expanded\[data-side="right"\] \.region-stage \{[^}]*grid-template-columns/);

  /*
   * E o trajeto tem de andar junto. Ele é desenhado por uma câmera, não pela
   * grade: sem alguém medir o quanto o vão saiu do centro e repassar, a linha
   * ficaria parada no meio da tela e o bloco aberto passaria por cima dela.
   */
  assert.match(controlador, /setLateralShift/);
  assert.match(controlador, /gridTemplateColumns/, "a medida sai da grade já resolvida, não de uma segunda conta");
});

test("o deslocamento é animado, e a linha segue a animação em vez de repeti-la", async () => {
  const css = await readFile(new URL("../../outputs/css/home-journey.css", import.meta.url), "utf8");
  const controlador = await readFile(new URL("../../outputs/js/home/home-controller.js", import.meta.url), "utf8");

  const palco = css.slice(css.indexOf(".region-stage {"), css.indexOf("}", css.indexOf(".region-stage {")));

  /*
   * Sem as colunas na transição a página saltava de largura de um quadro para
   * o outro: existiam o antes e o depois, mas não o deslocamento — que é o
   * gesto inteiro. Conferido no navegador que elas interpolam mesmo: a 25% do
   * tempo, a grade lê 545.6px 177.5px 444.6px.
   */
  assert.match(palco, /transition:[^;]*grid-template-columns/);

  /*
   * E a linha SEGUE essa animação, medindo-a. Animar a câmera em paralelo, com
   * a curva repetida em JavaScript, criaria duas curvas que precisam coincidir
   * — e que divergem assim que alguém ajustar o tempo de um lado só. A
   * divergência aparece exatamente como o defeito a evitar: a linha chegando
   * antes ou depois do vão que deveria ocupar.
   */
  assert.match(controlador, /requestAnimationFrame\(\(\) => followGutter/);
  assert.doesNotMatch(controlador, /cubic-bezier|easeOut|bezier\(/, "a curva não pode ser repetida no JS");

  // A leitura por quadro é limitada à transição, e o quadro pendente é
  // cancelado ao destruir — senão sobra um laço rodando sobre um DOM morto.
  assert.match(controlador, /shiftUntil = performance\.now\(\)/);
  assert.match(controlador, /if \(shiftFrame\) cancelAnimationFrame\(shiftFrame\);\s*\n\s*expansion\.destroy\(\);/);
});
