import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createAppointmentPanel } from "../../outputs/js/admin/appointment-panel.js";
import { computeEnd, syncSlotForm, slotErrorMessage, DURATIONS } from "../../outputs/js/admin/atendimentos-view.js";

const REQ = "10000000-0000-4000-8000-000000000001";
const REQ_DONE = "10000000-0000-4000-8000-000000000002";
const REQ_LEGACY = "10000000-0000-4000-8000-000000000003";
const SLOT = "30000000-0000-4000-8000-000000000003";
const base = { contact_type: "email", contact: "cliente@example.invalid", preferred_date: "2026-11-12", preferred_period: "tarde",
  created_at: "2026-11-10T12:00:00Z", updated_at: "2026-11-10T12:00:00Z", modality: "online" };
const rows = [
  { ...base, id: REQ, requester_name: "Cliente Sintético", service: "Consulta online", status: "recebida", offering_id: "o1", professional_profile_id: "p1" },
  { ...base, id: REQ_DONE, requester_name: "Cliente Confirmado", service: "Consulta online", status: "encerrada", offering_id: "o1", professional_profile_id: "p1", reservation_schedule_id: "sched-1" },
  { ...base, id: REQ_LEGACY, requester_name: "Cliente Antigo", service: "Serviço antigo", status: "recebida" },
];
const slots = [
  { id: SLOT, starts_at: "2026-11-12T13:00:00Z", ends_at: "2026-11-12T14:00:00Z", status: "held", held_by_request_id: REQ },
  { id: "30000000-0000-4000-8000-000000000004", starts_at: "2026-11-13T13:00:00Z", ends_at: "2026-11-13T14:00:00Z", status: "booked", held_by_request_id: REQ_DONE },
];
const operational = {
  profiles: [
    { id: "p1", display_name: "Profissional Publicada", roles: ["professional"], active: true, published: true },
    { id: "p2", display_name: "Profissional Oculta", roles: ["professional"], active: true, published: false },
    { id: "c1", display_name: "Cliente Op", roles: ["client"], active: true },
  ],
  activity_offerings: [
    { id: "o1", title: "Consulta online", mode: "online", professional_id: null, active: true },
    { id: "o2", title: "Atendimento presencial", mode: "presencial", professional_id: "p1", active: true },
  ],
  rooms: [{ id: "r1", name: "Sala 1", status: "available", capacity: 4 }],
};
const fakeClient = { from(table) {
  const data = table === "appointment_slots" ? slots : rows;
  const q = { select: () => q, order: () => q, limit: () => ({ data, error: null }) };
  return q;
} };

function setup({ state = "authorized", createSlot, confirmReservation } = {}) {
  const handlers = {}, calls = { slot: [], confirm: [] };
  const target = { innerHTML: "", querySelector: () => null };
  const root = { querySelector: () => target, contains: () => true, addEventListener: (t, fn) => { handlers[t] = fn; }, removeEventListener() {} };
  const panel = createAppointmentPanel({
    root, client: fakeClient, enabled: true, reservationsEnabled: true, view: "atendimentos", selector: "[data-atendimentos-admin]",
    access: async () => ({ state }), getOperationalState: () => operational,
    createSlot: createSlot || (async (_c, args) => { calls.slot.push(args); }),
    confirmReservation: confirmReservation || (async (_c, args) => { calls.confirm.push(args); }),
  });
  return { panel, handlers, calls, target };
}
const formWith = (values) => ({ querySelector: (sel) => (sel in values ? { value: values[sel] } : null) });
const slotClick = (form) => ({ target: { closest: (sel) => (sel === "[data-appointment-slot-create]" ? { closest: (s) => (s === "[data-atendimentos-slot]" ? form : null) } : null) } });
const fields = (o) => ({ "[data-slot-professional]": o.professional ?? "p1", "[data-slot-offering]": o.offering ?? "o1", "[data-slot-room]": o.room ?? "",
  "[data-slot-date]": o.date ?? "2099-11-12", "[data-slot-time]": o.time ?? "10:00", "[data-slot-duration]": String(o.duration ?? 30) });

test("término é calculado pela duração (30/45/60) e vira o dia quando preciso", () => {
  assert.deepEqual(DURATIONS, [30, 45, 60]);
  assert.equal(computeEnd("2026-11-12", "10:00", 30), "2026-11-12T10:30");
  assert.equal(computeEnd("2026-11-12", "10:00", 45), "2026-11-12T10:45");
  assert.equal(computeEnd("2026-11-12", "23:30", 60), "2026-11-13T00:30");
  assert.equal(computeEnd("2026-11-12", "10:00", 50), "");
  assert.equal(computeEnd("", "10:00", 30), "");
});

test("a seção mostra as três áreas, cliente, profissional, serviço, data e horário", async () => {
  const { panel, target } = setup();
  await panel.reload();
  const html = target.innerHTML;
  for (const t of ["Disponibilizar horário", "Solicitações recebidas", "Consultas confirmadas"]) assert.ok(html.includes(t), t);
  for (const t of ["Cliente Sintético", "Profissional Publicada", "Consulta online", "12/11/2026 · 10:00–11:00"]) assert.ok(html.includes(t), t);
  assert.match(html, /data-atendimentos-confirmed="10000000-0000-4000-8000-000000000002"/);
  assert.match(html, /data-atendimentos-goto="agenda"/);
  assert.match(html, /Profissional Oculta — não publicado/);
  /* confirmada não aparece entre as pendentes */
  const pendentes = html.slice(html.indexOf('id="atend-solicitacoes"'), html.indexOf('id="atend-confirmadas"'));
  assert.ok(!pendentes.includes("Cliente Confirmado"));
  /* pedido com slot: sem caixa de revisão; pedido legado mantém a exigência explícita */
  const slotCard = pendentes.slice(pendentes.indexOf(`data-appointment-row="${REQ}"`), pendentes.indexOf(`data-appointment-row="${REQ_LEGACY}"`));
  assert.ok(!slotCard.includes("data-reservation-confirm"));
  assert.match(slotCard, /Confirmar atendimento/);
  assert.match(pendentes.slice(pendentes.indexOf(`data-appointment-row="${REQ_LEGACY}"`)), /data-reservation-confirm/);
});

test("somente administração autorizada vê a seção; sem acesso nada é consultado nem criado", async () => {
  const { panel, target, handlers, calls } = setup({ state: "forbidden" });
  await panel.reload();
  assert.match(target.innerHTML, /Acesso administrativo necessário/);
  assert.ok(!target.innerHTML.includes("Cliente Sintético"));
  await handlers.click(slotClick(formWith(fields({}))));
  assert.equal(calls.slot.length, 0);
});

test("cria horário online: início/fim calculados, sem sala, mensagem de sucesso", async () => {
  const { panel, target, handlers, calls } = setup();
  await panel.reload();
  await handlers.click(slotClick(formWith(fields({ duration: 45, room: "r1" }))));
  assert.deepEqual(calls.slot, [{ offeringId: "o1", professionalProfileId: "p1", startsAt: "2099-11-12T10:00", endsAt: "2099-11-12T10:45", roomId: "" }]);
  assert.match(target.innerHTML, /Horário disponibilizado: Profissional Publicada · Consulta online · 12\/11\/2099 10:00–10:45/);
});

test("presencial exige sala antes de chamar o banco", async () => {
  const { panel, target, handlers, calls } = setup();
  await panel.reload();
  await handlers.click(slotClick(formWith(fields({ offering: "o2" }))));
  assert.equal(calls.slot.length, 0);
  assert.match(target.innerHTML, /presencial: escolha a sala/);
  await handlers.click(slotClick(formWith(fields({ offering: "o2", room: "r1" }))));
  assert.equal(calls.slot[0].roomId, "r1");
});

test("campos faltando não chamam o banco", async () => {
  const { panel, target, handlers, calls } = setup();
  await panel.reload();
  await handlers.click(slotClick(formWith(fields({ time: "" }))));
  assert.equal(calls.slot.length, 0);
  assert.match(target.innerHTML, /Preencha profissional, serviço, data e horário/);
});

test("recusas do banco viram mensagens próprias e não apagam as solicitações", async () => {
  for (const [code, re] of [["22023", /profissional publicado/], ["PT409", /sobreposto/], ["23514", /sala escolhida/], ["42501", /não permite/]]) {
    const { panel, target, handlers } = setup({ createSlot: async () => { throw Object.assign(new Error("SQL interno secreto"), { code }); } });
    await panel.reload();
    await handlers.click(slotClick(formWith(fields({ professional: "p2" }))));
    assert.match(target.innerHTML, re);
    assert.ok(!target.innerHTML.includes("SQL interno secreto"));
    assert.ok(target.innerHTML.includes("Cliente Sintético"), "lista preservada");
  }
  assert.match(slotErrorMessage({}), /Não foi possível disponibilizar/);
});

test("confirma pedido com slot usando só os dados existentes, sem caixa de revisão", async () => {
  const { panel, handlers, calls } = setup();
  await panel.reload();
  const article = { querySelector: (sel) => ({
    "[data-reservation-start]": { value: "2026-11-12T10:00" }, "[data-reservation-end]": { value: "2026-11-12T11:00" } }[sel] || null) };
  const button = { dataset: { appointmentConfirm: REQ }, closest: (s) => (s === "[data-appointment-row]" ? article : null) };
  await handlers.click({ target: { closest: (s) => (s === "[data-appointment-confirm]" ? button : null) } });
  assert.equal(calls.confirm.length, 1);
  assert.equal(calls.confirm[0].requestId, REQ);
  assert.equal(calls.confirm[0].slotStartsAt, "2026-11-12T10:00");
  assert.equal(calls.confirm[0].slotEndsAt, "2026-11-12T11:00");
});

test("horário diferente do slot solicitado não chega ao banco", async () => {
  const { panel, handlers, calls } = setup();
  await panel.reload();
  const article = { querySelector: (sel) => ({
    "[data-reservation-start]": { value: "2026-11-12T11:00" }, "[data-reservation-end]": { value: "2026-11-12T12:00" } }[sel] || null) };
  const button = { dataset: { appointmentConfirm: REQ }, closest: (s) => (s === "[data-appointment-row]" ? article : null) };
  await handlers.click({ target: { closest: (s) => (s === "[data-appointment-confirm]" ? button : null) } });
  assert.equal(calls.confirm.length, 0);
});

test("pedido legado continua exigindo a revisão marcada", async () => {
  const { panel, handlers, calls, target } = setup();
  await panel.reload();
  const article = { querySelector: (sel) => (sel === "[data-reservation-confirm]" ? { checked: false } : null) };
  const button = { dataset: { appointmentConfirm: REQ_LEGACY }, closest: (s) => (s === "[data-appointment-row]" ? article : null) };
  await handlers.click({ target: { closest: (s) => (s === "[data-appointment-confirm]" ? button : null) } });
  assert.equal(calls.confirm.length, 0);
  assert.match(target.innerHTML, /Confirme que revisou/);
});

function fakeForm({ professional = "", offering = "", date = "", time = "", duration = "30" } = {}) {
  const opt = (value, dataset = {}) => ({ value, dataset, disabled: false });
  const profOptions = [opt(""), opt("p1", { published: "true" }), opt("p2", { published: "false" })];
  const offOptions = [opt(""), opt("o1", { professional: "", mode: "online" }), opt("o2", { professional: "p1", mode: "presencial" })];
  const select = (options, value) => ({ options, value, get selectedOptions() { return [options.find((o) => o.value === this.value) || options[0]]; } });
  const nodes = {
    "[data-slot-professional]": select(profOptions, professional), "[data-slot-offering]": select(offOptions, offering),
    "[data-slot-room-label]": { hidden: true }, "[data-slot-room]": { value: "", required: false },
    "[data-slot-unpublished]": { hidden: true }, "[data-slot-modality]": { textContent: "" }, "[data-slot-end]": { textContent: "" },
    "[data-slot-date]": { value: date }, "[data-slot-time]": { value: time }, "[data-slot-duration]": { value: duration },
  };
  return { nodes, querySelector: (sel) => nodes[sel] || null };
}

test("aviso de profissional não publicado aparece sem alterar nada; sala só quando presencial; término visível", () => {
  const f = fakeForm({ professional: "p2", offering: "o1", date: "2026-11-12", time: "10:00", duration: "45" });
  syncSlotForm(f);
  assert.equal(f.nodes["[data-slot-unpublished]"].hidden, false);
  assert.equal(f.nodes["[data-slot-room-label]"].hidden, true);
  assert.match(f.nodes["[data-slot-end]"].textContent, /10:45/);
  const g = fakeForm({ professional: "p1", offering: "o2" });
  syncSlotForm(g);
  assert.equal(g.nodes["[data-slot-unpublished]"].hidden, true);
  assert.equal(g.nodes["[data-slot-room-label]"].hidden, false);
  assert.equal(g.nodes["[data-slot-room]"].required, true);
});

test("oferta de outro profissional fica indisponível para o escolhido", () => {
  const f = fakeForm({ professional: "p2", offering: "o2" });
  syncSlotForm(f);
  assert.equal(f.nodes["[data-slot-offering]"].options[2].disabled, true);
  assert.equal(f.nodes["[data-slot-offering]"].value, "");
  assert.equal(f.nodes["[data-slot-offering]"].options[1].disabled, false);
});

test("o cartão da Visão geral não reage a cliques da seção Atendimentos (sem ação dupla)", async () => {
  const handlers = {}, target = { innerHTML: "", querySelector: () => null };
  const root = { querySelector: () => target, contains: () => true, addEventListener: (t, fn) => { handlers[t] = fn; }, removeEventListener() {} };
  let criou = 0;
  const panel = createAppointmentPanel({ root, client: fakeClient, enabled: true, reservationsEnabled: true, access: async () => ({ state: "authorized" }),
    getOperationalState: () => operational, createSlot: async () => { criou++; } });
  await panel.reload();
  const evento = { target: { closest: (s) => (s === "[data-atendimentos-admin]" ? {} : s === "[data-appointment-slot-create]" ? { closest: () => formWith({}) } : null) } };
  await handlers.click(evento);
  assert.equal(criou, 0);
});

test("admin.html: item Atendimentos no menu e área própria; cartão antigo da Visão geral preservado", () => {
  const html = readFileSync(new URL("../../outputs/admin.html", import.meta.url), "utf8");
  assert.match(html, /data-section="atendimentos"[^>]*data-dica="Atendimentos"/);
  assert.match(html, /data-admin-workspace="atendimentos" hidden/);
  assert.match(html, /<div data-atendimentos-admin><\/div>/);
  assert.match(html, /data-admin-workspace="agenda" data-op-view="agenda"/);
  const views = readFileSync(new URL("../../outputs/js/admin/operations/views.js", import.meta.url), "utf8");
  assert.match(views, /<div data-appointment-admin><\/div>/);
});

test("a camada nova não toca o banco além das funções existentes", () => {
  const src = readFileSync(new URL("../../outputs/js/admin/atendimentos-view.js", import.meta.url), "utf8");
  assert.ok(!/\.rpc\(|\.from\(|supabase/i.test(src));
});
