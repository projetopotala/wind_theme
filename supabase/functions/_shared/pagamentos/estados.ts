// PAY-01: maquina de estados financeira dos pagamentos de atendimentos.
//
// O estado financeiro NAO e o estado do agendamento. A cobranca pendente nunca equivale a pagamento confirmado.
// Esta tabela e a unica fonte da regra no codigo; a funcao SQL public.pay_next_state() (migration 202611250002)
// espelha a mesma tabela e um teste de paridade compara os dois para todas as combinacoes.
//
// Equivalencia com os eventos do Asaas (https://docs.asaas.com/docs/webhook-para-cobrancas). A ordem de entrega
// NAO e garantida e a entrega e "at least once"; por isso a regra e por precedencia, nunca "ultimo evento vence".

export const ESTADOS = [
  "criando", // linha interna criada; cobranca ainda nao registrada no Asaas
  "aguardando_pagamento", // PENDING
  "em_processamento", // analise de risco / autorizacao (cartao)
  "confirmado", // CONFIRMED: pago, saldo ainda nao disponivel
  "recebido", // RECEIVED: saldo disponivel
  "vencido", // OVERDUE
  "cancelado", // DELETED, reprovado ou falha de criacao
  "estornado", // REFUNDED
  "em_contestacao", // chargeback
  "divergente", // exige reconciliacao manual
] as const;
export type EstadoPagamento = (typeof ESTADOS)[number];

export type Resultado = "aplicado" | "sem_mudanca" | "obsoleto" | "divergencia";

// Evento Asaas -> estado alvo. `null` = informativo (so registrado, nao muda o estado).
export const EVENTO_PARA_ESTADO: Readonly<Record<string, EstadoPagamento | null>> = {
  PAYMENT_CREATED: "aguardando_pagamento",
  PAYMENT_UPDATED: null,
  PAYMENT_AWAITING_RISK_ANALYSIS: "em_processamento",
  PAYMENT_APPROVED_BY_RISK_ANALYSIS: "em_processamento",
  PAYMENT_REPROVED_BY_RISK_ANALYSIS: "cancelado",
  PAYMENT_AUTHORIZED: "em_processamento",
  PAYMENT_CONFIRMED: "confirmado",
  PAYMENT_RECEIVED: "recebido",
  PAYMENT_CREDIT_CARD_CAPTURE_REFUSED: "cancelado",
  PAYMENT_ANTICIPATED: null,
  PAYMENT_OVERDUE: "vencido",
  PAYMENT_DELETED: "cancelado",
  PAYMENT_RESTORED: "aguardando_pagamento",
  PAYMENT_REFUNDED: "estornado",
  PAYMENT_PARTIALLY_REFUNDED: "divergente",
  PAYMENT_REFUND_IN_PROGRESS: null,
  PAYMENT_REFUND_DENIED: null,
  PAYMENT_RECEIVED_IN_CASH_UNDONE: "divergente",
  PAYMENT_CHARGEBACK_REQUESTED: "em_contestacao",
  PAYMENT_CHARGEBACK_DISPUTE: "em_contestacao",
  PAYMENT_AWAITING_CHARGEBACK_REVERSAL: "em_contestacao",
  PAYMENT_DUNNING_REQUESTED: null,
  PAYMENT_DUNNING_RECEIVED: null,
  PAYMENT_BANK_SLIP_CANCELLED: null,
  PAYMENT_BANK_SLIP_VIEWED: null,
  PAYMENT_CHECKOUT_VIEWED: null,
  PAYMENT_SPLIT_CANCELLED: null,
  PAYMENT_SPLIT_DIVERGENCE_BLOCK: null,
  PAYMENT_SPLIT_DIVERGENCE_BLOCK_FINISHED: null,
  PAYMENT_SPLIT_DONE: null,
};

// Status da cobranca no Asaas (GET /payments/{id}) -> estado interno (reconciliacao).
// Nomes de status a confirmar no Sandbox (a pagina oficial de status nao abriu durante a PAY-01).
export const STATUS_ASAAS_PARA_ESTADO: Readonly<Record<string, EstadoPagamento | null>> = {
  PENDING: "aguardando_pagamento",
  AWAITING_RISK_ANALYSIS: "em_processamento",
  CONFIRMED: "confirmado",
  RECEIVED: "recebido",
  RECEIVED_IN_CASH: "recebido",
  OVERDUE: "vencido",
  REFUNDED: "estornado",
  REFUND_REQUESTED: null,
  REFUND_IN_PROGRESS: null,
  CHARGEBACK_REQUESTED: "em_contestacao",
  CHARGEBACK_DISPUTE: "em_contestacao",
  AWAITING_CHARGEBACK_REVERSAL: "em_contestacao",
};

// Transicoes permitidas. O que ficar fora vira "obsoleto" ou "divergencia" (ver proximoEstado).
export const TRANSICOES: Readonly<Record<EstadoPagamento, readonly EstadoPagamento[]>> = {
  criando: ["aguardando_pagamento", "em_processamento", "confirmado", "recebido", "vencido", "cancelado"],
  aguardando_pagamento: ["em_processamento", "confirmado", "recebido", "vencido", "cancelado"],
  em_processamento: ["confirmado", "recebido", "cancelado", "vencido"],
  confirmado: ["recebido", "estornado", "em_contestacao"],
  recebido: ["estornado", "em_contestacao"],
  vencido: ["confirmado", "recebido", "cancelado"],
  cancelado: ["aguardando_pagamento"], // somente por PAYMENT_RESTORED
  estornado: [],
  em_contestacao: ["estornado"],
  divergente: [],
};

// Quanto maior, mais adiantado no ciclo. Alvo que nao esta adiante do atual e ignorado como obsoleto.
const PRECEDENCIA: Readonly<Record<EstadoPagamento, number>> = {
  criando: 0,
  aguardando_pagamento: 1,
  vencido: 2,
  em_processamento: 2,
  confirmado: 3,
  recebido: 4,
  em_contestacao: 5,
  estornado: 6,
  cancelado: 7,
  divergente: 8,
};

const EVIDENCIA_DE_PAGAMENTO: ReadonlySet<EstadoPagamento> = new Set<EstadoPagamento>(["confirmado", "recebido"]);

export function proximoEstado(atual: EstadoPagamento, alvo: EstadoPagamento | null): { resultado: Resultado; proximo: EstadoPagamento } {
  if (alvo === null || alvo === atual) return { resultado: "sem_mudanca", proximo: atual };
  if (atual === "divergente") return { resultado: "sem_mudanca", proximo: atual }; // so reconciliacao manual sai daqui
  if (alvo === "divergente") return { resultado: "divergencia", proximo: "divergente" };
  if (TRANSICOES[atual].includes(alvo)) return { resultado: "aplicado", proximo: alvo };
  // Dinheiro chegando numa cobranca cancelada nunca e "obsoleto": exige reconciliacao.
  if (atual === "cancelado" && EVIDENCIA_DE_PAGAMENTO.has(alvo)) return { resultado: "divergencia", proximo: "divergente" };
  if (PRECEDENCIA[alvo] <= PRECEDENCIA[atual]) return { resultado: "obsoleto", proximo: atual };
  // Salto impossivel para frente (ex.: cancelar um pagamento ja recebido): nao decidir sozinho.
  return { resultado: "divergencia", proximo: "divergente" };
}

export function aplicarEventoAsaas(atual: EstadoPagamento, evento: string): { resultado: Resultado; proximo: EstadoPagamento; conhecido: boolean } {
  if (!Object.hasOwn(EVENTO_PARA_ESTADO, evento)) return { resultado: "sem_mudanca", proximo: atual, conhecido: false };
  return { ...proximoEstado(atual, EVENTO_PARA_ESTADO[evento]), conhecido: true };
}

// Decisao de negocio PENDENTE para "confirmado": ate aprovacao, so "recebido" autoriza a confirmacao do atendimento.
// Espelhada em public.pay_state_clears_reservation().
export function estadoLiberaConfirmacao(estado: EstadoPagamento): boolean {
  return estado === "recebido";
}

export function ehTerminal(estado: EstadoPagamento): boolean {
  return TRANSICOES[estado].length === 0;
}
