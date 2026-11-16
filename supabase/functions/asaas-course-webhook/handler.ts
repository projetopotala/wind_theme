const MAX_BODY = 128 * 1024;
export type WebhookDeps = {
  env(name: string): string | undefined;
  process(payload: Record<string, unknown>): Promise<{ data?: { processed?: boolean } | null; error?: unknown }>;
};
function equalSecret(a: string, b: string) {
  const enc = new TextEncoder(); const x = enc.encode(a); const y = enc.encode(b);
  let diff = x.length ^ y.length; const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i % Math.max(1, x.length)] ?? 0) ^ (y[i % Math.max(1, y.length)] ?? 0);
  return diff === 0;
}
export function createAsaasWebhookHandler(deps: WebhookDeps) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return Response.json({ received: false }, { status: 405 });
    const expected = deps.env("ASAAS_WEBHOOK_TOKEN") ?? "";
    const supplied = request.headers.get("asaas-access-token") ?? "";
    if (expected.length < 32 || supplied.length > 255 || !equalSecret(expected, supplied)) return Response.json({ received: false }, { status: 401 });
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return Response.json({ received: false }, { status: 400 });
    const text = await request.text();
    if (text.length > MAX_BODY) return Response.json({ received: false }, { status: 413 });
    let payload: Record<string, unknown>;
    try {
      const value = JSON.parse(text);
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("bad");
      payload = value;
    } catch { return Response.json({ received: false }, { status: 400 }); }
    const result = await deps.process(payload).catch(() => ({ error: true }));
    if (result.error || !result.data?.processed) return Response.json({ received: false }, { status: 503, headers: { "Retry-After": "30" } });
    return Response.json({ received: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
  };
}
