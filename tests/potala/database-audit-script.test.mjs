import assert from "node:assert/strict";
import test from "node:test";

import { runPublicDatabaseAudit } from "../../scripts/audit-supabase-public.mjs";

const config = { url: "https://portal.example", publishableKey: "sb_publishable_test" };

function fakeFetch({ exposePrivate = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    const path = new URL(url).pathname;
    const isPrivate = ["/rest/v1/profiles", "/rest/v1/saved_items", "/rest/v1/home_block_drafts", "/rest/v1/users", "/rest/v1/op_records"].includes(path)
      || path === "/rest/v1/rpc/op_snapshot";
    if (isPrivate && !exposePrivate) return { ok: false, status: 401, json: async () => ({ code: "42501" }) };
    return { ok: true, status: 200, json: async () => (path.includes("settings") ? { external: { email: true } } : []) };
  };
  return { calls, fetchImpl };
}

test("a auditoria pública prova leitura prevista e negação privada sem imprimir a chave", async () => {
  const fake = fakeFetch();
  const lines = [];
  const report = await runPublicDatabaseAudit({ config, fetchImpl: fake.fetchImpl, log: (line) => lines.push(line) });

  assert.equal(report.ok, true);
  assert.ok(report.checks.some((check) => check.name === "profiles privado" && check.ok));
  assert.ok(report.checks.some((check) => check.name === "home_blocks publicado" && check.ok));
  assert.ok(fake.calls.every((call) => call.options.headers.apikey === config.publishableKey));
  assert.doesNotMatch(lines.join("\n"), /sb_publishable_test/);
  assert.ok(fake.calls.filter((call) => call.options.method === "POST").every((call) => call.url.endsWith("/rpc/op_snapshot")), "não executa RPC de escrita");
});

test("a auditoria falha se uma tabela privada responder ao anônimo", async () => {
  const report = await runPublicDatabaseAudit({ config, fetchImpl: fakeFetch({ exposePrivate: true }).fetchImpl, log: () => {} });
  assert.equal(report.ok, false);
  assert.ok(report.checks.some((check) => check.kind === "private" && !check.ok));
});
