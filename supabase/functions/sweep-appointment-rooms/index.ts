import { createSweepHandler } from "./handler.ts";
import { criarLk } from "../_shared/livekit-sdk.ts";

// Só a chave de serviço chama esta função (o handler confere); verify_jwt=true também exige JWT válido.
const env = (name: string) => Deno.env.get(name);
const TIMEOUT_MS = 8000;

async function ler(url: string, init?: RequestInit) {
  const key = env("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const r = await fetch(url, { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!r.ok) throw new Error("leitura");
  return await r.json();
}

async function pendentes(limite: number) {
  const base = env("SUPABASE_URL");
  const fila = await ler(`${base}/rest/v1/rpc/appointment_rooms_pending_revocation`, { method: "POST", body: JSON.stringify({ p_limit: limite }) });
  if (!Array.isArray(fila)) throw new Error("leitura");
  const saida = [];
  for (const s of fila as { session_id: string; room_name: string }[]) {
    const log = await ler(`${base}/rest/v1/appointment_room_access_log?session_id=eq.${s.session_id}&kind=eq.token&select=user_id`);
    if (!Array.isArray(log)) throw new Error("leitura");
    saida.push({ session_id: s.session_id, room_name: s.room_name,
      user_ids: [...new Set(log.map((row: { user_id: string }) => row.user_id))] as string[] });
  }
  return saida;
}

const marcar = (sessionId: string) =>
  ler(`${env("SUPABASE_URL")}/rest/v1/rpc/mark_appointment_room_revoked`, { method: "POST", body: JSON.stringify({ p_session_id: sessionId }) });

export default { fetch: createSweepHandler({ env, pendentes, lk: criarLk(env), marcar }) };
