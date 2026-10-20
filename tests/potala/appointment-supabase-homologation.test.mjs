import test from "node:test";
import assert from "node:assert/strict";
import { HOMOLOG_PROJECT_REF, validateDestination, runHttpChecks, signInTestUser } from "../../scripts/run-appointment-supabase-homologation.mjs";

const ref = HOMOLOG_PROJECT_REF;
const valid = { POTALA_HOMOLOG_PROJECT_REF: ref,
  POTALA_HOMOLOG_URL: `https://${ref}.supabase.co/`,
  POTALA_HOMOLOG_PUBLISHABLE_KEY: "sb_publishable_test",
  POTALA_HOMOLOG_CONFIRM_REF: ref };

test("recusa produção, destino inconsistente e confirmação ausente", () => {
  assert.throws(() => validateDestination({ ...valid, POTALA_HOMOLOG_PROJECT_REF: "gotrumwuimpoeggwamut" }, true));
  assert.throws(() => validateDestination({ ...valid, POTALA_HOMOLOG_PROJECT_REF: "abcdefghijklmnopqrst",
    POTALA_HOMOLOG_URL: "https://abcdefghijklmnopqrst.supabase.co/",
    POTALA_HOMOLOG_CONFIRM_REF: "abcdefghijklmnopqrst" }, true));
  assert.throws(() => validateDestination({ ...valid, POTALA_HOMOLOG_URL: "https://outro.supabase.co/" }, true));
  assert.throws(() => validateDestination({ ...valid, POTALA_HOMOLOG_CONFIRM_REF: "" }, true));
  assert.throws(() => validateDestination({ ...valid, POTALA_HOMOLOG_URL: "http://127.0.0.1/" }, true));
  assert.throws(() => validateDestination({ ...valid, POTALA_HOMOLOG_URL: `https://user:pass@${ref}.supabase.co/` }, true));
});

test("aceita somente referência explícita de projeto isolado", () => {
  assert.equal(validateDestination(valid, true).ref, ref);
});

test("Auth rejeitado interrompe antes de qualquer POST", async () => {
  const token = sub => `e30.${Buffer.from(JSON.stringify({ iss: `https://${ref}.supabase.co/auth/v1`,
    role: "authenticated", sub, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.sig`;
  const env = { ...valid, POTALA_HOMOLOG_ADMIN_JWT: token("admin"),
    POTALA_HOMOLOG_ORDINARY_JWT: token("ordinary"), POTALA_HOMOLOG_INACTIVE_JWT: token("inactive") };
  const methods = [];
  await assert.rejects(runHttpChecks(env, async (_url, options) => {
    methods.push(options.method);
    return { ok: false, status: 401, text: async () => "" };
  }), /Auth real/);
  assert.deepEqual(methods, ["GET"]);
});

test("login de teste exige token e identidade correspondentes antes da homologação", async () => {
  const url = `https://${ref}.supabase.co`;
  const email = "teste@example.invalid";
  const jwt = "token-de-teste";
  const calls = [];
  const mock = async (target, options) => {
    calls.push({ target, method: options.method, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ access_token: jwt, user: { email } }) };
  };
  assert.equal(await signInTestUser(url, "sb_publishable_test", email, "senha-ficticia", mock), jwt);
  assert.deepEqual(calls, [{ target: `${url}/auth/v1/token?grant_type=password`, method: "POST",
    body: { email, password: "senha-ficticia" } }]);
  await assert.rejects(signInTestUser(url, "sb_publishable_test", email, "senha-ficticia",
    async () => ({ ok: true, json: async () => ({ access_token: jwt, user: { email: "outro@example.invalid" } }) })),
  /Falha no login/);
});
