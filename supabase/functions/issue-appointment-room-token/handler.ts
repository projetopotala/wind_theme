// Emite o token LiveKit da sala. A autorização vem do banco (RPC com o JWT do
// usuário); o ID recebido no corpo nunca é prova de nada. A chave e o segredo do
// provedor existem só aqui, via variáveis de ambiente.
import { esperarReal, revogarSala, TTL_TOKEN_SEGUNDOS, urlLiveKit, type Esperar, type LkAdmin, type LkResult } from "../_shared/livekit-revoke.ts";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 512;

export type Access = {
  session_id: string; room_name: string; provider: string; role: string;
  expires_at: string; participant_id: string;
};
export type TokenSpec = { room: string; identity: string; name: string; ttlSeconds: number };
export type Deps = {
  env: (name: string) => string | undefined;
  issue: (jwt: string, requestId: string) => Promise<{ data?: Access | null; error?: { code?: string } | null }>;
  lk: LkAdmin & { token: (spec: TokenSpec) => Promise<string> };
  // Estado do atendimento lido de novo no banco com o JWT do usuário (revalidação depois do provedor).
  context: (jwt: string, requestId: string) => Promise<{ data?: { state?: string } | null; error?: { code?: string } | null }>;
  later?: (tarefa: Promise<unknown>) => void;
  esperar?: Esperar;
};

function reply(status: number, body: Record<string, unknown>, headers: Record<string, string>) {
  return Response.json(body, { status, headers: { ...headers, "Cache-Control": "no-store" } });
}

function cors(request: Request, allowed: string[]): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin || !allowed.includes(origin)) return {};
  return { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "apikey, authorization, content-type", Vary: "Origin" };
}

export function createRoomTokenHandler(deps: Deps) {
  return async (request: Request): Promise<Response> => {
    const allowed = (deps.env("ROOM_ALLOWED_ORIGINS") ?? "").split(",").map(s => s.trim()).filter(Boolean);
    const headers = cors(request, allowed);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return reply(405, { message: "Método não permitido." }, headers);

    const jwt = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
    if (!jwt) return reply(401, { message: "Entre na sua conta." }, headers);
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return reply(400, { message: "Pedido inválido." }, headers);
    }
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return reply(413, { message: "Pedido grande demais." }, headers);
    let requestId = "";
    try {
      const body = JSON.parse(text);
      if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1
        || typeof body.request_id !== "string" || !UUID.test(body.request_id)) throw new Error("bad");
      requestId = body.request_id.toLowerCase();
    } catch { return reply(400, { message: "Pedido inválido." }, headers); }

    const url = urlLiveKit(deps.env("LIVEKIT_URL"));
    if (!deps.env("LIVEKIT_API_KEY") || !deps.env("LIVEKIT_API_SECRET") || !url) {
      return reply(503, { message: "A videochamada ainda não está configurada." }, headers);
    }

    // Diagnóstico seguro: só o passo e o status HTTP (nunca corpo, chave, segredo ou token).
    const falha = (passo: string, r?: LkResult) =>
      reply(502, { message: "Não foi possível abrir a sala.", step: passo, ...(r ? { provider_status: r.status } : {}) }, headers);
    const { data, error } = await deps.issue(jwt, requestId)
      .catch(() => ({ data: null, error: { code: "unavailable" } }));
    if (error || !data) {
      const code = error?.code ?? "";
      if (code === "42501") return reply(403, { code, message: "Acesso negado." }, headers);
      if (code === "P0001") return reply(409, { code, message: "A sala não está disponível agora." }, headers);
      if (code === "54000") return reply(429, { code, message: "Muitas tentativas." }, headers);
      return reply(502, { message: "Não foi possível abrir a sala." }, headers);
    }
    // Sessão antiga de outro provedor (histórico Daily): nunca entra em sala LiveKit.
    if (data.provider !== "livekit") return reply(409, { code: "P0001", message: "A sala não está disponível agora." }, headers);

    const exp = Math.floor(new Date(data.expires_at).getTime() / 1000);
    const agora = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(exp) || exp <= agora) {
      return reply(409, { code: "P0001", message: "A sala não está disponível agora." }, headers);
    }
    // Token curto: nunca passa do fim da janela da consulta.
    const ttlSeconds = Math.max(1, Math.min(TTL_TOKEN_SEGUNDOS, exp - agora));

    // Sala privada de 2 participantes, sem gravação (nenhum egress é criado), chat é o nosso.
    const room = await deps.lk.createRoom(data.room_name).catch((): LkResult => ({ status: 599 }));
    if (room.status !== 200) return falha("room", room);

    let token: string | null = null;
    try {
      const t = await deps.lk.token({ room: data.room_name, identity: data.participant_id,
        name: data.role === "professional" ? "Profissional" : "Cliente", ttlSeconds });
      token = typeof t === "string" && t ? t : null;
    } catch { token = null; }

    // Revalida DEPOIS das operações externas: o encerramento pode ter acontecido entre a emissão
    // no banco e a criação da sala/token (a sala apagada pelo encerramento seria recriada aqui).
    // O token só é entregue se o banco ainda diz "open"; qualquer outra coisa (inclusive não
    // conseguir confirmar) falha fechado e a sala é compensada.
    const reconciliar = async (): Promise<"aberta" | "revogada" | "pendente"> => {
      let estado: string | undefined;
      try { estado = (await deps.context(jwt, requestId)).data?.state; } catch { /* desconhecido */ }
      if (estado === "open") return "aberta";
      if (estado === undefined) return "pendente";
      return (await revogarSala(deps.lk, data.room_name, [data.participant_id])) ? "revogada" : "pendente";
    };
    const resultado = await reconciliar();
    if (resultado === "aberta") {
      if (!token) return falha("token");
      return reply(200, { url, token, expires_at: data.expires_at, role: data.role }, headers);
    }
    if (resultado === "pendente") {
      // Não depende de ninguém repetir: reconcilia em segundo plano até confirmar.
      const esperar = deps.esperar ?? esperarReal;
      deps.later?.((async () => {
        for (const ms of [1000, 3000, 8000]) { await esperar(ms); if (await reconciliar() !== "pendente") return true; }
        return false;
      })().catch(() => false));
      return reply(502, { message: "Não foi possível abrir a sala." }, headers);
    }
    return reply(409, { code: "P0001", message: "A sala não está disponível agora." }, headers);
  };
}
