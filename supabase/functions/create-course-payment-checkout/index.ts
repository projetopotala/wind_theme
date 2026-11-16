import { createCoursePaymentCheckoutHandler } from "./handler.ts";

const env = (name: string) => Deno.env.get(name);
async function rpc(name: string, key: string, body: Record<string, unknown>) {
  const response = await fetch(`${env("SUPABASE_URL")}/rest/v1/rpc/${name}`, {
    method: "POST", headers: { apikey: env("SUPABASE_ANON_KEY") ?? "", Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(8000),
  });
  const json = await response.json().catch(() => null);
  return response.ok ? { data: json } : { error: { code: json?.code ?? String(response.status) } };
}
const service = () => env("SUPABASE_SERVICE_ROLE_KEY") ?? "";

export default { fetch: createCoursePaymentCheckoutHandler({
  env, fetch,
  prepare: (jwt, requestId, idempotencyKey) => rpc("prepare_course_payment_checkout", jwt, { p_request_id: requestId, p_idempotency_key: idempotencyKey }),
  register: (id, providerId, url) => rpc("register_course_payment_checkout", service(), { p_checkout_id: id, p_provider_checkout_id: providerId, p_checkout_url: url }),
  fail: async (id, reason) => { await rpc("fail_course_payment_checkout", service(), { p_checkout_id: id, p_error: reason }); },
}) };
