import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { criarAtividadeDaConta, criarEndereco, criarPrivacidade, FABRICAS } from "../../outputs/js/conta/modelos.js";

const sql = await readFile(new URL("../../supabase/migrations/202610290002_meu_potala_privacidade.sql", import.meta.url), "utf8");
const adaptador = await readFile(new URL("../../outputs/js/conta/adaptadores/supabase.js", import.meta.url), "utf8");
const configuracoes = await readFile(new URL("../../outputs/js/conta/spa/vistas/configuracoes.js", import.meta.url), "utf8");

test("T-01: endereço, privacidade e atividade têm modelos reais", () => {
  assert.equal(typeof FABRICAS.enderecos, "function");
  assert.equal(criarEndereco({ destinatario: "Pessoa A", cep: "01234-567", logradouro: "Rua Um", numero: "10", bairro: "Centro", cidade: "São Paulo", uf: "sp" }).uf, "SP");
  assert.throws(() => criarEndereco({ destinatario: "A", cep: "x", logradouro: "R", numero: "1", bairro: "B", cidade: "C", uf: "SP" }), /CEP/);
  assert.equal(criarPrivacidade({ analytics: true }).analytics, true);
  assert.equal(criarAtividadeDaConta({ acao: "profile_updated" }).acao, "profile_updated");
});

test("T-01: todas as novas tabelas têm RLS, revoke e vínculo com auth.uid", () => {
  for (const tabela of ["user_addresses", "privacy_preferences", "account_activity"]) {
    assert.match(sql, new RegExp(`alter table public\\.${tabela} enable row level security;`));
    assert.match(sql, new RegExp(`revoke all on table public\\.${tabela} from public, anon, authenticated;`));
  }
  assert.doesNotMatch(sql, /grant (select|insert|update|delete)[^;]* to anon/);
  assert.match(sql, /account_activity[\s\S]*grant select on table public\.account_activity to authenticated/);
  assert.doesNotMatch(sql, /grant (insert|update|delete) on table public\.account_activity/);
  for (const policy of sql.match(/create policy[\s\S]*?;/g) || []) assert.match(policy, /\(select auth\.uid\(\)\)/);
});

test("T-01: trilha é escrita por triggers não executáveis pelo navegador", () => {
  assert.match(sql, /security definer[\s\S]*set search_path = ''/);
  assert.match(sql, /revoke execute on function public\.log_own_account_activity\(\) from public, anon, authenticated/);
  assert.match(sql, /after insert or update or delete on public\.user_addresses/);
  assert.match(adaptador, /atividadesDaConta[^\n]+account_activity/);
  assert.match(adaptador, /trilha da conta é registrada somente pelo servidor/);
});

test("T-01: configurações oferecem endereço e escolhas persistidas sem expor user_id", () => {
  assert.match(configuracoes, /data-form="endereco"/);
  assert.match(configuracoes, /data-form="privacidade"/);
  assert.match(configuracoes, /sessao\.colecao\("enderecos"\)\.gravar/);
  assert.match(configuracoes, /sessao\.colecao\("privacidade"\)\.gravar/);
  assert.doesNotMatch(configuracoes, /user_id/);
});
