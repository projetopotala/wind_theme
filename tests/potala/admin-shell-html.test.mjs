import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../../outputs/admin.html", import.meta.url), "utf8");

test("a navegação traz a jornada e as áreas de operação", () => {
  for (const secao of [
    "Jornada", "Financeiro", "Atendimentos", "Salas físicas",
    "Atendimentos virtuais", "Usuários",
  ]) {
    assert.ok(html.includes(secao), `seção ausente: ${secao}`);
  }
});

test("cada área de operação tem a própria tela, fora do editor", () => {
  for (const secao of ["financeiro", "atendimentos", "salas", "virtuais", "usuarios"]) {
    assert.match(html, new RegExp(`data-admin-workspace="${secao}" hidden`));
  }
  assert.match(html, /data-admin-workspace="jornada"/);
});

test("a seção ativa é a Jornada", () => {
  assert.match(html, /data-section="jornada" aria-current="page"/);
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
test("esconder um bloco realmente o esconde", async () => {
  const css = await readFile(new URL("../../outputs/css/admin.css", import.meta.url), "utf8");
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
});
