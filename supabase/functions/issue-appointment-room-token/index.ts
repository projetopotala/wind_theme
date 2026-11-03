import { createRoomTokenHandler } from "./handler.ts";

// verify_jwt=true em config.toml: a plataforma valida o JWT; o banco valida de novo
// ao chamar a RPC com ele (auth.uid()). A chave do provedor só existe como secret desta função.
const env = (name: string) => Deno.env.get(name);

async function issue(jwt: string, requestId: string) {
  const response = await fetch(`${env("SUPABASE_URL")}/rest/v1/rpc/issue_appointment_room_access`, {
    method: "POST",
    headers: { apikey: env("SUPABASE_ANON_KEY") ?? "", Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_request_id: requestId }),
    signal: AbortSignal.timeout(8000),
  });
  const json = await response.json().catch(() => null);
  return response.ok ? { data: json } : { error: { code: json?.code ?? String(response.status) } };
}

async function context(jwt: string, requestId: string) {
  const response = await fetch(`${env("SUPABASE_URL")}/rest/v1/rpc/appointment_room_context`, {
    method: "POST",
    headers: { apikey: env("SUPABASE_ANON_KEY") ?? "", Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_request_id: requestId }),
    signal: AbortSignal.timeout(8000),
  });
  const json = await response.json().catch(() => null);
  return response.ok ? { data: json } : { error: { code: json?.code ?? String(response.status) } };
}

// Tarefas de reconciliação continuam depois da resposta (Edge Runtime).
const later = (tarefa: Promise<unknown>) => { (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime?.waitUntil(tarefa); };

// Remove espaços, quebras de linha e aspas coladas junto com a chave.
const chaveDaily = () => (env("DAILY_API_KEY") ?? "").trim().replace(/^["']+|["']+$/g, "").trim();

async function daily(path: string, body: unknown, method: "POST" | "DELETE" = "POST") {
  let response: Response;
  try {
    response = await fetch(`https://api.daily.co/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${chaveDaily()}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  } catch (e) {
    // Só o tipo do erro (TypeError, TimeoutError...), nunca a mensagem: ela poderia citar cabeçalhos.
    return { status: 599, json: { error: `net-${String((e as Error)?.name ?? "error").toLowerCase()}` } };
  }
  return { status: response.status, json: await response.json().catch(() => ({})) };
}

export default { fetch: createRoomTokenHandler({ env, issue, context, daily, later }) };
