import { createCloseRoomHandler } from "./handler.ts";

// verify_jwt=true em config.toml. O banco decide quem pode encerrar (RPC com o JWT do
// usuário); a chave de serviço só lê o nome da sala e os participantes já registrados,
// e só depois de o banco autorizar. DAILY_API_KEY existe apenas como secret desta função.
const env = (name: string) => Deno.env.get(name);
const TIMEOUT_MS = 8000; // sem resposta nao e sucesso: a chamada falha e a revogacao fica pendente

// Reconciliação continua depois da resposta (Edge Runtime).
const later = (tarefa: Promise<unknown>) => { (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime?.waitUntil(tarefa); };

async function close(jwt: string, requestId: string) {
  const response = await fetch(`${env("SUPABASE_URL")}/rest/v1/rpc/close_appointment_room_session`, {
    method: "POST",
    headers: { apikey: env("SUPABASE_ANON_KEY") ?? "", Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_request_id: requestId }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = await response.json().catch(() => null);
  return response.ok ? { data: json } : { error: { code: json?.code ?? String(response.status) } };
}

async function lookup(requestId: string) {
  const key = env("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const base = env("SUPABASE_URL");
  const ler = async (url: string) => {
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!r.ok) throw new Error("lookup");
    return await r.json();
  };
  const sessions = await ler(`${base}/rest/v1/appointment_room_sessions?request_id=eq.${requestId}&select=id,provider_room_name`);
  if (!Array.isArray(sessions)) throw new Error("lookup");
  if (sessions.length === 0) return null;
  const log = await ler(`${base}/rest/v1/appointment_room_access_log?session_id=eq.${sessions[0].id}&kind=eq.token&select=user_id`);
  if (!Array.isArray(log)) throw new Error("lookup");
  const ids = [...new Set(log.map((row: { user_id: string }) => row.user_id))];
  return { room_name: sessions[0].provider_room_name as string, user_ids: ids as string[] };
}

// Remove espaços, quebras de linha e aspas coladas junto com a chave.
const chaveDaily = () => (env("DAILY_API_KEY") ?? "").trim().replace(/^["']+|["']+$/g, "").trim();

async function daily(method: "POST" | "DELETE", path: string, body?: unknown) {
  let response: Response;
  try {
    response = await fetch(`https://api.daily.co/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${chaveDaily()}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  } catch (e) {
    // Só o tipo do erro (TypeError, TimeoutError...), nunca a mensagem: ela poderia citar cabeçalhos.
    return { status: 599, json: { error: `net-${String((e as Error)?.name ?? "error").toLowerCase()}` } };
  }
  return { status: response.status, json: await response.json().catch(() => ({})) };
}

export default { fetch: createCloseRoomHandler({ env, close, lookup, daily, later }) };
