import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/202609020001_portal_home_content.sql",
  import.meta.url,
);

test("migração protege conteúdo e administração por RLS", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /create table if not exists public\.home_blocks/i);
  assert.match(sql, /create table if not exists public\.admin_users/i);
  assert.equal((sql.match(/enable row level security/gi) || []).length, 2);
  assert.match(sql, /create policy "public can read published home blocks"[\s\S]*to anon[\s\S]*published/i);
  assert.match(sql, /replace_home_blocks\s*\(payload jsonb\)/i);
  assert.match(sql, /auth\.uid\(\)/i);
  assert.doesNotMatch(sql, /sb_secret_|sb_publishable_|service_role/i);
});

test("migração é expansiva e não destrói tabelas", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.doesNotMatch(sql, /drop\s+(table|schema|type)/i);
  assert.doesNotMatch(sql, /truncate/i);
  assert.match(sql, /on conflict \(id\) do nothing/i);
});

test("escrita em lote exige administrador e ocorre em uma RPC", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /if not public\.is_portal_admin\(\) then/i);
  assert.match(sql, /raise exception 'portal_admin_required'/i);
  assert.match(sql, /jsonb_to_recordset\(payload\)/i);
  assert.match(sql, /delete from public\.home_blocks/i);
  assert.match(sql, /insert into public\.home_blocks/i);
  assert.match(sql, /on conflict \(id\) do update/i);
});
