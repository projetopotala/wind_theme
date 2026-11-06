import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { papeisDaConta, filtrarContas, renderizarAcessos, mensagemDeErro, createAccessPanel } from "../../outputs/js/admin/access-panel.js";

const sql = readFileSync(new URL("../../supabase/migrations/202611060002_admin_list_accounts.sql", import.meta.url), "utf8");
const html = readFileSync(new URL("../../outputs/admin.html", import.meta.url), "utf8");
const entry = readFileSync(new URL("../../outputs/js/admin/admin-entry.js", import.meta.url), "utf8");

const prof = { profile_id: "p1", display_name: "Dra. Ana", roles: ["professional"], link_active: true, profile_active: true };
const contas = [
  { id: "1", email: "owner@x", name: "Dona", status: "ativa", portal_role: "owner", portal_active: true, links: [] },
  { id: "2", email: "ana@x", name: "Ana", status: "nunca_entrou", links: [prof] },
  { id: "3", email: "cli@x", name: "Cli", status: "ativa", links: [{ ...prof, profile_id: "c", roles: ["client"], display_name: "Cli" }] },
  { id: "4", email: "esc@x", name: "Escritora", status: "ativa", portal_role: "blog_editor", portal_active: true, blog: { edit: true, publish: false, active: true }, links: [] },
  { id: "5", email: "ed@x", name: "Editor", status: "ativa", portal_role: "blog_editor", portal_active: true, blog: { edit: true, publish: true, active: true }, links: [] },
  { id: "6", email: "novo@x", name: "", status: "pendente_confirmacao", links: [] },
  { id: "7", email: "ex@x", name: "Ex", status: "ativa", links: [{ ...prof, profile_active: false }] },
  { id: "8", email: "multi@x", name: "Multi", status: "ativa", portal_role: "admin", portal_active: true, links: [prof] },
];

test("papéis saem só dos dados do banco, com múltiplos papéis por conta", () => {
  assert.deepEqual(papeisDaConta(contas[0]), ["owner"]);
  assert.deepEqual(papeisDaConta(contas[1]), ["profissional"]);
  assert.deepEqual(papeisDaConta(contas[2]), ["cliente"]);
  assert.deepEqual(papeisDaConta(contas[3]), ["escritor"]);
  assert.deepEqual(papeisDaConta(contas[4]), ["editor"]);
  assert.deepEqual(papeisDaConta(contas[5]), ["sem_vinculo"]);
  assert.deepEqual(papeisDaConta(contas[6]), ["profissional_inativo"]);
  assert.deepEqual(papeisDaConta(contas[7]), ["admin", "profissional"]);
  assert.deepEqual(papeisDaConta({ portal_role: "admin", portal_active: false, links: [{ ...prof, link_active: false }] }), ["sem_vinculo"]);
});
test("busca por nome, e-mail e perfil; filtros por papel e status", () => {
  assert.deepEqual(filtrarContas(contas, { busca: "ana@" }).map((c) => c.id), ["2"]);
  assert.deepEqual(filtrarContas(contas, { busca: "dra." }).map((c) => c.id), ["2", "7", "8"]);
  assert.deepEqual(filtrarContas(contas, { papel: "profissional" }).map((c) => c.id), ["2", "8"]);
  assert.deepEqual(filtrarContas(contas, { status: "pendente_confirmacao" }).map((c) => c.id), ["6"]);
});
test("tela escapa conteúdo e diferencia pendente, nunca entrou e ativa, sem convite simulado", () => {
  const out = renderizarAcessos({ contas: [{ ...contas[2], name: "<img src=x onerror=1>" }, { ...contas[1], links: [] }, contas[5]] });
  assert.doesNotMatch(out, /<img src=x/);
  assert.match(out, /Confirmada, nunca entrou/);
  assert.match(out, /Aguardando confirmação do e-mail/);
  assert.doesNotMatch(out, /<button|convite enviado/i);
});
test("erros: função ausente, sem permissão e falha genérica", () => {
  assert.match(mensagemDeErro({ code: "PGRST202" }), /atualização do banco/);
  assert.match(mensagemDeErro({ code: "42501" }), /não permite/);
  assert.match(mensagemDeErro({ code: "x" }), /Tente de novo/);
});
test("painel lê contas e perfis, sem parâmetros", async () => {
  const chamadas = [];
  const alvo = { innerHTML: "", addEventListener() {}, querySelector() { return null; } };
  const painel = createAccessPanel({ root: { querySelector: () => alvo }, client: { rpc: async (n, a) => { chamadas.push([n, a]); return { data: n === "admin_list_accounts" ? contas : [], error: null }; } } });
  assert.equal((await painel.reload()).length, contas.length);
  assert.deepEqual(chamadas.map((c) => c[0]).sort(), ["admin_list_accounts", "admin_list_professional_profiles"]);
  assert.ok(chamadas.every((c) => c[1] === undefined));
  assert.match(alvo.innerHTML, /8 de 8 conta/);
});
test("migration: só admin, sem anon, somente leitura e sem segredos", () => {
  assert.match(sql, /if not public\.is_portal_admin\(\) then\s+raise exception .* errcode = '42501'/s);
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path = ''/);
  assert.match(sql, /revoke all on function public\.admin_list_accounts\(\) from public, anon;/);
  const codigo = sql.replace(/--.*$/gm, "");
  assert.doesNotMatch(codigo, /\b(insert|update|delete|drop|alter|truncate)\b/i);
  assert.doesNotMatch(codigo, /encrypted_password|password_hash|raw_user_meta_data|raw_app_meta_data|phone|token/i);
});
test("navegação e carregamento só fora do perfil de Blog", () => {
  assert.match(html, /data-section="acessos"/);
  assert.match(html, /data-admin-workspace="acessos" data-access-view/);
  const bloco = entry.slice(entry.indexOf('if (access.role !== "blog_editor")'), entry.indexOf("if (!controller)"));
  assert.match(bloco, /createAccessPanel/);
});
