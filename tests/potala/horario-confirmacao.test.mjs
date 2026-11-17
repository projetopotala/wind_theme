import assert from "node:assert/strict";
import test from "node:test";

import { createAppointmentPanel, reservationForm } from "../../outputs/js/admin/appointment-panel.js";
import { confirmAppointmentReservation } from "../../outputs/js/admin/appointment-reservations.js";
import { renderAgenda, tabelaDaAgenda } from "../../outputs/js/admin/operations/agenda-views.js";

/*
 * Defeito de 16/11 (23:23 em Sao Paulo): a Central sugeria a "proxima hora cheia" para um horario vencido. Na virada do dia isso
 * era 00:00 do dia seguinte e o Owner confirmou sem perceber. Alem disso a Central ("Horario a conferir na Agenda") e a Agenda
 * nao enxergavam o item criado no servidor (estado operacional nao recarregava) e a grade da Agenda so desenha 07h-23h.
 */
const U = (n) => `10000000-0000-4000-8000-00000000000${n}`;
const base = { contact_type: "email", contact: "c@example.invalid", modality: "online", service: "Flamengo", created_at: "2026-11-16T13:20:00Z", updated_at: "2026-11-16T13:20:00Z" };
const pedido = { ...base, id: U(1), requester_name: "Cliente Teste", status: "recebida", preferred_date: "2026-11-16", preferred_period: "manha", requester_user_id: "u1", offering_id: "o1" };
const operacional = {
  profiles: [{ id: "p1", display_name: "Prof Um", roles: ["professional"], active: true }],
  activity_offerings: [{ id: "o1", title: "Flamengo", mode: "online", active: true }],
  offering_professionals: [{ offering_id: "o1", professional_id: "p1", active: true }],
  schedule_items: [],
};
const NOITE = new Date("2026-11-17T02:23:22Z"); // 23:23 de 16/11 em Sao Paulo (ja e 17/11 em UTC)

test("virada do dia: 23:23 com horario vencido NAO sugere 00:00 do dia seguinte; data de hoje e inicio vazio com aviso", () => {
  const html = reservationForm(pedido, operacional, { simple: true, agora: NOITE });
  assert.match(html, /data-reservation-date type="date" min="2026-11-16" value="2026-11-16"/);
  assert.match(html, /data-reservation-start type="time" value=""/);
  assert.match(html, /data-reservation-aviso-passou/);
  assert.doesNotMatch(html, /value="2026-11-17"|value="00:00"/);
});

test("horario futuro continua sugerido como pedido (nada muda para quem nao vencou)", () => {
  const cedo = new Date("2026-11-16T12:00:00Z"); // 09:00 SP, periodo da tarde = 14:00
  const html = reservationForm({ ...pedido, preferred_period: "tarde" }, operacional, { simple: true, agora: cedo });
  assert.match(html, /data-reservation-start type="time" value="14:00"/);
  assert.doesNotMatch(html, /data-reservation-aviso-passou/);
});

function painel({ confirm, refreshOperational, operacionalAtual = operacional }) {
  const handlers = {};
  const alvo = { innerHTML: "", querySelector: () => null };
  const root = { querySelector: () => alvo, contains: () => true, addEventListener: (t, fn) => { handlers[t] = fn; }, removeEventListener() {} };
  const client = { from: () => { const q = { select: () => q, order: () => q, limit: () => ({ data: [pedido], error: null }) }; return q; } };
  const p = createAppointmentPanel({ root, client, enabled: true, reservationsEnabled: true, view: "atendimentos", selector: "x",
    access: async () => ({ state: "authorized" }), getOperationalState: () => operacionalAtual, confirmReservation: confirm,
    refreshOperational, id: () => "20000000-0000-4000-8000-000000000001" });
  return { p, handlers, alvo };
}
const cliqueAgendar = (id) => ({ target: { closest: (s) => (s === "[data-atendimentos-agendar]" ? { dataset: { atendimentosAgendar: id } } : null) } });
const cliqueConfirmar = (id, campos) => {
  const artigo = { querySelector: (s) => (s in campos ? { value: campos[s] } : null) };
  const botao = { dataset: { appointmentConfirm: id }, closest: (s) => (s === "[data-appointment-row]" ? artigo : null) };
  return { target: { closest: (s) => (s === "[data-appointment-confirm]" ? botao : null) } };
};
const campos = (extra = {}) => ({ "[data-reservation-date]": "2099-01-10", "[data-reservation-start]": "19:00", "[data-reservation-duration]": "60", "[data-reservation-professional]": "p1", ...extra });

test("confirmar sem escolher o inicio: nada vai ao banco e a mensagem pede o horario", async () => {
  const chamadas = [];
  const { p, handlers, alvo } = painel({ confirm: async (_c, args) => { chamadas.push(args); } });
  await p.reload();
  await handlers.click(cliqueAgendar(U(1)));
  await handlers.click(cliqueConfirmar(U(1), campos({ "[data-reservation-start]": "" })));
  assert.equal(chamadas.length, 0);
  assert.match(alvo.innerHTML, /Escolha o horário de início/);
  assert.doesNotMatch(alvo.innerHTML, /Agendamento confirmado/);
});

test("sucesso: mostra o horario enviado e recarrega o estado operacional DEPOIS da confirmacao (Central e Agenda enxergam o item)", async () => {
  const ordem = [];
  const { p, handlers, alvo } = painel({
    confirm: async (_c, args) => { ordem.push(["confirm", args.startsAt, args.endsAt]); },
    refreshOperational: async () => { ordem.push(["refresh"]); },
  });
  await p.reload();
  await handlers.click(cliqueAgendar(U(1)));
  await handlers.click(cliqueConfirmar(U(1), campos({ "[data-reservation-start]": "00:00" })));
  assert.deepEqual(ordem, [["confirm", "2099-01-10T00:00", "2099-01-10T01:00"], ["refresh"]]);
  assert.match(alvo.innerHTML, /Agendamento confirmado para 10\/01\/2099 às 00:00 – 01:00 \(horário de Brasília\)/);
});

test("falha ao recarregar a Agenda nao desfaz a confirmacao e avisa", async () => {
  const { p, handlers, alvo } = painel({ confirm: async () => {}, refreshOperational: async () => { throw new Error("rede"); } });
  await p.reload();
  await handlers.click(cliqueAgendar(U(1)));
  await handlers.click(cliqueConfirmar(U(1), campos()));
  assert.match(alvo.innerHTML, /Agendamento confirmado para 10\/01\/2099 às 19:00 – 20:00/);
  assert.match(alvo.innerHTML, /Não foi possível atualizar a Agenda/);
});

test("conversao America/Sao_Paulo -> UTC enviada a RPC: 19:00, 23:30 e 00:00 do dia seguinte", async () => {
  const enviados = [];
  const client = { rpc: async (_nome, args) => { enviados.push(args.p_schedule); return { data: { result: { request_id: U(1), schedule_id: "s" } }, error: null }; } };
  const confirmar = (startsAt, endsAt) => confirmAppointmentReservation(client, { requestId: U(1), expectedUpdatedAt: "2026-11-16T13:20:00Z", idempotencyKey: "20000000-0000-4000-8000-000000000001", startsAt, endsAt });
  await confirmar("2026-11-16T19:00", "2026-11-16T20:00");
  await confirmar("2026-11-16T23:30", "2026-11-17T00:30");
  await confirmar("2026-11-17T00:00", "2026-11-17T01:00");
  assert.deepEqual(enviados.map((s) => [s.starts_at, s.ends_at]), [
    ["2026-11-16T22:00:00.000Z", "2026-11-16T23:00:00.000Z"],
    ["2026-11-17T02:30:00.000Z", "2026-11-17T03:30:00.000Z"],
    ["2026-11-17T03:00:00.000Z", "2026-11-17T04:00:00.000Z"],
  ]);
});

/* Agenda */
const item = (id, inicio, fim, extra = {}) => ({ id, kind: "appointment", mode: "online", status: "booked", participants: 1, title: `Consulta ${id}`, starts_at: new Date(`${inicio}-03:00`).toISOString(), ends_at: new Date(`${fim}-03:00`).toISOString(), ...extra });
const estadoAgenda = (itens) => ({ rooms: [], profiles: [{ id: "p1", display_name: "Prof Um", roles: ["professional"] }], activity_definitions: [], activity_offerings: [], schedule_participants: [], maintenance_orders: [], schedule_series: [], schedule_items: itens });
const AGORA = Date.parse("2026-11-16T23:23:00-03:00");

test("Agenda: consulta as 00:00 (03:00Z) nao fica invisivel na semana; as 19:00 e um bloco normal", () => {
  const s = estadoAgenda([item("meia-noite", "2026-11-17T00:00:00", "2026-11-17T01:00:00"), item("sete", "2026-11-16T19:00:00", "2026-11-16T20:00:00")]);
  for (const view of ["week", "day"]) {
    const html = renderAgenda(s, { date: "2026-11-17", view, agora: AGORA });
    assert.match(html, /data-agenda-fora-janela/, view);
    assert.match(html, /Consulta meia-noite/, view);
  }
  const semana = renderAgenda(s, { date: "2026-11-16", view: "week", agora: AGORA });
  const fora = semana.slice(semana.indexOf("data-agenda-fora-janela"));
  assert.doesNotMatch(fora, /Consulta sete/, "consulta dentro da janela nao entra na lista de fora");
  assert.match(semana, /Consulta sete/);
});

test("Agenda: sem consulta fora da janela a lista de fora nao aparece; cancelada nao entra", () => {
  const s = estadoAgenda([item("dia", "2026-11-17T10:00:00", "2026-11-17T11:00:00"), item("cancelada", "2026-11-17T00:00:00", "2026-11-17T01:00:00", { status: "cancelled" })]);
  assert.doesNotMatch(renderAgenda(s, { date: "2026-11-17", view: "week", agora: AGORA }), /data-agenda-fora-janela/);
});

test("Lista da Agenda mostra 00:00–01:00 do dia 17 para o item gravado em 03:00Z", () => {
  const s = estadoAgenda([item("meia-noite", "2026-11-17T00:00:00", "2026-11-17T01:00:00")]);
  const html = tabelaDaAgenda(s, s.schedule_items, { agora: AGORA });
  assert.match(html, /00:00–01:00/);
  assert.match(html, /ter, 17 nov/);
});

