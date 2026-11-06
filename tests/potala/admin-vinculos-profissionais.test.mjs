import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderizarAcessos, mensagemDaOperacao, createAccessPanel } from "../../outputs/js/admin/access-panel.js";

const sql = readFileSync(new URL("../../supabase/migrations/202611060003_admin_professional_links.sql", import.meta.url), "utf8");
const codigo = sql.replace(/--.*$/gm, "");
const prof = { profile_id: "p1", display_name: "Dra. Ana", roles: ["professional"], link_active: true, profile_active: true };
const contas = [
  { id: "u1", email: "ana@x", name: "Ana", status: "ativa", links: [prof] },
  { id: "u2", email: "livre@x", name: "Livre", status: "nunca_entrou", links: [] },
  { id: "u3", email: "cli@x", name: "Cli", status: "ativa", links: [{ ...prof, profile_id: "c1", roles: ["client"] }] },
];
const perfis = [
  { profile_id: "p1", display_name: "Dra. Ana", active: true, linked_user_id: "u1" },
  { profile_id: "p2", display_name: "Dr. Novo", active: true, linked_user_id: null },
  { profile_id: "p3", display_name: "Inativo", active: false, linked_user_id: null },
];

test("formulário oferece só contas sem vínculo e perfis ativos sem conta", () => {
  const html = renderizarAcessos({ contas, perfis });
  const form = html.slice(html.indexOf("data-access-vincular"), html.indexOf("</form>"));
  assert.match(form, /livre@x/);
  assert.doesNotMatch(form, /ana@x|cli@x/);
  assert.match(form, /Dr\. Novo/);
  assert.doesNotMatch(form, /Dra\. Ana|Inativo/);
});
test("sem conta livre ou perfil livre explica o que falta, sem botão", () => {
  const html = renderizarAcessos({ contas: [contas[0]], perfis });
  assert.match(html, /data-vinculo-indisponivel/);
  assert.doesNotMatch(html, /data-access-vincular/);
});
test("desativar exige confirmação inline que avisa sobre salas e não conclui consulta", () => {
  const html = renderizarAcessos({ contas, perfis });
  assert.match(html, /data-acao="desativar" data-conta-id="u1" data-perfil="p1"/);
  assert.doesNotMatch(html, /desativar-confirmado/);
  const conf = renderizarAcessos({ contas, perfis, confirmando: "u1|p1" });
  assert.match(conf, /encerra as salas abertas/);
  assert.match(conf, /as consultas não são concluídas/);
  assert.match(conf, /data-acao="desativar-confirmado"/);
  assert.doesNotMatch(renderizarAcessos({ contas, perfis }).split("cli@x")[1].split("</tr>")[0], /data-acao/);
});
test("cadastro com papéis de cliente e profissional não oferece desativar a conta inteira", () => {
  const multi = [{ ...contas[0], links: [{ ...prof, roles: ["client", "professional"] }] }];
  const html = renderizarAcessos({ contas: multi, perfis });
  assert.doesNotMatch(html, /data-acao="desativar"/);
  assert.match(html, /remova o papel profissional em Pessoas/);
});
test("migration recusa desativar vínculo de cadastro que também é de cliente e explica o caminho", () => {
  assert.match(codigo, /coalesce\(perfil -> 'roles', '\[\]'::jsonb\) \? 'client' then\s+raise exception 'Este cadastro também é de cliente/);
  assert.match(codigo, /Acrescente o papel profissional a esse cadastro em Pessoas/);
});
test("migration: retirar papel profissional em Pessoas encerra salas por gatilho, sem expor a função", () => {
  assert.match(codigo, /create trigger op_records_close_rooms_on_professional_revoked\s+after update of document or delete on public\.op_records/);
  assert.match(codigo, /revoke all on function public\.close_rooms_on_professional_revoked\(\) from public, anon, authenticated;/);
  const fn = codigo.slice(codigo.indexOf("function public.close_rooms_on_professional_revoked"));
  assert.match(fn, /old\.document -> 'roles'.*\? 'professional'/s);
  assert.match(fn, /set closed_at = clock_timestamp\(\)/);
  assert.match(fn, /return coalesce\(new, old\)/);
});
test("vínculo inativo só reativa se o perfil estiver ativo", () => {
  const inativo = [{ ...contas[0], links: [{ ...prof, link_active: false }] }];
  assert.match(renderizarAcessos({ contas: inativo, perfis }), /data-acao="reativar"/);
  const perfilOff = [{ ...contas[0], links: [{ ...prof, link_active: false, profile_active: false }] }];
  assert.doesNotMatch(renderizarAcessos({ contas: perfilOff, perfis }), /data-acao="reativar"/);
});
test("mensagens de operação: regra do banco, permissão e falha genérica", () => {
  assert.equal(mensagemDaOperacao({ code: "23505", message: "Este perfil já está vinculado a outra conta." }), "Este perfil já está vinculado a outra conta.");
  assert.match(mensagemDaOperacao({ code: "42501" }), /não permite/);
  assert.match(mensagemDaOperacao({ code: "XX000", message: "detalhe interno" }), /Nada foi alterado/);
});

function painelFalso(respostas) {
  const chamadas = [];
  const ouvintes = {};
  const alvo = { innerHTML: "", addEventListener(t, f) { ouvintes[t] = f; }, querySelector() { return null; } };
  const client = { rpc: async (n, a) => { chamadas.push([n, a]); return respostas[n] || { data: [], error: null }; } };
  const painel = createAccessPanel({ root: { querySelector: () => alvo }, client });
  return { painel, chamadas, ouvintes, alvo };
}
const botao = (attrs) => ({ target: { closest: () => ({ getAttribute: (k) => attrs[k] ?? null }) } });

test("clique em desativar só pede confirmação; confirmar chama a RPC com p_active=false", async () => {
  const f = painelFalso({ admin_list_accounts: { data: contas, error: null }, admin_set_professional_link: { data: { active: false, rooms_closed: 1 }, error: null } });
  await f.painel.reload();
  f.ouvintes.click(botao({ "data-acao": "desativar", "data-conta-id": "u1", "data-perfil": "p1" }));
  assert.equal(f.chamadas.filter((c) => c[0] === "admin_set_professional_link").length, 0);
  assert.match(f.alvo.innerHTML, /Confirmar desativação/);
  f.ouvintes.click(botao({ "data-acao": "desativar-confirmado", "data-conta-id": "u1", "data-perfil": "p1" }));
  await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(f.chamadas.find((c) => c[0] === "admin_set_professional_link")[1], { p_user_id: "u1", p_profile_id: "p1", p_active: false });
  assert.match(f.alvo.innerHTML, /1 sala\(s\) aberta\(s\) encerrada\(s\)/);
});

test("migration: só admin, sem anon, advisory lock, auditoria e sem concluir consulta", () => {
  for (const fn of ["admin_list_professional_profiles", "admin_link_professional", "admin_set_professional_link"]) {
    const corpo = codigo.slice(codigo.indexOf(`function public.${fn}(`));
    assert.match(corpo.slice(0, 900), /if not public\.is_portal_admin\(\) then\s+raise exception .*errcode = '42501'/s, fn);
    assert.match(codigo, new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon;`), fn);
  }
  assert.match(codigo, /pg_advisory_xact_lock/);
  assert.match(codigo, /revoke all on table public\.admin_access_events from public, anon, authenticated;/);
  assert.match(codigo, /enable row level security/);
  assert.match(codigo, /set closed_at = clock_timestamp\(\)/);
  assert.doesNotMatch(codigo, /update public\.appointment_requests|status\s*=\s*'(encerrada|concluida|cancelada)'/i);
  assert.doesNotMatch(codigo, /\bdelete\s+from\b|\bdrop\s+(table|function|column)\b|\btruncate\b/i);
  assert.match(codigo, /security definer/);
  assert.doesNotMatch(codigo, /raw_user_meta_data|user_metadata/);
});
