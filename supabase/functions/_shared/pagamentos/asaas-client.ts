// PAY-01: cliente HTTP exclusivo do Asaas. Recebe `fetch` por injecao (testes usam mock; nunca rede real aqui).
// A chave vai somente no header `access_token`; nunca em URL, corpo, log ou mensagem de erro.
// Campos exatos de /customers e /payments devem ser conferidos no Sandbox (pendencia registrada em docs/pay-01).

import { ASAAS_URLS } from "./config.ts";

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export class AsaasErro extends Error {
  // "rejeitado" = 4xx conclusivo (nada foi criado). "inconclusivo" = timeout/5xx/resposta ruim: a cobranca pode
  // existir no Asaas e deve ser reconciliada pelo externalReference, nunca recriada as cegas.
  tipo: "rejeitado" | "inconclusivo";
  status: number | null;
  correlationId: string;
  constructor(tipo: "rejeitado" | "inconclusivo", status: number | null, correlationId: string) {
    super(`asaas_${tipo}${status ? `_${status}` : ""}`);
    this.tipo = tipo; this.status = status; this.correlationId = correlationId;
  }
}

export type NovoClienteAsaas = { nome: string; cpfCnpj: string; email?: string; referenciaExterna: string };
export type NovaCobrancaPix = { clienteId: string; valorCentavos: number; vencimento: string; referenciaExterna: string; descricao: string };
export type CobrancaAsaas = { id: string; status: string; valorCentavos: number; referenciaExterna: string | null; vencimento: string | null };
export type PixQrCode = { imagemBase64: string; copiaECola: string; expiraEm: string };

const REAL = (c: number) => Math.round(c) / 100;
const centavos = (reais: unknown) => (typeof reais === "number" && Number.isFinite(reais) ? Math.round(reais * 100) : NaN);
const texto = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);

export function criarClienteAsaas(opcoes: { baseUrl: string; apiKey: string; fetch: FetchLike; timeoutMs?: number; novoId?: () => string; log?: (linha: Record<string, unknown>) => void }) {
  if (opcoes.baseUrl === ASAAS_URLS.producao) throw new Error("producao_bloqueada_na_pay_01");
  if (opcoes.baseUrl !== ASAAS_URLS.sandbox) throw new Error("url_asaas_invalida");
  const timeoutMs = opcoes.timeoutMs ?? 12000;
  const novoId = opcoes.novoId ?? (() => crypto.randomUUID());

  async function chamar(metodo: "GET" | "POST", caminho: string, corpo?: unknown): Promise<Record<string, unknown>> {
    const correlationId = novoId();
    let resposta: Response;
    try {
      resposta = await opcoes.fetch(`${opcoes.baseUrl}${caminho}`, {
        method: metodo,
        signal: AbortSignal.timeout(timeoutMs),
        headers: { access_token: opcoes.apiKey, "Content-Type": "application/json", "User-Agent": "Instituto-Potala-Portal/1.0", "X-Correlation-Id": correlationId },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      });
    } catch {
      opcoes.log?.({ evento: "asaas_transporte_falhou", metodo, caminho: caminho.replace(/\/[^/]+$/, "/:id"), correlationId });
      throw new AsaasErro("inconclusivo", null, correlationId);
    }
    opcoes.log?.({ evento: "asaas_resposta", metodo, caminho: caminho.replace(/\/[^/]+$/, "/:id"), status: resposta.status, correlationId });
    if (resposta.status >= 400 && resposta.status < 500) throw new AsaasErro("rejeitado", resposta.status, correlationId);
    if (!resposta.ok) throw new AsaasErro("inconclusivo", resposta.status, correlationId);
    const json = await resposta.json().catch(() => null);
    if (!json || typeof json !== "object" || Array.isArray(json)) throw new AsaasErro("inconclusivo", resposta.status, correlationId);
    return json as Record<string, unknown>;
  }

  function lerCobranca(j: Record<string, unknown>, correlationId = ""): CobrancaAsaas {
    const id = texto(j.id);
    const valor = centavos(j.value);
    const status = texto(j.status);
    if (!id || !status || !Number.isInteger(valor) || valor <= 0) throw new AsaasErro("inconclusivo", 200, correlationId);
    return { id, status, valorCentavos: valor, referenciaExterna: texto(j.externalReference), vencimento: texto(j.dueDate) };
  }

  return {
    async criarCliente(c: NovoClienteAsaas): Promise<{ id: string }> {
      const j = await chamar("POST", "/customers", { name: c.nome, cpfCnpj: c.cpfCnpj, email: c.email, externalReference: c.referenciaExterna, notificationDisabled: true });
      const id = texto(j.id);
      if (!id) throw new AsaasErro("inconclusivo", 200, "");
      return { id };
    },
    async criarCobrancaPix(c: NovaCobrancaPix): Promise<CobrancaAsaas> {
      if (!Number.isInteger(c.valorCentavos) || c.valorCentavos <= 0) throw new Error("valor_invalido");
      const j = await chamar("POST", "/payments", {
        customer: c.clienteId, billingType: "PIX", value: REAL(c.valorCentavos), dueDate: c.vencimento,
        externalReference: c.referenciaExterna, description: c.descricao,
      });
      const cobranca = lerCobranca(j);
      if (cobranca.valorCentavos !== c.valorCentavos || cobranca.referenciaExterna !== c.referenciaExterna) throw new AsaasErro("inconclusivo", 200, "");
      return cobranca;
    },
    async obterCobranca(id: string): Promise<CobrancaAsaas> {
      return lerCobranca(await chamar("GET", `/payments/${encodeURIComponent(id)}`));
    },
    async obterPixQrCode(id: string): Promise<PixQrCode> {
      const j = await chamar("GET", `/payments/${encodeURIComponent(id)}/pixQrCode`);
      const imagemBase64 = texto(j.encodedImage); const copiaECola = texto(j.payload); const expiraEm = texto(j.expirationDate);
      if (!imagemBase64 || !copiaECola || !expiraEm) throw new AsaasErro("inconclusivo", 200, "");
      return { imagemBase64, copiaECola, expiraEm };
    },
  };
}
