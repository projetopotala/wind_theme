// Encerra a sala: o banco decide quem pode (RPC com o JWT do usuário) e só depois
// o provedor é chamado para expulsar e banir quem já entrou e apagar a sala.
// Repetir a chamada é seguro: o banco aceita o profissional de uma sala já encerrada,
// o que permite completar a revogação se o provedor falhou antes.
import { esperarReal, revogarSala, type DailyCall, type Esperar } from "../_shared/daily-revoke.ts";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 512;

export type Deps = {
  env: (name: string) => string | undefined;
  close: (jwt: string, requestId: string) => Promise<{ data?: { closed?: boolean } | null; error?: { code?: string } | null }>;
  lookup: (requestId: string) => Promise<{ room_name: string; user_ids: string[] } | null>;
  daily: DailyCall;
  // Reconciliação em segundo plano (EdgeRuntime.waitUntil em produção); ausente nos testes simples.
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

export function createCloseRoomHandler(deps: Deps) {
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

    const { data, error } = await deps.close(jwt, requestId)
      .catch(() => ({ data: null, error: { code: "unavailable" } }));
    if (error || !data) {
      if (error?.code === "42501") return reply(403, { code: "42501", message: "Acesso negado." }, headers);
      return reply(502, { message: "Não foi possível encerrar a sala." }, headers);
    }
    // Nada foi aberto: não há o que revogar no provedor.
    if (!data.closed) return reply(200, { closed: false, revoked: true }, headers);

    // A partir daqui o banco já bloqueia novas entradas; falhas do provedor só
    // significam que a revogação precisa ser repetida.
    let revoked = false;
    try {
      const found = await deps.lookup(requestId); // lança se a leitura falhar
      if (!found) revoked = true;
      else if (!deps.env("DAILY_API_KEY")) revoked = false;
      else {
        revoked = await revogarSala(deps.daily, found.room_name, found.user_ids);
        // Falhou: não depende de o profissional repetir. A reconciliação continua em segundo plano.
      }
    } catch { revoked = false; }
    // Falhou (Daily, leitura ou chave): não depende de o profissional repetir. Reconcilia em segundo plano,
    // relendo a sala a cada tentativa; o banco já está fechado, então nada reabre.
    if (!revoked && deps.env("DAILY_API_KEY")) {
      const esperar = deps.esperar ?? esperarReal;
      deps.later?.((async () => {
        for (const ms of [1000, 3000, 8000]) {
          await esperar(ms);
          try {
            const again = await deps.lookup(requestId);
            if (!again || await revogarSala(deps.daily, again.room_name, again.user_ids)) return true;
          } catch { /* próxima tentativa */ }
        }
        return false;
      })());
    }
    return reply(200, { closed: true, revoked }, headers);
  };
}
