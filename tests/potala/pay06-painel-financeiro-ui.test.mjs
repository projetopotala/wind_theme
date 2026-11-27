import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createPagamentosPixAdmin, emFalha, mensagemDeErro, renderizarHistorico, renderizarLista, renderizarPainel, renderizarResumo, reais,
} from "../../outputs/js/admin/pagamentos-pix-admin.js";

/* PAY-06 | Historico financeiro continua somente leitura; PAY-10 acrescenta configuracao por RPCs Owner-only. */
const ID = "11111111-1111-4111-8111-111111111111";
const ITEM = { id: ID, status: "aguardando_pagamento", amount_cents: 15000, servico: "Atendimento teste", created_at: "2026-11-26T12:00:00Z", updated_at: "2026-11-26T12:05:00Z",
  due_date: "2026-11-27", confirmed_at: null, received_at: null, refunded_at: null, reservation_outcome: "pendente", failure_reason: null, last_event_at: null, eventos: 0, eventos_com_falha: 0, revisoes_abertas: 0 };
const VISAO = { charges_enabled: false, total: 1, por_situacao: { aguardando_pagamento: 1 }, revisoes_abertas: 0, ultimo_evento_em: null };
const PROIBIDAS = ["Gerar", "Cancelar", "Confirmar", "Editar", "Estornar", "Registrar", "Marcar como", "<form", "<input", "<textarea", "type=\"submit\""];

test("estados: carregando, erro, vazio e lista", () => {
  assert.match(renderizarPainel({ carregando: true }), /Carregando pagamentos/);
  const erro = renderizarPainel({ erro: mensagemDeErro({ code: "42501" }) });
  assert.match(erro, /role="alert"/); assert.match(erro, /Somente o Owner ativo/); assert.match(erro, /data-pg-recarregar/);
  assert.match(mensagemDeErro(new Error("x")), /Não foi possível carregar/);
  const vazio = renderizarPainel({ visao: { ...VISAO, total: 0, por_situacao: {} }, lista: [] });
  assert.match(vazio, /Nenhuma cobrança ainda/); assert.match(vazio, /continuam desativados/); assert.match(vazio, /bloqueadas/);
  assert.match(renderizarLista([], { filtro: "recebido" }), /Nenhuma cobrança com esta situação/);
  const cheio = renderizarPainel({ visao: VISAO, lista: [ITEM] });
  assert.match(cheio, /Atendimento teste · R\$\s?150,00/); assert.match(cheio, /Aguardando pagamento/); assert.match(cheio, /26\/11\/2026/);
});

test("trava geral aparece como bloqueada ou liberada, conforme o banco", () => {
  assert.match(renderizarResumo({ ...VISAO, charges_enabled: false }), /data-pg-trava="fechada"[^>]*>Cobranças: <strong>bloqueadas/);
  assert.match(renderizarResumo({ ...VISAO, charges_enabled: true }), /data-pg-trava="aberta"[^>]*>Cobranças: <strong>liberadas/);
});

test("falhas: divergente, evento com falha, revisao aberta e motivo registrado ganham atencao", () => {
  assert.equal(emFalha(ITEM), false);
  for (const extra of [{ status: "divergente" }, { status: "em_contestacao" }, { eventos_com_falha: 1 }, { revisoes_abertas: 2 }, { failure_reason: "timeout" }]) assert.equal(emFalha({ ...ITEM, ...extra }), true, JSON.stringify(extra));
  const h = renderizarLista([{ ...ITEM, revisoes_abertas: 2, failure_reason: "timeout" }]);
  assert.match(h, /data-falha/); assert.match(h, /Atenção/); assert.match(h, /Falha registrada: timeout/); assert.match(h, /2 pendência\(s\) de revisão/);
});

test("historico: carregando, erro, vazio, eventos e revisoes", () => {
  assert.match(renderizarHistorico(null), /Carregando histórico/);
  assert.match(renderizarHistorico(null, "Falhou"), /role="alert"/);
  assert.match(renderizarHistorico({ eventos: [], revisoes: [] }), /Nenhum evento recebido/);
  const h = renderizarHistorico({
    eventos: [{ evento: "PAYMENT_RECEIVED", resultado: "divergencia", de: "aguardando_pagamento", para: "divergente", valor_cents: 99999, recebido_em: "2026-11-26T13:00:00Z" }],
    revisoes: [{ tipo: "divergencia_financeira", aberta_em: "2026-11-26T13:00:00Z", resolvida_em: null }],
  });
  assert.match(h, /PAYMENT_RECEIVED/); assert.match(h, /Divergência/); assert.match(h, /Aguardando pagamento → Divergente/); assert.match(h, /R\$\s?999,99/);
  assert.match(h, /Valor diferente do esperado/); assert.match(h, /em aberto/); assert.match(h, /data-falha/);
});

test("historico de cobrancas permanece somente leitura", () => {
  const html = renderizarLista([ITEM, { ...ITEM, id: "b", status: "recebido" }], { aberto: ID, historico: { eventos: [], revisoes: [] } });
  for (const proibida of PROIBIDAS) assert.equal(html.includes(proibida), false, proibida);
  const botoes = [...html.matchAll(/<button[^>]*data-pg-([a-z]+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(botoes)].sort(), ["historico"]);
});

test("dados minimos e escape: texto externo nunca vira HTML; nada de CPF, Pix ou provedor na tela", () => {
  const html = renderizarLista([{ ...ITEM, servico: "<img src=x onerror=alert(1)>", failure_reason: "<script>1</script>", status: "<b>" }]);
  assert.equal(/<img|<script|<b>/.test(html), false);
  const tela = renderizarPainel({ visao: VISAO, lista: [ITEM] });
  for (const termo of ["cpf", "pix_copy_paste", "00020126", "provider", "client_id", "e-mail", "telefone"]) assert.equal(tela.toLowerCase().includes(termo), false, termo);
  assert.equal(reais(-1), "—"); assert.equal(reais(null), "—");
});

/* -------- comportamento com cliente falso -------- */
function raizFalsa({ hidden = false } = {}) {
  const ouvintes = {};
  return { hidden, innerHTML: "", addEventListener(t, f) { ouvintes[t] = f; }, disparar(t, alvo) { return ouvintes[t]({ target: alvo }); } };
}
const alvo = (seletor, extra = {}) => ({ closest: (s) => (s === seletor ? { getAttribute: () => extra.id, value: extra.value } : null) });
function clienteFalso(respostas = {}) {
  const chamadas = [];
  return { chamadas, rpc: async (nome, args) => { chamadas.push([nome, args]); const r = respostas[nome]; return typeof r === "function" ? r(args) : (r ?? { data: null, error: null }); } };
}
const OK = { admin_pay_overview: { data: VISAO, error: null }, admin_list_appointment_payments: { data: [ITEM], error: null },
  admin_list_appointment_service_prices: { data: [], error: null }, admin_list_pay_pilot_candidates: { data: [], error: null },
  admin_list_appointment_payment_events: { data: { eventos: [], revisoes: [] }, error: null } };

test("so monta com raiz e cliente; sem eles nao faz nada", () => {
  assert.equal(createPagamentosPixAdmin({}), null);
  assert.equal(createPagamentosPixAdmin({ root: raizFalsa() }), null);
});

test("conta que nao e Owner (area oculta): nenhuma chamada ao banco", async () => {
  const cliente = clienteFalso(OK); const raiz = raizFalsa({ hidden: true });
  await createPagamentosPixAdmin({ root: raiz, client: cliente }).iniciar();
  assert.deepEqual(cliente.chamadas, []); assert.equal(raiz.innerHTML, "");
});

test("Owner: carrega uma vez as quatro leituras da Central e desenha a lista", async () => {
  const cliente = clienteFalso(OK); const raiz = raizFalsa(); const p = createPagamentosPixAdmin({ root: raiz, client: cliente });
  await p.iniciar(); await p.iniciar();
  assert.deepEqual(cliente.chamadas.map((c) => c[0]).sort(), ["admin_list_appointment_payments", "admin_list_appointment_service_prices", "admin_list_pay_pilot_candidates", "admin_pay_overview"]);
  assert.match(raiz.innerHTML, /Atendimento teste/);
  assert.deepEqual(cliente.chamadas.find((c) => c[0] === "admin_list_appointment_payments")[1], { p_status: null, p_limit: 50 });
});

test("erro de leitura: mensagem simples com tentar de novo; recusa do banco vira aviso de Owner", async () => {
  const raiz = raizFalsa();
  await createPagamentosPixAdmin({ root: raiz, client: clienteFalso({ admin_pay_overview: { data: null, error: { code: "42501" } }, admin_list_appointment_payments: { data: [], error: null } }) }).iniciar();
  assert.match(raiz.innerHTML, /Somente o Owner ativo/); assert.match(raiz.innerHTML, /data-pg-recarregar/);
  const raiz2 = raizFalsa();
  await createPagamentosPixAdmin({ root: raiz2, client: clienteFalso({ admin_pay_overview: () => { throw new Error("rede"); } }) }).iniciar();
  assert.match(raiz2.innerHTML, /Não foi possível carregar/);
});

test("historico abre e fecha pelo botao; filtro recarrega a lista", async () => {
  const cliente = clienteFalso(OK); const raiz = raizFalsa(); const p = createPagamentosPixAdmin({ root: raiz, client: cliente });
  await p.iniciar();
  await raiz.disparar("click", alvo("[data-pg-historico]", { id: ID }));
  assert.ok(cliente.chamadas.some((c) => c[0] === "admin_list_appointment_payment_events" && c[1].p_payment_id === ID));
  assert.match(raiz.innerHTML, /Nenhum evento recebido/); assert.match(raiz.innerHTML, /Ocultar histórico/);
  await raiz.disparar("click", alvo("[data-pg-historico]", { id: ID }));
  assert.match(raiz.innerHTML, /Ver histórico/);
  await raiz.disparar("change", alvo("[data-pg-filtro]", { value: "recebido" }));
  assert.deepEqual(cliente.chamadas.filter((c) => c[0] === "admin_list_appointment_payments").pop()[1], { p_status: "recebido", p_limit: 50 });
});

test("historico com erro nao derruba a lista", async () => {
  const raiz = raizFalsa();
  const p = createPagamentosPixAdmin({ root: raiz, client: clienteFalso({ ...OK, admin_list_appointment_payment_events: { data: null, error: { code: "XX" } } }) });
  await p.iniciar(); await raiz.disparar("click", alvo("[data-pg-historico]", { id: ID }));
  assert.match(raiz.innerHTML, /Atendimento teste/); assert.match(raiz.innerHTML, /Não foi possível carregar/);
});

/* -------- integracao estatica -------- */
test("integracao: area exclusiva do Owner, sem acesso direto a tabelas e carregamento so ao abrir Financeiro", () => {
  const fonte = readFileSync(new URL("../../outputs/js/admin/pagamentos-pix-admin.js", import.meta.url), "utf8");
  const rpcs = [...fonte.matchAll(/rpc\("([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(rpcs)].sort(), ["admin_list_appointment_payment_events", "admin_list_appointment_payments", "admin_list_appointment_service_prices", "admin_list_pay_pilot_candidates", "admin_pay_overview", "admin_set_appointment_service_price", "admin_set_pay_pilot_authorization_for_request"]);
  for (const proibido of [".from(", ".insert(", ".update(", ".delete(", ".upsert(", "functions.invoke", "create-appointment-payment", "fetch("]) assert.equal(fonte.includes(proibido), false, proibido);
  const html = readFileSync(new URL("../../outputs/admin.html", import.meta.url), "utf8");
  const bloco = html.match(/<section[^>]*data-pagamentos-pix-admin[^>]*>/)?.[0] || "";
  assert.ok(bloco.includes("data-admin-so-owner") && bloco.includes(" hidden"), "oculta por padrao e so do Owner");
  assert.equal((html.match(/data-admin-workspace="financeiro"/g) || []).length, 1, "nao criou nova area");
  assert.equal((html.match(/data-section="pagamentos/g) || []).length, 0, "nem novo item de menu");
  const entrada = readFileSync(new URL("../../outputs/js/admin/admin-entry.js", import.meta.url), "utf8");
  assert.ok(entrada.includes("data-section=\\\"financeiro\\\"]\")?.addEventListener(\"click\""), "carrega ao abrir Financeiro");
  const config = readFileSync(new URL("../../outputs/js/conta/pagamentos/config.js", import.meta.url), "utf8");
  assert.match(config, /PAGAMENTOS_PIX_ATIVO = false/);
});
