import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const raiz = new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const lerSql = (nome) => readFileSync(join(raiz, "supabase/migrations", nome), "utf8");
const semComentarios = (sql) => sql.replace(/--.*$/gm, "");

function arquivos(dir, extensoes) {
  const saida = [];
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === "vendor" || nome.startsWith(".")) continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) saida.push(...arquivos(caminho, extensoes));
    else if (extensoes.some((e) => nome.endsWith(e))) saida.push(caminho);
  }
  return saida;
}
const rel = (c) => relative(raiz, c).replaceAll("\\", "/");

const MIGRATION = "202611060004_remove_legacy_portal_password.sql";

test("migration remove as duas funcoes legadas e a coluna, sem conceder nada", () => {
  const codigo = semComentarios(lerSql(MIGRATION));
  assert.match(codigo, /drop function if exists public\.verify_portal_password\(text, text\)/i);
  assert.match(codigo, /drop function if exists public\.set_portal_user_password\(text, text\)/i);
  assert.match(codigo, /alter table public\.users\s+drop column if exists password_hash/i);
  assert.doesNotMatch(codigo, /\bgrant\b/i);
  assert.doesNotMatch(codigo, /drop table|truncate|delete from|drop schema/i);
  assert.match(codigo, /^\s*begin;/im);
  assert.match(codigo, /^\s*commit;/im);
});

test("migration aborta se outra funcao passar a depender dos itens legados", () => {
  const codigo = semComentarios(lerSql(MIGRATION));
  assert.match(codigo, /prosrc ilike '%password_hash%'/i);
  assert.match(codigo, /raise exception/i);
});

test("nenhum codigo ativo referencia a autenticacao legada", () => {
  const alvos = ["outputs", "supabase/functions", "scripts", "src"]
    .map((d) => join(raiz, d))
    .flatMap((d) => { try { return arquivos(d, [".js", ".mjs", ".ts", ".tsx", ".html", ".ps1"]); } catch { return []; } });
  const achados = alvos.filter((f) => /set_portal_user_password|verify_portal_password|password_hash/.test(readFileSync(f, "utf8")));
  assert.deepEqual(achados.map(rel), []);
});

test("o navegador so le users e portal_module_permissions", () => {
  const js = arquivos(join(raiz, "outputs/js"), [".js"]);
  for (const f of js) {
    const texto = readFileSync(f, "utf8");
    assert.doesNotMatch(
      texto,
      /from\(\s*["'](users|portal_module_permissions|admin_users)["']\s*\)\s*\.\s*(insert|update|upsert|delete)/,
      `${rel(f)} escreve em tabela de permissoes`,
    );
  }
});

test("nenhuma migration a partir da 0001 de 06/11 escreve em users ou concede escrita a clientes", () => {
  const novas = readdirSync(join(raiz, "supabase/migrations")).filter((n) => n >= "202611060001" && n.endsWith(".sql"));
  assert.ok(novas.length >= 4);
  for (const nome of novas) {
    if (nome === MIGRATION) continue;
    const codigo = semComentarios(lerSql(nome));
    assert.doesNotMatch(codigo, /(insert\s+into|update|delete\s+from)\s+(public\.)?users\b/i, `${nome} escreve em users`);
    assert.doesNotMatch(codigo, /(insert\s+into|update|delete\s+from)\s+(public\.)?portal_module_permissions\b/i, `${nome} escreve em permissoes`);
    assert.doesNotMatch(codigo, /role\s*=\s*'(owner|admin)'\s*(,|where|;)/i, `${nome} atribui papel administrativo`);
  }
});

test("grants sobre public.users para anon/authenticated sao somente leitura", () => {
  const todas = readdirSync(join(raiz, "supabase/migrations")).filter((n) => n.endsWith(".sql"));
  for (const nome of todas) {
    const codigo = semComentarios(lerSql(nome));
    for (const m of codigo.matchAll(/grant\s+([^;]*?)\s+on\s+(?:table\s+)?public\.users\s+to\s+([^;]*);/gi)) {
      if (!/anon|authenticated/i.test(m[2])) continue;
      assert.match(m[1].trim(), /^select\b/i, `${nome}: grant em users alem de select (${m[1]})`);
    }
  }
});

test("as RPCs de administracao de contas nao alteram papeis nem promovem owner", () => {
  for (const nome of ["202611060002_admin_list_accounts.sql", "202611060003_admin_professional_links.sql"]) {
    const codigo = semComentarios(lerSql(nome));
    assert.match(codigo, /is_portal_admin\(\)/);
    assert.doesNotMatch(codigo, /public\.users\b[^;]*\b(role|active)\s*=/i);
    assert.doesNotMatch(codigo, /insert\s+into\s+public\.users/i);
  }
});
