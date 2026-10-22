import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const MIGRATION = new URL(
  "../../supabase/migrations/202610210001_authenticated_appointment_requests.sql",
  import.meta.url
);

async function obterFuncao() {
  const sql = await readFile(MIGRATION, "utf8");
  const inicio = sql.indexOf(
    "create function public.submit_authenticated_appointment_request("
  );

  assert.ok(inicio >= 0, "RPC autenticada deve existir");

  return sql.slice(inicio);
}

test("F3.2 exige e-mail confirmado no servidor", async () => {
  const sql = await obterFuncao();

  assert.match(
    sql,
    /if not exists\s*\(\s*select 1 from auth\.users as usuario\s*where usuario\.id = requester_id\s*and usuario\.email_confirmed_at is not null\s*\)\s*then/i
  );

  const verificacao = sql.indexOf("usuario.email_confirmed_at is not null");
  const persistencia = sql.indexOf(
    "receipt := public.submit_appointment_request("
  );

  assert.ok(verificacao >= 0);
  assert.ok(persistencia > verificacao);
});

test("F3.2 compara modalidade com oferta no servidor", async () => {
  const sql = await obterFuncao();

  assert.match(
    sql,
    /if p_modality is distinct from coalesce\s*\(\s*offering\.document ->> 'mode',\s*'presencial'\s*\)\s*then/i
  );

  const verificacao = sql.indexOf("if p_modality is distinct from");
  const persistencia = sql.indexOf(
    "receipt := public.submit_appointment_request("
  );

  assert.ok(verificacao >= 0);
  assert.ok(persistencia > verificacao);
});