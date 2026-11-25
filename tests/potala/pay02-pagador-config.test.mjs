import { test } from "node:test";
import assert from "node:assert/strict";
import { ASAAS_URLS, CONFIRMACAO_PRODUCAO, lerConfigAsaas } from "../../supabase/functions/_shared/pagamentos/config.ts";
import { validarDocumento, validarNomePagador } from "../../supabase/functions/_shared/pagamentos/documento.ts";
import { AsaasErro, criarClienteAsaas } from "../../supabase/functions/_shared/pagamentos/asaas-client.ts";
import { criarWebhookHandler } from "../../supabase/functions/_shared/pagamentos/webhook.ts";
import { criarCriarPagamentoHandler } from "../../supabase/functions/create-appointment-payment/handler.ts";

/*
 * PAY-02 | Configuracao de producao com travas, cliente Asaas ampliado, validacao de CPF/CNPJ e fluxo do pagador.
 * TUDO com fetch simulado: nenhuma rede, nenhuma credencial real, nenhuma cobranca real. Mocks NAO sao homologacao
 * da API real (ver docs/pay-02-integracao-asaas-real.md).
 */
const CHAVE_SBX = "chave_sbx_FICTICIA_".padEnd(48, "s");
const CHAVE_PROD = "chave_prod_FICTICIA_".padEnd(48, "p");
const CHAVE_HMLG = "chave_hmlg_FICTICIA_".padEnd(48, "h");
const TOKEN = "token-webhook-FICTICIO-".padEnd(48, "w");
const base = (extra = {}) => (nome) => ({ PAYMENTS_ENABLED: "true", ASAAS_ENV: "sandbox", ASAAS_API_KEY: CHAVE_SBX, ASAAS_WEBHOOK_TOKEN: TOKEN, PAYMENT_ALLOWED_ORIGINS: "https://preview.example", ...extra })[nome];
const producao = (extra = {}) => base({ ASAAS_ENV: "production", ASAAS_API_KEY: CHAVE_PROD, PAYMENTS_PRODUCTION_ACK: CONFIRMACAO_PRODUCAO, ...extra });

/* ---------------- Config ---------------- */
test("config producao | tres travas: PAYMENTS_ENABLED, confirmacao explicita e (no banco) a chave geral; sem elas, desligada", () => {
  assert.equal(lerConfigAsaas(base({ PAYMENTS_ENABLED: undefined })).motivo, "desligado");
  assert.equal(lerConfigAsaas(producao({ PAYMENTS_ENABLED: "false" })).motivo, "desligado");
  assert.equal(lerConfigAsaas(producao({ PAYMENTS_ENABLED: "TRUE" })).motivo, "desligado");
  for (const ambiente of ["production", "producao", " Production "]) {
    assert.equal(lerConfigAsaas(producao({ ASAAS_ENV: ambiente, PAYMENTS_PRODUCTION_ACK: undefined })).motivo, "producao_bloqueada", ambiente);
  }
  for (const ack of ["true", "sim", "COBRANCAS-REAIS-AUTORIZADAS", "cobrancas-reais-autorizadas ", ""]) {
    assert.equal(lerConfigAsaas(producao({ PAYMENTS_PRODUCTION_ACK: ack })).motivo, "producao_bloqueada", `ack=${ack}`);
  }
  const ok = lerConfigAsaas(producao());
  assert.equal(ok.ativo, true); assert.equal(ok.ambiente, "production"); assert.equal(ok.baseUrl, ASAAS_URLS.producao);
  assert.equal(lerConfigAsaas(producao({ ASAAS_ENV: "producao" })).ambiente, "production");
});

test("config producao | chave de um ambiente nao serve ao outro; segredos obrigatorios; token do webhook != chave", () => {
  assert.equal(lerConfigAsaas(producao({ ASAAS_API_KEY: CHAVE_HMLG })).motivo, "chave_incompativel");
  assert.equal(lerConfigAsaas(base({ ASAAS_API_KEY: CHAVE_PROD })).motivo, "chave_incompativel");
  assert.equal(lerConfigAsaas(producao({ ASAAS_API_KEY: "" })).motivo, "sem_chave");
  assert.equal(lerConfigAsaas(producao({ ASAAS_API_KEY: undefined })).motivo, "sem_chave");
  assert.equal(lerConfigAsaas(producao({ ASAAS_WEBHOOK_TOKEN: CHAVE_PROD })).motivo, "sem_webhook_token");
  assert.equal(lerConfigAsaas(producao({ ASAAS_WEBHOOK_TOKEN: "curto" })).motivo, "sem_webhook_token");
  assert.equal(lerConfigAsaas(producao({ ASAAS_WEBHOOK_TOKEN: `${TOKEN} x` })).motivo, "sem_webhook_token");
  assert.equal(lerConfigAsaas(base({ ASAAS_ENV: "staging" })).motivo, "ambiente_invalido");
  // Sandbox continua funcionando e ignora a confirmacao de producao
  const sbx = lerConfigAsaas(base({ PAYMENTS_PRODUCTION_ACK: CONFIRMACAO_PRODUCAO }));
  assert.deepEqual([sbx.ativo, sbx.ambiente, sbx.baseUrl], [true, "sandbox", ASAAS_URLS.sandbox]);
  // Nenhuma saida da config repete a chave
  assert.equal(JSON.stringify(lerConfigAsaas(producao({ ASAAS_API_KEY: CHAVE_HMLG }))).includes(CHAVE_HMLG), false);
});

test("config producao | o padrao de um ambiente vazio e DESLIGADO (nenhuma variavel => nada acontece)", () => {
  assert.deepEqual(lerConfigAsaas(() => undefined), { ativo: false, motivo: "desligado" });
});

/* ---------------- Webhook em conta compartilhada ---------------- */
test("webhook | recebimento alheio aos atendimentos: 200, sem alarme; referencia 'appointment:' sem cobranca: 200 e log de possivel orfa (so ids)", async () => {
  const mk = (resultado) => {
    const logs = [];
    const h = criarWebhookHandler({ env: base(), log: (l) => logs.push(l), registrar: async () => ({ data: { resultado } }) });
    const enviar = (ref) => h(new Request("https://edge.example", { method: "POST", headers: { "content-type": "application/json", "asaas-access-token": TOKEN },
      body: JSON.stringify({ id: "evt_1", event: "PAYMENT_RECEIVED", payment: { id: "pay_9", value: 150, externalReference: ref, status: "RECEIVED", billingType: "PIX" } }) }));
    return { logs, enviar };
  };
  const a = mk("sem_correspondencia");
  for (const ref of [undefined, "pedido-loja:77", "outro-sistema"]) assert.equal((await a.enviar(ref)).status, 200);
  assert.equal(a.logs.length, 0, "cobrancas de outros usos da conta nao geram alarme");
  assert.equal((await a.enviar("appointment:44444444-4444-4444-8444-444444444444")).status, 200);
  assert.deepEqual(a.logs, [{ evento: "webhook_possivel_orfa", tipo: "PAYMENT_RECEIVED", eventId: "evt_1", pagamentoId: "pay_9" }]);
  const b = mk("aplicado");
  await b.enviar("appointment:44444444-4444-4444-8444-444444444444");
  assert.equal(b.logs.length, 0);
});

/* ---------------- Cliente Asaas ---------------- */
function clienteMock(respostas, opcoes = {}) {
  const chamadas = []; const logs = [];
  const fetch = async (url, init) => { chamadas.push({ url, metodo: init.method, headers: init.headers, body: init.body }); const r = respostas.shift(); if (r instanceof Error) throw r; return r; };
  return { chamadas, logs, asaas: criarClienteAsaas({ baseUrl: ASAAS_URLS.producao, apiKey: CHAVE_PROD, fetch, novoId: () => "corr-1", log: (l) => logs.push(l), permitirProducao: true, ...opcoes }) };
}
const cob = (extra = {}) => ({ id: "pay_1", status: "PENDING", value: 150, externalReference: "appointment:x", dueDate: "2026-11-26", ...extra });

test("asaas producao | a URL real so e aceita com permissao explicita; outras URLs nunca", () => {
  const f = async () => null;
  assert.throws(() => criarClienteAsaas({ baseUrl: ASAAS_URLS.producao, apiKey: CHAVE_PROD, fetch: f }), /producao_bloqueada/);
  assert.throws(() => criarClienteAsaas({ baseUrl: ASAAS_URLS.producao, apiKey: CHAVE_PROD, fetch: f, permitirProducao: false }), /producao_bloqueada/);
  assert.throws(() => criarClienteAsaas({ baseUrl: ASAAS_URLS.producao, apiKey: CHAVE_PROD, fetch: f, permitirProducao: "true" }), /producao_bloqueada/);
  assert.doesNotThrow(() => criarClienteAsaas({ baseUrl: ASAAS_URLS.producao, apiKey: CHAVE_PROD, fetch: f, permitirProducao: true }));
  assert.throws(() => criarClienteAsaas({ baseUrl: "https://api.asaas.com.evil.example/v3", apiKey: CHAVE_PROD, fetch: f, permitirProducao: true }), /url_asaas_invalida/);
  assert.throws(() => criarClienteAsaas({ baseUrl: "http://api.asaas.com/v3", apiKey: CHAVE_PROD, fetch: f, permitirProducao: true }), /url_asaas_invalida/);
});

test("asaas | busca por referencia externa: URL codificada, chave so no header, log sem query nem referencia nem chave", async () => {
  const m = clienteMock([Response.json({ data: [{ id: "cus_9" }, { id: "cus_8" }] }), Response.json({ data: [cob()] }), Response.json({ data: [cob({ id: "pay_2", deleted: true })] })]);
  assert.deepEqual(await m.asaas.listarClientesPorReferencia("user:abc def&x=1"), ["cus_9", "cus_8"]);
  const cs = await m.asaas.listarCobrancasPorReferencia("appointment:11111111-1111-4111-8111-111111111111");
  assert.deepEqual([cs.length, cs[0].id, cs[0].valorCentavos, cs[0].removida], [1, "pay_1", 15000, false]);
  assert.equal((await m.asaas.listarCobrancasPorReferencia("appointment:y"))[0].removida, true);
  assert.ok(m.chamadas[0].url.startsWith("https://api.asaas.com/v3/customers?externalReference=user%3Aabc%20def%26x%3D1&"));
  assert.equal(m.chamadas.every((c) => c.metodo === "GET" && c.headers.access_token === CHAVE_PROD && !c.url.includes(CHAVE_PROD)), true);
  const logTxt = JSON.stringify(m.logs);
  for (const proibido of [CHAVE_PROD, "externalReference", "abc", "appointment:", "?"]) assert.equal(logTxt.includes(proibido), false, proibido);
});

test("asaas | cancelar cobranca usa DELETE e so conta com confirmacao do Asaas; 4xx e rejeicao, timeout e inconclusivo", async () => {
  const m = clienteMock([Response.json({ deleted: true, id: "pay_1" }), Response.json({ deleted: false }), new Response("{}", { status: 400 }), new Error("timeout")]);
  await m.asaas.cancelarCobranca("pay_1");
  assert.deepEqual([m.chamadas[0].metodo, m.chamadas[0].url], ["DELETE", "https://api.asaas.com/v3/payments/pay_1"]);
  await assert.rejects(m.asaas.cancelarCobranca("pay_1"), (e) => e instanceof AsaasErro && e.tipo === "inconclusivo");
  await assert.rejects(m.asaas.cancelarCobranca("pay_1"), (e) => e instanceof AsaasErro && e.tipo === "rejeitado" && e.status === 400);
  await assert.rejects(m.asaas.cancelarCobranca("pay_1"), (e) => e instanceof AsaasErro && e.tipo === "inconclusivo");
});

test("asaas | varredura de cobrancas recentes valida parametros e le paginas; lista malformada e inconclusiva", async () => {
  const m = clienteMock([Response.json({ data: [{ id: "pay_1", externalReference: "appointment:a" }, { id: null }, { id: "pay_3" }], hasMore: true }), Response.json({ objeto: "x" })]);
  const p = await m.asaas.listarCobrancasDesde("2026-11-23", 100);
  assert.deepEqual(p, { itens: [{ id: "pay_1", ref: "appointment:a" }, { id: "pay_3", ref: null }], temMais: true });
  assert.ok(m.chamadas[0].url.includes("dateCreated%5Bge%5D=2026-11-23") && m.chamadas[0].url.includes("offset=100"));
  await assert.rejects(m.asaas.listarCobrancasDesde("2026-11-23"), (e) => e.tipo === "inconclusivo");
  await assert.rejects(m.asaas.listarCobrancasDesde("amanha"), /parametro_invalido/);
  await assert.rejects(m.asaas.listarCobrancasDesde("2026-11-23", -1), /parametro_invalido/);
});

/* ---------------- Documento ---------------- */
test("documento | CPF e CNPJ validados por digito verificador; formatos comuns aceitos; o resto recusado", () => {
  assert.deepEqual(validarDocumento("52998224725"), { tipo: "cpf", digitos: "52998224725", ultimos4: "4725" });
  assert.deepEqual(validarDocumento("529.982.247-25"), { tipo: "cpf", digitos: "52998224725", ultimos4: "4725" });
  assert.deepEqual(validarDocumento("11.444.777/0001-61"), { tipo: "cnpj", digitos: "11444777000161", ultimos4: "0161" });
  for (const ruim of ["52998224726", "529.982.247-26", "11111111111", "00000000000", "12345678901", "5299822472", "529982247250", "11444777000162", "11111111111111",
    "abc", "", "  ", "5299822472a", "1".repeat(40), null, undefined, 52998224725, {}, [], ["52998224725"], true]) {
    assert.equal(validarDocumento(ruim), null, JSON.stringify(ruim));
  }
});

test("documento | nome do pagador: nome e sobrenome, tamanho e caracteres seguros", () => {
  assert.equal(validarNomePagador("  Maria   da Silva "), "Maria da Silva");
  assert.equal(validarNomePagador("José D'Ávila"), "José D'Ávila");
  for (const ruim of ["Maria", "A", "", "  ", "x".repeat(121), "Maria <script>", "Maria\u0000 Silva", "12345 67890", null, 42, {}]) assert.equal(validarNomePagador(ruim), null, JSON.stringify(ruim));
});

/* ---------------- Handler: pagador, producao e chave geral ---------------- */
const REQ = "11111111-1111-4111-8111-111111111111";
const KEY = "22222222-2222-4222-8222-222222222222";
const PREP = { id: "33333333-3333-4333-8333-333333333333", status: "criando", external_reference: "appointment:33333333-3333-4333-8333-333333333333", amount_cents: 15000, service_title: "Atendimento teste", hold_expires_at: "2026-11-25T20:00:00Z", due_date: "2026-11-25", provider_payment_id: null, replayed: false };
const PAGADOR = { nome: "Maria da Silva", cpf_cnpj: "529.982.247-25" };

function criar({ env = base(), clientes = [], cliente = { nome: "", email: null, cpfCnpj: null, asaasClienteId: null }, over = {}, fetchInterno = null } = {}) {
  const calls = []; const logs = [];
  const deps = {
    env,
    fetch: async (url, init) => {
      calls.push(["fetch", init.method, url, init.body ?? null]);
      if (fetchInterno) { const r = await fetchInterno(url, init); if (r) return r; }
      if (init.method === "GET" && url.includes("/customers?")) return Response.json({ data: clientes });
      if (init.method === "POST" && url.endsWith("/customers")) return Response.json({ id: "cus_novo" });
      if (url.endsWith("/pixQrCode")) return Response.json({ encodedImage: "aW1n", payload: "000201", expirationDate: "2026-12-01 10:00:00" });
      return Response.json({ id: "pay_1", status: "PENDING", value: 150, externalReference: PREP.external_reference, dueDate: "2026-11-25" });
    },
    usuarioDoJwt: async () => ({ id: "user-a" }),
    preparar: async (...a) => { calls.push(["preparar", ...a]); return { data: PREP }; },
    dadosCliente: async () => cliente,
    salvarClienteAsaas: async (...a) => { calls.push(["salvarCliente", ...a]); },
    registrar: async (...a) => { calls.push(["registrar", ...a]); return {}; },
    falhar: async (...a) => { calls.push(["falhar", ...a]); },
    log: (l) => { logs.push(l); },
    ...over,
  };
  const handler = criarCriarPagamentoHandler(deps);
  const enviar = (extra = {}, corpo = { request_id: REQ, idempotency_key: KEY, ...extra }) =>
    handler(new Request("https://edge.example", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer jwt", origin: "https://preview.example" }, body: JSON.stringify(corpo) }));
  const f = (metodo, fim) => calls.filter((x) => x[0] === "fetch" && x[1] === metodo && (fim instanceof RegExp ? fim.test(x[2]) : x[2].endsWith(fim)));
  return { calls, logs, enviar, f, falhas: () => calls.filter((x) => x[0] === "falhar").map((x) => x[2]), toda: () => JSON.stringify({ calls, logs }) };
}

test("pagador | sem cadastro no Asaas: o documento valido vai ao Asaas UMA vez; o banco recebe so tipo e 4 ultimos digitos; nada sensivel em log ou resposta", async () => {
  const c = criar();
  const r = await c.enviar({ payer: PAGADOR });
  const corpoResposta = await r.text();
  assert.equal(r.status, 200);
  assert.equal(c.f("GET", /\/customers\?/).length, 1, "procura antes de criar");
  const post = JSON.parse(c.f("POST", "/customers")[0][3]);
  assert.deepEqual([post.name, post.cpfCnpj, post.externalReference, post.notificationDisabled], ["Maria da Silva", "52998224725", "user:user-a", true]);
  assert.equal("email" in post && post.email !== undefined, false, "e-mail nao e enviado");
  const salvar = c.calls.find((x) => x[0] === "salvarCliente");
  assert.deepEqual(salvar.slice(1), ["user-a", "cus_novo", "cpf", "4725"]);
  assert.equal(JSON.parse(c.f("POST", "/payments")[0][3]).customer, "cus_novo");
  // o documento completo so existe no corpo enviado ao Asaas
  const fora = JSON.stringify({ logs: c.logs, resposta: corpoResposta, salvar, preparar: c.calls.find((x) => x[0] === "preparar"), registrar: c.calls.filter((x) => x[0] === "registrar") });
  for (const proibido of ["52998224725", "529.982.247-25", "Maria da Silva"]) assert.equal(fora.includes(proibido), false, proibido);
  assert.equal(corpoResposta.includes(CHAVE_SBX), false);
});

test("pagador | com cadastro no Asaas ja salvo, o corpo 'payer' e ignorado e nenhum cliente e criado nem consultado", async () => {
  const c = criar({ cliente: { nome: "", email: null, cpfCnpj: null, asaasClienteId: "cus_salvo" } });
  assert.equal((await c.enviar({ payer: PAGADOR })).status, 200);
  assert.equal(c.f("GET", /\/customers/).length + c.f("POST", "/customers").length, 0);
  assert.equal(JSON.parse(c.f("POST", "/payments")[0][3]).customer, "cus_salvo");
  assert.equal(c.calls.some((x) => x[0] === "salvarCliente"), false);
  assert.equal(JSON.stringify(c.calls).includes("52998224725"), false, "documento nem foi repassado");
});

test("pagador | cliente ja existe no Asaas (timeout anterior): reutiliza pela referencia externa, sem criar duplicado", async () => {
  const c = criar({ clientes: [{ id: "cus_antigo" }] });
  assert.equal((await c.enviar({ payer: PAGADOR })).status, 200);
  assert.equal(c.f("POST", "/customers").length, 0);
  assert.equal(JSON.parse(c.f("POST", "/payments")[0][3]).customer, "cus_antigo");
  assert.deepEqual(c.calls.find((x) => x[0] === "salvarCliente").slice(1), ["user-a", "cus_antigo", "cpf", "4725"]);
});

test("pagador | clientes ambiguos no Asaas: nao adivinha; cancela a tentativa (nenhuma cobranca foi enviada) e nao cria cobranca", async () => {
  const c = criar({ clientes: [{ id: "cus_1" }, { id: "cus_2" }] });
  assert.equal((await c.enviar({ payer: PAGADOR })).status, 502);
  assert.deepEqual(c.falhas(), ["cliente_ambiguo"]);
  assert.equal(c.f("POST", "/payments").length + c.f("POST", "/customers").length, 0);
  assert.ok(c.logs.some((l) => l.evento === "pay_cliente_ambiguo"));
});

test("pagador | falha ao consultar ou criar o cliente (antes de qualquer cobranca) cancela a tentativa; nunca envia cobranca", async () => {
  for (const interno of [async (url, init) => (init.method === "GET" ? (() => { throw new Error("timeout"); })() : null), async (url, init) => (init.method === "POST" && url.endsWith("/customers") ? new Response("{}", { status: 400 }) : null)]) {
    const c = criar({ fetchInterno: interno });
    assert.equal((await c.enviar({ payer: PAGADOR })).status, 502);
    assert.deepEqual(c.falhas(), ["antes_da_cobranca"]);
    assert.equal(c.f("POST", "/payments").length, 0);
  }
});

test("pagador | nao conseguir salvar o pagador nao impede a cobranca (a referencia externa o reencontra); so o id vai ao log", async () => {
  const c = criar({ over: { salvarClienteAsaas: async () => { throw new Error("banco fora"); } } });
  assert.equal((await c.enviar({ payer: PAGADOR })).status, 200);
  assert.equal(c.f("POST", "/payments").length, 1);
  const l = c.logs.find((x) => x.evento === "pay_cliente_nao_salvo");
  assert.deepEqual(l, { evento: "pay_cliente_nao_salvo", asaasClienteId: "cus_novo" });
});

test("pagador | sem cadastro e sem 'payer': 422 pedindo os dados; nada e enviado ao Asaas", async () => {
  const c = criar();
  const r = await c.enviar();
  assert.equal(r.status, 422);
  assert.equal((await r.json()).needs_payer, true);
  assert.deepEqual(c.falhas(), ["cliente_sem_documento"]);
  assert.equal(c.calls.filter((x) => x[0] === "fetch").length, 0);
});

test("pagador | 'payer' invalido: 422 ANTES de reservar qualquer coisa (preparar nem e chamado), sem repetir o que foi digitado", async () => {
  for (const ruim of [{ nome: "Maria da Silva", cpf_cnpj: "529.982.247-26" }, { nome: "Maria", cpf_cnpj: "52998224725" }, { nome: "Maria da Silva", cpf_cnpj: "" }, { nome: "<b>Maria</b> Silva", cpf_cnpj: "52998224725" }, { nome: "Maria da Silva", cpf_cnpj: 52998224725 }]) {
    const c = criar();
    const r = await c.enviar({ payer: ruim });
    assert.equal(r.status, 422, JSON.stringify(ruim));
    const txt = await r.text();
    assert.equal(JSON.parse(txt).payer_invalid, true);
    assert.equal(c.calls.length, 0, "nada chamado");
    assert.equal(txt.includes("529"), false);
  }
});

test("pagador | formato do pedido: 'payer' so com {nome, cpf_cnpj}; campos extras ou tipos errados sao 400; valor continua nao manipulavel", async () => {
  for (const corpo of [{ payer: null }, { payer: "52998224725" }, { payer: [] }, { payer: { nome: "Maria da Silva" } }, { payer: { ...PAGADOR, email: "a@b.c" } },
    { payer: { ...PAGADOR, asaas_customer_id: "cus_x" } }, { payer: PAGADOR, amount: 1 }, { payer: PAGADOR, amount_cents: 1 }, { payer: PAGADOR, status: "recebido" }]) {
    const c = criar();
    assert.equal((await c.enviar({}, { request_id: REQ, idempotency_key: KEY, ...corpo })).status, 400, JSON.stringify(corpo));
    assert.equal(c.calls.length, 0);
  }
});

test("chave geral | PT503 do banco (cobrancas ainda nao autorizadas): 503 sem tocar no Asaas e sem mensagem tecnica", async () => {
  const c = criar({ over: { preparar: async () => ({ data: null, error: { code: "PT503" } }) } });
  const r = await c.enviar({ payer: PAGADOR });
  assert.equal(r.status, 503);
  assert.deepEqual(await r.json(), { message: "O pagamento ainda não está disponível." });
  assert.equal(c.calls.filter((x) => x[0] === "fetch").length, 0);
});

test("producao | sem a confirmacao explicita nada acontece (503, zero chamadas); com ela, so a URL oficial e a chave certa no header", async () => {
  const sem = criar({ env: producao({ PAYMENTS_PRODUCTION_ACK: undefined }) });
  assert.equal((await sem.enviar({ payer: PAGADOR })).status, 503);
  assert.equal(sem.calls.length, 0, "nem preparar nem Asaas");
  const com = criar({ env: producao() });
  const r = await com.enviar({ payer: PAGADOR });
  assert.equal(r.status, 200);
  const urls = com.calls.filter((x) => x[0] === "fetch").map((x) => x[2]);
  assert.ok(urls.length >= 3 && urls.every((u) => u.startsWith("https://api.asaas.com/v3/")), urls.join(","));
  assert.equal(urls.some((u) => u.includes("sandbox")), false);
  assert.equal((await r.text()).includes(CHAVE_PROD), false);
  assert.equal(JSON.stringify(com.logs).includes(CHAVE_PROD), false);
});
