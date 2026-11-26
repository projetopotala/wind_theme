// PAY-01 (NAO PUBLICAR nem cadastrar este webhook no Asaas de producao nesta fase).
// Autenticacao por segredo em `asaas-access-token` dentro do handler compartilhado; por isso verify_jwt = false.
import { createClient } from "npm:@supabase/supabase-js@2";
import { criarWebhookHandler } from "../_shared/pagamentos/webhook.ts";

const env = (nome: string) => Deno.env.get(nome);

Deno.serve((request: Request) => {
  const admin = createClient(env("SUPABASE_URL") ?? "", env("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
  const handler = criarWebhookHandler({
    env,
    log: (linha) => console.log(JSON.stringify(linha)),
    registrar: async (e) => await admin.rpc("pay_apply_webhook_event", {
      p_provider_event_id: e.eventId, p_event: e.evento, p_event_created: e.dataCriacao, p_provider_payment_id: e.pagamentoId,
      p_external_reference: e.referenciaExterna, p_value_cents: e.valorCentavos, p_original_value_cents: e.valorOriginalCentavos,
      p_provider_status: e.statusAsaas, p_billing_type: e.metodo,
    }).then((r: { data: unknown; error: unknown }) => ({ data: r.data as { resultado: never } | null, error: r.error })),
  });
  return handler(request);
});
