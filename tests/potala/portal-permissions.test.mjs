import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/202610280001_portal_module_permissions.sql", root), "utf8");
const auth = await readFile(new URL("outputs/js/admin/admin-auth.js", root), "utf8");
const adminEntry = await readFile(new URL("outputs/js/admin/admin-entry.js", root), "utf8");
const editor = await readFile(new URL("outputs/js/blog-admin/blog-editor.js", root), "utf8");

test("migration cria papel blog_editor e tabela de permissões sem autoelevação", () => {
  assert.match(migration, /blog_editor/);
  assert.match(migration, /portal_module_permissions/);
  assert.match(migration, /can_read boolean/);
  assert.match(migration, /can_edit boolean/);
  assert.match(migration, /can_publish boolean/);
  assert.match(migration, /revoke all on public\.portal_module_permissions from anon, authenticated/);
  assert.match(migration, /has_portal_permission/);
  assert.match(
    migration,
    /papel is distinct from 'blog_editor' or p_module <> 'blog'/,
    "papel ausente, inclusive de conta inativa, nunca pode alcançar o grant",
  );
});

test("RPC do Blog separa leitura, edição e publicação", () => {
  assert.match(migration, /has_portal_permission\('blog', 'read'\)/);
  assert.match(migration, /has_portal_permission\('blog', 'edit'\)/);
  assert.match(migration, /has_portal_permission\('blog', 'publish'\)/);
  assert.match(migration, /Sua conta não possui permissão de publicação/);
});

test("autenticação reconhece blog_editor e painel geral não inicializa módulos operacionais", () => {
  assert.match(auth, /\["owner", "admin", "blog_editor"\]/);
  assert.match(adminEntry, /access\.role !== "blog_editor"/);
});

test("editor do Blog bloqueia publicação e agendamento sem concessão explícita", () => {
  assert.match(editor, /ctx\.permissoes\?\.publicar === false/);
  assert.match(editor, /não publicar ou agendar textos/);
});

