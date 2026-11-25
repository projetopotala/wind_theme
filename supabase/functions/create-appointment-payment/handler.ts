// PAY-01: cria a intencao de pagamento (Pix) de uma solicitacao de atendimento.
//
// - O navegador envia SOMENTE { request_id, idempotency_key }. O valor vem do banco (appointment_service_prices);
//   qualquer campo extra, inclusive "amount"/"valor", e rejeitado.
// - O usuario e identificado pelo JWT; o banco confere que a solicitacao e dele e que o horario ainda esta reservado.
// - Desligado por padrao (PAYMENTS_ENABLED) e restrito ao Sandbox (ver _shared/pagamentos/config.ts).
// - Falha de transporte/5xx e INCONCLUSIVA: a linha fica "criando" e a conciliacao usa o externalReference;
//   nunca se cria uma segunda cobranca as cegas.

import { lerConfigAsaas } from "../_shared/pagamentos/config.ts";
import { AsaasErro, criarClienteAsaas, type FetchLike } from "../_shared/pagamentos/asaas-client.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CORPO = 512;

export type Preparado = {
  id: string; status: "criando" | "aguardando_pagamento" | string; external_reference: string; amount_cents: number;
  service_title: string; hold_expires_at: string; due_date: string; provider_payment_id: string | null; replayed: boolean;
};
export type DadosCliente = { nome: string; email: string | null; cpfCnpj: string | null; asaasClienteId: string | null };
export type CriarPagamentoDeps = {
  env(nome: string): string | undefined;
  fetch: FetchLike;
  usuarioDoJwt(jwt: string): Promise<{ id: string } | null>;
  preparar(usuarioId: string, requestId: string, chave: string, holdMinutos: number): Promise<{ data?: Preparado | null; error?: { code?: string } | null }>;
  dadosCliente(usuarioId: string): Promise<DadosCliente | null>;
  salvarClienteAsaas(usuarioId: string, asaasClienteId: string): Promise<void>;
  registrar(pagamentoId: string, asaasPagamentoId: string, qr: { copiaECola: string; expiraEm: string }): Promise<{ error?: unknown }>;
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
    try {
      const corpo = JSON.parse(texto);
      if (!corpo || Array.isArray(corpo) || Object.keys(corpo).sort().join(",") !== "idempotency_key,request_id"
        || !UUID.test(corpo.request_id) || !UUID.test(corpo.idempotency_key)) throw new Error("invalido");
      requestId = corpo.request_id.toLowerCase(); chave = corpo.idempotency_key.toLowerCase();
    } catch { return responder(400, { message: "Pedido inválido." }, h); }

    const usuario = await deps.usuarioDoJwt(jwt).catch(() => null);
    if (!usuario) return responder(401, { message: "Entre na sua conta." }, h);

    const { data, error } = await deps.preparar(usuario.id, requestId, chave, config.holdMinutos).catch(() => ({ data: null, error: { code: "indisponivel" } }));
    if (error || !data) {
      const c = error?.code ?? "";
      return responder(c === "42501" ? 403 : c === "P0002" ? 404 : c === "22023" || c === "PT409" ? 409 : c === "PT422" ? 422 : 502,
        { message: c === "42501" ? "Acesso negado." : c === "PT422" ? "Este atendimento ainda não tem valor definido para pagamento online." : "Não foi possível preparar o pagamento." }, h);
    }
    const resumo = { payment_id: data.id, amount_cents: data.amount_cents, currency: "BRL", service: data.service_title, hold_expires_at: data.hold_expires_at };
    if (data.status !== "criando") return responder(200, { ...resumo, status: data.status, replayed: true }, h); // QR por GET autenticado (RLS) na PAY-02
    if (data.replayed) return responder(409, { message: "A criação anterior está em conciliação. Aguarde antes de tentar novamente." }, h);

    const asaas = criarClienteAsaas({ baseUrl: config.baseUrl, apiKey: config.apiKey, fetch: deps.fetch, log: deps.log });
    const cliente = await deps.dadosCliente(usuario.id).catch(() => null);
    if (!cliente) return responder(502, { message: "Não foi possível preparar o pagamento." }, h);
    if (!cliente.asaasClienteId && !cliente.cpfCnpj) {
      await deps.falhar(data.id, "cliente_sem_documento").catch(() => undefined);
      return responder(422, { message: "Precisamos do CPF para gerar o Pix. Complete seu cadastro e tente de novo." }, h);
    }
    try {
      let clienteId = cliente.asaasClienteId;
      if (!clienteId) {
        clienteId = (await asaas.criarCliente({ nome: cliente.nome, cpfCnpj: cliente.cpfCnpj as string, email: cliente.email ?? undefined, referenciaExterna: `user:${usuario.id}` })).id;
        await deps.salvarClienteAsaas(usuario.id, clienteId);
      }
      const cobranca = await asaas.criarCobrancaPix({ clienteId, valorCentavos: data.amount_cents, vencimento: data.due_date, referenciaExterna: data.external_reference, descricao: `Atendimento - ${data.service_title}` });
      const qr = await asaas.obterPixQrCode(cobranca.id);
      const salvo = await deps.registrar(data.id, cobranca.id, { copiaECola: qr.copiaECola, expiraEm: qr.expiraEm }).catch(() => ({ error: true }));
      if (salvo.error) return responder(502, { message: "Pagamento criado, aguardando conciliação segura." }, h);
      return responder(200, { ...resumo, status: "aguardando_pagamento", replayed: false, pix: { copia_e_cola: qr.copiaECola, imagem_base64: qr.imagemBase64, expira_em: qr.expiraEm } }, h);
    } catch (e) {
      if (e instanceof AsaasErro && e.tipo === "rejeitado") {
        await deps.falhar(data.id, `asaas_http_${e.status}`).catch(() => undefined);
        return responder(502, { message: "Não foi possível criar o pagamento." }, h);
      }
      return responder(502, { message: "O Asaas não respondeu. A tentativa está em conciliação segura." }, h);
    }
  };
}
