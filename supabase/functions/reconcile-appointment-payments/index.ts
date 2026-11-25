// PAY-02 (NAO PUBLICAR sem autorizacao do Owner). Liga o reconciliador ao Supabase com a credencial privilegiada.
// Chamado por agendamento (ex.: a cada 5 minutos) com o header x-reconcile-token. Nunca cria cobranca.
import { createClient } from "npm:@supabase/supabase-js@2";
import { criarReconciliadorHandler } from "./handler.ts";

const env = (nome: string) => Deno.env.get(nome);

Deno.serve((request: Request) => {
  const admin = createClient(env("SUPABASE_URL") ?? "", env("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
  const handler = criarReconciliadorHandler({
    env,
    fetch: (url, init) => fetch(url, init),
    agora: () => new Date(),
    listarConferir: async (idade) => {
      const { data, error } = await admin.rpc("pay_list_reconcilable", { p_min_age_minutes: idade });
      if (error) throw new Error("falha_lista");
      return data ?? [];
    },
    listarExpirados: async () => {
      const { data, error } = await admin.rpc("pay_list_expired_unpaid");
      if (error) throw new Error("falha_lista");
      return data ?? [];
    },
    registrarId: async (id, asaasId, qr) => await admin.rpc("pay_register_provider_charge", { p_payment_id: id, p_provider_payment_id: asaasId, p_pix_payload: qr?.copiaECola ?? null, p_pix_expires_at: qr?.expiraEm ?? null }),
    aplicarEvento: async (e) => {
      const r = await admin.rpc("pay_apply_webhook_event", {
        p_provider_event_id: e.eventId, p_event: e.evento, p_event_created: null, p_provider_payment_id: e.provedorId,
        p_external_reference: e.referenciaExterna, p_value_cents: e.valorCentavos, p_original_value_cents: null, p_provider_status: e.statusAsaas, p_billing_type: "PIX",
      });
      return { resultado: (r.data as { resultado?: string } | null)?.resultado, error: r.error };
    },
    abrirRevisao: async (pagId, asaasId, tipo, detalhe) => { await admin.rpc("pay_log_review", { p_payment_id: pagId, p_provider_payment_id: asaasId, p_kind: tipo, p_detail: detalhe }); },
    liberarReserva: async (id) => {
      const { data, error } = await admin.rpc("pay_release_expired_hold", { p_payment_id: id });
      return error ? "erro" : String(data);
    },
    desconhecidas: async (itens) => {
      const { data, error } = await admin.rpc("pay_unknown_charges", { p_items: itens });
      if (error) throw new Error("falha_orfas");
      return data ?? [];
    },
    log: (linha) => console.log(JSON.stringify(linha)),
  });
  return handler(request);
});
