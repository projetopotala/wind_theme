import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(
  new URL("../../supabase/migrations/202609080004_portal_users.sql", import.meta.url),
  "utf8",
);

test("a tabela users guarda o cadastro administrativo e a função lê dela", () => {
  assert.match(sql, /create table if not exists public\.users/i);
  assert.match(sql, /id uuid primary key references auth\.users/i);
  assert.match(sql, /role text not null check \(role in \('owner', 'admin'\)\)/i);
  assert.match(sql, /active boolean not null default true/i);
  assert.match(sql, /from public\.users/i);
  assert.match(sql, /active = true/i);
  assert.match(sql, /enable row level security/i);
  assert.doesNotMatch(sql, /drop\s+table/i);
  assert.doesNotMatch(sql, /sb_secret_|sb_publishable_|service_role/i);
});
