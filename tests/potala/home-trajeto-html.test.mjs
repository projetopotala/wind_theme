import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  mountHomeJourney,
  regionIndexWithinPair,
} from "../../outputs/js/home/home-controller.js";
import { mountJourney, renderJourneyMenu } from "../../outputs/js/home/home-scenes.js";

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
    css.indexOf(".journey-pair.is-present .region-content {"),
    css.indexOf("}", css.indexOf(".journey-pair.is-present .region-content {")),
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
  assert.match(css, /is-expanded\[data-side="left"\]\) \.region-stage \{[^}]*grid-template-columns/);
  assert.match(css, /is-expanded\[data-side="right"\]\) \.region-stage \{[^}]*grid-template-columns/);

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
  // O que importa é o cancelamento acontecer na limpeza — não estar colado na
  // linha seguinte, que muda toda vez que algo novo entra no destroy.
  const limpeza = controlador.slice(controlador.indexOf("destroy() {"));
  assert.match(limpeza, /cancelAnimationFrame\(shiftFrame\)/);
});

test("as seções andam aos pares, e a irmã recua em vez de ser empurrada", async () => {
  const css = await readFile(new URL("../../outputs/css/home-journey.css", import.meta.url), "utf8");
  const cenas = await readFile(new URL("../../outputs/js/home/home-scenes.js", import.meta.url), "utf8");

  // O par é a unidade de rolagem: é ele que tem altura e atravessa a tela.
  assert.match(css, /\.journey-pair \{[^}]*min-height: var\(--pair-height/);
  assert.match(cenas, /export function renderPair/);
  assert.match(cenas, /inicio \+= 2/, "os blocos são agrupados de dois em dois");

  /*
   * A irmã encolhe junto com a coluna dela. Sem isso ela mantinha a largura de
   * antes numa coluna estreitada e ia parar fora da tela: medido, 1370px numa
   * janela de 1280. Encolher é o que transforma o empurrão em recuo.
   */
  const recuo = css.slice(
    css.indexOf(".journey-region:not(.is-expanded) .region-content {"),
    css.indexOf("}", css.indexOf(".journey-region:not(.is-expanded) .region-content {")),
  );
  assert.match(recuo, /width: 100%/);

  // E o recuo MULTIPLICA a presença: fixo, a irmã acenderia com o par ainda
  // fora da tela, enquanto a aberta continuaria invisível.
  assert.match(recuo, /calc\(clamp\([^)]*var\(--region-presence/);
});

test("a prévia compacta mantém os dois blocos em colunas separadas", async () => {
  const css = await readFile(new URL("../../outputs/css/home-journey.css", import.meta.url), "utf8");

  const inicio = css.indexOf("@media (min-width: 560px) and (max-width: 720px)");
  assert.ok(inicio >= 0, "faltou o modo compacto específico da prévia");
  const regras = css.slice(inicio);

  assert.match(regras, /\.is-admin-preview \.region-stage \{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)[^;]*minmax\(0,\s*1fr\)/);
  assert.match(regras, /\.is-admin-preview \.journey-region\[data-side="left"\] \.region-content \{[^}]*grid-column:\s*1/);
  assert.match(regras, /\.is-admin-preview \.journey-region\[data-side="right"\] \.region-content \{[^}]*grid-column:\s*3/);
  assert.match(regras, /\.is-admin-preview \.region-title \{[^}]*font-size:/, "a miniatura precisa reduzir a tipografia");

  const inicioEstreito = css.indexOf("@media (max-width: 559px)");
  assert.ok(inicioEstreito >= 0, "faltou impedir a sobreposição na prévia estreita");
  const estreito = css.slice(inicioEstreito);
  assert.match(estreito, /\.is-admin-preview \.region-stage \{[^}]*grid-template-rows:\s*repeat\(2,/);
  assert.match(estreito, /data-side="left"[^}]*grid-row:\s*1/);
  assert.match(estreito, /data-side="right"[^}]*grid-row:\s*2/);
  assert.match(
    estreito,
    /\.is-admin-preview \.journey-pair:has\(\.journey-region\.is-expanded\) \.region-stage \{[^}]*grid-template-columns:\s*var\(--journey-line-gutter\)\s+minmax\(0,\s*1fr\)/,
    "abrir um cartão não pode voltar à grade desktop e espremê-lo no vão",
  );
});

test("a barra lateral oferece marca, progresso, páginas e painel administrativo", () => {
  const markup = renderJourneyMenu([
    { id: "quem-somos", title: "Quem somos", href: "quem-somos.html" },
    { id: "atendimentos", title: "Atendimentos", href: "atendimentos.html" },
  ]);

  assert.match(markup, /class="journey-sidebar-brand"/);
  assert.match(markup, /src="media\/potala-mark-transparent\.png"/);
  assert.match(markup, /data-journey-current>01</);
  assert.match(markup, /data-journey-total>02</);
  assert.match(markup, /href="quem-somos\.html"[^>]*data-menu-target="quem-somos"/);
  assert.match(markup, /href="atendimentos\.html"[^>]*data-menu-target="atendimentos"/);
  /* O painel virou uma opcao do botao redondo do rodape, ao lado de
     "Contate-nos" — que e o que um visitante de fato procura ali embaixo. */
  assert.match(markup, /journey-sidebar-opcoes[\s\S]*?href="admin\.html"/);
  assert.match(markup, /Contate-nos/);
});

test("a barra fica permanente no desktop e recolhida no celular", async () => {
  const css = await readFile(new URL("../../outputs/css/home-journey.css", import.meta.url), "utf8");
  const controlador = await readFile(new URL("../../outputs/js/home/home-controller.js", import.meta.url), "utf8");

  assert.match(css, /--journey-sidebar-width:/);
  assert.match(css, /--journey-sidebar-surface:\s*rgba\(94,\s*69,\s*41,\s*\.76\)/);
  assert.match(css, /\.journey-menu\s*\{[\s\S]*backdrop-filter:\s*blur\(/);
  assert.match(css, /@media \(min-width:\s*901px\)[\s\S]*\.journey-menu\s*\{[\s\S]*visibility:\s*visible/);
  assert.match(css, /@media \(max-width:\s*900px\)[\s\S]*\.journey-menu\s*\{[\s\S]*transform:\s*translateX\(-/);
  assert.match(css, /body\.is-journey-menu-open\s*\{[^}]*overflow:\s*hidden/);
  assert.match(controlador, /matchMedia\("\(min-width: 901px\)"\)/);
  assert.match(controlador, /menuNav\.removeAttribute\("inert"\)/);
  assert.match(controlador, /menuNav\.setAttribute\("inert", ""\)/);
});

test("o card fechado mantém títulos de uma palavra em uma linha", async () => {
  const css = await readFile(new URL("../../outputs/css/home-journey.css", import.meta.url), "utf8");

  assert.match(
    css,
    /\.journey-region\[data-title-flow="single"\]:not\(\.is-expanded\) \.region-title\s*\{[^}]*white-space:\s*nowrap/s,
  );
  assert.match(css, /data-title-flow="single"[\s\S]*@media \(max-width:\s*720px\)/);
});

test("os dois cards fechados de cada etapa compartilham a altura do maior", async () => {
  const css = await readFile(new URL("../../outputs/css/home-journey.css", import.meta.url), "utf8");
  const seletor = ".region-stage:not(:has(.journey-region.is-expanded))";
  const inicio = css.indexOf(`${seletor} {`);

  assert.ok(inicio >= 0, "faltou a regra que iguala o par sem afetar o card aberto");
  const regra = css.slice(inicio, css.indexOf("}", inicio));
  assert.match(regra, /align-items:\s*stretch/, "o card menor precisa ocupar a altura da linha definida pelo maior");
  assert.match(regra, /align-content:\s*center/, "o par igualado precisa continuar centralizado na tela");
});

test("o botão móvel usa a marca e descreve abertura e fechamento", async () => {
  const markup = renderJourneyMenu([{ id: "cursos", title: "Cursos", href: "cursos.html" }]);
  const controlador = await readFile(new URL("../../outputs/js/home/home-controller.js", import.meta.url), "utf8");

  assert.match(markup, /class="journey-menu-toggle"/);
  assert.match(markup, /aria-expanded="false" aria-controls="journey-menu"/);
  assert.match(markup, /<img[^>]*potala-mark-transparent\.png/);
  assert.match(controlador, /"Fechar navegação" : "Abrir navegação"/);
});

test("o índice lateral funciona como roleta linear de cinco seções", async () => {
  const markup = renderJourneyMenu(Array.from({ length: 8 }, (_, index) => ({
    id: `secao-${index + 1}`,
    title: `Seção ${index + 1}`,
    href: `secao-${index + 1}.html`,
  })));
  const css = await readFile(new URL("../../outputs/css/home-journey.css", import.meta.url), "utf8");
  const controlador = await readFile(new URL("../../outputs/js/home/home-controller.js", import.meta.url), "utf8");

  assert.match(markup, /class="journey-menu-viewport"/);
  assert.match(css, /--journey-menu-visible:\s*5/);
  /*
   * `hidden`, e nao `auto`: a roleta e um INDICADOR, e quem a move e a rolagem
   * da pagina. Rolavel pela mao, ela discordava da pagina — a pessoa arrastava
   * a lista, soltava, e ficava com uma secao destacada que nao tinha nada a ver
   * com o que estava na tela. `scrollTo` por codigo continua funcionando.
   */
  assert.match(css, /\.journey-menu-viewport\s*\{[^}]*overflow-y:\s*hidden/);
  assert.match(css, /\.journey-menu-viewport\s*\{[^}]*mask-image:\s*linear-gradient/);
  /*
   * O encaixe por rolagem SAIU junto com a rolagem manual.
   *
   * `scroll-snap-type` só age sobre quem rola a caixa com a mão, e a roleta
   * deixou de aceitar isso: ela é um indicador, e quem a move é a rolagem da
   * página, por `scrollTo`. A propriedade virava uma promessa sem efeito, e uma
   * promessa dessas custa a próxima pessoa lendo o CSS e procurando o encaixe
   * que nunca acontece.
   *
   * `scroll-snap-align` fica nas linhas: é ele que o `scrollTo` usa para pousar
   * o item ativo no centro em vez de no topo.
   */
  assert.ok(!/scroll-snap-type/.test(css), "o encaixe voltou sem a rolagem manual");
  assert.match(css, /scroll-snap-align:\s*center/);
  assert.match(controlador, /menuViewport\.scrollTo\?\.\(\{/);
  assert.match(controlador, /menuViewport\?\.addEventListener\("focusin"/);
});

test("a roleta troca do bloco esquerdo para o direito na metade do par", () => {
  const geometry = {
    pairTop: 1000,
    pairHeight: 1600,
    viewportHeight: 800,
    regionCount: 2,
  };

  assert.equal(regionIndexWithinPair({ ...geometry, scrollY: 700 }), 0);
  assert.equal(regionIndexWithinPair({ ...geometry, scrollY: 1400 }), 1);
  assert.equal(regionIndexWithinPair({ ...geometry, scrollY: 2400 }), 1);
});
