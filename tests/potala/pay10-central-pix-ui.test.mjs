import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { centavosDoCampo, createPagamentosPixAdmin, renderizarPiloto, renderizarPrecos } from "../../outputs/js/admin/pagamentos-pix-admin.js";

const ID = "11111111-1111-4111-8111-111111111111";
const OFFER = "oferta-real";
const PRICE = { offering_id: OFFER, title: "Atendimento de meditação", published: true, professional_name: "Profissional Potala",
  professional_eligible: true, test_or_demo: false, amount_cents: null, currency: "BRL", price_active: false, updated_at: null };
const CANDIDATE = { request_id: ID, client_name: "Cliente autorizado", offering_title: "Atendimento de meditação", request_status: "recebida",
  slot_starts_at: "2026-12-10T15:00:00Z", payment_status: null, authorization_state: "none", authorization_expires_at: null, eligible: true, ineligible_reason: null };

test("campo monetario converte reais para centavos sem ponto flutuante", () => {
  assert.equal(centavosDoCampo("150,00"), 15000);
  assert.equal(centavosDoCampo("1.234,56"), 123456);
  assert.equal(centavosDoCampo("10.5"), 1050);
  for (const ruim of ["", "0", "-1", "abc", "1,234", "1000000,00"]) assert.equal(centavosDoCampo(ruim), null, ruim);
});

test("precos mostram vazio, edicao e bloqueiam oferta de teste ou profissional inelegivel", () => {
  assert.match(renderizarPrecos([]), /Nenhuma oferta ativa/);
  const normal = renderizarPrecos([PRICE]);
  assert.match(normal, /Preço do atendimento/); assert.match(normal, /Nenhum preço cadastrado/); assert.match(normal, /Salvar preço/);
  const teste = renderizarPrecos([{ ...PRICE, offering_id: "demo", title: "Demo", test_or_demo: true }]);
  assert.match(teste, /teste\/demonstração/); assert.match(teste, /disabled/);
  const inelegivel = renderizarPrecos([{ ...PRICE, offering_id: "x", professional_eligible: false }]);
  assert.match(inelegivel, /Profissional inativo/); assert.match(inelegivel, /disabled/);
});

test("piloto explica trava, elegibilidade e estados da autorizacao", () => {
  const html = renderizarPiloto([CANDIDATE]);
  assert.match(html, /não gera cobrança/); assert.match(html, /Pagamentos permanecem bloqueados/); assert.match(html, /Autorizar Pix de teste/);
  assert.doesNotMatch(html, /user_id|00000000-/);
  const ruim = renderizarPiloto([{ ...CANDIDATE, eligible: false, ineligible_reason: "Oferta sem preço ativo." }]);
  assert.match(ruim, /Oferta sem preço ativo/); assert.match(ruim, /disabled/);
  const ativo = renderizarPiloto([{ ...CANDIDATE, authorization_state: "active", authorization_expires_at: "2026-12-09T15:00:00Z" }]);
  assert.match(ativo, /Revogar autorização/); assert.doesNotMatch(ativo, /data-pg-pilot-authorize/);
});

function rootFake() {
  const handlers = {};
  return { hidden: false, innerHTML: "", handlers, addEventListener(type, fn) { handlers[type] = fn; } };
}
function clientFake() {
  const calls = [];
  const reads = {
    admin_pay_overview: { charges_enabled: false, total: 0, por_situacao: {}, revisoes_abertas: 0 },
    admin_list_appointment_payments: [], admin_list_appointment_service_prices: [PRICE], admin_list_pay_pilot_candidates: [CANDIDATE],
  };
  return { calls, async rpc(name, args) { calls.push([name, args]); return { data: reads[name] ?? {}, error: null }; } };
}
const wait = () => new Promise((resolve) => setTimeout(resolve, 0));

test("salvar preco confirma e envia somente offering, centavos e estado pela RPC", async () => {
  const root = rootFake(); const client = clientFake(); const confirmations = [];
  await createPagamentosPixAdmin({ root, client, confirmar: (m) => (confirmations.push(m), true) }).iniciar();
  const card = { getAttribute: () => OFFER, querySelector: () => ({ value: "150,00" }) };
  const button = { closest: (selector) => selector === "[data-pg-price-save]" ? button : selector === "[data-pg-price-item]" ? card : null };
  root.handlers.click({ target: button }); await wait(); await wait();
  assert.equal(confirmations.length, 1);
  assert.deepEqual(client.calls.find((c) => c[0] === "admin_set_appointment_service_price")[1], { p_offering_id: OFFER, p_amount_cents: 15000, p_active: true });
});

test("autorizar piloto deriva usuario no servidor: navegador envia apenas request, validade e enabled", async () => {
  const root = rootFake(); const client = clientFake();
  await createPagamentosPixAdmin({ root, client, confirmar: () => true }).iniciar();
  const card = { getAttribute: () => ID, querySelector: () => ({ value: "2027-01-01T12:00" }) };
  const button = { closest: (selector) => selector === "[data-pg-pilot-authorize]" ? button : selector === "[data-pg-pilot-item]" ? card : null };
  root.handlers.click({ target: button }); await wait(); await wait();
  const args = client.calls.find((c) => c[0] === "admin_set_pay_pilot_authorization_for_request")[1];
  assert.equal(args.p_request_id, ID); assert.equal(args.p_enabled, true); assert.match(args.p_expires_at, /^2027-01-01T/); assert.equal("p_user_id" in args, false);
});

test("integracao estatica nao acessa tabelas nem oferece chave global", () => {
  const source = readFileSync(new URL("../../outputs/js/admin/pagamentos-pix-admin.js", import.meta.url), "utf8");
  for (const forbidden of [".from(", ".insert(", ".update(", ".delete(", "charges_enabled", "PAGAMENTOS_PIX_ATIVO", "create-appointment-payment"])
    assert.equal(source.includes(forbidden), forbidden === "charges_enabled", forbidden);
  assert.doesNotMatch(source, /data-pg-(?:enable|toggle)-charges/);
});
