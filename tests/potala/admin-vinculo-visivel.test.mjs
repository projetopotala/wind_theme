import { test } from "node:test";
import assert from "node:assert/strict";
import { renderizarAcessos, createAccessPanel } from "../../outputs/js/admin/access-panel.js";

/* Regressão: o formulário de vínculo sumia sem explicação quando a lista de perfis vinha vazia ou falhava. */

const livre = { id: "u1", email: "viceles@x", name: "Viceles Arthur", status: "ativa", portal_role: "blog_editor", portal_active: true, blog: { edit: true, publish: true, active: true }, links: [] };
const perfilLivre = { profile_id: "p1", display_name: "Dra. Ana", active: true, published: false, linked_user_id: null, link_active: null };

test("há conta livre e perfil elegível: mostra o formulário", () => {
  const h = renderizarAcessos({ contas: [livre], perfis: [perfilLivre] });
  assert.match(h, /data-access-vincular/);
  assert.match(h, /Vincular conta ao profissional/);
  assert.doesNotMatch(h, /data-vinculo-indisponivel|data-vinculo-erro/);
});

test("sem nenhum perfil profissional: explica e manda cadastrar em Pessoas", () => {
  const h = renderizarAcessos({ contas: [livre], perfis: [] });
  assert.match(h, /data-vinculo-indisponivel/);
  assert.match(h, /Nenhum perfil profissional disponível para vínculo\. Cadastre um profissional em Pessoas/);
  assert.doesNotMatch(h, /data-access-vincular/);
});

test("falha ao carregar os perfis: mostra erro explícito, não esconde", () => {
  const h = renderizarAcessos({ contas: [livre], perfis: [], perfisComErro: true });
  assert.match(h, /role="alert" data-vinculo-erro/);
  assert.match(h, /Não foi possível carregar os perfis profissionais/);
  assert.doesNotMatch(h, /data-access-vincular/);
});

test("perfis todos vinculados ou desativados: diz o motivo", () => {
  const h = renderizarAcessos({ contas: [livre], perfis: [{ ...perfilLivre, linked_user_id: "x" }, { ...perfilLivre, profile_id: "p2", active: false }] });
  assert.match(h, /Nenhum perfil profissional ativo e sem conta/);
  assert.doesNotMatch(h, /data-access-vincular/);
});

test("todas as contas já vinculadas: diz o motivo", () => {
  const vinculada = { ...livre, links: [{ profile_id: "p9", display_name: "X", roles: ["professional"], link_active: true, profile_active: true }] };
  const h = renderizarAcessos({ contas: [vinculada], perfis: [perfilLivre] });
  assert.match(h, /Nenhuma conta sem vínculo para vincular/);
});

test("erro ao listar contas continua sem formulário nem mensagem de vínculo", () => {
  const h = renderizarAcessos({ contas: [], perfis: [], erro: "Falha" });
  assert.doesNotMatch(h, /data-access-vincular|data-vinculo/);
});

function painelCom(respostas, chamadas = []) {
  const alvo = { innerHTML: "", addEventListener() {}, querySelector() { return null; } };
  const client = { rpc: async (nome, args) => { chamadas.push([nome, args]); const r = respostas[nome]; return typeof r === "function" ? r(args) : r || { data: [], error: null }; } };
  return { painel: createAccessPanel({ root: { querySelector: () => alvo }, client }), alvo };
}

test("painel: RPC de perfis ausente (PGRST202) ou negada mostra o erro de vínculo", async () => {
  for (const error of [{ code: "PGRST202", message: "function not found" }, { code: "42501", message: "negado" }]) {
    const { painel, alvo } = painelCom({ admin_list_accounts: { data: [livre], error: null }, admin_list_professional_profiles: { data: null, error } });
    await painel.reload();
    assert.match(alvo.innerHTML, /data-vinculo-erro/, error.code);
    assert.doesNotMatch(alvo.innerHTML, /data-access-vincular/);
  }
});

test("painel: perfis vazios mostram a orientação; com perfil elegível mostram o formulário", async () => {
  let { painel, alvo } = painelCom({ admin_list_accounts: { data: [livre], error: null }, admin_list_professional_profiles: { data: [], error: null } });
  await painel.reload();
  assert.match(alvo.innerHTML, /Cadastre um profissional em Pessoas/);
  ({ painel, alvo } = painelCom({ admin_list_accounts: { data: [livre], error: null }, admin_list_professional_profiles: { data: [perfilLivre], error: null } }));
  await painel.reload();
  assert.match(alvo.innerHTML, /data-access-vincular/);
  assert.match(alvo.innerHTML, /viceles@x — Viceles Arthur/);
  assert.match(alvo.innerHTML, /Dra\. Ana/);
});

test("painel: vincular envia só conta e perfil escolhidos, sem identidade nem papel", async () => {
  const chamadas = [];
  const ouvintes = {};
  const alvo = { innerHTML: "", addEventListener(t, f) { ouvintes[t] = f; }, querySelector() { return null; } };
  const client = { rpc: async (n, a) => { chamadas.push([n, a]); return { data: n === "admin_list_accounts" ? [livre] : n === "admin_list_professional_profiles" ? [perfilLivre] : n === "admin_link_professional" ? { changed: true } : [], error: null }; } };
  const painel = createAccessPanel({ root: { querySelector: () => alvo }, client });
  await painel.reload();
  const campos = { conta: { value: "u1" }, perfil: { value: "p1" } };
  const form = { matches: (s) => s === "[data-access-vincular]", querySelector: (s) => campos[/name="(\w+)"/.exec(s)[1]] };
  ouvintes.submit({ preventDefault() {}, target: form });
  await new Promise((r) => setTimeout(r, 20));
  const link = chamadas.find((c) => c[0] === "admin_link_professional");
  assert.deepEqual(link[1], { p_user_id: "u1", p_profile_id: "p1" });
  assert.match(alvo.innerHTML, /Conta vinculada ao perfil profissional/);
});

test("vincular não altera o controle de Blog da conta (independente)", () => {
  const vinculada = { ...livre, links: [{ profile_id: "p1", display_name: "Dra. Ana", roles: ["professional"], link_active: true, profile_active: true }] };
  const h = renderizarAcessos({ contas: [vinculada], perfis: [] });
  assert.match(h, /Editor do Blog/);
  assert.match(h, /Profissional/);
  assert.match(h, /data-acao="blog"/);
});
