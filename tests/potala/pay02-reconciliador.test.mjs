import { test } from "node:test";
import assert from "node:assert/strict";
import { criarReconciliadorHandler } from "../../supabase/functions/reconcile-appointment-payments/handler.ts";

/*
 * PAY-02 | Reconciliador. Tudo com fetch simulado e dependencias em memoria: nenhuma rede, nenhuma credencial real.
 * Garantia central testada: o reconciliador NUNCA cria cobranca (nenhum POST /payments) e NUNCA libera horario sem prova.
 */
const CHAVE = "chave_sbx_FICTICIA_".padEnd(48, "s");
const TOKEN_WH = "token-webhook-FICTICIO-".padEnd(48, "w");
const SEGREDO = "segredo-reconciliador-FICTICIO-".padEnd(48, "r");
const ENV = { PAYMENTS_ENABLED: "true", ASAAS_ENV: "sandbox", ASAAS_API_KEY: CHAVE, ASAAS_WEBHOOK_TOKEN: TOKEN_WH, PAYMENTS_RECONCILE_TOKEN: SEGREDO };
const REF = "appointment:44444444-4444-4444-8444-444444444444";
const PAG = "55555555-5555-4555-8555-555555555555";

const cob = (extra = {}) => ({ id: "pay_1", status: "PENDING", value: 150, externalReference: REF, dueDate: "2026-11-26", ...extra });
const linha = (extra = {}) => ({ payment_id: PAG, provider_payment_id: "pay_1", external_reference: REF, status: "aguardando_pagamento", amount_cents: 15000, pix_ready: true, motivo: "conferir", ...extra });
const expirado = (extra = {}) => ({ payment_id: PAG, request_id: "req", status: "aguardando_pagamento", provider_payment_id: "pay_1", amount_cents: 15000, external_reference: REF, ...extra });

function montar({ env = ENV, rotas = {}, conferir = [], expirados = [], liberar = "liberada", desconhecidas = null, registrarErro = false, eventoResultado = "aplicado" } = {}) {
  const fetches = []; const eventos = []; const revisoes = []; const liberadas = []; const registros = []; const logs = [];
  const deps = {
    env: (n) => env[n],
    fetch: async (url, init) => {
      const caminho = new URL(url).pathname.replace(/^\/v3/, "");
      const chave = `${init.method} ${caminho}`;
      fetches.push({ chave, url, headers: init.headers, body: init.body ?? null });
      const r = rotas[chave] ?? rotas[`${init.method} *`];
      if (r === undefined) return new Response("{}", { status: 404 });
      const v = typeof r === "function" ? r(url, init) : r;
      if (v instanceof Error) throw v;
      return v instanceof Response ? v.clone() : Response.json(v);
    },
    agora: () => new Date("2026-11-25T12:00:00Z"),
    listarConferir: async () => conferir.map((l) => ({ ...l })),
    listarExpirados: async () => expirados,
    registrarId: async (...a) => { registros.push(a); return registrarErro ? { error: true } : {}; },
    aplicarEvento: async (e) => { eventos.push(e); return { resultado: eventoResultado }; },
    abrirRevisao: async (...a) => { revisoes.push(a); },
    liberarReserva: async (id) => { liberadas.push(id); return liberar; },
    desconhecidas: async (itens) => (desconhecidas ? desconhecidas(itens) : []),
    log: (l) => logs.push(l),
  };
  const handler = criarReconciliadorHandler(deps);
  const chamar = (metodo = "POST", token = SEGREDO) => handler(new Request("https://edge.example", { method: metodo, headers: token === null ? {} : { "x-reconcile-token": token } }));
  return { chamar, fetches, eventos, revisoes, liberadas, registros, logs, tipos: () => revisoes.map((r) => r[2]), posts: () => fetches.filter((f) => f.chave === "POST /payments") };
}

/* ---------------- Autenticacao e travas ---------------- */
test("reconciliador | so POST; sem integracao ativa ou sem segredo proprio valido: 503 fechado e zero chamadas", async () => {
  assert.equal((await montar().chamar("GET")).status, 405);
  const casos = [
    { ...ENV, PAYMENTS_ENABLED: "false" },
    { ...ENV, PAYMENTS_RECONCILE_TOKEN: undefined },
    { ...ENV, PAYMENTS_RECONCILE_TOKEN: "curto" },
    { ...ENV, PAYMENTS_RECONCILE_TOKEN: `${SEGREDO} x` },
    { ...ENV, PAYMENTS_RECONCILE_TOKEN: CHAVE },
    { ...ENV, PAYMENTS_RECONCILE_TOKEN: TOKEN_WH },
    { ...ENV, ASAAS_ENV: "production" }, // sem a confirmacao explicita de producao
  ];
  for (const env of casos) {
    const m = montar({ env, conferir: [linha()], expirados: [expirado()] });
    assert.equal((await m.chamar()).status, 503, JSON.stringify(Object.keys(env).filter((k) => env[k] === undefined)));
    assert.equal(m.fetches.length + m.eventos.length + m.liberadas.length, 0);
  }
});

test("reconciliador | token errado, ausente ou parecido: 401 sem tocar em nada; a API Key nao serve de token", async () => {
  for (const t of [null, "", "errado", SEGREDO.slice(0, -1), `${SEGREDO}x`, CHAVE, TOKEN_WH]) {
    const m = montar({ conferir: [linha()], expirados: [expirado()] });
    assert.equal((await m.chamar("POST", t)).status, 401, String(t));
    assert.equal(m.fetches.length + m.eventos.length + m.liberadas.length, 0);
  }
});

/* ---------------- A) Sem id ---------------- */
test("sem_id | achou exatamente uma com valor e referencia certos: vincula e recupera o QR; nunca cria", async () => {
  const m = montar({ conferir: [linha({ provider_payment_id: null, pix_ready: false, motivo: "sem_id" })], rotas: {
    "GET /payments": { data: [cob()] }, "GET /payments/pay_1/pixQrCode": { encodedImage: "aW1n", payload: "000201", expirationDate: "2026-12-01 10:00:00" } } });
  const corpo = await (await m.chamar()).json();
  assert.deepEqual([corpo.vinculadas, corpo.qr_recuperados, corpo.erros], [1, 1, 0]);
  assert.deepEqual(m.registros.map((r) => [r[0], r[1], r[2] === null ? "sem-qr" : "com-qr"]), [[PAG, "pay_1", "sem-qr"], [PAG, "pay_1", "com-qr"]]);
  assert.equal(m.posts().length, 0);
  assert.equal(m.revisoes.length, 0);
});

test("sem_id | nenhuma encontrada: abre revisao e NAO cancela, NAO cria, NAO libera (ausencia nao e prova)", async () => {
  const m = montar({ conferir: [linha({ provider_payment_id: null, motivo: "sem_id" })], rotas: { "GET /payments": { data: [] } } });
  const corpo = await (await m.chamar()).json();
  assert.deepEqual(m.tipos(), ["sem_id_no_provedor"]);
  assert.deepEqual([corpo.revisoes_abertas, m.eventos.length, m.liberadas.length, m.posts().length, m.registros.length], [1, 0, 0, 0, 0]);
  assert.equal(m.fetches.some((f) => f.chave.startsWith("DELETE")), false);
});

test("sem_id | varias encontradas: nao escolhe; revisao multiplas_no_provedor", async () => {
  const m = montar({ conferir: [linha({ provider_payment_id: null, motivo: "sem_id" })], rotas: { "GET /payments": { data: [cob(), cob({ id: "pay_2" })] } } });
  await m.chamar();
  assert.deepEqual(m.tipos(), ["multiplas_no_provedor"]);
  assert.deepEqual([m.registros.length, m.posts().length], [0, 0]);
});

test("sem_id | valor ou referencia diferentes: divergencia financeira e NAO vincula", async () => {
  for (const diferente of [{ value: 149.99 }, { externalReference: "appointment:outra" }]) {
    const m = montar({ conferir: [linha({ provider_payment_id: null, motivo: "sem_id" })], rotas: { "GET /payments": { data: [cob(diferente)] } } });
    await m.chamar();
    assert.deepEqual(m.tipos(), ["divergencia_financeira"], JSON.stringify(diferente));
    assert.equal(m.registros.length, 0);
  }
});

test("sem_id | timeout na consulta ao Asaas: conta erro, nao abre 'sem cobranca', nao cancela e nao cria", async () => {
  const m = montar({ conferir: [linha({ provider_payment_id: null, motivo: "sem_id" })], rotas: { "GET /payments": new Error("timeout") } });
  const corpo = await (await m.chamar()).json();
  assert.equal(corpo.erros >= 1, true);
  assert.deepEqual([m.revisoes.length, m.registros.length, m.liberadas.length, m.posts().length], [0, 0, 0, 0]);
});

test("sem_id | falha ao gravar o vinculo: erro contado e nada mais acontece", async () => {
  const m = montar({ registrarErro: true, conferir: [linha({ provider_payment_id: null, motivo: "sem_id" })], rotas: { "GET /payments": { data: [cob()] } } });
  const corpo = await (await m.chamar()).json();
  assert.deepEqual([corpo.vinculadas, corpo.erros, m.fetches.filter((f) => f.chave.endsWith("pixQrCode")).length], [0, 1, 0]);
});

/* ---------------- A) Sem QR e conferencia de status ---------------- */
test("sem_qr | busca o QR da cobranca ja vinculada e grava; falha no QR nunca cancela", async () => {
  const ok = montar({ conferir: [linha({ motivo: "sem_qr", pix_ready: false })], rotas: { "GET /payments/pay_1/pixQrCode": { encodedImage: "aW1n", payload: "000201", expirationDate: "2026-12-01 10:00:00" } } });
  assert.equal((await (await ok.chamar()).json()).qr_recuperados, 1);
  const ruim = montar({ conferir: [linha({ motivo: "sem_qr", pix_ready: false })], rotas: { "GET /payments/pay_1/pixQrCode": new Error("timeout") } });
  const corpo = await (await ruim.chamar()).json();
  assert.deepEqual([corpo.erros >= 1, ruim.eventos.length, ruim.liberadas.length, ruim.fetches.some((f) => f.chave.startsWith("DELETE"))], [true, 0, 0, false]);
});

test("conferir | evento perdido: aplica o status real pela mesma funcao do webhook, com id deterministico (idempotente)", async () => {
  const casos = [["RECEIVED", "PAYMENT_RECEIVED"], ["CONFIRMED", "PAYMENT_CONFIRMED"], ["OVERDUE", "PAYMENT_OVERDUE"], ["REFUNDED", "PAYMENT_REFUNDED"]];
  for (const [statusAsaas, evento] of casos) {
    const m = montar({ conferir: [linha()], rotas: { "GET /payments/pay_1": cob({ status: statusAsaas }) } });
    await m.chamar();
    assert.equal(m.eventos.length, 1, statusAsaas);
    assert.deepEqual(m.eventos[0], { eventId: `recon:pay_1:${statusAsaas}`, evento, provedorId: "pay_1", referenciaExterna: REF, valorCentavos: 15000, statusAsaas });
    assert.equal(m.posts().length, 0);
  }
});

test("conferir | status igual ao interno, status desconhecido ou reembolso em andamento", async () => {
  const igual = montar({ conferir: [linha()], rotas: { "GET /payments/pay_1": cob({ status: "PENDING" }) } });
  await igual.chamar(); assert.equal(igual.eventos.length, 0);
  const novo = montar({ conferir: [linha()], rotas: { "GET /payments/pay_1": cob({ status: "STATUS_NOVO_DO_FUTURO" }) } });
  await novo.chamar(); assert.deepEqual([novo.eventos.length, novo.logs.some((l) => l.evento === "recon_status_desconhecido")], [0, true]);
  const reembolso = montar({ conferir: [linha({ status: "recebido" })], rotas: { "GET /payments/pay_1": cob({ status: "REFUND_REQUESTED" }) } });
  await reembolso.chamar(); assert.equal(reembolso.eventos[0].evento, "PAYMENT_REFUND_IN_PROGRESS");
});

test("conferir | valor diferente no Asaas vira revisao de divergencia financeira (alem de conferir o status)", async () => {
  const m = montar({ conferir: [linha()], rotas: { "GET /payments/pay_1": cob({ value: 99, status: "PENDING" }) } });
  await m.chamar();
  assert.deepEqual(m.tipos(), ["divergencia_financeira"]);
});

test("conferir | cobranca removida no Asaas: aplica PAYMENT_DELETED so se o banco ainda nao esta cancelado", async () => {
  const a = montar({ conferir: [linha()], rotas: { "GET /payments/pay_1": cob({ deleted: true }) } });
  await a.chamar(); assert.equal(a.eventos[0].evento, "PAYMENT_DELETED");
  const b = montar({ conferir: [linha({ status: "cancelado" })], rotas: { "GET /payments/pay_1": cob({ deleted: true }) } });
  await b.chamar(); assert.equal(b.eventos.length, 0);
});

test("conferir | resultado 'duplicado'/'sem_mudanca' nao conta como evento aplicado (reexecucao e inofensiva)", async () => {
  const m = montar({ eventoResultado: "duplicado", conferir: [linha()], rotas: { "GET /payments/pay_1": cob({ status: "RECEIVED" }) } });
  assert.equal((await (await m.chamar()).json()).eventos_aplicados, 0);
});

/* ---------------- B) Reservas expiradas ---------------- */
test("expirada | cancela a cobranca no Asaas, aplica PAYMENT_DELETED e so depois libera o horario (nessa ordem)", async () => {
  const ordem = [];
  const m = montar({ expirados: [expirado()], rotas: {
    "DELETE /payments/pay_1": () => { ordem.push("delete"); return { deleted: true, id: "pay_1" }; },
    "GET /payments/pay_1": () => { ordem.push("get"); return cob({ deleted: true }); } } });
  const orig = m.eventos.push.bind(m.eventos); m.eventos.push = (e) => { ordem.push("evento"); return orig(e); };
  const origL = m.liberadas.push.bind(m.liberadas); m.liberadas.push = (x) => { ordem.push("liberar"); return origL(x); };
  const corpo = await (await m.chamar()).json();
  assert.deepEqual(ordem, ["delete", "get", "evento", "liberar"]);
  assert.deepEqual([corpo.canceladas_no_asaas, corpo.reservas_liberadas, m.eventos[0].evento, m.posts().length], [1, 1, "PAYMENT_DELETED", 0]);
});

test("expirada | Asaas recusa a exclusao (pode ja ter sido paga): confere o status real, abre revisao e NUNCA libera", async () => {
  const m = montar({ expirados: [expirado()], rotas: { "DELETE /payments/pay_1": new Response("{}", { status: 400 }), "GET /payments/pay_1": cob({ status: "RECEIVED" }) } });
  const corpo = await (await m.chamar()).json();
  assert.deepEqual(m.tipos(), ["falha_cancelamento_hold"]);
  assert.equal(m.eventos[0].evento, "PAYMENT_RECEIVED");
  assert.deepEqual([m.liberadas.length, corpo.reservas_liberadas], [0, 0]);
});

test("expirada | timeout na exclusao: resultado inconclusivo, revisao aberta e horario mantido", async () => {
  const m = montar({ expirados: [expirado()], rotas: { "DELETE /payments/pay_1": new Error("timeout"), "GET /payments/pay_1": new Error("timeout") } });
  await m.chamar();
  assert.deepEqual(m.tipos(), ["falha_cancelamento_hold"]);
  assert.deepEqual([m.liberadas.length, m.eventos.length], [0, 0]);
});

test("expirada | sem id da cobranca: nao assume que nada foi criado; revisao e horario mantido", async () => {
  const m = montar({ expirados: [expirado({ provider_payment_id: null })] });
  await m.chamar();
  assert.deepEqual(m.tipos(), ["hold_expirado_sem_id"]);
  assert.deepEqual([m.liberadas.length, m.fetches.filter((f) => f.chave !== "GET /payments").length], [0, 0]);
});

test("expirada | ja cancelada no banco: nao chama o Asaas, apenas libera o horario", async () => {
  const m = montar({ expirados: [expirado({ status: "cancelado" })] });
  const corpo = await (await m.chamar()).json();
  assert.deepEqual([m.fetches.filter((f) => f.chave.startsWith("DELETE")).length, m.liberadas.length, corpo.reservas_liberadas], [0, 1, 1]);
});

test("expirada | liberacao recusada pelo banco abre revisao; 'outra cobranca aberta' e 'ja tratada' sao apenas logados", async () => {
  const bloqueada = montar({ expirados: [expirado({ status: "cancelado" })], liberar: "cobranca_ativa_encontrada" });
  await bloqueada.chamar(); assert.deepEqual(bloqueada.tipos(), ["liberacao_bloqueada"]);
  for (const motivo of ["outra_cobranca_aberta", "solicitacao_ja_tratada"]) {
    const m = montar({ expirados: [expirado({ status: "cancelado" })], liberar: motivo });
    const corpo = await (await m.chamar()).json();
    assert.deepEqual([m.revisoes.length, corpo.reservas_liberadas, m.logs.some((l) => l.evento === "recon_liberacao_nao_necessaria")], [0, 0, true], motivo);
  }
});

/* ---------------- C) Orfas ---------------- */
test("orfas | cobrancas do Asaas com nossa referencia que o banco desconhece viram revisao; nada e alterado", async () => {
  const m = montar({
    rotas: { "GET /payments": { data: [{ id: "pay_x", externalReference: "appointment:a" }, { id: "pay_y", externalReference: "outro-sistema:1" }, { id: "pay_z" }], hasMore: false } },
    desconhecidas: (itens) => itens.filter((i) => i.id === "pay_x") });
  const corpo = await (await m.chamar()).json();
  assert.deepEqual([corpo.orfas, m.tipos(), m.revisoes[0][1]], [1, ["orfa_no_provedor"], "pay_x"]);
  assert.deepEqual([m.eventos.length, m.liberadas.length, m.posts().length, m.fetches.some((f) => f.chave.startsWith("DELETE"))], [0, 0, 0, false]);
});

test("orfas | so refs com o prefixo appointment: sao enviadas ao banco; paginacao limitada a 5 paginas", async () => {
  let paginas = 0; let recebidas = null;
  const m = montar({
    rotas: { "GET /payments": () => { paginas++; return { data: [{ id: `pay_${paginas}`, externalReference: "appointment:q" }, { id: "alheia", externalReference: "x" }], hasMore: true }; } },
    desconhecidas: (itens) => { recebidas = itens; return []; } });
  await m.chamar();
  assert.equal(paginas, 5);
  assert.deepEqual(recebidas.map((i) => i.id), ["pay_1", "pay_2", "pay_3", "pay_4", "pay_5"]);
});

/* ---------------- Limites e sigilo ---------------- */
test("limite por execucao: no maximo 50 itens por etapa", async () => {
  const conferir = Array.from({ length: 80 }, (_, i) => linha({ payment_id: `p${i}` }));
  const m = montar({ conferir, rotas: { "GET /payments/pay_1": cob({ status: "RECEIVED" }) } });
  await m.chamar();
  assert.equal(m.eventos.length, 50);
});

test("garantia | em nenhum cenario ha POST /payments nem POST /customers (o reconciliador nunca cria nada no Asaas)", async () => {
  const m = montar({
    conferir: [linha({ provider_payment_id: null, motivo: "sem_id" }), linha({ payment_id: "b", motivo: "sem_qr", pix_ready: false }), linha({ payment_id: "c" })],
    expirados: [expirado({ payment_id: "d" }), expirado({ payment_id: "e", provider_payment_id: null })],
    rotas: { "GET /payments": { data: [] }, "GET /payments/pay_1": cob({ status: "RECEIVED" }), "GET /payments/pay_1/pixQrCode": { encodedImage: "x", payload: "y", expirationDate: "2026-12-01 10:00:00" }, "DELETE /payments/pay_1": { deleted: true } } });
  await m.chamar();
  assert.equal(m.fetches.some((f) => f.chave.startsWith("POST ")), false);
  assert.equal(m.fetches.every((f) => f.url.startsWith("https://api-sandbox.asaas.com/v3/") || f.url.startsWith("https://sandbox.asaas.com/api/v3/")), true, m.fetches.map((f) => f.url).join(","));
});

test("sigilo | a chave so vai no header access_token; resposta, logs e revisoes nao a contem nem tem dados pessoais", async () => {
  const m = montar({ conferir: [linha()], expirados: [expirado({ payment_id: "d", provider_payment_id: null })], rotas: { "GET /payments/pay_1": cob({ status: "RECEIVED" }) } });
  const resposta = await (await m.chamar()).text();
  assert.equal(m.fetches.every((f) => f.headers.access_token === CHAVE), true);
  const tudo = JSON.stringify({ resposta, logs: m.logs, revisoes: m.revisoes });
  for (const proibido of [CHAVE, SEGREDO, TOKEN_WH, "cpf", "email"]) assert.equal(tudo.includes(proibido), false, proibido);
});
