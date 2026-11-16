import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { classificarAtendimentos } from "../../outputs/js/admin/atendimentos-secoes.js";
import { renderAtendimentos } from "../../outputs/js/admin/atendimentos-view.js";
import { createAppointmentPanel, reservationForm, suggestedTime, roomLink } from "../../outputs/js/admin/appointment-panel.js";

const AGORA = new Date("2026-11-16T15:00:00Z"); // 12:00 em Sao Paulo
const base = { contact_type: "email", contact: "c@example.invalid", modality: "online", service: "Acolhimento", created_at: "2026-11-10T12:00:00Z", updated_at: "2026-11-10T12:00:00Z" };
const U = (n) => `10000000-0000-4000-8000-00000000000${n}`;
const rows = [
  { ...base, id: U(1), requester_name: "Ativa Hoje", status: "recebida", preferred_date: "2026-11-16", preferred_period: "tarde", requester_user_id: "u1", offering_id: "o1" },
  { ...base, id: U(2), requester_name: "Vencida Antiga", status: "recebida", preferred_date: "2026-11-02", preferred_period: "manha", requester_user_id: "u2", offering_id: "o1" },
  { ...base, id: U(3), requester_name: "Confirmada Futura", status: "encerrada", preferred_date: "2026-11-16", preferred_period: "tarde", reservation_schedule_id: "s-fut", professional_profile_id: "p1" },
  { ...base, id: U(4), requester_name: "Confirmada Passada", status: "encerrada", preferred_date: "2026-11-10", preferred_period: "tarde", reservation_schedule_id: "s-pas", professional_profile_id: "p1" },
  { ...base, id: U(5), requester_name: "Encerrada Sem Agenda", status: "encerrada", preferred_date: "2026-11-01", preferred_period: "noite" },
  { ...base, id: U(6), requester_name: "Cancelada", status: "cancelada", preferred_date: "2026-11-18", preferred_period: "manha" },
  { ...base, id: U(7), requester_name: "Presencial Passada", modality: "presencial", status: "encerrada", preferred_date: "2026-11-16", preferred_period: "manha", reservation_schedule_id: "s-pres", professional_profile_id: "p1" },
];
const operacional = {
  profiles: [{ id: "p1", display_name: "Prof Um", roles: ["professional"], active: true, published: true }],
  activity_offerings: [{ id: "o1", title: "Acolhimento", mode: "online", active: true }],
  offering_professionals: [{ id: "v", offering_id: "o1", professional_id: "p1", active: true }],
  schedule_items: [
    { id: "s-fut", starts_at: "2026-11-16T20:00:00Z", ends_at: "2026-11-16T21:00:00Z" },
    { id: "s-pas", starts_at: "2026-11-10T18:00:00Z", ends_at: "2026-11-10T19:00:00Z" },
    { id: "s-pres", starts_at: "2026-11-16T12:00:00Z", ends_at: "2026-11-16T13:00:00Z" },
  ],
};

test("a fila ativa so tem o que exige acao; processadas e passadas saem dela sem serem apagadas", () => {
  const g = classificarAtendimentos(rows, operacional, AGORA);
  assert.deepEqual(g.pendentes.map((r) => r.requester_name), ["Ativa Hoje", "Vencida Antiga"], "ativas primeiro, vencida depois");
  assert.deepEqual(g.confirmadas.map((r) => r.requester_name), ["Confirmada Futura"]);
  assert.deepEqual(g.canceladas.map((r) => r.requester_name), ["Cancelada"]);
  const hist = g.historico.map((r) => r.requester_name).sort();
  assert.deepEqual(hist, ["Confirmada Passada", "Encerrada Sem Agenda", "Presencial Passada"]);
  assert.equal(g.pendentes.length + g.confirmadas.length + g.historico.length + g.canceladas.length, rows.length, "nenhum registro some");
});

test("solicitacao vencida continua pendente, identificada e com aviso", () => {
  const g = classificarAtendimentos(rows, operacional, AGORA);
  assert.equal(g.vencida(rows[1]), true);
  assert.equal(g.vencida(rows[0]), false, "hoje nao esta vencido");
  const html = render();
  assert.match(html, /data-vencida="true"/);
  assert.match(html, /Data vencida/);
  assert.match(html, /1 com data preferida já vencida/);
});

const helpers = { reservationForm, suggestedTime, roomLink };
function render(extra = {}) {
  return renderAtendimentos({ rows, phase: "ready", message: "", busy: false, operationalState: operacional, reservationsEnabled: true, agora: AGORA, helpers, ...extra });
}

test("secoes recolhiveis com contagem; so as pendentes abrem sozinhas; nenhum formulario aberto", () => {
  const html = render();
  for (const id of ["solicitacoes", "confirmadas", "historico", "canceladas"]) assert.match(html, new RegExp(`<details class="atend-secao" id="atend-${id}" data-atend-secao="${id}"`));
  assert.match(html, /data-atend-secao="solicitacoes" open>/);
  assert.doesNotMatch(html, /data-atend-secao="confirmadas" open/);
  assert.match(html, /Solicitações pendentes<\/span><span class="atend-contagem" aria-label="2 registros">2</);
  assert.match(html, /Histórico e encerradas<\/span><span class="atend-contagem" aria-label="3 registros">3</);
  assert.doesNotMatch(html, /data-appointment-confirm|<textarea/);
  assert.equal((html.match(/data-atendimentos-agendar=/g) || []).length, 2, "um botao Agendar por pendente");
});

test("historico diz 'Horario encerrado', nao 'realizada'; abertura lembrada entre redesenhos", () => {
  const html = render({ abertas: { historico: true } });
  const hist = html.split('id="atend-historico"')[1].split('id="atend-canceladas"')[0];
  assert.match(hist, /Horário encerrado/);
  assert.match(hist, /Encerrada sem agendamento/);
  assert.doesNotMatch(hist, /realizad/i);
  assert.match(html, /data-atend-secao="historico" open>/);
});

test("Agendar abre formulario compacto com profissional elegivel, data, inicio, duracao e hoje valido", () => {
  const html = render({ agendando: U(1) });
  assert.equal((html.match(/data-appointment-confirm=/g) || []).length, 1);
  assert.match(html, /Profissional responsável<select data-reservation-professional/);
  assert.match(html, /<option value="p1"\s+selected>Prof Um<\/option>/, "um único profissional elegível já vem escolhido");
  assert.match(html, /data-reservation-date type="date" min="2026-11-16" value="2026-11-16"/);
  assert.match(html, /data-reservation-start type="time" value="14:00"/);
  assert.match(html, /data-reservation-duration/);
  assert.match(html, /Confirmar agendamento/);
  assert.match(html, /sala privada é criada automaticamente/, "online: nada de colar link");
  assert.doesNotMatch(html, /data-reservation-room|data-reservation-client/);
});

test("hoje, a sugestao de horario nao fica no passado", () => {
  const tarde = new Date("2026-11-16T22:30:00Z"); // 19:30 SP
  const r = { ...rows[0], preferred_period: "manha" };
  assert.equal(suggestedTime(r, tarde).start, "2026-11-16T20:00");
});

function painel({ confirm }) {
  const handlers = {};
  const alvo = { innerHTML: "", querySelector: () => null };
  const root = { querySelector: () => alvo, contains: () => true, addEventListener: (t, fn) => { handlers[t] = fn; }, removeEventListener() {} };
  const client = { from: (t) => { const q = { select: () => q, order: () => q, limit: () => ({ data: t === "appointment_slots" ? [] : rows, error: null }) }; return q; } };
  const p = createAppointmentPanel({ root, client, enabled: true, reservationsEnabled: true, view: "atendimentos", selector: "x",
    access: async () => ({ state: "authorized" }), getOperationalState: () => operacional, confirmReservation: confirm, id: () => "20000000-0000-4000-8000-000000000001" });
  return { p, handlers, alvo };
}
const cliqueAgendar = (id) => ({ target: { closest: (s) => (s === "[data-atendimentos-agendar]" ? { dataset: { atendimentosAgendar: id } } : null) } });
const cliqueConfirmar = (id, campos) => {
  const artigo = { querySelector: (s) => (s in campos ? { value: campos[s] } : null) };
  const botao = { dataset: { appointmentConfirm: id }, closest: (s) => (s === "[data-appointment-row]" ? artigo : null) };
  return { target: { closest: (s) => (s === "[data-appointment-confirm]" ? botao : null) } };
};

test("Confirmar agendamento: data+inicio+duracao viram inicio/fim e vao pela RPC existente com o profissional escolhido", async () => {
  const chamadas = [];
  const { p, handlers, alvo } = painel({ confirm: async (_c, args) => { chamadas.push(args); } });
  await p.reload();
  await handlers.click(cliqueAgendar(U(1)));
  assert.match(alvo.innerHTML, /Confirmar agendamento/);
  await handlers.click(cliqueConfirmar(U(1), { "[data-reservation-date]": "2099-01-10", "[data-reservation-start]": "10:00", "[data-reservation-duration]": "45", "[data-reservation-professional]": "p1", "[data-reservation-notes]": "obs" }));
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].requestId, U(1));
  assert.equal(chamadas[0].startsAt, "2099-01-10T10:00");
  assert.equal(chamadas[0].endsAt, "2099-01-10T10:45");
  assert.equal(chamadas[0].professionalProfileId, "p1");
  assert.match(alvo.innerHTML, /Agendamento confirmado/);
  assert.doesNotMatch(alvo.innerHTML, /data-reservation-date/, "formulario fecha apos confirmar");
});

test("horario passado nunca chega ao banco", async () => {
  const chamadas = [];
  const { p, handlers, alvo } = painel({ confirm: async (_c, args) => { chamadas.push(args); } });
  await p.reload();
  await handlers.click(cliqueAgendar(U(1)));
  await handlers.click(cliqueConfirmar(U(1), { "[data-reservation-date]": "2020-01-10", "[data-reservation-start]": "10:00", "[data-reservation-duration]": "30", "[data-reservation-professional]": "p1" }));
  assert.equal(chamadas.length, 0);
  assert.match(alvo.innerHTML, /Escolha um horário futuro/);
});

test("clique em Agendar alterna o formulario e a abertura das secoes e lembrada", async () => {
  const { p, handlers, alvo } = painel({ confirm: async () => {} });
  await p.reload();
  await handlers.click(cliqueAgendar(U(1)));
  assert.match(alvo.innerHTML, /data-reservation-date/);
  await handlers.click(cliqueAgendar(U(1)));
  assert.doesNotMatch(alvo.innerHTML, /data-reservation-date/);
  handlers.toggle({ target: { dataset: { atendSecao: "historico" }, open: true } });
  p.render();
  assert.match(alvo.innerHTML, /data-atend-secao="historico" open>/);
});

test("cliente: mesmo pedido ainda aguardando nao e enviado de novo; formulario so pede servico, dia e periodo", () => {
  const app = readFileSync(new URL("../../outputs/js/conta/spa/app.js", import.meta.url), "utf8");
  assert.match(app, /Você já tem uma solicitação igual aguardando confirmação/);
  assert.match(app, /Esse período de hoje já terminou/);
});

/* Reagendar: formulario editavel mesmo com horario publicado vencido ou preferencia vencida. */
test("pedido com horario publicado (slot passado): formulario compacto editavel, default futuro e aviso", () => {
  const slot = { id: "sl1", starts_at: "2026-11-16T14:00:00Z", ends_at: "2026-11-16T15:00:00Z", status: "held", held_by_request_id: U(1) };
  const row = { ...rows[0], appointment_slot_id: "sl1", appointment_slot: slot }; // slot 11:00-12:00 SP; agora 12:00 SP
  const html = reservationForm(row, operacional, { simple: true, agora: AGORA });
  assert.match(html, /data-reservation-date type="date" min="2026-11-16" value="2026-11-16"/);
  assert.match(html, /data-reservation-start type="time" value="13:00"/, "slot passado: sugere a proxima hora cheia");
  assert.doesNotMatch(html, /readonly|disabled|datetime-local/);
  assert.match(html, /data-reservation-aviso-slot[^>]*>O cliente escolheu o horário publicado de 16\/11\/2026, 11:00 às 12:00 \(já passou\)/);
});

test("pedido com horario publicado ainda futuro: sugere o proprio horario, tambem editavel", () => {
  const slot = { id: "sl1", starts_at: "2026-11-17T17:00:00Z", ends_at: "2026-11-17T17:45:00Z", status: "held", held_by_request_id: U(1) };
  const row = { ...rows[0], appointment_slot_id: "sl1", appointment_slot: slot };
  const html = reservationForm(row, operacional, { simple: true, agora: AGORA });
  assert.match(html, /value="2026-11-17"/);
  assert.match(html, /data-reservation-start type="time" value="14:00"/);
  assert.match(html, /<option value="45" selected>/);
  assert.doesNotMatch(html, /readonly/);
});

test("preferencia vencida: o formulario nao comeca no passado e continua editavel", () => {
  const html = reservationForm(rows[1], operacional, { simple: true, agora: AGORA });
  assert.match(html, /data-reservation-date type="date" min="2026-11-16" value="2026-11-16"/);
  assert.match(html, /data-reservation-start type="time" value="13:00"/);
  assert.doesNotMatch(html, /readonly|disabled/);
});

test("servico com profissional fixo: aparece escolhido; varios elegiveis exigem escolha; inativo nunca aparece", () => {
  const fixo = { ...operacional,
    profiles: [...operacional.profiles, { id: "p2", display_name: "Prof Dois", roles: ["professional"], active: true }, { id: "p3", display_name: "Prof Inativo", roles: ["professional"], active: false }],
    activity_offerings: [{ id: "o1", title: "Acolhimento", mode: "online", active: true, professional_id: "p2" }] };
  const h1 = reservationForm(rows[0], fixo, { simple: true, agora: AGORA });
  assert.match(h1, /<option value="p2"\s+selected>Prof Dois<\/option>/);
  assert.doesNotMatch(h1, /Prof Um|Prof Inativo/);
  const varios = { ...operacional,
    profiles: [...operacional.profiles, { id: "p2", display_name: "Prof Dois", roles: ["professional"], active: true }, { id: "p3", display_name: "Prof Inativo", roles: ["professional"], active: false }],
    offering_professionals: [{ offering_id: "o1", professional_id: "p1", active: true }, { offering_id: "o1", professional_id: "p2", active: true }, { offering_id: "o1", professional_id: "p3", active: true }] };
  const h2 = reservationForm(rows[0], varios, { simple: true, agora: AGORA });
  assert.match(h2, /<option value="">Escolha o profissional<\/option>/);
  assert.match(h2, /Prof Um/); assert.match(h2, /Prof Dois/);
  assert.doesNotMatch(h2, /Prof Inativo/);
});

test("a Central nunca digita sobre o que o Owner escreve: so o clique em Agendar redesenha o formulario", () => {
  const src = readFileSync(new URL("../../outputs/js/admin/appointment-panel.js", import.meta.url), "utf8");
  const mudanca = src.slice(src.indexOf("function change(event)"), src.indexOf("/* Lembra quais"));
  assert.doesNotMatch(mudanca, /render\(/, "change nao redesenha o painel");
});
