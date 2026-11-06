import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import atendimentos from "../../outputs/js/conta/spa/vistas/atendimentos.js";
import { criarDadosSupabase } from "../../outputs/js/conta/adaptadores/supabase.js";

const sql = readFileSync(new URL("../../supabase/migrations/202611060001_my_appointment_professional_profiles.sql", import.meta.url), "utf8");
const rpc = (resposta) => {
  const chamadas = [];
  return { chamadas, client: { from() { throw new Error("sem tabela"); }, rpc: async (nome, args) => { chamadas.push([nome, args]); return resposta; } } };
};

test("profissional com vínculo e zero consultas vê a própria agenda vazia, sem interface de cliente", () => {
  const html = atendimentos.renderizar({ perfisProfissionais: [{ id: "p1", nome: "X" }], agendaProfissional: [], atendimentoDisponivel: true });
  assert.match(html, /id="mp-agenda-profissional"/);
  assert.match(html, /Nenhuma consulta futura atribuída a você/);
  assert.doesNotMatch(html, /Solicitar um atendimento|mp-atendimentos-resumo/);
});
test("cliente sem vínculo continua com a interface de cliente", () => {
  const html = atendimentos.renderizar({ perfisProfissionais: [], agendaProfissional: [], atendimentoDisponivel: true });
  assert.doesNotMatch(html, /mp-agenda-profissional/);
  assert.match(html, /mp-atendimentos-resumo/);
});
test("profissional que também é cliente mantém os dois papéis", () => {
  const pedido = { id: "c3d1a4f2-0000-4000-8000-000000000001", servico: "S", modalidade: "online", status: "recebida" };
  const html = atendimentos.renderizar({ perfisProfissionais: [{ id: "p1", nome: "X" }], atendimentos: [pedido], atendimentoDisponivel: true });
  assert.match(html, /mp-agenda-profissional/);
  assert.match(html, /mp-atendimentos-resumo/);
});
test("adaptador pergunta ao banco sem enviar ID e filtra a resposta", async () => {
  const { client, chamadas } = rpc({ data: [{ profile_id: "p1", display_name: "Prof" }, { profile_id: "" }, null], error: null });
  assert.deepEqual(await criarDadosSupabase({ client }).perfisProfissionais(), [{ id: "p1", nome: "Prof" }]);
  assert.deepEqual(chamadas, [["my_appointment_professional_profiles", undefined]]);
});
test("função ainda não aplicada no banco não quebra a página", async () => {
  for (const code of ["PGRST202", "42883"]) {
    const { client } = rpc({ data: null, error: { code, message: "x" } });
    assert.deepEqual(await criarDadosSupabase({ client }).perfisProfissionais(), []);
  }
  const { client } = rpc({ data: null, error: { code: "42501", message: "x" } });
  await assert.rejects(() => criarDadosSupabase({ client }).perfisProfissionais());
});
test("migration: só a própria conta, perfil ativo, sem anon, e profissional desativado perde acesso", () => {
  assert.match(sql, /conta\.user_id = \(select auth\.uid\(\)\)/);
  assert.doesNotMatch(sql, /my_appointment_professional_profiles\s*\(\s*p_/);
  assert.match(sql, /revoke all on function public\.my_appointment_professional_profiles\(\) from public, anon;/);
  assert.match(sql, /grant execute on function public\.my_appointment_professional_profiles\(\) to authenticated;/);
  const isProf = sql.slice(sql.indexOf("create or replace function public.is_appointment_professional"));
  assert.match(isProf, /security definer/);
  assert.match(isProf, /set search_path = ''/);
  assert.match(isProf, /conta\.active = true/);
  assert.match(isProf, /\? 'professional'/);
  assert.match(isProf, /coalesce\(\(perfil\.document ->> 'active'\)::boolean, true\)/);
  assert.doesNotMatch(sql, /grant .* to anon|service_role|drop /i);
});
test("app lê os perfis profissionais e a demonstração devolve vazio", () => {
  const app = readFileSync(new URL("../../outputs/js/conta/spa/app.js", import.meta.url), "utf8");
  assert.match(app, /sessao\.perfisProfissionais\(\)/);
  assert.match(app, /dados\.perfisProfissionais \|\|= \[\]/);
  const demo = readFileSync(new URL("../../outputs/js/conta/adaptadores/demonstracao.js", import.meta.url), "utf8");
  assert.match(demo, /async perfisProfissionais\(\) \{ return \[\]; \}/);
});
