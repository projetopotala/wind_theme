// PAY-01: recebimento seguro de eventos do Asaas. O navegador NUNCA confirma pagamento; so este caminho (autenticado
// por segredo, idempotente por id de evento, transacional no banco) altera o estado financeiro.
//
// Politica de resposta (o Asaas pausa a fila apos 15 falhas consecutivas):
//   401 token ausente/errado        -> nada e lido nem gravado
//   400/413 corpo invalido/grande   -> rejeitado sem gravar
//   200 evento gravado (aplicado, duplicado, obsoleto, sem cobranca correspondente, divergente)
//   503 falha do banco/integracao desligada -> o Asaas reenvia (at least once)

import { lerConfigAsaas } from "./config.ts";

export const MAX_CORPO = 128 * 1024;

export type EventoNormalizado = {
  eventId: string; evento: string; dataCriacao: string | null;
  pagamentoId: string; referenciaExterna: string | null; valorCentavos: number | null; valorOriginalCentavos: number | null;
  statusAsaas: string | null; metodo: string | null;
};
export type ResultadoRegistro = { resultado: "aplicado" | "duplicado" | "sem_mudanca" | "obsoleto" | "divergencia" | "sem_correspondencia" };
export type WebhookDeps = {
  env(nome: string): string | undefined;
  registrar(evento: EventoNormalizado): Promise<{ data?: ResultadoRegistro | null; error?: unknown }>;
  log?(linha: Record<string, unknown>): void;
};

function iguais(a: string, b: string) {
  const enc = new TextEncoder(); const x = enc.encode(a); const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length, 1);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
const reais = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v * 100) : null);
const str = (v: unknown, max: number) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);

export function normalizarEvento(bruto: unknown): EventoNormalizado | null {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return null;
  const e = bruto as Record<string, unknown>;
  const p = e.payment;
  if (!p || typeof p !== "object" || Array.isArray(p)) return null;
  const pg = p as Record<string, unknown>;
  const eventId = str(e.id, 120); const evento = str(e.event, 80); const pagamentoId = str(pg.id, 120);
  if (!eventId || !evento || !pagamentoId || !/^[A-Z_]+$/.test(evento)) return null;
  return {
    eventId, evento, dataCriacao: str(e.dateCreated, 40), pagamentoId,
    referenciaExterna: str(pg.externalReference, 200), valorCentavos: reais(pg.value), valorOriginalCentavos: reais(pg.originalValue),
    statusAsaas: str(pg.status, 60), metodo: str(pg.billingType, 40),
  };
}

// Envelope valido ({ id, event }) cuja familia NAO e de cobrancas (event nao comeca por PAYMENT_).
export function eventoDeOutraFamilia(bruto: unknown): { eventId: string; evento: string } | null {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return null;
  const e = bruto as Record<string, unknown>;
  const eventId = str(e.id, 120); const evento = str(e.event, 80);
  if (!eventId || !evento || !/^[A-Z][A-Z0-9_]*$/.test(evento) || evento.startsWith("PAYMENT_")) return null;
  return { eventId, evento };
}

export function criarWebhookHandler(deps: WebhookDeps) {
  return async (request: Request): Promise<Response> => {
    const corpo = { "Cache-Control": "no-store" };
    if (request.method !== "POST") return Response.json({ received: false }, { status: 405, headers: corpo });
    const config = lerConfigAsaas(deps.env);
    if (!config.ativo) return Response.json({ received: false }, { status: 503, headers: { ...corpo, "Retry-After": "300" } });
    const enviado = request.headers.get("asaas-access-token") ?? "";
    if (enviado.length === 0 || enviado.length > 255 || !iguais(config.webhookToken, enviado)) return Response.json({ received: false }, { status: 401, headers: corpo });
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return Response.json({ received: false }, { status: 400, headers: corpo });
    const texto = await request.text();
    if (texto.length > MAX_CORPO) return Response.json({ received: false }, { status: 413, headers: corpo });
    let json: unknown = null;
    try { json = JSON.parse(texto); } catch { json = null; }
    const evento = normalizarEvento(json);
    if (!evento) {
      // R8: evento VALIDO e autenticado de outra familia (transferencia, assinatura, nota...) nao e falha de entrega:
      // responde 200 e registra so nome e id no log (nunca o corpo). Malformado continua 400; PAYMENT_* sem `payment` tambem.
      const outro = eventoDeOutraFamilia(json);
      if (outro) {
        deps.log?.({ evento: "webhook_ignorado", tipo: outro.evento, eventId: outro.eventId });
        return Response.json({ received: true, resultado: "ignorado" }, { status: 200, headers: corpo });
      }
      return Response.json({ received: false }, { status: 400, headers: corpo });
    }
    const registro = await deps.registrar(evento).catch(() => ({ error: true }) as { data?: null; error?: unknown });
    if (registro.error || !registro.data) return Response.json({ received: false }, { status: 503, headers: { ...corpo, "Retry-After": "30" } });
    // Referencia NOSSA sem cobranca no banco = possivel orfa (a conta e compartilhada; o resto e de outros usos e fica quieto).
    // So ids no log, nunca o corpo; o reconciliador abre a revisao.
    if (registro.data.resultado === "sem_correspondencia" && evento.referenciaExterna?.startsWith("appointment:")) {
      deps.log?.({ evento: "webhook_possivel_orfa", tipo: evento.evento, eventId: evento.eventId, pagamentoId: evento.pagamentoId });
    }
    return Response.json({ received: true, resultado: registro.data.resultado }, { status: 200, headers: corpo });
  };
}
