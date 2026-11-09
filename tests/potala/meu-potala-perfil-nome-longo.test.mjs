import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../../outputs/css/conta.css", import.meta.url), "utf8");

function regra(seletor) {
  const inicio = css.indexOf(`${seletor} {`);
  assert.notEqual(inicio, -1, `regra ${seletor} não encontrada`);
  return css.slice(inicio, css.indexOf("}", inicio));
}

test("o nome do perfil quebra e-mails e nomes longos sem espaço", () => {
  assert.match(regra(".mp-perfil-nome"), /overflow-wrap:\s*anywhere/);
  assert.match(regra(".mp-perfil-bio"), /overflow-wrap:\s*anywhere/);
  assert.match(regra(".mp-perfil-resumo .mp-cartao-detalhe"), /overflow-wrap:\s*anywhere/);
});

test("o texto ao lado do avatar e as colunas do perfil podem encolher", () => {
  assert.match(regra(".mp-perfil-resumo > :not(.mp-avatar)"), /min-width:\s*0/);
  assert.match(regra(".mp-perfil > *"), /min-width:\s*0/);
});

test("o avatar não encolhe e a página não esconde o transbordamento", () => {
  assert.match(regra(".mp-avatar"), /flex:\s*none/);
  assert.doesNotMatch(regra(".mp-perfil"), /overflow-x:\s*hidden/);
  assert.doesNotMatch(css, /(?:^|\n)\s*(?:html|body)\s*(?:,[^{]*)?\{[^}]*overflow-x:\s*hidden/);
});
