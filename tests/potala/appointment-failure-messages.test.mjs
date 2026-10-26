/*
 * P2.1 — FALHAS DO AGENDAMENTO COM A FRASE CERTA, E NENHUM "RECEBIDA" SEM RECIBO.
 *
 * 1. Envio público: cada status do servidor (submit-appointment-request) leva a
 *    uma orientação própria. Antes, 400, 403, 409, 429 e 503 diziam todos
 *    "confira sua conexão".
 * 2. Meu Potala (envio autenticado): a RPC só vale como recebida com recibo
 *    { id UUID, status "recebida" }. Antes, qualquer resposta sem erro — até
 *    vazia — virava "Solicitação recebida".
 * Tudo com dados fictícios e clientes falsos: nenhuma chamada sai do processo.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { setupAppointmentForm, RECEIVED_MESSAGE } from "../../outputs/js/appointments/form.js";
import { appointmentFailureMessage, submitAppointmentRequest } from "../../outputs/js/shared/appointment-requests.js";
import { RestError } from "../../outputs/js/supabase/rest.js";
import { criarDadosSupabase } from "../../outputs/js/conta/adaptadores/supabase.js";
import { ErroDeConta, mensagemDoErro } from "../../outputs/js/conta/mensagens.js";

const now = () => new Date("2026-10-18T12:00:00Z");
const valores = () => ({ service: "Reiki", modality: "online", preferred_date: "2026-10-19",
  preferred_period: "tarde", requester_name: "Pessoa Fictícia", contact_type: "email", contact: "pessoa@example.invalid" });

function formulario(send) {
  const handlers = {};
  const summary = { dataset: {}, hidden: false, textContent: "", focus() {} };
  const button = { disabled: true, textContent: "" };
  const fields = { disabled: true };
  const form = { values: valores(), querySelector: () => fields, elements: { namedItem: () => ({}) },
    setAttribute() {}, reportValidity: () => true, addEventListener: (evento, fn) => { handlers[evento] = fn; } };
  const documento = { querySelector: (s) => ({ "#bookForm": form, "#bookContinue": button, "#bookSummary": summary })[s] };
  setupAppointmentForm(documento, { enabled: true, now, send });
  return { summary, button, enviar: () => handlers.submit({ preventDefault() {} }) };
}

async function comFormData(trabalho) {
  const original = globalThis.FormData;
  globalThis.FormData = class { constructor(form) { return Object.entries(form.values); } };
  try { await trabalho(); } finally { globalThis.FormData = original; }
}

test("envio público: cada status do servidor tem orientação própria e nenhuma confirma horário", async () => comFormData(async () => {
  const esperado = {
    400: /Revise o serviço/, 413: /Revise o serviço/, 403: /verificação de segurança/, 409: /Os dados mudaram/,
    429: /muitas solicitações em pouco tempo/, 503: /temporariamente indisponível/,
  };
  for (const [status, frase] of Object.entries(esperado)) {
    const f = formulario(async () => { throw new RestError("Não foi possível receber a solicitação.", { status: Number(status) }); });
    await f.enviar();
    assert.equal(f.summary.dataset.state, "error", `status ${status}`);
    assert.match(f.summary.textContent, frase, `status ${status}`);
    assert.match(f.summary.textContent, /Nenhum horário está confirmado\./);
    assert.notEqual(f.summary.textContent, RECEIVED_MESSAGE);
    assert.equal(f.button.disabled, false, "os controles voltam para nova tentativa");
  }
}));

test("envio público: sem status (rede) ou verificação não concluída mantêm as frases anteriores", () => {
  assert.match(appointmentFailureMessage(new RestError("Sem conexão com o Portal.")), /Confira sua conexão/);
  assert.match(appointmentFailureMessage(new Error("Verificação não concluída.")), /verificação de segurança/);
  assert.match(appointmentFailureMessage(undefined), /Confira sua conexão/);
  for (const status of [400, 403, 409, 413, 429, 503, 0]) {
    assert.doesNotMatch(appointmentFailureMessage({ status }), /confirmad[ao] (com sucesso|para)|nada foi (gravado|enviado)/i,
      "nenhuma frase promete horário nem afirma que nada foi gravado");
  }
});

test("envio público: o status HTTP real chega à mensagem (fetch falso, sem rede)", async () => {
  const config = { url: "https://exemplo.invalid", publishableKey: "chave-publica-ficticia" };
  for (const status of [400, 403, 409, 413, 429, 503]) {
    const erro = await submitAppointmentRequest({}, "token-ficticio", {
      config, fetchImpl: async () => new Response(JSON.stringify({ message: "x" }), { status }),
    }).then(() => null, (falha) => falha);
    assert.equal(erro?.status, status);
  }
});

function clienteRpc(resposta) {
  const chamadas = [];
  return {
    chamadas,
    from() { throw new Error("este teste não lê tabelas"); },
    rpc: async (nome, args) => { chamadas.push({ nome, args }); return resposta; },
  };
}
const PEDIDO = { idempotencia: "20000000-0000-4000-8000-000000000002", ofertaId: "oferta-ficticia",
  modalidade: "online", dataPreferida: "2026-10-20", periodoPreferido: "manha" };

test("Meu Potala: só há 'recebida' com recibo válido da RPC", async () => {
  const valido = { id: "30000000-0000-4000-8000-000000000003", status: "recebida" };
  const ok = criarDadosSupabase({ client: clienteRpc({ data: { ...valido, extra: "ignorado" }, error: null }) });
  assert.deepEqual(await ok.solicitarAtendimento(PEDIDO), valido, "devolve só id e status");

  for (const data of [null, {}, { status: "recebida" }, { id: "nao-e-uuid", status: "recebida" }, { ...valido, status: "confirmada" }, []]) {
    const dados = criarDadosSupabase({ client: clienteRpc({ data, error: null }) });
    await assert.rejects(dados.solicitarAtendimento(PEDIDO), (erro) => erro instanceof ErroDeConta && erro.codigo === "ATENDIMENTO_SEM_RECIBO",
      `resposta ${JSON.stringify(data)} não pode virar recebida`);
  }
  assert.match(mensagemDoErro(new ErroDeConta("ATENDIMENTO_SEM_RECIBO")), /não é duplicado/);
  assert.match(mensagemDoErro(new ErroDeConta("ATENDIMENTO_SEM_RECIBO")), /Nenhuma consulta foi confirmada/);
});

test("Meu Potala: recusas conhecidas da RPC têm frase própria; o resto segue o caminho geral", async () => {
  const comErro = (code) => criarDadosSupabase({ client: clienteRpc({ data: null, error: { code, message: "x" } }) });
  await assert.rejects(comErro("PT409").solicitarAtendimento(PEDIDO), (e) => e.codigo === "ATENDIMENTO_ALTERADO");
  await assert.rejects(comErro("22023").solicitarAtendimento(PEDIDO), (e) => e.codigo === "ATENDIMENTO_RECUSADO");
  await assert.rejects(comErro("PGRST205").solicitarAtendimento(PEDIDO), (e) => e.codigo === "DADOS_INDISPONIVEIS");
  await assert.rejects(comErro("42501").solicitarAtendimento(PEDIDO), (e) => e instanceof ErroDeConta);
  for (const codigo of ["ATENDIMENTO_ALTERADO", "ATENDIMENTO_RECUSADO"]) {
    assert.notEqual(mensagemDoErro(new ErroDeConta(codigo)), mensagemDoErro(new ErroDeConta("QUALQUER")), `${codigo} tem frase própria`);
  }
});

test("Meu Potala: a chamada continua sendo a RPC autenticada, com os mesmos argumentos", async () => {
  const cliente = clienteRpc({ data: { id: "30000000-0000-4000-8000-000000000003", status: "recebida" }, error: null });
  await criarDadosSupabase({ client: cliente }).solicitarAtendimento(PEDIDO);
  assert.deepEqual(cliente.chamadas, [{ nome: "submit_authenticated_appointment_request", args: {
    p_idempotency_key: PEDIDO.idempotencia, p_offering_id: PEDIDO.ofertaId, p_modality: PEDIDO.modalidade,
    p_preferred_date: PEDIDO.dataPreferida, p_preferred_period: PEDIDO.periodoPreferido } }]);
});
