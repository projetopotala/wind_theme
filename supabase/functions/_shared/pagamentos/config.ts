// PAY-01: configuracao explicita do Asaas. Producao fica BLOQUEADA no codigo ate decisao do Owner (PAY-03+).
//
// Variaveis (somente no backend / secrets das Edge Functions; nenhuma no frontend):
//   PAYMENTS_ENABLED          "true" liga a integracao; qualquer outro valor a desliga por completo.
//   ASAAS_ENV                 "sandbox" (unico aceito na PAY-01).
//   ASAAS_API_KEY             chave do ambiente escolhido (Sandbox). Nunca a chave de producao.
//   ASAAS_WEBHOOK_TOKEN       segredo do webhook (32 a 255 caracteres, enviado em asaas-access-token).
//   PAYMENT_HOLD_MINUTES      validade da reserva do horario sem pagamento (padrao 30; limites 5 a 1440).

export const ASAAS_URLS = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  producao: "https://api.asaas.com/v3",
} as const;

export type ConfigAsaas =
  | { ativo: false; motivo: "desligado" | "ambiente_invalido" | "producao_bloqueada" | "sem_chave" | "sem_webhook_token" }
  | { ativo: true; ambiente: "sandbox"; baseUrl: string; apiKey: string; webhookToken: string; holdMinutos: number };

type Env = (nome: string) => string | undefined;

export function lerConfigAsaas(env: Env): ConfigAsaas {
  if (env("PAYMENTS_ENABLED") !== "true") return { ativo: false, motivo: "desligado" };
  const ambiente = (env("ASAAS_ENV") ?? "").trim().toLowerCase();
  // Producao nao existe como caminho de codigo na PAY-01: liberar exige PR propria e decisao do Owner.
  if (ambiente === "producao" || ambiente === "production") return { ativo: false, motivo: "producao_bloqueada" };
  if (ambiente !== "sandbox") return { ativo: false, motivo: "ambiente_invalido" };
  const apiKey = (env("ASAAS_API_KEY") ?? "").trim();
  if (!apiKey) return { ativo: false, motivo: "sem_chave" };
  const webhookToken = env("ASAAS_WEBHOOK_TOKEN") ?? "";
  if (webhookToken.length < 32 || webhookToken.length > 255 || /\s/.test(webhookToken) || webhookToken === apiKey) {
    return { ativo: false, motivo: "sem_webhook_token" };
  }
  const bruto = Number(env("PAYMENT_HOLD_MINUTES") ?? "30");
  const holdMinutos = Number.isInteger(bruto) && bruto >= 5 && bruto <= 1440 ? bruto : 30;
  return { ativo: true, ambiente: "sandbox", baseUrl: ASAAS_URLS.sandbox, apiKey, webhookToken, holdMinutos };
}
