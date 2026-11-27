// PAY-01/PAY-02: cria a intencao de pagamento (Pix) de uma solicitacao de atendimento.
//
// - O navegador envia { request_id, idempotency_key } e, SOMENTE se o pagador ainda nao existe no Asaas,
//   { payer: { nome, cpf_cnpj } }. O valor vem do banco (appointment_service_prices); qualquer outro campo,
//   inclusive "amount"/"valor", e rejeitado. O documento e validado aqui, nunca gravado por inteiro e nunca logado.
// - O usuario e identificado pelo JWT; o banco confere que a solicitacao e dele e que o horario ainda esta reservado.
// - Desligado por padrao (PAYMENTS_ENABLED). Producao exige as 3 travas descritas em _shared/pagamentos/config.ts.
//
// Ordem das operacoes (correcao B1):
//   1. reserva interna idempotente (linha "criando", sem id externo);
//   2. POST da cobranca no Asaas;
//   3. grava IMEDIATAMENTE o id externo (provider_payment_id) — a cobranca existente nunca mais e "esquecida";
//   4. so entao busca o QR Code; qualquer falha aqui preserva a cobranca e permite repetir a mesma chamada,
//      que apenas recupera o QR (nenhuma segunda cobranca).
// Cancelamento interno (pay_fail_creation) so acontece com PROVA de que nenhuma cobranca foi criada:
//   * falha ANTES de enviar o POST da cobranca, ou
//   * rejeicao 4xx conclusiva (exceto 408) do proprio POST da cobranca.
// Resultado inconclusivo (timeout, 5xx, resposta ruim, id externo nao gravado) mantem a linha "criando" SEM id:
// o indice de cobranca aberta bloqueia novas cobrancas ate o reconciliador (reconcile-appointment-payments) agir.

import { lerConfigAsaas } from "../_shared/pagamentos/config.ts";
import { AsaasErro, criarClienteAsaas, type FetchLike } from "../_shared/pagamentos/asaas-client.ts";
import { validarDocumento, validarNomePagador } from "../_shared/pagamentos/documento.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CORPO = 1024;

export type Preparado = {
  id: string; status: "criando" | "aguardando_pagamento" | string; external_reference: string; amount_cents: number;
  service_title: string; hold_expires_at: string; due_date: string; provider_payment_id: string | null;
  pix_ready?: boolean; replayed: boolean;
};
export type DadosCliente = { nome: string; email: string | null; cpfCnpj: string | null; asaasClienteId: string | null };
export type QrSalvo = { copiaECola: string; expiraEm: string };
export type CriarPagamentoDeps = {
  env(nome: string): string | undefined;
  fetch: FetchLike;
  usuarioDoJwt(jwt: string): Promise<{ id: string } | null>;
  preparar(usuarioId: string, requestId: string, chave: string, holdMinutos: number): Promise<{ data?: Preparado | null; error?: { code?: string } | null }>;
  // Cadastro minimo do pagador: so o id do cliente no Asaas e o e-mail da conta (nunca o documento completo).
  dadosCliente(usuarioId: string): Promise<DadosCliente | null>;
  salvarClienteAsaas(usuarioId: string, asaasClienteId: string, tipo?: "cpf" | "cnpj", ultimos4?: string): Promise<void>;
  // qr = null grava so o id externo (passo 3); com qr grava tambem o Pix. Idempotente para o mesmo id.
  registrar(pagamentoId: string, asaasPagamentoId: string, qr: QrSalvo | null): Promise<{ error?: unknown }>;
  falhar(pagamentoId: string, motivo: string): Promise<void>;
  log?(linha: Record<string, unknown>): void;
};

function origens(env: CriarPagamentoDeps["env"]) { return (env("PAYMENT_ALLOWED_ORIGINS") ?? "").split(",").map((x) => x.trim()).filter(Boolean); }
function cors(request: Request, deps: CriarPagamentoDeps): Record<string, string> {
  const origem = request.headers.get("origin");
  return origem && origens(deps.env).includes(origem)
    ? { "Access-Control-Allow-Origin": origem, "Access-Control-Allow-Headers": "apikey, authorization, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", Vary: "Origin" }
    : {};
}
const responder = (status: number, corpo: Record<string, unknown>, h: Record<string, string>) =>
  Response.json(corpo, { status, headers: { ...h, "Cache-Control": "no-store" } });

export function criarCriarPagamentoHandler(deps: CriarPagamentoDeps) {
  return async (request: Request): Promise<Response> => {
    const h = cors(request, deps);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
    if (request.method !== "POST") return responder(405, { message: "Método não permitido." }, h);
    const config = lerConfigAsaas(deps.env);
    if (!config.ativo) return responder(503, { message: "O pagamento ainda não está disponível." }, h);
    const jwt = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
    if (!jwt) return responder(401, { message: "Entre na sua conta." }, h);
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return responder(400, { message: "Pedido inválido." }, h);
    const texto = await request.text();
    if (texto.length > MAX_CORPO) return responder(413, { message: "Pedido grande demais." }, h);
    let requestId = ""; let chave = "";
    let pagador: { nome: string; documento: NonNullable<ReturnType<typeof validarDocumento>> } | null = null;
    try {
      const corpo = JSON.parse(texto);
      const chaves = corpo && !Array.isArray(corpo) && typeof corpo === "object" ? Object.keys(corpo).sort().join(",") : "";
      if (!corpo || Array.isArray(corpo) || (chaves !== "idempotency_key,request_id" && chaves !== "idempotency_key,payer,request_id")
        || !UUID.test(corpo.request_id) || !UUID.test(corpo.idempotency_key)) throw new Error("invalido");
      requestId = corpo.request_id.toLowerCase(); chave = corpo.idempotency_key.toLowerCase();
      if ("payer" in corpo) {
        const p = corpo.payer;
        if (!p || Array.isArray(p) || typeof p !== "object" || Object.keys(p).sort().join(",") !== "cpf_cnpj,nome") throw new Error("invalido");
        const nome = validarNomePagador(p.nome); const documento = validarDocumento(p.cpf_cnpj);
        // 422 antes de reservar qualquer coisa: nada e criado, e a mensagem nao repete o que o usuario digitou.
        if (!nome || !documento) return responder(422, { message: "Confira o nome completo e o CPF ou CNPJ informados.", payer_invalid: true }, h);
        pagador = { nome, documento };
      }
    } catch { return responder(400, { message: "Pedido inválido." }, h); }

    const usuario = await deps.usuarioDoJwt(jwt).catch(() => null);
    if (!usuario) return responder(401, { message: "Entre na sua conta." }, h);

    const { data, error } = await deps.preparar(usuario.id, requestId, chave, config.holdMinutos).catch(() => ({ data: null, error: { code: "indisponivel" } }));
    if (error || !data) {
      const c = error?.code ?? "";
      // PT503: a chave geral de cobrancas no banco esta desligada (nenhuma cobranca nova nasce).
      return responder(c === "42501" || c === "PT403" ? 403 : c === "P0002" ? 404 : c === "22023" || c === "PT409" ? 409 : c === "PT422" ? 422 : c === "PT503" ? 503 : 502,
        { message: c === "42501" || c === "PT403" ? "Este pedido não está autorizado para o piloto Pix." : c === "PT422" ? "Este atendimento ainda não tem valor definido para pagamento online." : c === "PT503" ? "O pagamento ainda não está disponível." : "Não foi possível preparar o pagamento." }, h);
    }
    const resumo = { payment_id: data.id, amount_cents: data.amount_cents, currency: "BRL", service: data.service_title, hold_expires_at: data.hold_expires_at };
    const asaas = criarClienteAsaas({ baseUrl: config.baseUrl, apiKey: config.apiKey, fetch: deps.fetch, log: deps.log, permitirProducao: config.ambiente === "production" });
    const idExterno = data.provider_payment_id;

    // (a) A cobranca JA existe no Asaas (nesta ou em tentativa anterior): nunca criar outra.
    if (idExterno) {
      const aberta = data.status === "criando" || data.status === "aguardando_pagamento";
      if (data.pix_ready === true || !aberta) return responder(200, { ...resumo, status: data.status, replayed: true, pix_ready: data.pix_ready === true }, h);
      // Cobranca criada sem QR disponivel: recupera o QR com o id ja gravado.
      try {
        const qr = await asaas.obterPixQrCode(idExterno);
        const salvo = await deps.registrar(data.id, idExterno, { copiaECola: qr.copiaECola, expiraEm: qr.expiraEm }).catch(() => ({ error: true }));
        if (salvo.error) return responder(502, { ...resumo, status: data.status, pix_ready: false, retry_same_request: true, message: "O Pix foi gerado, mas ainda não conseguimos salvá-lo. Tente de novo em instantes." }, h);
        return responder(200, { ...resumo, status: "aguardando_pagamento", replayed: true, recovered: true, pix_ready: true, pix: { copia_e_cola: qr.copiaECola, imagem_base64: qr.imagemBase64, expira_em: qr.expiraEm } }, h);
      } catch {
        return responder(502, { ...resumo, status: data.status, pix_ready: false, retry_same_request: true, message: "Seu pagamento já foi criado, mas o Pix ainda não está disponível. Tente de novo em instantes." }, h);
      }
    }

    // (b) Sem id externo: ou a linha esta encerrada, ou ha tentativa anterior inconclusiva (bloqueada ate reconciliar).
    if (data.status !== "criando") return responder(200, { ...resumo, status: data.status, replayed: true, pix_ready: false }, h);
    if (data.replayed) return responder(409, { message: "A criação anterior está em conciliação. Aguarde antes de tentar novamente." }, h);

    // (c) Criacao nova. `cobrancaEnviada` separa "provadamente nada criado" de "resultado inconclusivo".
    let cobrancaEnviada = false;
    let cobranca: { id: string };
    try {
      const cliente = await deps.dadosCliente(usuario.id);
      if (!cliente) { await deps.falhar(data.id, "cliente_indisponivel").catch(() => undefined); return responder(502, { message: "Não foi possível preparar o pagamento." }, h); }
      let clienteId = cliente.asaasClienteId;
      if (!clienteId) {
        // Documento: o informado agora (ja validado) ou, por compatibilidade, o que o adaptador entregar.
        const documento = pagador?.documento ?? validarDocumento(cliente.cpfCnpj);
        const nome = pagador?.nome ?? validarNomePagador(cliente.nome);
        if (!documento || !nome) {
          await deps.falhar(data.id, "cliente_sem_documento").catch(() => undefined);
          return responder(422, { message: "Precisamos do seu nome completo e do CPF ou CNPJ para gerar o Pix.", needs_payer: true }, h);
        }
        // Evita cliente duplicado apos timeout: procura primeiro pela referencia externa gravada na criacao.
        const existentes = await asaas.listarClientesPorReferencia(`user:${usuario.id}`);
        if (existentes.length > 1) {
          deps.log?.({ evento: "pay_cliente_ambiguo", pagamentoId: data.id, quantidade: existentes.length });
          await deps.falhar(data.id, "cliente_ambiguo").catch(() => undefined); // nenhum POST de cobranca foi enviado
          return responder(502, { message: "Não foi possível preparar o pagamento." }, h);
        }
        clienteId = existentes[0] ?? (await asaas.criarCliente({ nome, cpfCnpj: documento.digitos, email: cliente.email ?? undefined, referenciaExterna: `user:${usuario.id}` })).id;
        // Se salvar falhar, o proximo pedido reencontra o cliente pela referencia externa: nao e motivo para abortar.
        await deps.salvarClienteAsaas(usuario.id, clienteId, documento.tipo, documento.ultimos4).catch(() => deps.log?.({ evento: "pay_cliente_nao_salvo", asaasClienteId: clienteId }));
      }
      cobrancaEnviada = true; // a partir daqui o Asaas pode ter criado a cobranca
      cobranca = await asaas.criarCobrancaPix({ clienteId, valorCentavos: data.amount_cents, vencimento: data.due_date, referenciaExterna: data.external_reference, descricao: `Atendimento - ${data.service_title}` });
    } catch (e) {
      if (!cobrancaEnviada) {
        await deps.falhar(data.id, "antes_da_cobranca").catch(() => undefined); // prova: o POST da cobranca nem foi enviado
        return responder(502, { message: "Não foi possível preparar o pagamento." }, h);
      }
      if (e instanceof AsaasErro && e.tipo === "rejeitado") {
        await deps.falhar(data.id, `asaas_http_${e.status}`).catch(() => undefined); // 4xx conclusivo do POST: nada foi criado
        return responder(502, { message: "Não foi possível criar o pagamento." }, h);
      }
      deps.log?.({ evento: "pay_criacao_inconclusiva", pagamentoId: data.id, correlationId: e instanceof AsaasErro ? e.correlationId : null });
      return responder(502, { message: "O Asaas não respondeu. A tentativa está em conciliação segura." }, h);
    }

    // Passo 3: grava o id externo antes de qualquer outra coisa (duas tentativas). Se nao gravar, NAO cancela:
    // a linha continua "criando" sem id, bloqueando novas cobrancas; o webhook PAYMENT_CREATED (por externalReference)
    // ou o reconciliador vinculam o id. O id vai para o log para recuperacao manual.
    let idGravado = false;
    for (let tentativa = 0; tentativa < 2 && !idGravado; tentativa++) {
      const r = await deps.registrar(data.id, cobranca.id, null).catch(() => ({ error: true }));
      idGravado = !r.error;
    }
    if (!idGravado) {
      deps.log?.({ evento: "pay_id_externo_nao_persistido", pagamentoId: data.id, asaasPagamentoId: cobranca.id });
      return responder(502, { message: "Pagamento criado, aguardando conciliação segura." }, h);
    }

    // Passo 5: QR Code. Qualquer falha preserva a cobranca; repetir a chamada so recupera o QR.
    try {
      const qr = await asaas.obterPixQrCode(cobranca.id);
      const salvo = await deps.registrar(data.id, cobranca.id, { copiaECola: qr.copiaECola, expiraEm: qr.expiraEm }).catch(() => ({ error: true }));
      if (salvo.error) return responder(502, { ...resumo, status: "aguardando_pagamento", pix_ready: false, retry_same_request: true, message: "O Pix foi gerado, mas ainda não conseguimos salvá-lo. Tente de novo em instantes." }, h);
      return responder(200, { ...resumo, status: "aguardando_pagamento", replayed: false, pix_ready: true, pix: { copia_e_cola: qr.copiaECola, imagem_base64: qr.imagemBase64, expira_em: qr.expiraEm } }, h);
    } catch {
      return responder(502, { ...resumo, status: "aguardando_pagamento", pix_ready: false, retry_same_request: true, message: "Seu pagamento foi criado, mas o Pix ainda não está disponível. Tente de novo em instantes." }, h);
    }
  };
}
