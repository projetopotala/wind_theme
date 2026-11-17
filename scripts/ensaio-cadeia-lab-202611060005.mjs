/*
 * ENSAIO DA CADEIA 202611060003 -> 202611060005 NUM POSTGRES ISOLADO (PGlite, em memória).
 *
 * Reproduz a ORDEM REAL do LAB hmspabllgxqfzzricijv: tudo até 202611050000, depois a
 * 202611120002 (já aplicada lá, fora de ordem), e só então 202611060003 e 202611060005.
 * Não aplica 202611060001, 202611060002, 202611060004, 202611100001 nem as posteriores
 * (ausentes ou desconhecidas no LAB). Não toca em nenhum banco real.
 *
 * Uso: node scripts/ensaio-cadeia-lab-202611060005.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const dir = new URL("../supabase/migrations/", import.meta.url);
const todas = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const versao = (f) => f.slice(0, 12);
const arquivo = (v) => todas.find((f) => versao(f) === v) ?? assert.fail(`migration ${v} não encontrada`);
const sql = (f) => readFileSync(new URL(f, dir), "utf8");
const semTransacao = (texto) => texto.replace(/^\s*begin;\s*$/gim, "").replace(/^\s*commit;\s*$/gim, "");

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

const instantaneo = async () => {
  const f = (await db.query("select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public'")).rows.map((r) => r.n);
  const t = (await db.query("select tgname || ' em ' || tgrelid::regclass::text as n from pg_trigger where not tgisinternal")).rows.map((r) => r.n);
  const tb = (await db.query("select table_name as n from information_schema.tables where table_schema = 'public'")).rows.map((r) => r.n);
  const pol = (await db.query("select schemaname || '.' || tablename || ':' || policyname as n from pg_policies")).rows.map((r) => r.n);
  return { funcoes: new Set(f), gatilhos: new Set(t), tabelas: new Set(tb), politicas: new Set(pol) };
};
const diferenca = (a, b) => Object.fromEntries(Object.keys(a).map((k) => [k, [...b[k]].filter((x) => !a[k].has(x)).sort()]));
const mostrar = (titulo, d) => {
  console.log(`\n${titulo}`);
  for (const [k, v] of Object.entries(d)) if (v.length) console.log(`  ${k}: ${v.join("; ")}`);
};

// 1. Estado de partida do LAB: tudo antes de 202611060001 + 202611120002.
const base = todas.filter((f) => versao(f) < "202611060001");
for (const f of base) await db.exec(sql(f));
await db.exec(sql(arquivo("202611120002")));
const s0 = await instantaneo();
console.log(`Estado de partida: ${base.length} migrations até 202611050000 + 202611120002 (ordem do LAB).`);
assert.equal(s0.tabelas.has("admin_access_events"), false, "partida sem admin_access_events, como no LAB");
assert.equal(s0.funcoes.has("blog_access_level(p_user_id uuid)"), false, "partida sem blog_access_level, como no LAB");

// 2. Dry-run: 060003 + 060005 numa transação que termina em rollback não deixa nada.
await db.exec(`begin; ${semTransacao(sql(arquivo("202611060003")))} ${semTransacao(sql(arquivo("202611060005")))} rollback;`);
const sDry = await instantaneo();
assert.deepEqual(diferenca(s0, sDry), { funcoes: [], gatilhos: [], tabelas: [], politicas: [] });
console.log("\nDRY-RUN (060003 + 060005 com rollback): nenhuma alteração restou. OK");

// 3. 060005 sozinha falha e reverte (é o bloqueio do LAB).
let erroSozinha = null;
try { await db.exec(sql(arquivo("202611060005"))); } catch (e) { erroSozinha = e.message; }
await db.exec("rollback").catch(() => {}); // a sessão fica em transação abortada; um cliente real descarta a sessão
assert.ok(erroSozinha, "060005 sem a 060003 deveria falhar");
const sFalha = await instantaneo();
assert.deepEqual(diferenca(s0, sFalha), { funcoes: [], gatilhos: [], tabelas: [], politicas: [] });
console.log(`\n060005 SOZINHA: falha como esperado (${erroSozinha.slice(0, 90)}) e não deixa resíduo. OK`);

// 4. Cadeia mínima real: 060003, depois 060005.
await db.exec(sql(arquivo("202611060003")));
const s1 = await instantaneo();
mostrar("EFEITOS DA 202611060003 (objetos novos):", diferenca(s0, s1));
await db.exec(sql(arquivo("202611060005")));
const s2 = await instantaneo();
mostrar("EFEITOS DA 202611060005 (objetos novos sobre a 060003):", diferenca(s1, s2));

// 5. Segurança: ninguém ganha papel administrativo; escritora/editor com limites; revogação vale na hora.
const OWNER = "00000000-0000-4000-8000-0000000000a1";
const ESCRITORA = "00000000-0000-4000-8000-0000000000b1";
const EDITOR = "00000000-0000-4000-8000-0000000000c1";
await db.exec("reset role");
await db.exec(`
  insert into auth.users (id, email, aud, role) values
    ('${OWNER}', 'owner-sintetico@example.invalid', 'authenticated', 'authenticated'),
    ('${ESCRITORA}', 'escritora-lab@example.invalid', 'authenticated', 'authenticated'),
    ('${EDITOR}', 'editor-lab@example.invalid', 'authenticated', 'authenticated');
  insert into public.users (id, email, name, role, active) values ('${OWNER}', 'owner-sintetico@example.invalid', 'Owner sintetico', 'owner', true);
`);
const administrativos = async () => (await db.query("select count(*)::int n from public.users where role in ('owner','admin')")).rows[0].n;
const adminAntes = await administrativos();
const como = async (uid) => { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]); await db.exec("set role authenticated"); };
const tenta = async (fn) => { try { await fn(); return null; } catch (e) { return e.code || e.message; } };
const salvar = (acao) => db.query("select public.mesa_salvar_post($1::jsonb, $2) as r", [JSON.stringify({ id: "ensaio-lab", slug: "ensaio-lab", title: "Texto de ensaio", author: "Escritora Lab (sintética)", category: "artigos", excerpt: "x", content: [{ id: "b1", type: "paragraph", text: "Corpo sintético." }] }), acao]);

await como(OWNER);
await db.query("select public.admin_set_blog_access($1, 'writer')", [ESCRITORA]);
await db.query("select public.admin_set_blog_access($1, 'editor')", [EDITOR]);
await como(ESCRITORA);
assert.equal((await salvar("rascunho")).rows[0].r.status, "draft");
assert.equal((await salvar("revisao")).rows[0].r.status, "review");
assert.equal(await tenta(() => salvar("publicar")), "42501", "escritora não publica");
assert.equal(await tenta(() => db.query("select public.admin_set_blog_access($1, 'editor')", [ESCRITORA])), "42501", "escritora não concede acesso");
await como(EDITOR);
assert.equal(await tenta(() => db.query("select public.admin_set_blog_access($1, 'editor')", [EDITOR])), "42501", "editor não concede acesso");
assert.equal(await tenta(() => db.query("select public.admin_list_professional_profiles()")), "42501", "editor não acessa vínculos profissionais (admin)");
assert.equal((await salvar("publicar")).rows[0].r.status, "published", "editor publica");
await como(OWNER);
await db.query("select public.admin_set_blog_access($1, 'none')", [ESCRITORA]);
await como(ESCRITORA);
assert.equal(await tenta(() => salvar("rascunho")), "42501", "revogação vale na próxima chamada");
await db.exec("reset role");
assert.equal(await administrativos(), adminAntes, "nenhuma conta administrativa criada");
console.log(`\nSEGURANÇA: escritora não publica nem concede; editor publica, não concede e não acessa vínculos profissionais; revogação imediata; contas owner/admin: ${adminAntes} antes e depois. OK`);
// 6. A tela "Usuários e acessos" do Owner lista contas por admin_list_accounts (202611060002, somente leitura).
//    Sem ela o Owner não consegue conceder writer/editor pela interface. Ensaia 060002 por cima da cadeia.
await db.exec(sql(arquivo("202611060002")));
await como(OWNER);
const contas = (await db.query("select public.admin_list_accounts() as l")).rows[0].l;
const porEmail = Object.fromEntries(contas.map((c) => [c.email, c]));
assert.equal(porEmail["editor-lab@example.invalid"].blog.publish, true, "tela do Owner mostra o editor");
assert.equal(porEmail["escritora-lab@example.invalid"].blog.active, false, "e a escritora revogada");
await como(EDITOR);
assert.equal(await tenta(() => db.query("select public.admin_list_accounts()")), "42501", "editor não lista contas");
await db.exec("reset role");
assert.equal(await administrativos(), adminAntes, "nenhuma conta administrativa criada");
console.log("\n060002 (admin_list_accounts, só leitura) por cima da cadeia: Owner lista contas e níveis do Blog; editor recebe 42501. OK");
console.log("\nENSAIO CONCLUÍDO SEM FALHAS (Postgres isolado; nenhum banco real foi tocado).");

