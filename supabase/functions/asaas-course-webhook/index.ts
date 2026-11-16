import { createAsaasWebhookHandler } from "./handler.ts";
const env = (name: string) => Deno.env.get(name);
async function process(payload: Record<string, unknown>) {
  const key = env("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const response = await fetch(`${env("SUPABASE_URL")}/rest/v1/rpc/process_course_payment_webhook`, {
    method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_payload: payload }), signal: AbortSignal.timeout(10000),
  });
  const json = await response.json().catch(() => null);
  return response.ok ? { data: json } : { error: { code: json?.code ?? String(response.status) } };
}
export default { fetch: createAsaasWebhookHandler({ env, process }) };
