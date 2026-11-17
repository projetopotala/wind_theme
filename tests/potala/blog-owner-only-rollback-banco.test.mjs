/*
 * ROLLBACK DA APROVACAO OWNER-ONLY, executado de verdade num Postgres isolado (PGlite).
 * Prova: (1) a migration fecha RPC legada, helper e politicas para admin/Editor com can_publish;
 * (2) o rollback restaura byte a byte as definicoes e grants anteriores; (3) reaplicar a migration
 * depois do rollback e seguro; (4) textos publicados e rascunhos nao sao tocados. Nenhum banco real.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const dir = new URL("../../supabase/migrations/", import.meta.url);
const todas = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const versao = (f) => f.slice(0, 12);
const arquivo = (v) => todas.find((f) => versao(f) === v) ?? assert.fail(`migration ${v} nao encontrada`);
const sql = (f) => readFileSync(new URL(f, dir), "utf8");
const ROLLBACK = readFileSync(new URL("../../supabase/rollbacks/20261117130357_rollback_blog_owner_only_publishing.sql", import.meta.url), "utf8");
const MIGRATION = sql(arquivo("202611171303"));

const OWNER = "00000000-0000-4000-8000-0000000000a1";
const ADMIN = "00000000-0000-4000-8000-0000000000a2";
const EDITOR = "00000000-0000-4000-8000-0000000000c1";
const ANA = "00000000-0000-4000-8000-0000000000b1";

let db;
const como = async (uid) => {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid || ""]);
  await db.exec(uid ? "set role authenticated" : "set role anon");
};
const tenta = async (fn) => { try { await fn(); return null; } catch (e) { return e.code || e.message; } };
const post = (id, status = "published") => ({ id, slug: id, status, title: id, author: "Sintetico", category: "artigos", excerpt: "x", content: [{ id: "b1", type: "paragraph", text: "x" }] });
const legado = async (p) => (await db.query("select (public.save_blog_post($1::jsonb)).id as id", [JSON.stringify(p)])).rows[0].id;
const publica = async () => (await db.query("select public.has_portal_permission('blog','publish') as ok")).rows[0].ok;

/* Fotografia do que o rollback precisa restaurar. */
const fotografia = async () => {
  await db.exec("reset role");
  const funcs = (await db.query(`select p.proname, pg_get_functiondef(p.oid) as def, coalesce(p.proacl::text, '') as acl
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('has_portal_permission', 'save_blog_post') order by 1`)).rows;
  const pols = (await db.query(`select tablename, policyname, cmd, qual, with_check from pg_policies
    where schemaname = 'public' and tablename in ('blog_posts', 'blog_settings', 'blog_comments') order by 1, 2`)).rows;
  /* Fim de linha nao e semantica: a Production foi criada com CRLF; o arquivo no Git pode vir com LF ou CRLF. */
  return JSON.stringify({ funcs, pols }).replace(/\\r/g, "");
};

before(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth; create schema storage; create schema extensions;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, aud text, role text, deleted_at timestamptz, banned_until timestamptz, email_confirmed_at timestamptz, last_sign_in_at timestamptz, raw_user_meta_data jsonb default '{}', created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('teste.role', true), ''), 'anon') $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    grant usage on schema auth, storage, extensions to anon, authenticated, service_role;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, owner_id text, metadata jsonb);
    alter table storage.objects enable row level security;
    grant select, insert, update, delete on storage.objects to authenticated, service_role;
    grant select on storage.objects, storage.buckets to anon;
    create function storage.foldername(n text) returns text[] language sql as $$ select string_to_array(n,'/') $$;
  `);
  for (const f of todas.filter((nome) => versao(nome) < "202611060001")) await db.exec(sql(f));
  /* Ate a ultima migration ANTES da Owner-only (a mesma ordem do fluxo editorial). */
  for (const v of ["202611120002", "202611060003", "202611060005", "202611150001"]) await db.exec(sql(arquivo(v)));
  await db.exec(`
    insert into auth.users (id, email, aud, role) values
      ('${OWNER}', 'owner-sintetico@example.invalid', 'authenticated', 'authenticated'),
      ('${ADMIN}', 'admin-sintetico@example.invalid', 'authenticated', 'authenticated'),
      ('${EDITOR}', 'editor-sintetico@example.invalid', 'authenticated', 'authenticated'),
      ('${ANA}', 'ana-sintetica@example.invalid', 'authenticated', 'authenticated');
    insert into public.users (id, email, name, role, active) values
      ('${OWNER}', 'owner-sintetico@example.invalid', 'Owner sintetico', 'owner', true),
      ('${ADMIN}', 'admin-sintetico@example.invalid', 'Admin legado sintetico', 'admin', true);
  `);
  await como(OWNER);
  await db.query("select public.admin_set_blog_access($1, 'editor')", [EDITOR]);
  await db.query("select public.admin_set_blog_access($1, 'writer')", [ANA]);
  await db.exec("reset role");
  /* Configuracao antiga: o Editor legado carrega can_publish=true. */
  await db.query("update public.portal_module_permissions set can_publish = true where user_id = $1 and module = 'blog'", [EDITOR]);
  /* Textos que ja existiam e nao podem mudar. */
  await db.query("insert into public.blog_posts (id, slug, status, featured, published_at, document) values ('antigo-publicado','antigo-publicado','published',false,'2026-01-01',$1::jsonb), ('antigo-rascunho','antigo-rascunho','draft',false,'',$2::jsonb)", [JSON.stringify(post("antigo-publicado")), JSON.stringify(post("antigo-rascunho", "draft"))]);
});
after(async () => { await db?.close(); });

let antes, depois, aposRollback;

test("ANTES: admin legado e Editor com can_publish publicam pelo caminho legado", async () => {
  antes = await fotografia();
  await como(ADMIN);
  assert.equal(await publica(), true, "admin legado publica antes da regra nova");
  assert.equal(await tenta(() => legado(post("pelo-admin"))), null);
  await como(EDITOR);
  assert.equal(await publica(), true, "Editor com can_publish publicava antes da regra nova");
});

test("MIGRATION: so o Owner ativo publica; admin, Editor legado e Writer sao barrados no backend", async () => {
  await db.exec("reset role");
  await db.exec(MIGRATION);
  depois = await fotografia();
  assert.notEqual(antes, depois, "a migration muda helper, RPC e politicas");
  await como(OWNER);
  assert.equal(await publica(), true);
  assert.equal(await tenta(() => legado(post("pelo-owner"))), null);
  for (const uid of [ADMIN, EDITOR, ANA]) {
    await como(uid);
    assert.equal(await publica(), false, `${uid} nao publica`);
    assert.equal(await tenta(() => legado(post(`bloqueado-${uid.slice(-2)}`))), "42501", `${uid}: RPC legada recusada`);
  }
  await como(null);
  assert.equal(await tenta(() => legado(post("anonimo"))), "42501");
});

test("MIGRATION: Owner inativo, sem sessao ou sem linha em users falha fechado", async () => {
  await db.exec("reset role");
  await db.query("update public.users set active = false where id = $1", [OWNER]);
  await como(OWNER);
  assert.equal(await publica(), false, "Owner inativo nao publica (consulta a cada chamada)");
  assert.equal(await tenta(() => legado(post("owner-inativo"))), "42501");
  await db.exec("reset role");
  await db.query("update public.users set active = true where id = $1", [OWNER]);
  await como("00000000-0000-4000-8000-00000000ffff");
  assert.equal(await publica(), false, "sem linha em public.users: negado");
});

test("MIGRATION: textos antigos continuam intactos e legiveis", async () => {
  await db.exec("reset role");
  const r = (await db.query("select id, status from public.blog_posts where id in ('antigo-publicado','antigo-rascunho') order by id")).rows;
  assert.deepEqual(r.map((x) => `${x.id}:${x.status}`), ["antigo-publicado:published", "antigo-rascunho:draft"]);
  await como(ADMIN);
  const lidos = (await db.query("select id from public.blog_posts where id = 'antigo-rascunho'")).rows.length;
  assert.equal(lidos, 0, "admin legado nao le mais rascunhos alheios pela politica administrativa");
  await como(null);
  assert.equal((await db.query("select id from public.blog_posts where id = 'antigo-publicado'")).rows.length, 1, "o publico continua lendo o publicado");
});

test("ROLLBACK: restaura exatamente helper, RPC legada, grants e politicas anteriores", async () => {
  await db.exec("reset role");
  await db.exec(ROLLBACK);
  aposRollback = await fotografia();
  assert.equal(aposRollback, antes, "definicoes, ACLs e politicas identicas ao estado anterior");
  await como(ADMIN);
  assert.equal(await tenta(() => legado(post("pelo-admin-2"))), null, "admin volta a publicar, como antes");
  await como(ANA);
  assert.equal(await tenta(() => legado(post("pela-writer"))), "42501");
  await db.exec("reset role");
  const r = (await db.query("select count(*)::int as n from public.blog_posts where id in ('antigo-publicado','antigo-rascunho')")).rows[0].n;
  assert.equal(r, 2, "o rollback nao apaga textos");
});

test("REAPLICAR: a migration depois do rollback e segura e idempotente", async () => {
  await db.exec("reset role");
  await db.exec(MIGRATION);
  assert.equal(await fotografia(), depois, "mesmo resultado da primeira aplicacao");
  await db.exec(MIGRATION);
  assert.equal(await fotografia(), depois, "rodar duas vezes nao muda nada");
  await como(ADMIN);
  assert.equal(await tenta(() => legado(post("admin-de-novo"))), "42501");
});
