// PAY-01/PAY-02 (NAO PUBLICAR sem autorizacao do Owner). Liga o handler ao Supabase com a credencial privilegiada,
// que fica so aqui, no servidor.
import { createClient } from "npm:@supabase/supabase-js@2";
import { criarCriarPagamentoHandler } from "./handler.ts";

const env = (nome: string) => Deno.env.get(nome);

Deno.serve((request: Request) => {
  const admin = createClient(env("SUPABASE_URL") ?? "", env("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
  const handler = criarCriarPagamentoHandler({
    env,
    fetch: (url, init) => fetch(url, init),
    usuarioDoJwt: async (jwt) => {
      const { data, error } = await admin.auth.getUser(jwt);
      return error || !data.user ? null : { id: data.user.id };
    },
    preparar: async (usuarioId, requestId, chave, holdMinutos) =>
      await admin.rpc("pay_prepare_appointment_payment", { p_user_id: usuarioId, p_request_id: requestId, p_idempotency_key: chave, p_hold_minutes: holdMinutos }),
    // Minimizacao (LGPD): do cadastro so se le o id do cliente no Asaas. Nome e documento chegam no pedido, sao validados
    // e vao ao Asaas uma unica vez; e-mail nao e enviado (as notificacoes do Asaas ficam desligadas).
    dadosCliente: async (usuarioId) => {
      const { data, error } = await admin.rpc("pay_get_payer", { p_user_id: usuarioId });
      if (error) return null;
      return { nome: "", email: null, cpfCnpj: null, asaasClienteId: (data as { asaas_customer_id?: string } | null)?.asaas_customer_id ?? null };
    },
    salvarClienteAsaas: async (usuarioId, asaasId, tipo, ultimos4) => {
      const { error } = await admin.rpc("pay_save_payer", { p_user_id: usuarioId, p_asaas_customer_id: asaasId, p_kind: tipo, p_last4: ultimos4 });
      if (error) throw new Error("pagador_nao_salvo");
    },
    registrar: async (id, asaasId, qr) => await admin.rpc("pay_register_provider_charge", { p_payment_id: id, p_provider_payment_id: asaasId, p_pix_payload: qr?.copiaECola ?? null, p_pix_expires_at: qr?.expiraEm ?? null }),
    falhar: async (id, motivo) => { await admin.rpc("pay_fail_creation", { p_payment_id: id, p_reason: motivo }); },
    log: (linha) => console.log(JSON.stringify(linha)),
  });
  return handler(request);
});
