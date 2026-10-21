import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createAppointmentHandler, verifyTurnstileWithFetch } from "../../supabase/functions/submit-appointment-request/handler.ts";

const id = "10000000-0000-4000-8000-000000000001";
const args = { p_idempotency_key: "20000000-0000-4000-8000-000000000002",
  p_service: "Reiki", p_modality: "online", p_requester_name: "Pessoa Fictícia",
  p_contact_type: "email", p_contact: "pessoa@example.invalid",
  p_preferred_date: "2026-10-22", p_preferred_period: "tarde", turnstile_token: "token-ficticio" };
const origin = "https://isolado.invalid";
const settings = { APPOINTMENT_INTAKE_ENABLED: "true", TURNSTILE_SECRET_KEY: "segredo-ficticio",
  APPOINTMENT_TURNSTILE_HOSTNAME: "isolado.invalid", APPOINTMENT_ALLOWED_ORIGINS: origin };
const request = (body = args, method = "POST", headers = {}) => new Request("https://api.invalid/functions/v1/submit-appointment-request", {
  method, headers: { Origin: origin, "Content-Type": "application/json", ...headers },
  ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
});
function fixture(overrides = {}) {
  let rpcCalls = 0;
  let challengeCalls = 0;
  const env = name => ({ ...settings, ...overrides.settings })[name];
  const handle = createAppointmentHandler({ env,
    verifyTurnstile: async (...values) => { challengeCalls++; return overrides.verify
      ? overrides.verify(...values) : { success: true, hostname: "isolado.invalid", action: "appointment_request" }; },
    invokeRpc: async values => { rpcCalls++; return overrides.rpc
      ? overrides.rpc(values) : { data: { id, status: "recebida", contact: "não expor" }, error: null }; },
  });
  return { handle, get rpcCalls() { return rpcCalls; }, get challengeCalls() { return challengeCalls; } };
}

test("flag desligada e configuração ausente falham fechadas antes do Siteverify/RPC", async () => {
  for (const settingsPatch of [{ APPOINTMENT_INTAKE_ENABLED: "false" }, { TURNSTILE_SECRET_KEY: "" },
    { APPOINTMENT_TURNSTILE_HOSTNAME: "" }, { APPOINTMENT_ALLOWED_ORIGINS: "" }]) {
    const f = fixture({ settings: settingsPatch });
    assert.equal((await f.handle(request())).status, 503);
    assert.equal(f.challengeCalls, 0);
    assert.equal(f.rpcCalls, 0);
  }
});

test("somente POST; OPTIONS responde CORS apenas para origem configurada", async () => {
  const f = fixture();
  const preflight = await f.handle(request(null, "OPTIONS"));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
  assert.equal((await f.handle(request(null, "OPTIONS", { Origin: "https://outra.invalid" }))).status, 403);
  assert.equal((await f.handle(request(args, "POST", { Origin: "https://outra.invalid" }))).status, 403);
  assert.equal((await f.handle(request(null, "GET"))).status, 405);
  assert.equal(f.rpcCalls, 0);
});

test("JSON, tipo e tamanho são limitados antes de qualquer operação privilegiada", async () => {
  const f = fixture();
  for (const [body, headers, status] of [
    ["{", {}, 400], [args, { "Content-Type": "text/plain" }, 400],
    [{ ...args, extra: "x" }, {}, 400], [" ".repeat(4097), {}, 413],
    [args, { "Content-Length": "5000" }, 413],
  ]) assert.equal((await f.handle(request(body, "POST", headers))).status, status);
  assert.equal(f.challengeCalls, 0); assert.equal(f.rpcCalls, 0);
});

test("contrato de oito campos recusa valores inválidos e serviço não oferecido", async () => {
  const f = fixture();
  const variants = [{ p_service: "Serviço inventado" }, { p_service: "" },
    { p_idempotency_key: "inválida" }, { p_modality: "outra" },
    { p_requester_name: "x" }, { p_contact: "sem-email" },
    { p_contact_type: "outro" }, { p_preferred_date: "2026-02-30" },
    { p_preferred_period: "madrugada" }, { turnstile_token: "" }];
  for (const variant of variants) assert.equal((await f.handle(request({ ...args, ...variant }))).status, 400);
  assert.equal(f.challengeCalls, 0); assert.equal(f.rpcCalls, 0);
});

test("token inválido, expirado/reutilizado, hostname e action errados não chamam RPC", async () => {
  for (const result of [{ success: false }, { success: false, "error-codes": ["timeout-or-duplicate"] },
    { success: true, hostname: "outro.invalid", action: "appointment_request" },
    { success: true, hostname: "isolado.invalid", action: "outro" }]) {
    const f = fixture({ verify: async () => result });
    assert.equal((await f.handle(request())).status, 403);
    assert.equal(f.rpcCalls, 0);
  }
});

test("Siteverify indisponível ou com timeout falha fechado; segredo não sai na resposta", async () => {
  for (const failure of [new Error("offline"), new DOMException("timeout", "TimeoutError")]) {
    const f = fixture({ verify: async () => { throw failure; } });
    const response = await f.handle(request());
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /segredo-ficticio|offline|timeout/i);
    assert.equal(f.rpcCalls, 0);
  }
  const checked = await verifyTurnstileWithFetch("token", "segredo", { fetchImpl: async (url, options) => {
    assert.equal(url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    assert.equal(options.body.get("response"), "token");
    assert.equal(options.body.get("secret"), "segredo");
    assert.ok(options.signal);
    return Response.json({ success: false });
  } });
  assert.equal(checked.success, false);
  await assert.rejects(verifyTurnstileWithFetch("token", "segredo", { fetchImpl: async () => new Response("", { status: 503 }) }));
});

test("RPC recebe só os oito argumentos, devolve recibo público e preserva chave em repetição", async () => {
  const seen = [];
  const f = fixture({ rpc: async values => { seen.push(values); return { data: { id, status: "recebida", contact: "privado" }, error: null }; } });
  for (let i = 0; i < 2; i++) {
    const response = await f.handle(request({ ...args, turnstile_token: `token-${i}` }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { id, status: "recebida" });
  }
  assert.equal(seen.length, 2);
  assert.deepEqual(seen[0], seen[1]);
  assert.deepEqual(seen[0], Object.fromEntries(Object.entries(args).filter(([key]) => key.startsWith("p_"))));
});

test("erros de idempotência, limite e RPC não vazam dados nem confirmam reserva", async () => {
  for (const [code, expected] of [["PT409", 409], ["PT429", 429], ["22023", 400], ["PGRST000", 503]]) {
    const f = fixture({ rpc: async () => ({ data: null, error: { code, message: "contato privado" } }) });
    const response = await f.handle(request());
    assert.equal(response.status, expected);
    assert.doesNotMatch(await response.text(), /contato privado|pessoa@example.invalid|confirmad[ao]/i);
  }
  assert.equal((await fixture({ rpc: async () => ({ data: { id, status: "confirmada" }, error: null }) })
    .handle(request())).status, 503);
});

test("configuração local mantém RPC pública bloqueada e segredo fora do frontend", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/202610200001_appointment_intake_edge_execute.sql", import.meta.url), "utf8");
  const config = readFileSync(new URL("../../supabase/config.toml", import.meta.url), "utf8");
  const index = readFileSync(new URL("../../supabase/functions/submit-appointment-request/index.ts", import.meta.url), "utf8");
  const front = readFileSync(new URL("../../outputs/js/shared/appointment-requests.js", import.meta.url), "utf8");
  assert.match(sql, /revoke execute[\s\S]*from public, anon, authenticated/);
  assert.match(sql, /grant execute[\s\S]*to service_role/);
  for (const role of ["anon", "authenticated", "service_role"]) {
    assert.match(sql, new RegExp(`has_function_privilege\\('${role}'`));
  }
  assert.match(config, /\[functions\.submit-appointment-request\][\s\S]*verify_jwt = false/);
  assert.match(index, /withSupabase\(\{ auth: "publishable", cors: "disabled" \}/);
  assert.match(index, /request\.method === "POST" \? post\(request\) : nonPost\(request\)/);
  assert.match(index, /context\.supabaseAdmin\.schema\("public"\)\s*\.rpc\("submit_appointment_request"/);
  assert.doesNotMatch(front, /service_role|sb_secret_|rest\/v1\/rpc\/submit_appointment_request/);
});
