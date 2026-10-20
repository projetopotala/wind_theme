const MAX_BODY_BYTES = 4096;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SERVICES = ["Acupuntura", "Reflexologia Palmar", "Reiki"];
const FIELDS = ["p_idempotency_key", "p_service", "p_modality", "p_requester_name",
  "p_contact_type", "p_contact", "p_preferred_date", "p_preferred_period", "turnstile_token"];
type Verification = { success?: boolean; hostname?: string; action?: string };
type RpcReply = { data?: { id?: string; status?: string } | null; error?: { code?: string } | null };

function json(status: number, message: string, headers: Record<string, string>, receipt?: { id: string; status: string }) {
  return Response.json(receipt ?? { message }, { status, headers: { ...headers, "Cache-Control": "no-store" } });
}

function cors(request: Request, origins: string[]): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin || !origins.includes(origin)) return {};
  return { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "apikey, content-type", Vary: "Origin" };
}

async function readSmallJson(request: Request): Promise<unknown> {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) throw new Error("too-large");
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new Error("bad-json");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("bad-json");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new Error("too-large"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new Error("bad-json"); }
}

function validated(body: unknown): Record<string, string> | null {
  if (!body || Array.isArray(body) || typeof body !== "object"
    || Object.keys(body).length !== FIELDS.length || Object.keys(body).some(key => !FIELDS.includes(key))
    || FIELDS.some(key => typeof (body as Record<string, unknown>)[key] !== "string")) return null;
  const input = body as Record<string, string>;
  const args = Object.fromEntries(FIELDS.slice(0, -1).map(key => [key, input[key].trim()]));
  args.p_contact = args.p_contact.toLowerCase();
  const day = args.p_preferred_date;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T12:00:00Z`) : null;
  if (!UUID.test(args.p_idempotency_key) || !SERVICES.includes(args.p_service)
    || !["presencial", "online"].includes(args.p_modality)
    || [...args.p_requester_name].length < 2 || [...args.p_requester_name].length > 100
    || !["email", "telefone"].includes(args.p_contact_type)
    || [...args.p_contact].length < 8 || [...args.p_contact].length > 254
    || !(args.p_contact_type === "email" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.p_contact)
      || args.p_contact_type === "telefone" && /^\+?[0-9]{10,15}$/.test(args.p_contact))
    || !parsed || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== day
    || !["manha", "tarde", "noite"].includes(args.p_preferred_period)
    || !input.turnstile_token || input.turnstile_token.length > 2048) return null;
  // A janela relativa da data permanece na RPC, depois da consulta idempotente.
  return args;
}

export function createAppointmentHandler({ env, verifyTurnstile, invokeRpc }: {
  env: (name: string) => string | undefined;
  verifyTurnstile: (token: string, secret: string) => Promise<Verification>;
  invokeRpc: (args: Record<string, string>) => Promise<RpcReply>;
}) {
  return async function handle(request: Request): Promise<Response> {
    const origins = (env("APPOINTMENT_ALLOWED_ORIGINS") || "").split(",").map(v => v.trim()).filter(Boolean);
    const headers = cors(request, origins);
    if (request.method === "OPTIONS") return new Response(null, { status: Object.keys(headers).length ? 204 : 403, headers });
    if (request.method !== "POST") return json(405, "Método não permitido.", headers);
    if (env("APPOINTMENT_INTAKE_ENABLED") !== "true") return json(503, "Solicitações temporariamente indisponíveis.", headers);
    const secret = env("TURNSTILE_SECRET_KEY");
    const hostname = env("APPOINTMENT_TURNSTILE_HOSTNAME");
    if (!secret || !hostname
      || !origins.length || typeof verifyTurnstile !== "function" || typeof invokeRpc !== "function") {
      return json(503, "Solicitações temporariamente indisponíveis.", headers);
    }
    if (request.headers.has("origin") && !Object.keys(headers).length) {
      return json(403, "Origem não permitida.", headers);
    }
    let body;
    try { body = await readSmallJson(request); }
    catch (error) { return json(error instanceof Error && error.message === "too-large" ? 413 : 400, "Solicitação inválida.", headers); }
    const args = validated(body);
    if (!args) return json(400, "Revise os dados da solicitação.", headers);
    let verification;
    try { verification = await verifyTurnstile((body as Record<string, string>).turnstile_token, secret); }
    catch { return json(503, "Não foi possível validar a solicitação. Tente novamente.", headers); }
    if (verification?.success !== true || verification.hostname !== hostname
      || verification.action !== "appointment_request") {
      return json(403, "Verificação de segurança inválida. Tente novamente.", headers);
    }
    try {
      const { data, error } = await invokeRpc(args);
      if (error) {
        const status = error.code === "PT409" ? 409 : error.code === "PT429" ? 429
          : error.code === "22023" ? 400 : 503;
        return json(status, status === 429 ? "Limite de solicitações atingido. Tente mais tarde."
          : status === 409 ? "A solicitação mudou. Revise os dados antes de tentar novamente."
            : "Não foi possível receber a solicitação.", headers);
      }
      if (!data || typeof data.id !== "string" || !UUID.test(data.id) || data.status !== "recebida") throw new Error("unexpected-receipt");
      return json(200, "", headers, { id: data.id, status: "recebida" });
    } catch { return json(503, "Não foi possível confirmar o recebimento. Tente novamente.", headers); }
  };
}

export async function verifyTurnstileWithFetch(token: string, secret: string, {
  fetchImpl = globalThis.fetch, timeoutMs = 3000,
}: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}): Promise<Verification> {
  const response = await fetchImpl("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST", body: new URLSearchParams({ secret, response: token }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error("siteverify-unavailable");
  return response.json();
}
