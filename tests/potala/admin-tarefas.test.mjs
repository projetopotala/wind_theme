import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { TAREFAS, atualizarTarefas, secaoPermitida } from "../../outputs/js/admin/admin-tarefas.js";

const ler = (rel) => readFileSync(new URL(`../../outputs/${rel}`, import.meta.url), "utf8");
const html = ler("admin.html");
const area = html.match(/<div class="admin-tarefas"[\s\S]*?<\/ul>\s*<\/div>/)?.[0] || "";
const inicio = html.match(/<section class="admin-workspace admin-home" data-admin-workspace="inicio"[\s\S]*?<\/section>/)?.[0] || "";

/*
 * P1A | "O que deseja fazer?" na entrada da Central Operacional: atalhos para
 * as funcionalidades que já existem, sem cadastro novo e sem mexer no backend.
 */
test("a área de tarefas fica na Visão geral, antes do painel operacional", () => {
  assert.ok(area, "a área existe");
  assert.ok(inicio.includes(area), "os atalhos ficam dentro da Visão geral, que rola junto com o painel");
  assert.match(area, /<h2 id="admin-tarefas-titulo" tabindex="-1">O que deseja fazer\?<\/h2>/);
  assert.ok(html.indexOf("admin-tarefas\"") < html.indexOf('data-op-view="dashboard"'));
  assert.match(html, /<link rel="stylesheet" href="\/css\/admin-tarefas\.css">/);
  const entrada = ler("js/admin/admin-entry.js");
  assert.match(entrada, /import \{ ligarTarefas \} from "\.\/admin-tarefas\.js";/);
  assert.match(entrada, /tarefas\?\.atualizar\(\);/);
});

test("as oito tarefas estão presentes, com nome e próximo passo", () => {
  const ids = [...area.matchAll(/data-admin-tarefa="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, ["profissional", "horario", "solicitacoes", "curso", "turma", "inscrever", "artigo", "site"]);
  for (const t of ["Cadastrar profissional", "Disponibilizar horário", "Ver solicitações", "Cadastrar curso", "Criar turma", "Inscrever aluno", "Escrever artigo", "Editar conteúdo do site"]) {
    assert.ok(area.includes(`<span class="admin-tarefa__titulo">${t}</span>`), t);
  }
  assert.equal((area.match(/class="admin-tarefa__passo"/g) || []).length, 8);
  assert.equal((area.match(/<svg class="admin-icone" aria-hidden="true"/g) || []).length, 8);
});

test("cada atalho aponta para seção, formulário ou endereço que já existem", () => {
  for (const t of TAREFAS) {
    assert.match(html, new RegExp(`data-section="${t.secao}"`), `seção inexistente: ${t.secao}`);
  }
  const views = ler("js/admin/operations/views.js");
  assert.match(views, /action\('Cadastrar pessoa','person'\)/);
  assert.match(views, /action\('Novo tipo de atividade','definition'\)/);
  assert.match(views, /action\('Nova turma \/ oferta','offering'\)/);
  assert.match(views, /action\('Inscrever','enrollment'/);
  const atend = ler("js/admin/atendimentos-view.js");
  assert.match(atend, /id="atend-horario"/);
  assert.match(atend, /id="atend-solicitacoes"/);
  const controller = ler("js/admin/operations/controller.js");
  assert.match(controller, /\['professional','Profissional'\]/, "o papel Profissional existe no cadastro de pessoa");
  assert.match(controller, /\['course','Curso'\]/, "o tipo Curso existe no cadastro de atividade");
  assert.match(area, /href="\/blog#\/novo"/);
  assert.match(html, /href="\/blog#\/novo"/);
  assert.match(area, /href="\/atendimentos-conceito\.html"/);
});

test("nenhum atalho concede papel administrativo nem grava sozinho", () => {
  const js = ler("js/admin/admin-tarefas.js").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(js, /\bowner\b|admin_|role\s*=|supabase|fetch\(|\.rpc\(|command\(|requestSubmit|\.submit\(/i);
  const profissional = TAREFAS.find((t) => t.id === "profissional");
  assert.equal(profissional.marcar, 'input[name="roles"][value="professional"]');
});

/* Nós falsos, como em admin-shell.test.mjs. */
function botao(attrs = {}) {
  const mapa = new Map(Object.entries(attrs));
  return { hidden: false, disabled: false, getAttribute: (n) => mapa.get(n) ?? null, setAttribute: (n, v) => mapa.set(n, String(v)) };
}
function montar(secoes) {
  const nav = Object.fromEntries(secoes.map(([s, attrs]) => [s, botao({ "data-section": s, ...attrs })]));
  const itens = [...TAREFAS.map((t) => t.id), "artigo"].map((id) => {
    const li = { hidden: false };
    const el = botao({ "data-admin-tarefa": id, ...(id === "artigo" ? { "data-admin-tarefa-secao": "blog" } : {}) });
    el.closest = () => li;
    return { el, li, id };
  });
  const root = {
    querySelector(sel) { const m = sel.match(/data-section="([a-z]+)"/); return m ? nav[m[1]] || null : null; },
    querySelectorAll(sel) { return sel === "[data-admin-tarefa]" ? itens.map((i) => i.el) : []; },
  };
  return { root, nav, itens };
}

test("permissões: só aparecem atalhos das seções que a conta pode abrir", () => {
  const todas = ["pessoas", "atendimentos", "ofertas", "jornada", "blog"].map((s) => [s, {}]);
  const completo = montar(todas);
  atualizarTarefas(completo.root);
  assert.ok(completo.itens.every((i) => !i.li.hidden), "conta com todas as seções vê tudo");

  const soBlog = montar(todas.map(([s]) => [s, s === "blog" ? {} : { "aria-hidden": "true" }]));
  for (const [s, b] of Object.entries(soBlog.nav)) if (s !== "blog") b.hidden = true;
  atualizarTarefas(soBlog.root);
  assert.deepEqual(soBlog.itens.filter((i) => !i.li.hidden).map((i) => i.id), ["artigo"]);

  const inerte = montar(todas.map(([s]) => [s, s === "pessoas" ? { "aria-disabled": "true" } : {}]));
  assert.equal(secaoPermitida(inerte.root, "pessoas"), false);
  atualizarTarefas(inerte.root);
  assert.equal(inerte.itens.find((i) => i.id === "profissional").li.hidden, true);
  assert.equal(inerte.itens.find((i) => i.id === "turma").li.hidden, false);
});

test("CSS: alvos de 44px, foco visível, grade responsiva e movimento reduzido", () => {
  const css = ler("css/admin-tarefas.css");
  assert.match(css, /\.admin-tarefa \{[^}]*min-height: 44px/);
  assert.match(css, /\.admin-tarefa:focus-visible \{[^}]*outline:/);
  assert.match(css, /@media \(max-width: 560px\) \{ \.admin-tarefas__lista \{ grid-template-columns: 1fr; \} \}/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
