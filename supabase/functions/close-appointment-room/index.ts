import { createCloseRoomHandler } from "./handler.ts";

// verify_jwt=true em config.toml. O banco decide quem pode encerrar (RPC com o JWT do
// usuário); a chave de serviço só lê o nome da sala e os participantes já registrados,
// e só depois de o banco autorizar. DAILY_API_KEY existe apenas como secret desta função.
const env = (name: string) => Deno.env.get(name);

async function close(jwt: string, requestId: string) {
  const response = await fetch(`${env("SUPABASE_URL")}/rest/v1/rpc/close_appointment_room_session`, {
    method: "POST",
    headers: { apikey: env("SUPABASE_ANON_KEY") ?? "", Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_request_id: requestId }),
  });
  const json = await response.json().catch(() => null);
  return response.ok ? { data: json } : { error: { code: json?.code ?? String(response.status) } };
}

async function lookup(requestId: string) {
  const key = env("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const base = env("SUPABASE_URL");
  const sessions = await (await fetch(`${base}/rest/v1/appointment_room_sessions?request_id=eq.${requestId}&select=id,provider_room_name`, { headers })).json();
  if (!Array.isArray(sessions) || sessions.length === 0) return null;
  const log = await (await fetch(`${base}/rest/v1/appointment_room_access_log?session_id=eq.${sessions[0].id}&kind=eq.token&select=user_id`, { headers })).json();
  const ids = Array.isArray(log) ? [...new Set(log.map((row: { user_id: string }) => row.user_id))] : [];
  return { room_name: sessions[0].provider_room_name as string, user_ids: ids as string[] };
}

async function daily(method: "POST" | "DELETE", path: string, body?: unknown) {
  const response = await fetch(`https://api.daily.co/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${env("DAILY_API_KEY")}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, json: await response.json().catch(() => ({})) };
}

export default { fetch: createCloseRoomHandler({ env, close, lookup, daily }) };
