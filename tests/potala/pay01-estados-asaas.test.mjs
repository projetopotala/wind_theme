import { test } from "node:test";
import assert from "node:assert/strict";
import { ESTADOS, EVENTO_PARA_ESTADO, TRANSICOES, aplicarEventoAsaas, proximoEstado, estadoLiberaConfirmacao, ehTerminal, STATUS_ASAAS_PARA_ESTADO } from "../../supabase/functions/_shared/pagamentos/estados.ts";
import { lerConfigAsaas } from "../../supabase/functions/_shared/pagamentos/config.ts";
import { AsaasErro, criarClienteAsaas } from "../../supabase/functions/_shared/pagamentos/asaas-client.ts";
import { criarWebhookHandler, normalizarEvento } from "../../supabase/functions/_shared/pagamentos/webhook.ts";
import { criarCriarPagamentoHandler } from "../../supabase/functions/create-appointment-payment/handler.ts";

/* PAY-01 | Unidades puras: maquina de estados, configuracao, cliente Asaas (mock), webhook e criacao da cobranca.
   Nenhum teste faz rede; nenhuma credencial real e usada. */

const TOKEN = "t".repeat(40);
const CHAVE = "chave-sandbox-de-teste";
const envBase = { PAYMENTS_ENABLED: "true", ASAAS_ENV: "sandbox", ASAAS_API_KEY: CHAVE, ASAAS_WEBHOOK_TOKEN: TOKEN, PAYMENT_ALLOWED_ORIGINS: "https://preview.example" };
const env = (extra = {}) => (n) => ({ ...envBase, ...extra })[n];

/* ---------------- Maquina de estados ---------------- */
test("estados | os 10 estados exigidos existem e nao ha flag booleana unica 'pago'", () => {
  assert.deepEqual([...ESTADOS].sort(), ["aguardando_pagamento", "cancelado", "confirmado", "criando", "divergente", "em_contestacao", "em_processamento", "estornado", "recebido", "vencido"]);
});

test("estados | fluxo normal: pendente nao e pago; confirmado nao libera; recebido libera", () => {
  let s = "criando";
  for (const [ev, esperado] of [["PAYMENT_CREATED", "aguardando_pagamento"], ["PAYMENT_CONFIRMED", "confirmado"], ["PAYMENT_RECEIVED", "recebido"]]) {
    const r = aplicarEventoAsaas(s, ev);
    assert.equal(r.resultado, "aplicado"); assert.equal(r.proximo, esperado); s = r.proximo;
  }
  assert.equal(estadoLiberaConfirmacao("aguardando_pagamento"), false);
  assert.equal(estadoLiberaConfirmacao("confirmado"), false);
  assert.equal(estadoLiberaConfirmacao("recebido"), true);
  assert.equal(estadoLiberaConfirmacao("vencido"), false);
});

test("estados | evento antigo ou duplicado NUNCA reverte estado mais recente", () => {
  for (const [atual, evento] of [["recebido", "PAYMENT_CREATED"], ["recebido", "PAYMENT_OVERDUE"], ["confirmado", "PAYMENT_CREATED"], ["recebido", "PAYMENT_CONFIRMED"], ["estornado", "PAYMENT_RECEIVED"], ["estornado", "PAYMENT_CONFIRMED"]]) {
    const r = aplicarEventoAsaas(atual, evento);
    assert.equal(r.proximo, atual, `${atual} + ${evento}`);
    assert.ok(["obsoleto", "sem_mudanca"].includes(r.resultado), `${atual} + ${evento}: ${r.resultado}`);
  }
  assert.equal(aplicarEventoAsaas("recebido", "PAYMENT_RECEIVED").resultado, "sem_mudanca");
});

test("estados | fora de ordem: RECEIVED antes de CREATED/CONFIRMED chega a recebido e o atrasado e ignorado", () => {
  let r = aplicarEventoAsaas("aguardando_pagamento", "PAYMENT_RECEIVED");
  assert.deepEqual([r.resultado, r.proximo], ["aplicado", "recebido"]);
  r = aplicarEventoAsaas("recebido", "PAYMENT_CONFIRMED");
  assert.deepEqual([r.resultado, r.proximo], ["obsoleto", "recebido"]);
});

test("estados | dinheiro em cobranca cancelada, estorno parcial e saltos impossiveis viram divergencia (reconciliacao)", () => {
  for (const [atual, evento] of [["cancelado", "PAYMENT_RECEIVED"], ["cancelado", "PAYMENT_CONFIRMED"], ["recebido", "PAYMENT_PARTIALLY_REFUNDED"], ["recebido", "PAYMENT_DELETED"], ["confirmado", "PAYMENT_RECEIVED_IN_CASH_UNDONE"]]) {
    const r = aplicarEventoAsaas(atual, evento);
    assert.deepEqual([r.resultado, r.proximo], ["divergencia", "divergente"], `${atual} + ${evento}`);
  }
  assert.equal(aplicarEventoAsaas("divergente", "PAYMENT_RECEIVED").proximo, "divergente");
});

test("estados | vencido, cancelado, estorno e contestacao", () => {
  assert.equal(aplicarEventoAsaas("aguardando_pagamento", "PAYMENT_OVERDUE").proximo, "vencido");
  assert.equal(aplicarEventoAsaas("vencido", "PAYMENT_RECEIVED").proximo, "recebido"); // Pix pago depois do vencimento
  assert.equal(aplicarEventoAsaas("aguardando_pagamento", "PAYMENT_DELETED").proximo, "cancelado");
  assert.equal(aplicarEventoAsaas("cancelado", "PAYMENT_RESTORED").proximo, "aguardando_pagamento");
  assert.equal(aplicarEventoAsaas("recebido", "PAYMENT_REFUNDED").proximo, "estornado");
  assert.equal(aplicarEventoAsaas("recebido", "PAYMENT_CHARGEBACK_REQUESTED").proximo, "em_contestacao");
  assert.equal(aplicarEventoAsaas("em_contestacao", "PAYMENT_REFUNDED").proximo, "estornado");
  assert.ok(ehTerminal("estornado") && ehTerminal("divergente") && !ehTerminal("recebido"));
});

test("estados | evento informativo ou desconhecido so e registrado, sem mudar estado", () => {
  assert.deepEqual(aplicarEventoAsaas("recebido", "PAYMENT_BANK_SLIP_VIEWED"), { resultado: "sem_mudanca", proximo: "recebido", conhecido: true });
  const desc = aplicarEventoAsaas("recebido", "PAYMENT_ALGO_NOVO");
  assert.deepEqual([desc.resultado, desc.proximo, desc.conhecido], ["sem_mudanca", "recebido", false]);
  assert.equal(Object.hasOwn(EVENTO_PARA_ESTADO, "__proto__"), false);
});

test("estados | tabelas coerentes: todo alvo e estado valido; todo status Asaas mapeia para estado valido", () => {
  for (const alvo of Object.values(EVENTO_PARA_ESTADO)) assert.ok(alvo === null || ESTADOS.includes(alvo));
  for (const alvo of Object.values(STATUS_ASAAS_PARA_ESTADO)) assert.ok(alvo === null || ESTADOS.includes(alvo));
  for (const [de, alvos] of Object.entries(TRANSICOES)) for (const a of alvos) assert.ok(ESTADOS.includes(de) && ESTADOS.includes(a));
  assert.equal(proximoEstado("recebido", null).resultado, "sem_mudanca");
});

/* ---------------- Configuracao ---------------- */
test("config | desligada por padrao; so Sandbox; producao bloqueada; segredos exigidos", () => {
  assert.deepEqual(lerConfigAsaas(() => undefined), { ativo: false, motivo: "desligado" });
  assert.equal(lerConfigAsaas(env({ PAYMENTS_ENABLED: "1" })).ativo, false);
  assert.equal(lerConfigAsaas(env({ ASAAS_ENV: "producao" })).motivo, "producao_bloqueada");
  assert.equal(lerConfigAsaas(env({ ASAAS_ENV: "production" })).motivo, "producao_bloqueada");
  assert.equal(lerConfigAsaas(env({ ASAAS_ENV: "qualquer" })).motivo, "ambiente_invalido");
  assert.equal(lerConfigAsaas(env({ ASAAS_API_KEY: "" })).motivo, "sem_chave");
  assert.equal(lerConfigAsaas(env({ ASAAS_WEBHOOK_TOKEN: "curto" })).motivo, "sem_webhook_token");
  assert.equal(lerConfigAsaas(env({ ASAAS_WEBHOOK_TOKEN: CHAVE.padEnd(40, "x"), ASAAS_API_KEY: CHAVE.padEnd(40, "x") })).motivo, "sem_webhook_token");
  const ok = lerConfigAsaas(env());
  assert.equal(ok.ativo, true); assert.equal(ok.baseUrl, "https://api-sandbox.asaas.com/v3"); assert.equal(ok.holdMinutos, 30);
  assert.equal(lerConfigAsaas(env({ PAYMENT_HOLD_MINUTES: "2" })).holdMinutos, 30);
  assert.equal(lerConfigAsaas(env({ PAYMENT_HOLD_MINUTES: "45" })).holdMinutos, 45);
});

/* ---------------- Cliente Asaas (fetch simulado) ---------------- */
function clienteMock(respostas) {
  const chamadas = [];
  const fetch = async (url, init) => { chamadas.push({ url, init }); const r = respostas.shift(); if (r instanceof Error) throw r; return r; };
  const logs = [];
  return { chamadas, logs, asaas: criarClienteAsaas({ baseUrl: "https://api-sandbox.asaas.com/v3", apiKey: CHAVE, fetch, novoId: () => "corr-1", log: (l) => logs.push(l) }) };
}
const cobrancaJson = (extra = {}) => Response.json({ id: "pay_1", status: "PENDING", value: 123.45, externalReference: "appointment:x", dueDate: "2026-11-26", ...extra });

test("asaas | recusa producao e URL desconhecida; chave so no header; valor vem em reais exatos", async () => {
  assert.throws(() => criarClienteAsaas({ baseUrl: "https://api.asaas.com/v3", apiKey: CHAVE, fetch: async () => null }), /producao_bloqueada/);
  assert.throws(() => criarClienteAsaas({ baseUrl: "https://outro.example/v3", apiKey: CHAVE, fetch: async () => null }), /url_asaas_invalida/);
  const m = clienteMock([cobrancaJson()]);
  const c = await m.asaas.criarCobrancaPix({ clienteId: "cus_1", valorCentavos: 12345, vencimento: "2026-11-26", referenciaExterna: "appointment:x", descricao: "Atendimento" });
  assert.equal(c.valorCentavos, 12345);
  const [{ url, init }] = m.chamadas;
  assert.equal(url, "https://api-sandbox.asaas.com/v3/payments");
  assert.equal(init.headers.access_token, CHAVE);
  const corpo = JSON.parse(init.body);
  assert.deepEqual([corpo.billingType, corpo.value, corpo.externalReference], ["PIX", 123.45, "appointment:x"]);
  assert.ok(!JSON.stringify(corpo).includes(CHAVE) && !url.includes(CHAVE));
  assert.ok(!JSON.stringify(m.logs).includes(CHAVE));
});

test("asaas | 4xx e rejeicao conclusiva; timeout e 5xx sao inconclusivos; resposta divergente e inconclusiva", async () => {
  const falha = async (resp, fn) => { try { await fn(clienteMock([resp]).asaas); assert.fail("devia lancar"); } catch (e) { assert.ok(e instanceof AsaasErro, String(e)); return e; } };
  const criar = (a) => a.criarCobrancaPix({ clienteId: "cus_1", valorCentavos: 12345, vencimento: "2026-11-26", referenciaExterna: "appointment:x", descricao: "d" });
  assert.equal((await falha(new Response("{}", { status: 400 }), criar)).tipo, "rejeitado");
  assert.equal((await falha(new Response("{}", { status: 503 }), criar)).tipo, "inconclusivo");
  assert.equal((await falha(new Error("timeout"), criar)).tipo, "inconclusivo");
  assert.equal((await falha(new Response("nao e json", { status: 200 }), criar)).tipo, "inconclusivo");
  assert.equal((await falha(cobrancaJson({ value: 1 }), criar)).tipo, "inconclusivo"); // valor diferente do enviado
  assert.equal((await falha(cobrancaJson({ externalReference: "outra" }), criar)).tipo, "inconclusivo");
  await assert.rejects(criarClienteAsaas({ baseUrl: "https://api-sandbox.asaas.com/v3", apiKey: CHAVE, fetch: async () => null }).criarCobrancaPix({ clienteId: "c", valorCentavos: 0, vencimento: "x", referenciaExterna: "r", descricao: "d" }), /valor_invalido/);
});

test("asaas | QR Pix validado", async () => {
  const m = clienteMock([Response.json({ encodedImage: "aW1n", payload: "000201...", expirationDate: "2027-01-01 23:59:59" }), Response.json({ encodedImage: "x" })]);
  assert.deepEqual(await m.asaas.obterPixQrCode("pay_1"), { imagemBase64: "aW1n", copiaECola: "000201...", expiraEm: "2027-01-01 23:59:59" });
  await assert.rejects(m.asaas.obterPixQrCode("pay_1"), AsaasErro);
});

/* ---------------- Webhook ---------------- */
const evento = (extra = {}, pagamento = {}) => ({ id: "evt_1", event: "PAYMENT_RECEIVED", dateCreated: "2026-11-25 10:00:00", payment: { id: "pay_1", value: 123.45, status: "RECEIVED", externalReference: "appointment:x", billingType: "PIX", ...pagamento }, ...extra });
function webhook(deps = {}) {
  const registros = [];
  const handler = criarWebhookHandler({ env: env(), registrar: async (e) => { registros.push(e); return { data: { resultado: "aplicado" } }; }, ...deps });
  const enviar = (corpo, headers = {}, metodo = "POST") => handler(new Request("https://edge.example/hook", { method: metodo, headers: { "content-type": "application/json", "asaas-access-token": TOKEN, ...headers }, body: metodo === "POST" ? (typeof corpo === "string" ? corpo : JSON.stringify(corpo)) : undefined }));
  return { registros, enviar };
}

test("webhook | legitimo: 200, evento normalizado em centavos", async () => {
  const w = webhook();
  const r = await w.enviar(evento());
  assert.equal(r.status, 200);
  assert.deepEqual(w.registros[0], { eventId: "evt_1", evento: "PAYMENT_RECEIVED", dataCriacao: "2026-11-25 10:00:00", pagamentoId: "pay_1", referenciaExterna: "appointment:x", valorCentavos: 12345, valorOriginalCentavos: null, statusAsaas: "RECEIVED", metodo: "PIX" });
});

test("webhook | sem token, token errado, vazio ou longo demais: 401 e nada e lido ou gravado", async () => {
  const w = webhook();
  for (const h of [{ "asaas-access-token": "" }, { "asaas-access-token": "x".repeat(40) }, { "asaas-access-token": TOKEN.slice(1) }, { "asaas-access-token": "a".repeat(300) }]) {
    assert.equal((await w.enviar(evento(), h)).status, 401);
  }
  const semHeader = await criarWebhookHandler({ env: env(), registrar: async () => assert.fail("nao deve registrar") })(new Request("https://e/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(evento()) }));
  assert.equal(semHeader.status, 401);
  assert.equal(w.registros.length, 0);
});

test("webhook | integracao desligada ou producao: 503 sem processar; metodo e corpo invalidos", async () => {
  for (const extra of [{ PAYMENTS_ENABLED: "false" }, { ASAAS_ENV: "producao" }]) {
    const w = criarWebhookHandler({ env: env(extra), registrar: async () => assert.fail("nao deve registrar") });
    assert.equal((await w(new Request("https://e/x", { method: "POST", headers: { "content-type": "application/json", "asaas-access-token": TOKEN }, body: "{}" }))).status, 503);
  }
  const w = webhook();
  assert.equal((await w.enviar(null, {}, "GET")).status, 405);
  assert.equal((await w.enviar("{nao json")).status, 400);
  assert.equal((await w.enviar({ id: "e", event: "x" })).status, 400);
  assert.equal((await w.enviar(evento({ id: "" }))).status, 400);
  assert.equal((await w.enviar(evento({ event: "payment_received" }))).status, 400);
  assert.equal((await w.enviar(evento(), { "content-type": "text/plain" })).status, 400);
  assert.equal((await w.enviar("x".repeat(200 * 1024))).status, 413);
});

test("webhook | falha do banco responde 503 para o Asaas reenviar; campos extras sao ignorados", async () => {
  const w = webhook({ registrar: async () => ({ error: { code: "x" } }) });
  assert.equal((await w.enviar(evento())).status, 503);
  const w2 = webhook({ registrar: async () => { throw new Error("rede"); } });
  assert.equal((await w2.enviar(evento())).status, 503);
  const w3 = webhook();
  assert.equal((await w3.enviar({ ...evento(), campoNovo: { a: 1 }, payment: { ...evento().payment, novo: true } })).status, 200);
  assert.equal(normalizarEvento(evento({}, { value: -5 })).valorCentavos, null);
});

/* ---------------- Criacao da cobranca ---------------- */
const REQ = "11111111-1111-4111-8111-111111111111";
const KEY = "22222222-2222-4222-8222-222222222222";
const PREPARADO = { id: "33333333-3333-4333-8333-333333333333", status: "criando", external_reference: "appointment:33333333-3333-4333-8333-333333333333", amount_cents: 15000, service_title: "Atendimento teste", hold_expires_at: "2026-11-25T20:00:00Z", due_date: "2026-11-25", provider_payment_id: null, replayed: false };
function criar(over = {}) {
  const calls = [];
  const deps = {
    env: env(), calls,
    fetch: async (url, init) => { calls.push(["fetch", url, init]); return url.endsWith("/customers") ? Response.json({ id: "cus_1" }) : url.endsWith("/pixQrCode") ? Response.json({ encodedImage: "aW1n", payload: "000201", expirationDate: "2026-12-01 10:00:00" }) : Response.json({ id: "pay_1", status: "PENDING", value: 150, externalReference: PREPARADO.external_reference, dueDate: "2026-11-25" }); },
    usuarioDoJwt: async (jwt) => (jwt === "jwt-valido" ? { id: "user-a" } : null),
    preparar: async (...a) => { calls.push(["preparar", ...a]); return { data: PREPARADO }; },
    dadosCliente: async () => ({ nome: "Cliente Teste", email: "c@example.com", cpfCnpj: "12345678909", asaasClienteId: null }),
    salvarClienteAsaas: async (...a) => { calls.push(["salvarCliente", ...a]); },
    registrar: async (...a) => { calls.push(["registrar", ...a]); return {}; },
    falhar: async (...a) => { calls.push(["falhar", ...a]); },
    ...over,
  };
  const handler = criarCriarPagamentoHandler(deps);
  const enviar = (corpo, auth = "Bearer jwt-valido") => handler(new Request("https://edge.example", { method: "POST", headers: { "content-type": "application/json", origin: "https://preview.example", ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify(corpo) }));
  return { calls, enviar };
}

test("criar | valor NAO e manipulavel: so request_id e idempotency_key; amount/valor/price sao recusados", async () => {
  const c = criar();
  for (const extra of [{ amount: 1 }, { amount_cents: 1 }, { valor: 1 }, { price: 1 }, { status: "recebido" }]) {
    assert.equal((await c.enviar({ request_id: REQ, idempotency_key: KEY, ...extra })).status, 400, JSON.stringify(extra));
  }
  assert.equal(c.calls.length, 0);
  const r = await c.enviar({ request_id: REQ, idempotency_key: KEY });
  assert.equal(r.status, 200);
  const corpo = JSON.parse(c.calls.find((x) => x[0] === "fetch" && x[1].endsWith("/payments"))[2].body);
  assert.equal(corpo.value, 150); // 15000 centavos vindos do banco
  assert.equal(corpo.externalReference, PREPARADO.external_reference);
});

test("criar | associa ao usuario do JWT e ao atendimento correto; salva o pagamento e devolve o Pix", async () => {
  const c = criar();
  const r = await c.enviar({ request_id: REQ, idempotency_key: KEY });
  const j = await r.json();
  assert.deepEqual(c.calls.find((x) => x[0] === "preparar").slice(1, 4), ["user-a", REQ, KEY]);
  assert.deepEqual([j.status, j.amount_cents, j.currency, j.pix.copia_e_cola], ["aguardando_pagamento", 15000, "BRL", "000201"]);
  const reg = c.calls.find((x) => x[0] === "registrar");
  assert.deepEqual([reg[1], reg[2]], [PREPARADO.id, "pay_1"]);
  assert.equal(JSON.stringify(j).includes(CHAVE), false);
});

test("criar | sem JWT, JWT invalido, desligado e origem nao permitida falham fechados", async () => {
  assert.equal((await criar().enviar({ request_id: REQ, idempotency_key: KEY }, null)).status, 401);
  assert.equal((await criar().enviar({ request_id: REQ, idempotency_key: KEY }, "Bearer outro")).status, 401);
  assert.equal((await criar({ env: env({ PAYMENTS_ENABLED: "false" }) }).enviar({ request_id: REQ, idempotency_key: KEY })).status, 503);
  assert.equal((await criar({ env: env({ ASAAS_ENV: "producao" }) }).enviar({ request_id: REQ, idempotency_key: KEY })).status, 503);
  const semOrigem = await criarCriarPagamentoHandler({ ...criar().calls, env: env(), fetch: async () => null, usuarioDoJwt: async () => ({ id: "u" }), preparar: async () => ({ data: PREPARADO }), dadosCliente: async () => null, salvarClienteAsaas: async () => {}, registrar: async () => ({}), falhar: async () => {} })(new Request("https://e", { method: "POST", headers: { "content-type": "application/json", origin: "https://malicioso.example", authorization: "Bearer x" }, body: "{}" }));
  assert.equal(semOrigem.headers.get("access-control-allow-origin"), null);
});

test("criar | idempotencia: repetir devolve a cobranca existente sem chamar o Asaas; 'criando' repetido fica em conciliacao", async () => {
  const c = criar({ preparar: async () => ({ data: { ...PREPARADO, status: "aguardando_pagamento", provider_payment_id: "pay_1", replayed: true } }) });
  const r = await c.enviar({ request_id: REQ, idempotency_key: KEY });
  assert.equal(r.status, 200); assert.equal((await r.json()).replayed, true);
  assert.equal(c.calls.filter((x) => x[0] === "fetch").length, 0);
  const c2 = criar({ preparar: async () => ({ data: { ...PREPARADO, replayed: true } }) });
  assert.equal((await c2.enviar({ request_id: REQ, idempotency_key: KEY })).status, 409);
  assert.equal(c2.calls.filter((x) => x[0] === "fetch").length, 0);
});

test("criar | erros do banco viram respostas seguras (dono errado, horario perdido, sem preco)", async () => {
  for (const [code, status] of [["42501", 403], ["P0002", 404], ["22023", 409], ["PT409", 409], ["PT422", 422], ["XX000", 502]]) {
    const c = criar({ preparar: async () => ({ data: null, error: { code } }) });
    assert.equal((await c.enviar({ request_id: REQ, idempotency_key: KEY })).status, status, code);
    assert.equal(c.calls.filter((x) => x[0] === "fetch").length, 0);
  }
});

test("criar | falha temporaria do Asaas: inconclusiva NAO cancela nem recria; 4xx cancela; sem CPF nao chama o Asaas", async () => {
  const timeout = criar({ fetch: async () => { throw new Error("timeout"); } });
  assert.equal((await timeout.enviar({ request_id: REQ, idempotency_key: KEY })).status, 502);
  assert.equal(timeout.calls.some((x) => x[0] === "falhar"), false);
  const rejeitado = criar({ fetch: async () => new Response("{}", { status: 400 }) });
  assert.equal((await rejeitado.enviar({ request_id: REQ, idempotency_key: KEY })).status, 502);
  assert.deepEqual(rejeitado.calls.find((x) => x[0] === "falhar").slice(1), [PREPARADO.id, "asaas_http_400"]);
  const semCpf = criar({ dadosCliente: async () => ({ nome: "X", email: null, cpfCnpj: null, asaasClienteId: null }) });
  assert.equal((await semCpf.enviar({ request_id: REQ, idempotency_key: KEY })).status, 422);
  assert.equal(semCpf.calls.filter((x) => x[0] === "fetch").length, 0);
  const salvarFalha = criar({ registrar: async () => ({ error: true }) });
  assert.equal((await salvarFalha.enviar({ request_id: REQ, idempotency_key: KEY })).status, 502);
});
