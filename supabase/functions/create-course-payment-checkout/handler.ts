const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY = 512;

export type PreparedCheckout = {
  id: string; status: string; provider_checkout_id?: string | null; checkout_url?: string | null;
  external_reference: string; amount_cents: number; course_title: string; replayed?: boolean;
};
export type CheckoutDeps = {
  env(name: string): string | undefined;
  prepare(jwt: string, requestId: string, idempotencyKey: string): Promise<{ data?: PreparedCheckout | null; error?: { code?: string } | null }>;
  register(id: string, providerId: string, url: string): Promise<{ data?: { checkout_url?: string } | null; error?: unknown }>;
  fail(id: string, reason: string): Promise<void>;
  fetch(input: string, init: RequestInit): Promise<Response>;
};

function allowedOrigins(env: CheckoutDeps["env"]) {
  return (env("PAYMENT_ALLOWED_ORIGINS") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
}
function cors(request: Request, deps: CheckoutDeps) {
  const origin = request.headers.get("origin");
  return origin && allowedOrigins(deps.env).includes(origin)
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "apikey, authorization, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", Vary: "Origin" }
    : {};
}
function reply(status: number, body: Record<string, unknown>, headers: Record<string, string>) {
  return Response.json(body, { status, headers: { ...headers, "Cache-Control": "no-store" } });
}
function returnUrl(deps: CheckoutDeps) {
  const raw = deps.env("COURSE_PAYMENT_RETURN_URL") ?? "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !allowedOrigins(deps.env).includes(url.origin)) return null;
    return url;
  } catch { return null; }
}

export function createCoursePaymentCheckoutHandler(deps: CheckoutDeps) {
  return async (request: Request): Promise<Response> => {
    const headers = cors(request, deps);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return reply(405, { message: "Método não permitido." }, headers);
    const jwt = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
    if (!jwt) return reply(401, { message: "Entre na sua conta." }, headers);
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return reply(400, { message: "Pedido inválido." }, headers);
    const text = await request.text();
    if (text.length > MAX_BODY) return reply(413, { message: "Pedido grande demais." }, headers);
    let requestId = ""; let idempotencyKey = "";
    try {
      const body = JSON.parse(text);
      if (!body || Array.isArray(body) || Object.keys(body).sort().join(",") !== "idempotency_key,request_id"
        || !UUID.test(body.request_id) || !UUID.test(body.idempotency_key)) throw new Error("bad");
      requestId = body.request_id.toLowerCase(); idempotencyKey = body.idempotency_key.toLowerCase();
    } catch { return reply(400, { message: "Pedido inválido." }, headers); }

    const apiUrl = deps.env("ASAAS_API_URL");
    const apiKey = deps.env("ASAAS_API_KEY");
    const callback = returnUrl(deps);
    if (apiUrl !== "https://api-sandbox.asaas.com/v3" || !apiKey || !callback) {
      return reply(503, { message: "O pagamento Sandbox ainda não está configurado." }, headers);
    }
    const { data, error } = await deps.prepare(jwt, requestId, idempotencyKey).catch(() => ({ data: null, error: { code: "unavailable" } }));
    if (error || !data) {
      const code = error?.code ?? "";
      return reply(code === "42501" ? 403 : code === "P0002" ? 404 : code === "22023" ? 409 : 502,
        { message: code === "42501" ? "Acesso negado." : "Não foi possível preparar o pagamento." }, headers);
    }
    if (data.status === "active" && data.checkout_url) return reply(200, { checkout_url: data.checkout_url, replayed: true }, headers);
    if (data.status === "creating" && data.replayed) {
      return reply(409, { message: "A criação anterior está em conciliação. Aguarde antes de tentar novamente." }, headers);
    }
    if (data.status !== "creating") return reply(409, { message: "Este pagamento não pode ser iniciado novamente." }, headers);

    const callbackFor = (result: string) => { const u = new URL(callback); u.searchParams.set("pagamento", result); return u.toString(); };
    let response: Response;
    try {
      response = await deps.fetch(`${apiUrl}/checkouts`, {
        method: "POST", signal: AbortSignal.timeout(12000),
        headers: { access_token: apiKey, "Content-Type": "application/json", "User-Agent": "Instituto-Potala-Portal/1.0" },
        body: JSON.stringify({
          billingTypes: ["PIX", "CREDIT_CARD"], chargeTypes: ["DETACHED"], minutesToExpire: 60,
          externalReference: data.external_reference,
          callback: { successUrl: callbackFor("retorno"), cancelUrl: callbackFor("cancelado"), expiredUrl: callbackFor("expirado") },
          items: [{ name: data.course_title, description: "Inscrição em curso do Instituto Potala", quantity: 1, value: data.amount_cents / 100 }],
        }),
      });
    } catch {
      await deps.fail(data.id, "asaas_unavailable").catch(() => undefined);
      return reply(502, { message: "O Asaas não respondeu. Nenhuma cobrança foi confirmada." }, headers);
    }
    const json = await response.json().catch(() => null) as { id?: unknown } | null;
    if (!response.ok || typeof json?.id !== "string" || !json.id) {
      await deps.fail(data.id, `asaas_http_${response.status}`).catch(() => undefined);
      return reply(502, { message: "Não foi possível criar a página de pagamento." }, headers);
    }
    const checkoutUrl = `https://asaas.com/checkoutSession/show?id=${encodeURIComponent(json.id)}`;
    const saved = await deps.register(data.id, json.id, checkoutUrl).catch(() => ({ error: true }));
    if (saved.error) return reply(502, { message: "Pagamento criado, aguardando conciliação segura." }, headers);
    return reply(200, { checkout_url: checkoutUrl, replayed: false }, headers);
  };
}
