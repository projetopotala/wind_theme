// PAY-01 (NAO PUBLICAR em producao nesta fase). Liga o handler ao Supabase com a credencial privilegiada,
// que fica so aqui, no servidor. Pontos marcados "PAY-02" dependem de decisoes pendentes (ver docs/pay-01).
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
    // PAY-02: onde ficam nome/CPF do cliente e o id do cliente no Asaas ainda e decisao pendente (LGPD).
    dadosCliente: async () => null,
    salvarClienteAsaas: async () => undefined,
    registrar: async (id, asaasId, qr) => await admin.rpc("pay_register_provider_charge", { p_payment_id: id, p_provider_payment_id: asaasId, p_pix_payload: qr.copiaECola, p_pix_expires_at: qr.expiraEm }),
    falhar: async (id, motivo) => { await admin.rpc("pay_fail_creation", { p_payment_id: id, p_reason: motivo }); },
    log: (linha) => console.log(JSON.stringify(linha)),
  });
  return handler(request);
});
