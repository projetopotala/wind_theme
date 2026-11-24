import assert from "node:assert/strict";
import test from "node:test";

import { resumoDeContas, renderizarAcessos, createAccessPanel } from "../../outputs/js/admin/access-panel.js";

const prof = { profile_id: "p1", display_name: "Dra. Ana", roles: ["professional"], link_active: true, profile_active: true };
const contas = [
  { id: "1", email: "owner@x", name: "Dona", status: "ativa", portal_role: "owner", portal_active: true, links: [] },
  { id: "2", email: "ana@x", name: "Ana", status: "nunca_entrou", links: [prof] },
  { id: "3", email: "cli@x", name: "Cli", status: "ativa", links: [{ ...prof, profile_id: "c", roles: ["client"], display_name: "Cli" }] },
  { id: "4", email: "esc@x", name: "Escritora", status: "ativa", portal_role: "blog_editor", portal_active: true, blog: { read: true, edit: true, publish: false, active: true }, links: [] },
  { id: "5", email: "ed@x", name: "Editor", status: "ativa", portal_role: "blog_editor", portal_active: true, blog: { read: true, edit: true, publish: true, active: true }, links: [] },
  { id: "6", email: "novo@x", name: "", status: "pendente_confirmacao", links: [] },
];

test("resumo: quantas contas por papel e quantas precisam de atenção", () => {
  const { porPapel, porStatus } = resumoDeContas(contas);
  assert.equal(porPapel.owner, 1);
  assert.equal(porPapel.profissional, 1);
  assert.equal(porPapel.cliente, 1);
  assert.equal(porPapel.escritor, 1);
  assert.equal(porPapel.editor, 1);
  assert.equal(porPapel.sem_vinculo, 1);
  assert.deepEqual(porStatus, { nunca_entrou: 1, pendente_confirmacao: 1 });
});

test("filtros rápidos: 'Todas' marcada por padrão, só os papéis que existem, com contagem", () => {
  const out = renderizarAcessos({ contas });
  assert.match(out, /class="acessos-resumo" role="group" aria-label="Filtros rápidos"/);
  assert.match(out, /data-chip-papel="" aria-pressed="true">Todas <span>6<\/span>/);
  assert.match(out, /data-chip-papel="escritor" aria-pressed="false">Escritor do Blog <span>1<\/span>/);
  assert.match(out, /data-chip-status="pendente_confirmacao" aria-pressed="false">Aguardando confirmação do e-mail <span>1<\/span>/);
  /* Não oferece filtro de um papel que ninguém tem. */
  assert.doesNotMatch(out, /data-chip-papel="admin"/);
  assert.doesNotMatch(out, /data-chip-status="bloqueada"/);
});

test("filtros rápidos acompanham os seletores: o chip do papel escolhido fica marcado", () => {
  const out = renderizarAcessos({ contas, filtros: { papel: "profissional" } });
  assert.match(out, /data-chip-papel="profissional" aria-pressed="true"/);
  assert.match(out, /data-chip-papel="" aria-pressed="false"/);
  assert.match(out, /<option value="profissional" selected>/);
  assert.match(out, /1 de 6 conta\(s\)/);
});

test("sem contas ou com erro, não há filtros para mostrar", () => {
  assert.doesNotMatch(renderizarAcessos({ contas: [] }), /acessos-resumo/);
  assert.doesNotMatch(renderizarAcessos({ contas, erro: "Falhou" }), /acessos-resumo/);
});

test("o resultado de uma operação aparece NA conta mexida, e não no topo da página", () => {
  const out = renderizarAcessos({ contas, aviso: "Acesso de Editor concedido.", avisoConta: "4" });
  assert.doesNotMatch(out, /data-access-aviso>/);
  const linha = out.split('data-conta="').find((t) => t.startsWith("4"));
  assert.match(linha, /data-access-aviso-conta/);
  assert.match(linha, /Acesso de Editor concedido\./);
  /* E não vaza para as outras contas. */
  assert.equal([...out.matchAll(/data-access-aviso-conta/g)].length, 1);
});

test("se o filtro esconde a conta mexida, o resultado volta ao topo em vez de sumir", () => {
  const out = renderizarAcessos({ contas, aviso: "Acesso removido.", avisoConta: "4", filtros: { papel: "profissional" } });
  assert.match(out, /data-access-aviso>Acesso removido\./);
  assert.doesNotMatch(out, /data-access-aviso-conta/);
});

test("aviso sem conta (ex.: formulário de vínculo) continua no topo", () => {
  const out = renderizarAcessos({ contas, aviso: "Escolha a conta e o perfil profissional." });
  assert.match(out, /data-access-aviso>Escolha a conta/);
});

test("cada conta pode receber foco (tabindex -1), para o resultado ser lido e a linha, vista", () => {
  const out = renderizarAcessos({ contas });
  assert.equal([...out.matchAll(/class="acessos-conta"[^>]*tabindex="-1"/g)].length, contas.length);
});

test("o conteúdo do aviso é escapado", () => {
  const out = renderizarAcessos({ contas, aviso: "<img src=x onerror=1>", avisoConta: "4" });
  assert.doesNotMatch(out, /<img src=x/);
});

/* ---- painel: foco, filtros rápidos e resultado, com um alvo falso ---- */
function painelFalso(rpcExtra = {}) {
  const ouvintes = {};
  const focos = [];
  const rolagens = [];
  const alvo = {
    innerHTML: "",
    addEventListener(tipo, fn) { ouvintes[tipo] = fn; },
    querySelector(sel) {
      return {
        value: "editor",
        focus() { focos.push(sel); },
        scrollIntoView() { rolagens.push(sel); },
        setSelectionRange() {},
      };
    },
  };
  const chamadas = [];
  const client = {
    rpc: async (nome, args) => {
      chamadas.push([nome, args]);
      if (rpcExtra[nome]) return rpcExtra[nome](args);
      if (nome === "admin_list_accounts") return { data: contas, error: null };
      return { data: [], error: null };
    },
  };
  const painel = createAccessPanel({ root: { querySelector: () => alvo }, client });
  return { painel, alvo, ouvintes, focos, rolagens, chamadas };
}

const chipAlvo = (attr, valor) => ({
  closest: (sel) => (sel.includes("data-chip") ? { hasAttribute: (a) => a === attr, getAttribute: (a) => (a === attr ? valor : null) } : null),
});
const botaoAlvo = (acao, atributos = {}, interno = {}) => ({
  closest: (sel) => {
    if (sel.includes("data-chip")) return null;
    if (sel === "[data-acao]") return { getAttribute: (a) => (a === "data-acao" ? acao : atributos[a] ?? null), closest: () => ({ querySelector: () => interno }) };
    return null;
  },
});

test("chip de papel filtra a lista e clicar de novo no mesmo chip limpa; o foco volta ao chip", async () => {
  const { painel, alvo, ouvintes, focos } = painelFalso();
  await painel.reload();
  assert.match(alvo.innerHTML, /6 de 6 conta/);
  ouvintes.click({ target: chipAlvo("data-chip-papel", "profissional") });
  assert.match(alvo.innerHTML, /1 de 6 conta/);
  assert.match(alvo.innerHTML, /data-chip-papel="profissional" aria-pressed="true"/);
  assert.equal(focos.at(-1), '[data-chip-papel="profissional"]');
  ouvintes.click({ target: chipAlvo("data-chip-papel", "profissional") });
  assert.match(alvo.innerHTML, /6 de 6 conta/);
});

test("chip de status e chip de papel não se somam: o último escolhido vale", async () => {
  const { painel, alvo, ouvintes } = painelFalso();
  await painel.reload();
  ouvintes.click({ target: chipAlvo("data-chip-papel", "escritor") });
  ouvintes.click({ target: chipAlvo("data-chip-status", "pendente_confirmacao") });
  assert.match(alvo.innerHTML, /1 de 6 conta/);
  assert.match(alvo.innerHTML, /data-chip-status="pendente_confirmacao" aria-pressed="true"/);
  assert.match(alvo.innerHTML, /data-chip-papel="escritor" aria-pressed="false"/);
});

test("alterar o nível do Blog: o foco vai à confirmação, Cancelar devolve o foco, Confirmar leva o resultado à conta", async () => {
  const { painel, alvo, ouvintes, focos, rolagens, chamadas } = painelFalso({
    admin_set_blog_access: async () => ({ data: { changed: true }, error: null }),
  });
  await painel.reload();
  /* 1. Alterar → pede confirmação, e o foco vai para o botão Confirmar da própria conta. */
  ouvintes.click({ target: botaoAlvo("blog", { "data-conta-id": "4" }, { value: "editor" }) });
  assert.match(alvo.innerHTML, /data-acao="blog-confirmar" data-conta-id="4" data-nivel="editor"/);
  assert.equal(focos.at(-1), '[data-conta="4"] [data-acao="blog-confirmar"]');
  /* 2. Cancelar → some a confirmação e o foco volta ao seletor do nível daquela conta. */
  ouvintes.click({ target: botaoAlvo("cancelar") });
  assert.doesNotMatch(alvo.innerHTML, /data-acao="blog-confirmar"/);
  assert.equal(focos.at(-1), '[data-conta="4"] [data-blog-nivel]');
  /* 3. Alterar de novo e Confirmar → chama o banco como antes. */
  ouvintes.click({ target: botaoAlvo("blog", { "data-conta-id": "4" }, { value: "editor" }) });
  ouvintes.click({ target: botaoAlvo("blog-confirmar", { "data-conta-id": "4", "data-nivel": "editor" }) });
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  const op = chamadas.find((c) => c[0] === "admin_set_blog_access");
  assert.deepEqual(op[1], { p_user_id: "4", p_level: "editor" });
  /* O resultado está na conta 4, e a linha foi trazida à vista e focada. */
  const linha = alvo.innerHTML.split('data-conta="').find((t) => t.startsWith("4"));
  assert.match(linha, /data-access-aviso-conta>Acesso de Editor concedido\./);
  assert.equal(rolagens.at(-1), '[data-conta="4"]');
  assert.equal(focos.at(-1), '[data-conta="4"]');
});

test("erro do banco também aparece na conta mexida, sem alterar o que o banco recusou", async () => {
  const { painel, alvo, ouvintes } = painelFalso({
    admin_set_blog_access: async () => ({ data: null, error: { code: "42501", message: "Somente o Owner altera o acesso ao Blog." } }),
  });
  await painel.reload();
  ouvintes.click({ target: botaoAlvo("blog", { "data-conta-id": "4" }, { value: "editor" }) });
  ouvintes.click({ target: botaoAlvo("blog-confirmar", { "data-conta-id": "4", "data-nivel": "editor" }) });
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  const linha = alvo.innerHTML.split('data-conta="').find((t) => t.startsWith("4"));
  assert.match(linha, /Somente o Owner altera o acesso ao Blog\./);
});
