import assert from "node:assert/strict";
import test from "node:test";

import { motivoDaFalha } from "../../outputs/js/admin/admin-draft.js";

/*
 * UMA FALHA PRECISA DIZER O QUE FAZER A SEGUIR.
 *
 * "Verifique a conexao e tente de novo" era a resposta para tudo. Quando a
 * causa era outra — a tabela de rascunhos nunca criada no banco, ou uma conta
 * sem permissao de administrador — a mensagem mandava tentar de novo uma acao
 * que ia falhar identica todas as vezes, e apontava a rede, que estava boa.
 *
 * O Postgres ja diz o que houve, no `code`. Traduzir esse codigo e o que separa
 * um problema de cinco minutos de uma tarde procurando no lugar errado.
 */

test("tabela que nao existe nao vira problema de conexao", () => {
  /* 42P01 = undefined_table. Acontece com a migracao dos rascunhos ainda nao
     aplicada ao banco — o caso mais comum, e o menos obvio. */
  const motivo = motivoDaFalha({ code: "42P01" });
  assert.match(motivo, /banco|migra/i);
  assert.doesNotMatch(motivo, /conex/i, "mandou verificar a conexao, que estava boa");
});

test("PostgREST tambem avisa que a tabela nao esta no schema", () => {
  /* PGRST205: a tabela nao esta no cache de schema do PostgREST. Mesma causa
     pratica, codigo de outra camada. */
  const motivo = motivoDaFalha({ code: "PGRST205" });
  assert.match(motivo, /banco|migra/i);
});

test("falta de permissao aponta a conta, e nao a rede", () => {
  /* 42501 = insufficient_privilege, e tambem o que a RPC levanta quando
     `is_portal_admin()` diz nao. */
  const motivo = motivoDaFalha({ code: "42501" });
  assert.match(motivo, /permiss|administrad/i);
  assert.doesNotMatch(motivo, /conex/i);
});

test("a mensagem de admin exigido e reconhecida pelo texto", () => {
  const motivo = motivoDaFalha({ message: "portal_admin_required" });
  assert.match(motivo, /permiss|administrad/i);
});

test("coluna que falta aponta o banco desatualizado", () => {
  /* 42703 = undefined_column: o banco tem a tabela, mas de uma versao anterior
     as colunas que o editor passou a gravar. */
  const motivo = motivoDaFalha({ code: "42703" });
  assert.match(motivo, /banco|coluna|migra/i);
});

test("o que nao se reconhece continua sendo tratado como conexao", () => {
  /*
   * O padrao continua o palpite mais util para uma falha desconhecida — mas so
   * DEPOIS de descartar as causas que temos como nomear. Adivinhar primeiro era
   * o defeito.
   */
  assert.match(motivoDaFalha({ code: "XX000" }), /conex/i);
  assert.match(motivoDaFalha(null), /conex/i);
  assert.match(motivoDaFalha(undefined), /conex/i);
});
