// Varredor de salas: encerra no LiveKit toda sala cuja consulta terminou (encerrada, cancelada
// ou vencida) e ainda não teve a revogação confirmada. É o que garante o fim da consulta
// quando ninguém encerra e quando uma função de borda foi interrompida (waitUntil não é durável).
// Chamado por agendador com a chave de serviço; nunca por usuário.
import { revogarSala, type LkAdmin } from "../_shared/livekit-revoke.ts";

export type Pendente = { session_id: string; room_name: string; user_ids: string[] };
export type Deps = {
  env: (name: string) => string | undefined;
  pendentes: (limite: number) => Promise<Pendente[]>; // lança se a leitura falhar
  lk: LkAdmin;
  marcar: (sessionId: string) => Promise<unknown>;
};

const reply = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function igual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function createSweepHandler(deps: Deps) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return reply(405, { message: "Método não permitido." });
    const chave = deps.env("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const bearer = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
    if (!chave || !igual(bearer, chave)) return reply(401, { message: "Não autorizado." });
    if (!deps.env("LIVEKIT_API_KEY") || !deps.env("LIVEKIT_API_SECRET") || !deps.env("LIVEKIT_URL")) {
      return reply(503, { message: "A videochamada ainda não está configurada." });
    }
    let fila: Pendente[];
    try { fila = await deps.pendentes(50); } catch { return reply(502, { message: "Não foi possível ler a fila." }); }
    let revogadas = 0, pendentes = 0;
    for (const s of fila) {
      let ok = false;
      try { ok = await revogarSala(deps.lk, s.room_name, s.user_ids); } catch { ok = false; }
      if (ok) { try { await deps.marcar(s.session_id); revogadas++; } catch { pendentes++; } } else pendentes++;
    }
    return reply(200, { processadas: fila.length, revogadas, pendentes });
  };
}
