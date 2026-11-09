import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../../outputs/css/conta.css", import.meta.url), "utf8");

function bloco(seletor) {
  const inicio = css.indexOf(`${seletor} {`);
  assert.notEqual(inicio, -1, `bloco ${seletor} não encontrado`);
  return css.slice(inicio, css.indexOf("}", inicio));
}

test("o título do Meu Potala quebra nomes longos sem espaço (e-mail como nome)", () => {
  const titulo = bloco(".mp-titulo");
  assert.match(titulo, /overflow-wrap:\s*anywhere/);
  assert.match(titulo, /min-width:\s*0/);
});

test("o cabeçalho e o texto de apoio acompanham a largura da página", () => {
  assert.match(bloco(".mp-cabecalho"), /min-width:\s*0/);
  assert.match(bloco(".mp-lede"), /overflow-wrap:\s*anywhere/);
});

test("a correção não esconde o transbordamento no body ou na página", () => {
  assert.doesNotMatch(css, /(?:^|\n)\s*(?:html|body)\s*(?:,[^{]*)?\{[^}]*overflow-x:\s*hidden/);
  assert.doesNotMatch(bloco(".mp-pagina"), /overflow-x:\s*hidden/);
});
