import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../../supabase/migrations/202609180001_integridade_de_persistencia.sql", import.meta.url),
  "utf8",
);
const readme = await readFile(new URL("../../README.md", import.meta.url), "utf8");
const sql = migration.replace(/--.*$/gm, "");

test("Supabase Auth volta a ser a única fonte de senha", () => {
  assert.match(sql, /drop function if exists public\.verify_portal_password\(text, text\)/i);
  assert.match(sql, /drop function if exists public\.set_portal_user_password\(text, text\)/i);
  assert.match(sql, /alter table public\.users\s+drop column if exists password_hash/i);
  assert.doesNotMatch(readme, /set_portal_user_password\s*\(/i);
  assert.match(readme, /Authentication[^\n]*Users/i);
});

test("comentários e contadores novos sempre apontam para um post", () => {
  assert.match(sql, /foreign key \(slug\) references public\.blog_posts \(slug\)[\s\S]*?on update cascade[\s\S]*?on delete cascade[\s\S]*?not valid/i);
  assert.match(sql, /foreign key \(post_slug\) references public\.blog_posts \(slug\)[\s\S]*?on update cascade[\s\S]*?on delete cascade[\s\S]*?not valid/i);
  assert.match(sql, /blog_post_views_post_slug_fk/i);
  assert.match(sql, /blog_comments_post_slug_fk/i);
});

test("a migration é transacional, idempotente e não apaga dados de conteúdo", () => {
  assert.match(migration, /^begin;$/m);
  assert.match(migration, /^commit;\s*$/m);
  assert.match(sql, /if not exists/i);
  assert.doesNotMatch(sql, /\bdrop\s+table\b|\btruncate\b|\bdelete\s+from\b/i);
});
