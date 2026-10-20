import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = relative => readFileSync(path.join(root, relative), "utf8");

test("driver inclui somente guarda, bootstrap, migration e testes aprovados", () => {
  const lines = read("tests/sql/appointment-f224-phase.psql").trim().split(/\r?\n/);
  assert.deepEqual(lines, [
    "\\set ON_ERROR_STOP on",
    "\\ir appointment-f224-guard.sql",
    "\\ir appointment-f224-bootstrap.sql",
    "\\ir ../../supabase/migrations/202610160001_appointment_requests.sql",
    "\\ir appointment-f224-guard.sql",
    "\\ir appointment-f224-fixtures.sql",
    "\\ir appointment-f224-guard.sql",
    "\\ir appointment-f224-verify.sql",
    "\\ir appointment-f224-guard.sql",
    "\\ir appointment-f224-volume.sql",
  ]);
  for (const name of ["concurrency-a", "concurrency-b", "concurrency-final"]) {
    const driver = read(`tests/sql/appointment-f224-${name}.psql`);
    assert.match(driver, /^\\set ON_ERROR_STOP on\r?\n\\ir appointment-f224-guard.sql\r?\n/);
    assert.doesNotMatch(driver, /\\(?:connect|c|include|i(?!r)|!|copy|gexec)\b/i);
  }
});

test("executor fixa hash da migration e de todos os auxiliares SQL", () => {
  const script = read("scripts/run-appointment-homologation.ps1");
  const files = ["bootstrap.sql", "concurrency-a.psql", "concurrency-b.psql", "concurrency-final.psql",
    "fixtures.sql", "guard.sql", "phase.psql", "verify.sql", "volume.sql"];
  for (const suffix of files) {
    const file = `appointment-f224-${suffix}`;
    const hash = createHash("sha256").update(readFileSync(path.join(root, "tests/sql", file))).digest("hex").toUpperCase();
    assert.ok(script.includes(`'${file}' = '${hash}'`), `Hash ausente ou antigo: ${file}`);
  }
  const hash = createHash("sha256").update(readFileSync(path.join(root, "supabase/migrations/202610160001_appointment_requests.sql"))).digest("hex").toUpperCase();
  assert.ok(script.includes(`'${hash}'`));
  assert.match(script, /if \(\$exists -ne '0'\) \{ throw/);
  assert.match(script, /-X -w -v ON_ERROR_STOP=1/);
  assert.match(script, /\$env:PGOPTIONS = '-c statement_timeout=30s -c lock_timeout=3s'/);
  assert.match(script, /\$LASTEXITCODE -ne 0 -or \$psqlVersion/);
  assert.match(script, /Remove-Job -Job \$job -Force/);
  assert.match(script, /database=\(select oid from pg_database where datname=current_database\(\)\)/);
  assert.match(script, /rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or rolreplication/);
  assert.match(script, /if \(\$unsafeRoles -ne '0'\) \{ throw/);
  assert.doesNotMatch(script, /DROP DATABASE|db reset|service_role|gotrumwuimpoeggwamut/i);
});

test("flags de produção continuam desligadas", () => {
  const flags = read("outputs/js/appointments/config.js");
  assert.match(flags, /APPOINTMENT_REQUESTS_ENABLED = false/);
  assert.match(flags, /APPOINTMENT_ADMIN_ENABLED = false/);
});

test("laboratório exige RPC pública bloqueada e mantém lógica positiva somente no banco isolado", () => {
  const migration = read("supabase/migrations/202610160001_appointment_requests.sql");
  const verify = read("tests/sql/appointment-f224-verify.sql");
  assert.match(migration, /revoke execute on function public\.submit_appointment_request\(uuid,text,text,text,text,text,date,text\) from public, anon, authenticated;\s*commit;/);
  assert.match(verify, /has_function_privilege\('anon',[\s\S]*?'EXECUTE'\)/);
  assert.match(verify, /has_function_privilege\('authenticated',[\s\S]*?'EXECUTE'\)/);
  assert.match(verify, /a\.grantee = 0 and a\.privilege_type = 'EXECUTE'/);
  assert.match(verify, /Visitante executou a RPC bloqueada/);
  assert.match(verify, /Usuário autenticado executou a RPC bloqueada/);
  for (const name of ["fixtures.sql", "volume.sql", "concurrency-a.psql", "concurrency-b.psql", "concurrency-final.psql"]) {
    assert.doesNotMatch(read(`tests/sql/appointment-f224-${name}`), /set local role anon;/i);
  }
  assert.match(read("tests/sql/appointment-f224-fixtures.sql"), /select public\.submit_appointment_request\(/);
  assert.match(read("tests/sql/appointment-f224-concurrency-b.psql"), /sqlstate 'PT429'/);
});
