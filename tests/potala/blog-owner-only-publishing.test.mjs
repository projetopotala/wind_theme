import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { permissoesDaSessao, podePublicar } from "../../outputs/js/blog-admin/mesa-modelo.js";

const ler = (caminho) => readFileSync(new URL(`../../${caminho}`, import.meta.url), "utf8");
const migration = ler("supabase/migrations/20261117130357_blog_owner_only_publishing.sql");
const rollback = ler("supabase/rollbacks/20261117130357_rollback_blog_owner_only_publishing.sql");

test("migration reserva publicacao ao Owner ativo e fecha o caminho legado", () => {
  assert.match(migration, /where u\.id = \(select auth\.uid\(\)\) and u\.active = true/);
  assert.match(migration, /p_module = 'blog' and p_action = 'publish'[\s\S]*return coalesce\(papel = 'owner', false\)/);
  assert.match(migration, /save_blog_post[\s\S]*has_portal_permission\('blog', 'publish'\)/);
  assert.match(migration, /Somente o Owner pode publicar no Blog/);
  assert.doesNotMatch(migration, /insert into public\.users|update public\.users|delete from public\.users/);
});

test("migration protege politicas administrativas com a mesma decisao Owner-only", () => {
  for (const politica of [
    "administracao le todos os textos",
    "administracao apaga textos",
    "administracao altera a configuracao do blog",
    "administracao le todos os comentarios",
    "administracao modera comentarios",
    "administracao apaga comentarios",
  ]) assert.match(migration, new RegExp(politica));
  assert.doesNotMatch(migration, /is_portal_admin\(\)/);
});

test("rollback e executavel e restaura helper, RPC legada, grants e politicas", () => {
  assert.match(rollback, /papel in \('owner', 'admin'\)/);
  assert.match(rollback, /create or replace function public\.save_blog_post\(post jsonb\)/);
  assert.match(rollback, /if not public\.is_portal_admin\(\)/);
  assert.match(rollback, /grant execute on function public\.save_blog_post\(jsonb\) to authenticated/);
  assert.match(rollback, /administracao le todos os textos[\s\S]*is_portal_admin\(\)/);
});

test("frontend falha fechado: Owner publica; admin, Editor legado e permissoes vazias nao", () => {
  assert.equal(podePublicar(permissoesDaSessao({ role: "owner", user: { id: "o" } })), true);
  assert.equal(podePublicar(permissoesDaSessao({ role: "admin", user: { id: "a" } })), false);
  assert.equal(podePublicar(permissoesDaSessao({
    role: "blog_editor", user: { id: "e" }, permissions: { read: true, edit: true, publish: true },
  })), false);
  assert.equal(podePublicar(undefined), false);
  assert.equal(podePublicar({}), false);
});

test("acoes privilegiadas programaticas usam a guarda central", () => {
  const editor = ler("outputs/js/blog-admin/blog-editor.js");
  assert.match(editor, /\["publicar", "agendar", "despublicar", "arquivar"\]\.includes\(acao\) && !podePublicar\(ctx\.permissoes\)/);
  assert.match(editor, /Somente o Owner pode executar ações de publicação/);
});
