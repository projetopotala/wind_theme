import { test } from "node:test";
import assert from "node:assert/strict";
import { createCoursePaymentCheckoutHandler } from "../../supabase/functions/create-course-payment-checkout/handler.ts";
import { createAsaasWebhookHandler } from "../../supabase/functions/asaas-course-webhook/handler.ts";

const REQUEST = "11111111-1111-4111-8111-111111111111";
const KEY = "22222222-2222-4222-8222-222222222222";
function checkout(overrides = {}) {
  const calls = [];
  const envs = { ASAAS_API_URL: "https://api-sandbox.asaas.com/v3", ASAAS_API_KEY: "secret", PAYMENT_ALLOWED_ORIGINS: "https://preview.example", COURSE_PAYMENT_RETURN_URL: "https://preview.example/meu-potala/cursos" };
  const deps = {
    env: (n) => envs[n], calls,
    prepare: async () => ({ data: { id: "33333333-3333-4333-8333-333333333333", status: "creating", external_reference: `course:${REQUEST}`, amount_cents: 12345, course_title: "Curso seguro" } }),
    register: async (...args) => { calls.push(["register", ...args]); return { data: { checkout_url: args[2] } }; },
    fail: async (...args) => { calls.push(["fail", ...args]); },
    fetch: async (url, init) => { calls.push(["fetch", url, init]); return Response.json({ id: "chk_123" }); },
    ...overrides,
  };
  return { deps, handler: createCoursePaymentCheckoutHandler(deps) };
}
const req = (body, auth = true) => new Request("https://edge.example", { method: "POST", headers: { "content-type": "application/json", origin: "https://preview.example", ...(auth ? { authorization: "Bearer jwt" } : {}) }, body: JSON.stringify(body) });

test("cria Checkout Sandbox Pix/cartao com valor apenas do banco", async () => {
  const x = checkout();
  const response = await x.handler(req({ request_id: REQUEST, idempotency_key: KEY }));
  assert.equal(response.status, 200);
  const [, url, init] = x.deps.calls.find((c) => c[0] === "fetch");
  assert.equal(url, "https://api-sandbox.asaas.com/v3/checkouts");
  const body = JSON.parse(init.body);
  assert.deepEqual(body.billingTypes, ["PIX", "CREDIT_CARD"]);
  assert.deepEqual(body.chargeTypes, ["DETACHED"]);
  assert.equal(body.items[0].value, 123.45);
  assert.equal(body.externalReference, `course:${REQUEST}`);
  assert.ok(!JSON.stringify(body).includes("secret"));
});

test("sem JWT, ambiente nao-Sandbox e resposta ruim falham fechados", async () => {
  assert.equal((await checkout().handler(req({ request_id: REQUEST, idempotency_key: KEY }, false))).status, 401);
  assert.equal((await checkout({ env: (n) => n === "ASAAS_API_URL" ? "https://api.asaas.com/v3" : "x" }).handler(req({ request_id: REQUEST, idempotency_key: KEY }))).status, 503);
  const bad = checkout({ fetch: async () => new Response("{}", { status: 500 }) });
  assert.equal((await bad.handler(req({ request_id: REQUEST, idempotency_key: KEY }))).status, 502);
  assert.equal(bad.deps.calls.at(-1)[0], "fail");
});

test("repeticao devolve o mesmo checkout sem nova chamada ao Asaas", async () => {
  const x = checkout({ prepare: async () => ({ data: { id: "x", status: "active", checkout_url: "https://asaas.com/checkoutSession/show?id=existente", external_reference: "x", amount_cents: 1, course_title: "x" } }) });
  const response = await x.handler(req({ request_id: REQUEST, idempotency_key: KEY }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).replayed, true);
  assert.equal(x.deps.calls.length, 0);
});

test("webhook exige token, rejeita invalido e persiste via RPC uma vez", async () => {
  const calls = [];
  const handler = createAsaasWebhookHandler({ env: () => "a".repeat(40), process: async (p) => { calls.push(p); return { data: { processed: true } }; } });
  const body = JSON.stringify({ id: "evt", event: "CHECKOUT_PAID", checkout: { id: "chk" } });
  for (const token of [null, "errado"]) {
    const headers = { "content-type": "application/json", ...(token ? { "asaas-access-token": token } : {}) };
    assert.equal((await handler(new Request("https://edge.example", { method: "POST", headers, body }))).status, 401);
  }
  const ok = await handler(new Request("https://edge.example", { method: "POST", headers: { "content-type": "application/json", "asaas-access-token": "a".repeat(40) }, body }));
  assert.equal(ok.status, 200);
  assert.equal(calls.length, 1);
});
