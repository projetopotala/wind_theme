// PAY-02: reconciliador de pagamentos de atendimentos. Roda por agendamento (a cada poucos minutos), NUNCA pelo navegador.
//
// Garantias de projeto:
//   * NUNCA cria cobranca. Nenhum caminho deste arquivo chama criarCobrancaPix.
//   * NUNCA cancela uma cobranca interna por "nao encontrei no Asaas": ausencia nao e prova de que nao foi criada
//     (consistencia eventual, timeout do GET). O caso vira pendencia de revisao manual do Owner e segue BLOQUEANDO.
//   * Cobranca existente so e cancelada no Asaas quando a reserva expirou sem pagamento, e o horario so e liberado
//     depois que o Asaas confirma o cancelamento (ou que o banco ja tem a cobranca como cancelada).
//   * Eventos perdidos sao recuperados pelo status real da cobranca, passando pela MESMA funcao do webhook
//     (pay_apply_webhook_event), com id de evento deterministico "recon:<cobranca>:<status>" (idempotente).
// Autenticacao: segredo proprio em `x-reconcile-token` (PAYMENTS_RECONCILE_TOKEN), diferente da API Key e do token do webhook.

import { lerConfigAsaas } from "../_shared/pagamentos/config.ts";
import { AsaasErro, criarClienteAsaas, type CobrancaAsaas, type FetchLike } from "../_shared/pagamentos/asaas-client.ts";
import { STATUS_ASAAS_PARA_ESTADO, type EstadoPagamento } from "../_shared/pagamentos/estados.ts";

export type LinhaConferir = { payment_id: string; provider_payment_id: string | null; external_reference: string; status: string; amount_cents: number; pix_ready: boolean; motivo: "sem_id" | "sem_qr" | "conferir" };
export type Expirado = { payment_id: string; request_id: string; status: string; provider_payment_id: string | null; amount_cents: number; external_reference: string };
export type EventoRecon = { eventId: string; evento: string; provedorId: string; referenciaExterna: string | null; valorCentavos: number; statusAsaas: string };
export type TipoRevisao =
  | "sem_id_no_provedor" | "multiplas_no_provedor" | "orfa_no_provedor" | "divergencia_financeira" | "hold_expirado_sem_id" | "falha_cancelamento_hold" | "liberacao_bloqueada";

export type ReconciliadorDeps = {
  env(nome: string): string | undefined;
  fetch: FetchLike;
  agora(): Date;
  listarConferir(idadeMinMinutos: number): Promise<LinhaConferir[]>;
  listarExpirados(): Promise<Expirado[]>;
  registrarId(pagamentoId: string, asaasId: string, qr: { copiaECola: string; expiraEm: string } | null): Promise<{ error?: unknown }>;
  aplicarEvento(e: EventoRecon): Promise<{ resultado?: string; error?: unknown }>;
  abrirRevisao(pagamentoId: string | null, asaasId: string | null, tipo: TipoRevisao, detalhe: Record<string, unknown>): Promise<void>;
  liberarReserva(pagamentoId: string): Promise<string>;
  desconhecidas(itens: Array<{ id: string; ref: string | null }>): Promise<Array<{ id: string; ref: string | null }>>;
  log?(linha: Record<string, unknown>): void;
};

const MAX_POR_EXECUCAO = 50;
const PAGINAS_ORFAS = 5;
const PREFIXO_REFERENCIA = "appointment:";

// estado interno -> evento equivalente do Asaas (o mesmo que o webhook aplicaria).
const EVENTO_DO_ESTADO: Partial<Record<EstadoPagamento, string>> = {
  aguardando_pagamento: "PAYMENT_CREATED", em_processamento: "PAYMENT_AUTHORIZED", confirmado: "PAYMENT_CONFIRMED", recebido: "PAYMENT_RECEIVED",
  vencido: "PAYMENT_OVERDUE", estornado: "PAYMENT_REFUNDED", em_contestacao: "PAYMENT_CHARGEBACK_REQUESTED",
};

function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const responder = (status: number, corpo: Record<string, unknown>) => Response.json(corpo, { status, headers: { "Cache-Control": "no-store" } });

export function criarReconciliadorHandler(deps: ReconciliadorDeps) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return responder(405, { message: "Método não permitido." });
    const config = lerConfigAsaas(deps.env);
    const segredo = deps.env("PAYMENTS_RECONCILE_TOKEN") ?? "";
    // Falha fechada: sem integracao ativa ou sem segredo proprio valido, nada roda.
    if (!config.ativo || segredo.length < 32 || /\s/.test(segredo) || segredo === config.apiKey || segredo === config.webhookToken) {
      return responder(503, { message: "Indisponível." });
    }
    const recebido = request.headers.get("x-reconcile-token") ?? "";
    if (!iguais(recebido, segredo)) return responder(401, { message: "Não autorizado." });

    const asaas = criarClienteAsaas({ baseUrl: config.baseUrl, apiKey: config.apiKey, fetch: deps.fetch, log: deps.log, permitirProducao: config.ambiente === "production" });
    const n = { asaas_autenticado: false, vinculadas: 0, qr_recuperados: 0, eventos_aplicados: 0, revisoes_abertas: 0, canceladas_no_asaas: 0, reservas_liberadas: 0, erros: 0, orfas: 0 };
    const revisar = async (pagId: string | null, asaasId: string | null, tipo: TipoRevisao, detalhe: Record<string, unknown>) => {
      await deps.abrirRevisao(pagId, asaasId, tipo, detalhe).then(() => { n.revisoes_abertas++; }).catch(() => { n.erros++; });
    };
    const aplicar = async (pag: { payment_id: string; external_reference: string }, c: CobrancaAsaas, evento: string) => {
      const r = await deps.aplicarEvento({ eventId: `recon:${c.id}:${c.removida ? "DELETED" : c.status}`.slice(0, 120), evento, provedorId: c.id, referenciaExterna: pag.external_reference, valorCentavos: c.valorCentavos, statusAsaas: c.status }).catch(() => ({ error: true, resultado: undefined }));
      if (r.error) { n.erros++; return null; }
      if (r.resultado && r.resultado !== "duplicado" && r.resultado !== "sem_mudanca") n.eventos_aplicados++;
      return r.resultado ?? null;
    };

    // A) Cobrancas sem id, sem QR ou paradas: recupera pelo identificador externo; nunca cria.
    const linhas = (await deps.listarConferir(10).catch(() => { n.erros++; return [] as LinhaConferir[]; })).slice(0, MAX_POR_EXECUCAO);
    for (const l of linhas) {
      try {
        if (l.motivo === "sem_id") {
          const achadas = await asaas.listarCobrancasPorReferencia(l.external_reference);
          if (achadas.length === 0) { await revisar(l.payment_id, null, "sem_id_no_provedor", { acao: "nenhuma_cobranca_encontrada_nao_cancelar" }); continue; }
          if (achadas.length > 1) { await revisar(l.payment_id, null, "multiplas_no_provedor", { quantidade: achadas.length }); continue; }
          const c = achadas[0];
          if (c.valorCentavos !== l.amount_cents || c.referenciaExterna !== l.external_reference) { await revisar(l.payment_id, c.id, "divergencia_financeira", { campo: "valor_ou_referencia" }); continue; }
          const reg = await deps.registrarId(l.payment_id, c.id, null);
          if (reg.error) { n.erros++; continue; }
          n.vinculadas++;
          l.provider_payment_id = c.id; l.pix_ready = false; l.motivo = "sem_qr";
        }
        if (l.motivo === "sem_qr" && l.provider_payment_id) {
          const qr = await asaas.obterPixQrCode(l.provider_payment_id);
          const reg = await deps.registrarId(l.payment_id, l.provider_payment_id, { copiaECola: qr.copiaECola, expiraEm: qr.expiraEm });
          if (reg.error) n.erros++; else n.qr_recuperados++;
          continue;
        }
        if (l.motivo === "conferir" && l.provider_payment_id) {
          const c = await asaas.obterCobranca(l.provider_payment_id);
          if (c.valorCentavos !== l.amount_cents) await revisar(l.payment_id, c.id, "divergencia_financeira", { campo: "valor" });
          if (c.removida) { if (l.status !== "cancelado") await aplicar(l, c, "PAYMENT_DELETED"); continue; }
          if (c.status === "REFUND_REQUESTED" || c.status === "REFUND_IN_PROGRESS") { await aplicar(l, c, "PAYMENT_REFUND_IN_PROGRESS"); continue; }
          const estado = STATUS_ASAAS_PARA_ESTADO[c.status];
          if (!estado) { deps.log?.({ evento: "recon_status_desconhecido", status: c.status }); continue; }
          const evento = EVENTO_DO_ESTADO[estado];
          if (estado !== l.status && evento) await aplicar(l, c, evento);
        }
      } catch (e) {
        n.erros++;
        deps.log?.({ evento: "recon_item_falhou", pagamentoId: l.payment_id, tipo: e instanceof AsaasErro ? e.tipo : "erro" });
      }
    }

    // B) Reservas vencidas e nao pagas: cancela a cobranca viva no Asaas, so entao libera o horario.
    const expirados = (await deps.listarExpirados().catch(() => { n.erros++; return [] as Expirado[]; })).slice(0, MAX_POR_EXECUCAO);
    for (const x of expirados) {
      try {
        if (x.status !== "cancelado") {
          if (!x.provider_payment_id) { await revisar(x.payment_id, null, "hold_expirado_sem_id", { acao: "horario_mantido_ate_revisao" }); continue; }
          try {
            await asaas.cancelarCobranca(x.provider_payment_id);
            n.canceladas_no_asaas++;
            const c = await asaas.obterCobranca(x.provider_payment_id).catch(() => null);
            await aplicar({ payment_id: x.payment_id, external_reference: x.external_reference }, c ?? { id: x.provider_payment_id, status: "DELETED", valorCentavos: x.amount_cents, referenciaExterna: x.external_reference, vencimento: null, removida: true }, "PAYMENT_DELETED");
          } catch (e) {
            // Exclusao recusada: a cobranca pode ja ter sido paga. Confere o status real; NUNCA libera o horario.
            const c = await asaas.obterCobranca(x.provider_payment_id).catch(() => null);
            const estado = c ? STATUS_ASAAS_PARA_ESTADO[c.status] : null;
            const evento = estado ? EVENTO_DO_ESTADO[estado] : undefined;
            if (c && evento && estado !== x.status) await aplicar({ payment_id: x.payment_id, external_reference: x.external_reference }, c, evento);
            await revisar(x.payment_id, x.provider_payment_id, "falha_cancelamento_hold", { tipo: e instanceof AsaasErro ? e.tipo : "erro", status_asaas: c?.status ?? null });
            continue;
          }
        }
        const r = await deps.liberarReserva(x.payment_id);
        if (r === "liberada") n.reservas_liberadas++;
        else if (r === "outra_cobranca_aberta" || r === "solicitacao_ja_tratada") deps.log?.({ evento: "recon_liberacao_nao_necessaria", motivo: r });
        else await revisar(x.payment_id, x.provider_payment_id, "liberacao_bloqueada", { motivo: r });
      } catch { n.erros++; }
    }

    // C) Cobrancas orfas: existem no Asaas com a nossa referencia e o banco nao as conhece. So registra; nao mexe.
    try {
      const desde = new Date(deps.agora().getTime() - 2 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      let offset = 0; const vistas: Array<{ id: string; ref: string | null }> = [];
      for (let p = 0; p < PAGINAS_ORFAS; p++) {
        const pagina = await asaas.listarCobrancasDesde(desde, offset);
        // Esta flag só existe depois de uma resposta 200 autenticada e estruturalmente
        // válida do Asaas. `erros: 0`, sozinho, não comprova conectividade.
        n.asaas_autenticado = true;
        vistas.push(...pagina.itens.filter((i) => i.ref?.startsWith(PREFIXO_REFERENCIA)));
        if (!pagina.temMais) break;
        offset += 100;
      }
      if (vistas.length > 0) {
        for (const o of await deps.desconhecidas(vistas)) { n.orfas++; await revisar(null, o.id, "orfa_no_provedor", { referencia_conhecida: Boolean(o.ref) }); }
      }
    } catch { n.erros++; }

    return responder(200, { ok: true, ambiente: config.ambiente, ...n });
  };
}
