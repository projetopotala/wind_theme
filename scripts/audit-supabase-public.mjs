import { pathToFileURL } from "node:url";

import { SUPABASE_CONFIG } from "../outputs/js/supabase/config.js";

const PUBLIC_READS = [
  ["home_blocks publicado", "/rest/v1/home_blocks?select=id&published=eq.true&limit=1"],
  ["blog_posts publicado", "/rest/v1/blog_posts?select=id&status=eq.published&limit=1"],
  ["blog_settings público", "/rest/v1/blog_settings?select=id&limit=1"],
  ["comentários aprovados", "/rest/v1/blog_comments?select=id&status=eq.approved&limit=1"],
  ["configuração do Auth", "/auth/v1/settings"],
];

const PRIVATE_READS = [
  ["profiles privado", "/rest/v1/profiles?select=id&limit=1"],
  ["saved_items privado", "/rest/v1/saved_items?select=id&limit=1"],
  ["rascunhos privados", "/rest/v1/home_block_drafts?select=id&limit=1"],
  ["users privado", "/rest/v1/users?select=id&limit=1"],
  ["op_records privado", "/rest/v1/op_records?select=id&limit=1"],
];

async function request(fetchImpl, base, key, path, options = {}) {
  try {
    const response = await fetchImpl(`${base}${path}`, {
      method: options.method || "GET",
      headers: {
        apikey: key,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body };
  } catch (error) {
    return { status: 0, body: {}, error };
  }
}

/**
 * Verifica somente a superfície anônima. Não usa credencial de usuário e não
 * chama nenhuma RPC de escrita, portanto pode rodar contra o projeto real.
 */
export async function runPublicDatabaseAudit({
  config = SUPABASE_CONFIG,
  fetchImpl = globalThis.fetch,
  log = console.log,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetch indisponível");
  if (!config?.url || !config?.publishableKey) throw new TypeError("Configuração publicável do Supabase ausente");

  const base = String(config.url).replace(/\/$/, "");
  const checks = [];

  for (const [name, path] of PUBLIC_READS) {
    const result = await request(fetchImpl, base, config.publishableKey, path);
    checks.push({ name, kind: "public", ok: result.status === 200, status: result.status, code: result.body?.code || "" });
  }

  for (const [name, path] of PRIVATE_READS) {
    const result = await request(fetchImpl, base, config.publishableKey, path);
    checks.push({ name, kind: "private", ok: [401, 403].includes(result.status), status: result.status, code: result.body?.code || "" });
  }

  const snapshot = await request(fetchImpl, base, config.publishableKey, "/rest/v1/rpc/op_snapshot", { method: "POST", body: {} });
  checks.push({ name: "op_snapshot exige admin", kind: "private", ok: [401, 403].includes(snapshot.status), status: snapshot.status, code: snapshot.body?.code || "" });

  for (const check of checks) {
    log(`${check.ok ? "OK" : "FALHA"}  ${check.name}  HTTP ${check.status}${check.code ? ` (${check.code})` : ""}`);
  }
  const ok = checks.every((check) => check.ok);
  log(ok ? "Auditoria pública aprovada." : "Auditoria pública encontrou exposição ou indisponibilidade.");
  return { ok, checks };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const report = await runPublicDatabaseAudit();
  if (!report.ok) process.exitCode = 1;
}
