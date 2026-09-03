import assert from "node:assert/strict";
import test from "node:test";

import { comRelacoes } from "../../outputs/js/home/home-controller.js";
import { DEFAULT_HOME_BLOCKS } from "../../outputs/js/home/journey-data.js";

/*
 * As relações vêm dos dados da jornada, não do que está gravado.
 *
 * O conteúdo editável vive no banco, e o banco não tem coluna para relações —
 * uma Home lendo de lá recebia todo bloco com a lista vazia, e a seção de
 * caminhos do painel não aparecia em nenhum deles. Medido no navegador: dez
 * blocos, zero listas, sem erro e sem espaço em branco.
 */
test("um bloco vindo do banco recebe as relações da jornada", () => {
  const doBanco = [{ id: "quem-somos", title: "Quem somos", relatedContent: [] }];
  const [pronto] = comRelacoes(doBanco);

  const padrao = DEFAULT_HOME_BLOCKS.find((bloco) => bloco.id === "quem-somos");
  assert.deepEqual(pronto.relatedContent, padrao.relatedContent);
  assert.ok(pronto.relatedContent.length, "o bloco padrão precisa ter relações");
});

/* O que o bloco já traz vence: no dia em que o painel puder editá-las, a
   escolha de quem edita não pode ser sobrescrita pelo padrão. */
test("relações declaradas no bloco não são substituídas", () => {
  const [pronto] = comRelacoes([{ id: "quem-somos", relatedContent: ["recepcao"] }]);
  assert.deepEqual(pronto.relatedContent, ["recepcao"]);
});

test("bloco sem correspondente nos padrões passa intacto", () => {
  const novo = { id: "inventado", title: "Novo" };
  assert.deepEqual(comRelacoes([novo]), [novo]);
});
