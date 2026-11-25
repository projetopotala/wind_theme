// PAY-01/PAY-02: configuracao explicita do Asaas. Producao so liga com TRES travas independentes:
//   1) PAYMENTS_ENABLED=true (secret das Edge Functions);
//   2) PAYMENTS_PRODUCTION_ACK="cobrancas-reais-autorizadas" (secret separado: confirma que o Owner autorizou dinheiro real);
//   3) public.pay_runtime_settings.charges_enabled = true no banco (nasce DESLIGADA; ver migration 202611250003).
// A terceira trava e verificada pelo banco a cada nova cobranca; nenhum deploy do Portal a liga.
//
// Variaveis (somente no backend / secrets das Edge Functions; nenhuma no frontend):
//   PAYMENTS_ENABLED          "true" liga a integracao; qualquer outro valor a desliga por completo.
//   ASAAS_ENV                 "sandbox" ou "production" ("producao" e aceito como sinonimo).
//   PAYMENTS_PRODUCTION_ACK   exigido SOMENTE em production; deve ser exatamente "cobrancas-reais-autorizadas".
//   ASAAS_API_KEY             chave do ambiente escolhido. Nunca em frontend, commit, log ou mensagem.
//   ASAAS_WEBHOOK_TOKEN       segredo do webhook (32 a 255 caracteres, sem espacos, diferente da API Key).
//   PAYMENT_HOLD_MINUTES      validade da reserva do horario sem pagamento (padrao 30; limites 5 a 1440).

export const ASAAS_URLS = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  producao: "https://api.asaas.com/v3",
} as const;

export const CONFIRMACAO_PRODUCAO = "cobrancas-reais-autorizadas";

export type MotivoDesligado =
  | "desligado" | "ambiente_invalido" | "producao_bloqueada" | "sem_chave" | "sem_webhook_token" | "chave_incompativel";

export type ConfigAsaas =
  | { ativo: false; motivo: MotivoDesligado }
  | { ativo: true; ambiente: "sandbox" | "production"; baseUrl: string; apiKey: string; webhookToken: string; holdMinutos: number };

type Env = (nome: string) => string | undefined;

export function lerConfigAsaas(env: Env): ConfigAsaas {
  if (env("PAYMENTS_ENABLED") !== "true") return { ativo: false, motivo: "desligado" };
  const bruto = (env("ASAAS_ENV") ?? "").trim().toLowerCase();
  const producao = bruto === "production" || bruto === "producao";
  if (!producao && bruto !== "sandbox") return { ativo: false, motivo: "ambiente_invalido" };
  // Producao exige confirmacao explicita e separada; sem ela a integracao fica desligada (falha fechada).
  if (producao && env("PAYMENTS_PRODUCTION_ACK") !== CONFIRMACAO_PRODUCAO) return { ativo: false, motivo: "producao_bloqueada" };
  const apiKey = (env("ASAAS_API_KEY") ?? "").trim();
  if (!apiKey) return { ativo: false, motivo: "sem_chave" };
  // Impede o erro caro: chave de um ambiente apontando para o outro (marcadores publicos do formato das chaves do Asaas).
  if (producao && /_hmlg_/i.test(apiKey)) return { ativo: false, motivo: "chave_incompativel" };
  if (!producao && /_prod_/i.test(apiKey)) return { ativo: false, motivo: "chave_incompativel" };
  const webhookToken = env("ASAAS_WEBHOOK_TOKEN") ?? "";
  if (webhookToken.length < 32 || webhookToken.length > 255 || /\s/.test(webhookToken) || webhookToken === apiKey) {
    return { ativo: false, motivo: "sem_webhook_token" };
  }
  const minutos = Number(env("PAYMENT_HOLD_MINUTES") ?? "30");
  const holdMinutos = Number.isInteger(minutos) && minutos >= 5 && minutos <= 1440 ? minutos : 30;
  return producao
    ? { ativo: true, ambiente: "production", baseUrl: ASAAS_URLS.producao, apiKey, webhookToken, holdMinutos }
    : { ativo: true, ambiente: "sandbox", baseUrl: ASAAS_URLS.sandbox, apiKey, webhookToken, holdMinutos };
}
