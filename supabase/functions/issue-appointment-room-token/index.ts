import { createRoomTokenHandler } from "./handler.ts";
import { criarLk } from "../_shared/livekit-sdk.ts";

// verify_jwt=true em config.toml: a plataforma valida o JWT; o banco valida de novo
// ao chamar a RPC com ele (auth.uid()). Chave e segredo do LiveKit só existem como secrets desta função.
const env = (name: string) => Deno.env.get(name);

async function rpc(nome: string, jwt: string, requestId: string) {
  const response = await fetch(`${env("SUPABASE_URL")}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: { apikey: env("SUPABASE_ANON_KEY") ?? "", Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_request_id: requestId }),
    signal: AbortSignal.timeout(8000),
  });
  const json = await response.json().catch(() => null);
  return response.ok ? { data: json } : { error: { code: json?.code ?? String(response.status) } };
}
const issue = (jwt: string, requestId: string) => rpc("issue_appointment_room_access", jwt, requestId);
const context = (jwt: string, requestId: string) => rpc("appointment_room_context", jwt, requestId);

// Tarefas de reconciliação continuam depois da resposta (Edge Runtime).
const later = (tarefa: Promise<unknown>) => { (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime?.waitUntil(tarefa); };

export default { fetch: createRoomTokenHandler({ env, issue, context, lk: criarLk(env), later }) };
