import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../../outputs/admin.html", import.meta.url), "utf8");

test("a navegação traz a jornada e as áreas de operação", () => {
  for (const secao of [
    "Visão geral", "Agenda", "Salas", "Cursos e atividades", "Pessoas",
    "Inventário", "Movimentações", "Manutenção", "Financeiro", "Relatórios",
    "Jornada", "Blog", "Configurações",
  ]) {
    assert.ok(html.includes(secao), `seção ausente: ${secao}`);
  }
});

test("cada área de operação tem a própria tela, fora do editor", () => {
  for (const secao of ["agenda", "salas", "ofertas", "pessoas", "inventario", "movimentacoes", "manutencao", "financeiro", "relatorios", "configuracoes", "blog"]) {
    assert.match(html, new RegExp(`data-admin-workspace="${secao}"[^>]*hidden`));
  }
  assert.match(html, /data-admin-workspace="jornada"/);
  assert.match(html, /data-op-dialog/);
  assert.match(html, /data-op-status/);
});

test("a abertura é a visão geral operacional, não o editor", () => {
  assert.match(html, /data-admin-section="inicio"/);
  assert.match(html, /data-section="inicio" aria-current="page"/);
  assert.match(html, /data-admin-workspace="inicio"[^>]*data-op-view="dashboard"/);
  assert.match(html, /data-admin-workspace="jornada"[^>]*hidden/);
  for (const secao of ["agenda", "salas", "ofertas", "pessoas", "inventario", "financeiro", "jornada", "blog"]) {
    assert.match(html, new RegExp(`data-section="${secao}"`));
  }
});

test("a barra lateral tem grupos claros e uma biblioteca só de ícones", async () => {
  for (const grupo of ["Visão geral", "Operação", "Pessoas e patrimônio", "Gestão", "Conteúdo do portal"]) {
    assert.match(html, new RegExp(`<p class="admin-nav-group">${grupo}</p>`), `grupo ausente: ${grupo}`);
  }
  /* Os glifos antigos vinham de fontes diferentes e alguns viravam emoji. */
  assert.doesNotMatch(html, /[⌂▦□◇♙▣⇄⌁◉↗✦✎⚙]/u);

  const nav = html.slice(html.indexOf("data-admin-nav aria-label"), html.indexOf("</nav>"));
  const botoes = [...nav.matchAll(/<button type="button"[^>]*data-section="([a-z]+)"[\s\S]*?<\/button>/g)];
  assert.equal(botoes.length, 13);
  for (const [botao, secao] of botoes) {
    assert.match(botao, /<use href="media\/icones-admin\.svg#[a-z-]+"><\/use>/, `sem ícone: ${secao}`);
  }

  const sprite = await readFile(new URL("../../outputs/media/icones-admin.svg", import.meta.url), "utf8");
  const { ICONES } = await import("../../outputs/js/admin/icones.js");
  const usados = new Set([...html.matchAll(/icones-admin\.svg#([a-z-]+)/g)].map((m) => m[1]));
  for (const nome of [...usados, ...ICONES]) assert.match(sprite, new RegExp(`<symbol id="${nome}"`), `fora do sprite: ${nome}`);
});

test("sair, configurações e a gaveta do telefone continuam alcançáveis", () => {
  assert.match(html, /class="admin-nav-rodape"[\s\S]*data-section="configuracoes"[\s\S]*data-admin-sign-out[^>]*>Sair</);
  assert.match(html, /class="admin-topo"[\s\S]*data-admin-nav-toggle[^>]*aria-controls="admin-nav"/);
  assert.match(html, /data-admin-nav-fechar/);
  assert.match(html, /<link rel="stylesheet" href="css\/admin-agenda\.css">/);
  assert.match(html, /<aside class="op-drawer" data-op-drawer aria-labelledby="op-drawer-titulo" hidden>/);
  assert.match(html, /data-op-menu-painel role="menu"/);
});

test("os ganchos que os módulos procuram existem", () => {
  for (const gancho of [
    "data-admin-nav", "data-admin-search", "data-admin-publish", "data-admin-saved-at",
    "data-admin-counts", "data-admin-tabs", "data-admin-list", "data-admin-form",
    "data-admin-form-tabs", "data-admin-preview", "data-admin-preview-device",
    "data-admin-preview-zoom", "data-admin-checklist", "data-admin-media-grid",
    "data-admin-summary-counter", "data-admin-preview-error", "data-admin-toolbar",
  ]) {
    assert.ok(html.includes(gancho), `gancho ausente: ${gancho}`);
  }
});

test("as abas do editor são um tablist de verdade", () => {
  assert.match(html, /role="tablist"/);
  assert.match(html, /role="tab"[^>]*aria-selected/);
  assert.match(html, /role="tabpanel"/);
  for (const painel of ["conteudo", "aparencia", "seo"]) {
    assert.ok(html.includes(`data-panel="${painel}"`), `painel ausente: ${painel}`);
  }
});

/* O contador do mockup mostra "105 / 160". O limite tem de estar declarado no
   próprio campo, senão o contador conta até um número que o campo não respeita. */
test("o resumo declara o limite que o contador mostra", () => {
  assert.match(html, /id="admin-summary"[\s\S]{0,120}maxlength="160"/);
});

test("os campos novos do editor existem, cada um na sua aba", () => {
  assert.match(html, /data-panel="conteudo"[\s\S]*?name="allowPanel"/);
  assert.match(html, /data-panel="aparencia"[\s\S]*?name="titleScale"/);
  assert.match(html, /data-panel="seo"[\s\S]*?name="metaDescription"/);
});

/* O caminho de teclado da reordenação não pode sumir num redesenho: quem não
   usa mouse depende dele para mudar a ordem dos blocos. */
test("a dica de reordenar pelo teclado continua na tela", () => {
  assert.ok(html.includes("Mover acima"));
  assert.ok(html.includes("Mover abaixo"));
});

test("a prévia tem um caminho para quando não carrega", () => {
  assert.match(html, /data-admin-preview-error/);
  assert.match(html, /data-admin-preview-reload/);
});

/*
 * O `hidden` da tela de login tem de vencer o `display` declarado para ela.
 *
 * O navegador aplica `display: none` a `[hidden]` na folha dele, que perde para
 * qualquer regra de autor — e `.admin-entry` declara `display: grid`. Medido no
 * navegador antes desta regra: o atributo estava posto e o `display` computado
 * seguia "grid", com o login e o painel empilhados na mesma página.
 */
/*
 * O painel tem a altura da tela e não rola; cada região rola por dentro.
 *
 * As telas operacionais rolam em `.admin-workspace`. O editor da Jornada não é
 * uma delas: ocupa as áreas head/status/columns. Sem rolagem própria, a coluna
 * cresceu até 4335px dentro de um painel de 768px e tudo abaixo da dobra ficou
 * inalcançável — só a prévia, que tem rolagem própria, continuava descendo.
 */
test("o editor da Jornada rola dentro do painel de altura fixa", async () => {
  const css = await readFile(new URL("../../outputs/css/admin.css", import.meta.url), "utf8");
  const regra = (seletor) => new RegExp(`(?:^|\\n)${seletor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([^}]*)\\}`).exec(css)?.[1] || "";
  assert.match(regra(".admin-panel"), /height:\s*100svh/);
  assert.match(regra(".admin-panel"), /overflow:\s*hidden/);
  const colunas = regra(".admin-columns");
  assert.match(colunas, /min-height:\s*0/, "sem min-height: 0 a linha 1fr cresce com o conteúdo");
  assert.match(colunas, /overflow-y:\s*auto/, "a coluna do editor precisa rolar");
});

/*
 * O cabeçalho do editor cabe numa linha.
 *
 * Medido antes: 216px de altura em 768. A regra global de campos
 * (`input[type="search"] { width: 100% }`) vencia `.admin-search` por
 * especificidade, a busca ocupava a largura inteira e empurrava os botões para
 * uma terceira linha. A largura da busca precisa de um seletor que vença a
 * regra global, e a linha "salvo às…" vazia não pode ocupar espaço.
 */
test("o cabeçalho do editor da Jornada não empilha em três linhas", async () => {
  const css = await readFile(new URL("../../outputs/css/admin.css", import.meta.url), "utf8");
  assert.match(css, /\.admin-head input\.admin-search \{[^}]*width:\s*\d+px/);
  assert.match(css, /\.admin-saved-at:empty \{[^}]*display:\s*none/);
  assert.match(css, /\.admin-head-title \{[^}]*align-items:\s*baseline/, "título e subtítulo lado a lado");
});

test("esconder um bloco realmente o esconde", async () => {
  const css = await readFile(new URL("../../outputs/css/admin.css", import.meta.url), "utf8");
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
});
