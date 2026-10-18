import assert from "node:assert/strict";
import test from "node:test";
import { webcrypto } from "node:crypto";
import { setupAppointmentForm, validateAppointmentForm, appointmentDateRange, RECEIVED_MESSAGE, DISABLED_MESSAGE } from "../../outputs/js/appointments/form.js";
import { APPOINTMENT_REQUESTS_ENABLED } from "../../outputs/js/appointments/config.js";
import { createAppointmentRequestSender } from "../../outputs/js/shared/appointment-requests.js";
import { criarRestPublico } from "../../outputs/js/supabase/rest.js";

const now = () => new Date("2026-10-18T12:00:00Z");
const values = () => ({ service: "Reiki", modality: "online", preferred_date: "2026-10-19",
  preferred_period: "tarde", requester_name: "Pessoa Fictícia", contact_type: "email", contact: "pessoa@example.invalid" });
const receipt = { id: "10000000-0000-4000-8000-000000000001", status: "recebida" };
function fixture(options = {}) {
  const handlers = {};
  const fields = { disabled: true };
  const button = { disabled: true, textContent: "" };
  const summary = { dataset: {}, hidden: false, textContent: "", focus() { this.focused = true; } };
  const date = {};
  const form = { values: values(), valid: true, querySelector: () => fields,
    elements: { namedItem: () => date }, setAttribute() {}, reportValidity() { return this.valid; },
    addEventListener: (event, handler) => { handlers[event] = handler; } };
  const document = { querySelector: (selector) => ({ "#bookForm": form, "#bookContinue": button, "#bookSummary": summary })[selector] };
  setupAppointmentForm(document, { now, ...options });
  return { form, fields, button, summary, date, handlers, submit: () => handlers.submit({ preventDefault() {} }) };
}
async function withFormData(work) {
  const original = globalThis.FormData;
  globalThis.FormData = class { constructor(form) { return Object.entries(form.values); } };
  try { await work(); } finally { globalThis.FormData = original; }
}

test("desativado por padrão: campos bloqueados e nenhum envio mesmo por submit programático", async () => {
  assert.equal(APPOINTMENT_REQUESTS_ENABLED, false);
  let calls = 0;
  const f = fixture({ send: async () => { calls++; return receipt; } });
  await f.submit();
  assert.equal(calls, 0);
  assert.equal(f.fields.disabled, true);
  assert.equal(f.button.disabled, true);
  assert.equal(f.summary.textContent, DISABLED_MESSAGE);
  assert.equal(f.summary.dataset.state, "disabled");
});

test("datas usam São Paulo, ano civil válido e limite de 365 dias", () => {
  assert.deepEqual(appointmentDateRange(new Date("2026-10-18T01:00:00Z")), { min: "2026-10-17", max: "2027-10-17" });
  for (const preferred_date of ["2026-10-17", "2027-10-19", "2027-02-30"]) {
    assert.throws(() => validateAppointmentForm({ ...values(), preferred_date }, now()));
  }
  for (const preferred_date of ["2026-10-18", "2027-10-18"]) {
    assert.equal(validateAppointmentForm({ ...values(), preferred_date }, now()).preferred_date, preferred_date);
  }
});

test("campos obrigatórios, opções e contato inválidos não enviam", async () => withFormData(async () => {
  let calls = 0;
  const f = fixture({ enabled: true, send: async () => { calls++; return receipt; } });
  for (const name of Object.keys(values())) {
    f.form.values = { ...values(), [name]: "" };
    await f.submit();
    assert.equal(f.summary.dataset.state, "error");
  }
  for (const invalid of [{ service: "Serviço inventado" }, { modality: "constructor" }, { preferred_period: "14:30" }, { contact: "inválido" }]) {
    f.form.values = { ...values(), ...invalid };
    await f.submit();
  }
  f.form.values = values();
  f.form.valid = false;
  await f.submit();
  assert.equal(calls, 0);
}));

test("duplo clique bloqueado, resposta recebida e repetição sem novo envio; edição limpa confirmação", async () => withFormData(async () => {
  let release;
  const calls = [];
  const f = fixture({ enabled: true, send: (request) => { calls.push(request); return new Promise((resolve) => { release = resolve; }); } });
  const first = f.submit();
  assert.equal(f.fields.disabled, true);
  assert.equal(f.button.disabled, true);
  await f.submit();
  assert.equal(calls.length, 1);
  release(receipt);
  await first;
  assert.equal(f.summary.textContent, RECEIVED_MESSAGE);
  assert.equal(f.button.disabled, false);
  assert.deepEqual(calls[0], values());
  await f.submit();
  assert.equal(calls.length, 1);
  f.form.values.service = "Acupuntura";
  f.handlers.input();
  assert.equal(f.summary.hidden, true);
  const edited = f.submit();
  assert.equal(calls.length, 2);
  release(receipt);
  await edited;
}));

test("rede e HTTP falham sem sucesso, retry usa mesma chave e edição usa outra", async () => withFormData(async () => {
  let saved = null;
  const keys = [];
  const bodies = [];
  const rest = criarRestPublico({ config: { url: "https://teste.invalid", publishableKey: "ficticia" }, fetchImpl: async (url, options) => {
    assert.equal(url, "https://teste.invalid/rest/v1/rpc/submit_appointment_request");
    assert.equal(options.method, "POST");
    const args = JSON.parse(options.body);
    keys.push(args.p_idempotency_key);
    bodies.push(args);
    if (keys.length === 1) throw new Error("Rede indisponível");
    if (keys.length === 2) return new Response(JSON.stringify({ message: "Indisponível" }), { status: 503 });
    return new Response(JSON.stringify(receipt), { status: 200 });
  } });
  const send = createAppointmentRequestSender({ rest, crypto: webcrypto, storage: { getItem: () => saved, setItem: (_, value) => { saved = value; } } });
  const f = fixture({ enabled: true, send });
  for (let i = 0; i < 2; i++) {
    await f.submit();
    assert.equal(f.summary.dataset.state, "error");
    assert.equal(f.button.disabled, false);
    assert.equal(f.fields.disabled, false);
    assert.notEqual(f.summary.textContent, RECEIVED_MESSAGE);
  }
  await f.submit();
  assert.equal(f.summary.textContent, RECEIVED_MESSAGE);
  assert.equal(keys[0], keys[1]);
  assert.equal(keys[1], keys[2]);
  f.form.values.preferred_period = "manha";
  await f.submit();
  assert.notEqual(keys[2], keys[3]);
  const { p_idempotency_key, ...args } = bodies[0];
  assert.deepEqual(args, Object.fromEntries(Object.entries(values()).map(([key, value]) => [`p_${key}`, value])));
}));

test("resultado pending, inesperado ou falso confirmado nunca vira sucesso e libera controles", async () => withFormData(async () => {
  for (const result of [{ status: "pending" }, null, { ...receipt, status: "confirmada" }, { status: "recebida" }]) {
    const f = fixture({ enabled: true, send: async () => result });
    await f.submit();
    assert.notEqual(f.summary.dataset.state, "received");
    assert.equal(f.button.disabled, false);
  }
}));
