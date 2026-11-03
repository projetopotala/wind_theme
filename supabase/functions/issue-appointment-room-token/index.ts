import { createRoomTokenHandler } from "./handler.ts";

// verify_jwt=true em config.toml: a plataforma valida o JWT; o banco valida de novo
// ao chamar a RPC com ele (auth.uid()). A chave do provedor só existe como secret desta função.
const env = (name: string) => Deno.env.get(name);

async function issue(jwt: string, requestId: string) {
  const response = await fetch(`${env("SUPABASE_URL")}/rest/v1/rpc/issue_appointment_room_access`, {
    method: "POST",
    headers: { apikey: env("SUPABASE_ANON_KEY") ?? "", Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_request_id: requestId }),
  });
  const json = await response.json().catch(() => null);
  return response.ok ? { data: json } : { error: { code: json?.code ?? String(response.status) } };
}

async function daily(path: string, body: unknown) {
  const response = await fetch(`https://api.daily.co/v1${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env("DAILY_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json().catch(() => ({})) };
}

export default { fetch: createRoomTokenHandler({ env, issue, daily }) };
