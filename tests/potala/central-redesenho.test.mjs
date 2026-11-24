import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderView } from "../../outputs/js/admin/operations/views.js";
import { ROTULO_PAPEL } from "../../outputs/js/admin/access-panel.js";

const ler = (c) => readFileSync(new URL(`../../outputs/${c}`, import.meta.url), "utf8");
const vazio = () => ({ rooms: [], schedule_items: [], maintenance_orders: [], inventory_items: [], inventory_balances: [], inventory_assets: [], inventory_movements: [], activity_definitions: [], activity_offerings: [], enrollments: [], profiles: [], financial_entries: [], payment_allocations: [], payments: [], split_rules: [], audit_events: [], revision: 1 });
const sala = (id, status) => ({ id, code: id, name: `Sala ${id}`, status, capacity: 6, floor: "", type: "group", accessible: true });
const painel = (estado) => renderView("dashboard", estado, { date: "2026-11-24", recebidos: { interesses: [], inscritos: 0 } });

test("painel inicial: sem pendências mostra o estado vazio acolhedor e o indicador neutro", () => {
  const html = painel({ ...vazio(), rooms: [sala("a", "available")] });
  assert.match(html, /Tudo em ordem por aqui\. Nenhuma pendência no momento\./);
  assert.match(html, /<article><p>Pendências<\/p><strong>0<\/strong><small>Tudo em ordem<\/small>/);
  assert.doesNotMatch(html, /is-atencao/);
});

test("painel inicial: com pendências o indicador sobe de tom e o plural está certo", () => {
  const uma = painel({ ...vazio(), rooms: [sala("a", "unconfirmed")] });
  assert.match(uma, /1 sala aguarda confirmação do cadastro/);
  assert.match(uma, /<article class="is-atencao"><p>Pendências<\/p><strong>1<\/strong>/);
  const duas = painel({ ...vazio(), rooms: [sala("a", "unconfirmed"), sala("b", "unconfirmed")] });
  assert.match(duas, /2 salas aguardam confirmação do cadastro/);
  const manut = painel({ ...vazio(), rooms: [sala("a", "available")], maintenance_orders: [{ id: "m", room_id: "a", description: "Lâmpada", status: "open" }] });
  assert.match(manut, /<strong>1<\/strong><small>Veja &quot;Precisa de atenção&quot;<\/small>/);
});

test("painel inicial: nenhuma ação existente foi removida", () => {
  const html = painel({ ...vazio(), rooms: [sala("a", "available")] });
  for (const trecho of ["Nova reserva", "Solicitações recebidas", "Agenda de hoje", 'data-op-action="goto-agenda"', "Próximas atividades", "Precisa de atenção", "data-appointment-admin"]) {
    assert.ok(html.includes(trecho), trecho);
  }
  const admin = ler("admin.html");
  for (const t of ["profissional", "horario", "solicitacoes", "curso", "turma", "inscrever", "artigo", "site"]) {
    assert.ok(admin.includes(`data-admin-tarefa="${t}"`), `atalho ${t}`);
  }
  assert.match(admin, /O que deseja fazer\?/);
});

test("CSS do painel: carregado depois do admin.css; só reordena, sem esconder conteúdo", () => {
  const html = ler("admin.html");
  assert.ok(html.indexOf("/css/admin.css") < html.indexOf("/css/admin-painel.css"));
  const css = ler("css/admin-painel.css");
  assert.match(css, /\.admin-home\[hidden\]\s*\{\s*display:\s*none;\s*\}/);
  assert.match(css, /\[data-op-view="dashboard"\]\s*\{\s*display:\s*contents;\s*\}/);
  /* nada some com display:none: o que fica fora da tela continua lido por leitores de tela */
  assert.doesNotMatch(css.replace(/\.admin-home\[hidden\][^}]*\}/, ""), /display:\s*none/);
});

test("papéis em Usuários e acessos: todo papel tem estilo próprio", () => {
  const css = ler("css/admin-painel.css");
  for (const papel of Object.keys(ROTULO_PAPEL)) {
    assert.ok(css.includes(`data-papel="${papel}"`), `papel ${papel} sem estilo`);
  }
});

test("campos obrigatórios: marcados por palavra, não só por cor ou asterisco", () => {
  const css = ler("css/admin-painel.css");
  assert.match(css, /content:\s*"obrigat\\00F3rio"/);
  assert.match(css, /\[required\]/);
});
