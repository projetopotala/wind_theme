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
export type CobrancaAsaas = { id: string; status: string; valorCentavos: number; referenciaExterna: string | null; vencimento: string | null; removida?: boolean };
export type PixQrCode = { imagemBase64: string; copiaECola: string; expiraEm: string };

const REAL = (c: number) => Math.round(c) / 100;
const centavos = (reais: unknown) => (typeof reais === "number" && Number.isFinite(reais) ? Math.round(reais * 100) : NaN);
const texto = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);

export function criarClienteAsaas(opcoes: { baseUrl: string; apiKey: string; fetch: FetchLike; timeoutMs?: number; novoId?: () => string; log?: (linha: Record<string, unknown>) => void; permitirProducao?: boolean }) {
  // PAY-02: a URL de producao so e aceita com permissao explicita, que apenas a config de producao (3 travas) concede.
  if (opcoes.baseUrl === ASAAS_URLS.producao && opcoes.permitirProducao !== true) throw new Error("producao_bloqueada_na_pay_01");
  if (opcoes.baseUrl !== ASAAS_URLS.sandbox && opcoes.baseUrl !== ASAAS_URLS.producao) throw new Error("url_asaas_invalida");
  const timeoutMs = opcoes.timeoutMs ?? 12000;
  const novoId = opcoes.novoId ?? (() => crypto.randomUUID());

  async function chamar(metodo: "GET" | "POST" | "DELETE", caminho: string, corpo?: unknown): Promise<Record<string, unknown>> {
    const correlationId = novoId();
    // O log nunca leva query string (pode conter referencia externa) nem o id: so o formato do caminho.
    const caminhoLog = caminho.split("?")[0].replace(/\/[^/]+$/, "/:id");
    let resposta: Response;
    try {
      resposta = await opcoes.fetch(`${opcoes.baseUrl}${caminho}`, {
        method: metodo,
        signal: AbortSignal.timeout(timeoutMs),
        headers: { access_token: opcoes.apiKey, "Content-Type": "application/json", "User-Agent": "Instituto-Potala-Portal/1.0", "X-Correlation-Id": correlationId },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      });
    } catch {
      opcoes.log?.({ evento: "asaas_transporte_falhou", metodo, caminho: caminhoLog, correlationId });
      throw new AsaasErro("inconclusivo", null, correlationId);
    }
    opcoes.log?.({ evento: "asaas_resposta", metodo, caminho: caminhoLog, status: resposta.status, correlationId });
    // 408 (tempo esgotado) nao prova que nada foi criado: e inconclusivo, como timeout e 5xx.
    if (resposta.status >= 400 && resposta.status < 500 && resposta.status !== 408) throw new AsaasErro("rejeitado", resposta.status, correlationId);
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
    return { id, status, valorCentavos: valor, referenciaExterna: texto(j.externalReference), vencimento: texto(j.dueDate), removida: j.deleted === true };
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
    // PAY-02: busca de cliente pela referencia externa gravada na criacao (evita cliente duplicado apos timeout).
    async listarClientesPorReferencia(ref: string): Promise<string[]> {
      const j = await chamar("GET", `/customers?externalReference=${encodeURIComponent(ref)}&limit=10`);
      if (!Array.isArray(j.data)) throw new AsaasErro("inconclusivo", 200, "");
      return (j.data as Array<Record<string, unknown>>).map((c) => texto(c.id)).filter((x): x is string => x !== null);
    },
    // PAY-02: recuperacao de cobranca pelo externalReference (cobranca criada sem id interno persistido).
    async listarCobrancasPorReferencia(ref: string): Promise<CobrancaAsaas[]> {
      const j = await chamar("GET", `/payments?externalReference=${encodeURIComponent(ref)}&limit=10`);
      if (!Array.isArray(j.data)) throw new AsaasErro("inconclusivo", 200, "");
      return (j.data as Array<Record<string, unknown>>).map((c) => lerCobranca(c));
    },
    // PAY-02: varredura recente para achar cobrancas orfas (existem no Asaas e nao no banco).
    async listarCobrancasDesde(dataISO: string, offset = 0): Promise<{ itens: Array<{ id: string; ref: string | null }>; temMais: boolean }> {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dataISO) || !Number.isInteger(offset) || offset < 0) throw new Error("parametro_invalido");
      const j = await chamar("GET", `/payments?dateCreated%5Bge%5D=${dataISO}&limit=100&offset=${offset}`);
      if (!Array.isArray(j.data)) throw new AsaasErro("inconclusivo", 200, "");
      const itens = (j.data as Array<Record<string, unknown>>).map((c) => ({ id: texto(c.id), ref: texto(c.externalReference) })).filter((c): c is { id: string; ref: string | null } => c.id !== null);
      return { itens, temMais: j.hasMore === true };
    },
    // PAY-02: cancela a cobranca no Asaas (so usado ao expirar a reserva). Sucesso = Asaas confirmou a exclusao.
    async cancelarCobranca(id: string): Promise<void> {
      const j = await chamar("DELETE", `/payments/${encodeURIComponent(id)}`);
      if (j.deleted !== true) throw new AsaasErro("inconclusivo", 200, "");
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
