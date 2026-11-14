import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

/*
 * PERMISSOES DO BLOG, NO BANCO, COM IDENTIDADES SINTETICAS.
 *
 * Aplica TODAS as migrations versionadas (inclusive 202611060005) num Postgres em memoria
 * (PGlite) e executa o teste comportamental supabase/tests/prod-03-blog-permissions.sql:
 * Owner concede e revoga; Escritor so mexe no proprio texto e nao publica; Editor publica;
 * contas administrativas permanecem intactas; nada depende do frontend.
 * Nao toca em LAB nem em Production: tudo acontece em memoria.
 */
const migrations = new URL("../../supabase/migrations/", import.meta.url);

async function bancoComTodasAsMigrations() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth; create schema storage; create schema extensions;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, aud text, role text, deleted_at timestamptz, banned_until timestamptz, email_confirmed_at timestamptz, last_sign_in_at timestamptz, raw_user_meta_data jsonb default '{}', created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
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
  const arquivos = readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort();
  for (const arquivo of arquivos) await db.exec(readFileSync(new URL(arquivo, migrations), "utf8"));
  return { db, total: arquivos.length };
}

const OWNER = "00000000-0000-4000-8000-0000000000a1";
const ESCRITORA = "00000000-0000-4000-8000-0000000000b1";
const OUTRA = "00000000-0000-4000-8000-0000000000b2";
const EDITOR = "00000000-0000-4000-8000-0000000000c1";
const ID_DO_TEXTO = "demonstracao-fluxo-b";

test("FLUXO B no banco: rascunho, revisao, publicacao, leitura publica e perfil, com revogacao", async () => {
  const { db } = await bancoComTodasAsMigrations();
  const como = async (uid) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
    await db.exec("set role authenticated");
  };
  const comoVisitante = async () => { await db.exec("reset role"); await db.exec("set role anon"); };
  const tenta = async (fn) => { try { await fn(); return null; } catch (erro) { return erro.code || erro.message; } };
  const salvar = (acao, extra = {}) => db.query(
    "select public.mesa_salvar_post($1::jsonb, $2) as r",
    [JSON.stringify({ id: ID_DO_TEXTO, slug: ID_DO_TEXTO, title: "Texto de demonstracao do fluxo B", author: "Ana Teste (demonstracao)", category: "artigos", excerpt: "Resumo.", content: [{ id: "b1", type: "paragraph", text: "Corpo sintetico." }], ...extra }), acao],
  );
  const publicos = async () => { await comoVisitante(); return (await db.query("select id, status, document->>'author' as autor from public.blog_posts order by id")).rows; };

  await db.exec("reset role");
  await db.exec(`
    insert into auth.users (id, email, aud, role) values
      ('${OWNER}', 'owner-sintetico@example.invalid', 'authenticated', 'authenticated'),
      ('${ESCRITORA}', 'ana-teste@example.invalid', 'authenticated', 'authenticated'),
      ('${OUTRA}', 'outra-teste@example.invalid', 'authenticated', 'authenticated'),
      ('${EDITOR}', 'editor-teste@example.invalid', 'authenticated', 'authenticated');
    insert into public.users (id, email, name, role, active) values
      ('${OWNER}', 'owner-sintetico@example.invalid', 'Owner sintetico', 'owner', true);
    -- Escritoras e editor sao contas COMUNS (so auth.users): public.users guarda apenas owner/admin.
  `);
  const antes = (await publicos()).filter((l) => l.id !== ID_DO_TEXTO);
  assert.ok(antes.length >= 20 && antes.every((l) => l.status === "published"), "textos legados publicados");

  // 1. Quem concede e o Owner; nunca para papel administrativo.
  await como(ESCRITORA);
  assert.equal(await tenta(() => db.query("select public.admin_set_blog_access($1, 'writer')", [OUTRA])), "42501");
  await como(OWNER);
  await db.query("select public.admin_set_blog_access($1, 'writer')", [ESCRITORA]);
  await db.query("select public.admin_set_blog_access($1, 'writer')", [OUTRA]);
  await db.query("select public.admin_set_blog_access($1, 'editor')", [EDITOR]);

  // 2. Escritora salva rascunho: o visitante nao ve.
  await como(ESCRITORA);
  assert.equal((await salvar("rascunho")).rows[0].r.status, "draft");
  assert.ok(!(await publicos()).some((l) => l.id === ID_DO_TEXTO), "rascunho invisivel ao visitante");

  // 3. Outra escritora nao ve nem altera o rascunho alheio.
  await como(OUTRA);
  assert.equal(await tenta(() => salvar("rascunho", { title: "Invasao" })), "42501");
  const listaOutra = (await db.query("select public.mesa_listar_posts() as l")).rows[0].l;
  assert.ok(!JSON.stringify(listaOutra).includes(ID_DO_TEXTO), "rascunho alheio fora da lista da outra escritora");

  // 4. Escritora envia para revisao e NAO consegue publicar.
  await como(ESCRITORA);
  assert.equal((await salvar("revisao")).rows[0].r.status, "review");
  assert.equal(await tenta(() => salvar("publicar")), "42501");
  assert.ok(!(await publicos()).some((l) => l.id === ID_DO_TEXTO), "em revisao continua invisivel");

  // 5. Editor ve na fila e publica; so entao o visitante ve, com a autoria correta.
  await como(EDITOR);
  const fila = (await db.query("select public.mesa_listar_posts() as l")).rows[0].l;
  assert.match(JSON.stringify(fila), new RegExp(ID_DO_TEXTO));
  assert.equal((await salvar("publicar")).rows[0].r.status, "published");
  const depois = await publicos();
  const publicado = depois.find((l) => l.id === ID_DO_TEXTO);
  assert.equal(publicado?.status, "published");
  assert.equal(publicado.autor, "Ana Teste (demonstracao)");
  // Perfil do escritor: a pagina agrupa os textos publicados pela assinatura.
  assert.equal(depois.filter((l) => l.autor === "Ana Teste (demonstracao)").length, 1);

  // 6. Textos legados intactos.
  const legados = depois.filter((l) => l.id !== ID_DO_TEXTO);
  assert.deepEqual(legados, antes);

  // 7. Revogacao: o Owner retira o acesso e a escritora perde a escrita na chamada seguinte.
  await como(OWNER);
  await db.query("select public.admin_set_blog_access($1, 'none')", [ESCRITORA]);
  await como(ESCRITORA);
  assert.equal(await tenta(() => salvar("rascunho", { title: "Depois da revogacao" })), "42501");

  // 8. Nenhuma conta administrativa nova surgiu.
  await db.exec("reset role");
  const admins = (await db.query("select email from public.users where role in ('owner','admin') and active order by email")).rows.map((l) => l.email);
  assert.deepEqual(admins, ["owner-sintetico@example.invalid"]);
  await db.close();
});

test("todas as migrations aplicam em ordem, e o teste de permissoes do Blog passa com identidades sinteticas", async () => {
  const { db, total } = await bancoComTodasAsMigrations();
  assert.ok(total >= 40);
  const teste = readFileSync(new URL("../../supabase/tests/prod-03-blog-permissions.sql", import.meta.url), "utf8");
  await db.exec("begin");
  try {
    // Owner SINTETICO, so em memoria: o teste exige uma conta owner ativa, como em qualquer ambiente real.
    await db.exec(`
      insert into auth.users (id, email, aud, role, raw_user_meta_data) values ('00000000-0000-4000-8000-0000000000a1', 'owner-sintetico@example.invalid', 'authenticated', 'authenticated', '{}');
      insert into public.users (id, email, name, role, active) values ('00000000-0000-4000-8000-0000000000a1', 'owner-sintetico@example.invalid', 'Owner sintetico', 'owner', true);
    `);
    await db.exec(teste);
  } finally {
    await db.exec("rollback");
    await db.close();
  }
});
