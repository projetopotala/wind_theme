import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

/*
 * SEC-04 | Endurecimento de dois privilegios, executado de verdade num Postgres isolado (PGlite).
 *
 *   1) public.is_portal_admin(): anon sem EXECUTE.
 *   2) public.home_block_drafts: authenticated sem MAINTAIN.
 *
 * O banco recebe TODAS as migrations reais ate a anterior a SEC-04, com os privilegios padrao do Supabase
 * (conferidos em producao: ALL em tabelas, que no PostgreSQL 17+ inclui MAINTAIN, e EXECUTE em funcoes, para
 * anon, authenticated e service_role). Sem isso o estado "antes" nao reproduziria o problema.
 * Depois: aplica a migration, reaplica (idempotencia), executa o rollback, reaplica de novo. Em cada fase tira uma
 * fotografia NORMALIZADA (ordem das entradas da ACL nao e semantica) de todas as ACLs, politicas e corpos de
 * funcao de public, e prova que a diferenca e exatamente a pretendida.
 *
 * LIMITES (PGlite): identidade simulada por SET ROLE + parametro de sessao (sem GoTrue/JWT/PostgREST); auth e storage
 * sao stubs; o teste prova o que as migrations do repositorio produzem, nao o estado da producao. O PGlite roda
 * PostgreSQL 18, entao MAINTAIN existe e o ramo "PostgreSQL < 17" da migration nao e exercitado aqui.
 */
const MIG_DIR = new URL("../../supabase/migrations/", import.meta.url);
const SEC04 = "202611250001_sec04_endurecimento_privilegios.sql";
const MIGRATION = readFileSync(new URL(SEC04, MIG_DIR), "utf8");
const ROLLBACK_ARQ = "202611250001_rollback_sec04_endurecimento_privilegios.sql";
const ROLLBACK = readFileSync(new URL(`../../supabase/rollbacks/${ROLLBACK_ARQ}`, import.meta.url), "utf8");

const U = {
  OWNER: "00000000-0000-4000-8000-0000000004f1",
  ADMIN: "00000000-0000-4000-8000-0000000004f2",
  EDITOR: "00000000-0000-4000-8000-0000000004c1",
  CLIENTE: "00000000-0000-4000-8000-0000000004a1",
};

async function criarBanco() {
  const banco = new PGlite({ extensions: { pgcrypto } });
  await banco.exec(`
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
    -- Privilegios padrao do Supabase (conferidos em producao): objetos novos em public nascem abertos; sao as
    -- REVOGACOES das migrations que fecham a porta.
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  `);
  for (const f of readdirSync(MIG_DIR).filter((n) => n.endsWith(".sql") && n < SEC04).sort()) {
    await banco.exec(readFileSync(new URL(f, MIG_DIR), "utf8"));
  }
  await banco.exec("grant usage on schema public to anon, authenticated, service_role");
  return banco;
}

function classificar(e) {
  const m = String(e.message || "");
  if (/row-level security/i.test(m)) return "RLS";
  if (/permission denied/i.test(m)) return "GRANT";
  if (e.code === "42501") return "FUNCAO"; /* negado pela validacao interna da funcao */
  return `OUTRO:${e.code ?? "?"}`;
}

const db = await criarBanco();
after(async () => { await db.close(); });

/* Executa como a identidade pedida, dentro de uma transacao sempre desfeita. Aceita varias instrucoes. */
async function como(quem, sql, banco = db) {
  const papel = quem === "anon" ? "anon" : quem === "SERVICE" ? "service_role" : "authenticated";
  const uid = quem === "anon" || quem === "SERVICE" ? "" : U[quem];
  const instrucoes = Array.isArray(sql) ? sql : [sql];
  await banco.exec("begin");
  try {
    await banco.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
    await banco.exec(`set local role ${papel}`);
    let r;
    for (const s of instrucoes) r = await banco.query(s);
    const dml = /^\s*(insert|update|delete)\b/i.test(instrucoes.at(-1));
    return { ok: true, rows: r.rows, n: dml ? (r.affectedRows ?? 0) : r.rows.length };
  } catch (e) {
    return { ok: false, tipo: classificar(e), code: e.code, message: e.message };
  } finally {
    await banco.exec("rollback");
  }
}
const chama = (quem, expr) => como(quem, `select ${expr} as v`);

/* ACL normalizada: ordem das entradas nao e semantica (um GRANT depois de um REVOKE reinsere no fim do array). */
const norm = (expr) => `(select coalesce(string_agg(e, ',' order by e), '') from (select format('%s=%s/%s',
  case a.grantee when 0 then 'PUBLIC' else pg_get_userbyid(a.grantee)::text end, a.privilege_type, pg_get_userbyid(a.grantor)) e
  from aclexplode(${expr}) a) s)`;

async function fotografia() {
  const q = async (sql) => (await db.query(sql)).rows;
  const linhas = [
    ...(await q(`select 'rel:'||c.relname k, ${norm("c.relacl")} v from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r','p','v','m','S','f')`)),
    ...(await q(`select 'fnacl:'||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' k, ${norm("p.proacl")} v from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind in ('f','p')`)),
    ...(await q(`select 'fncorpo:'||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' k, md5(pg_get_functiondef(p.oid)) v from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind in ('f','p')`)),
    ...(await q(`select 'col:'||c.relname||'.'||a.attname k, ${norm("a.attacl")} v from pg_attribute a join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and a.attacl is not null`)),
    ...(await q(`select 'schema:'||nspname k, ${norm("nspacl")} v from pg_namespace where nspname in ('public','auth','storage','extensions')`)),
    ...(await q(`select 'defacl:'||pg_get_userbyid(defaclrole)||'.'||defaclnamespace::regnamespace::text||'.'||defaclobjtype::text k, ${norm("defaclacl")} v from pg_default_acl`)),
    ...(await q(`select 'pol:'||schemaname||'.'||tablename||'.'||policyname k, md5(cmd||roles::text||coalesce(qual,'')||coalesce(with_check,'')) v from pg_policies`)),
  ];
  const mapa = {};
  for (const l of linhas) mapa[l.k] = l.v;
  return mapa;
}
function diferenca(antes, depois) {
  const chaves = [...new Set([...Object.keys(antes), ...Object.keys(depois)])].sort();
  return chaves.filter((k) => antes[k] !== depois[k]).map((k) => ({ k, antes: antes[k], depois: depois[k] }));
}
const entradas = (acl) => (acl ? acl.split(",") : []);

async function sonda() {
  const r = (await db.query(`select
    has_function_privilege('anon', 'public.is_portal_admin()', 'execute') anon_exec,
    has_function_privilege('authenticated', 'public.is_portal_admin()', 'execute') auth_exec,
    has_function_privilege('service_role', 'public.is_portal_admin()', 'execute') svc_exec,
    has_table_privilege('authenticated', 'public.home_block_drafts', 'maintain') maintain,
    has_table_privilege('authenticated', 'public.home_block_drafts', 'select') sel,
    has_table_privilege('authenticated', 'public.home_block_drafts', 'insert') ins,
    has_table_privilege('authenticated', 'public.home_block_drafts', 'update') upd,
    has_table_privilege('authenticated', 'public.home_block_drafts', 'delete') del`)).rows[0];
  return { ...r, anonChama: await chama("anon", "public.is_portal_admin()") };
}

/* Fixtures: contas sinteticas e um rascunho (semeados pelo dono do banco; as asserções rodam sob SET ROLE). */
await db.exec(`
  insert into auth.users (id, email, aud, role) values
    ('${U.OWNER}', 'owner-sec04@example.invalid', 'authenticated', 'authenticated'),
    ('${U.ADMIN}', 'admin-sec04@example.invalid', 'authenticated', 'authenticated'),
    ('${U.EDITOR}', 'editor-sec04@example.invalid', 'authenticated', 'authenticated'),
    ('${U.CLIENTE}', 'cliente-sec04@example.invalid', 'authenticated', 'authenticated');
  insert into public.users (id, email, name, role, active) values
    ('${U.OWNER}', 'owner-sec04@example.invalid', 'Owner Sec04', 'owner', true),
    ('${U.ADMIN}', 'admin-sec04@example.invalid', 'Admin Sec04', 'admin', true),
    ('${U.EDITOR}', 'editor-sec04@example.invalid', 'Editor Sec04', 'blog_editor', true);
  insert into public.home_block_drafts (id, slug, title, side, position) values ('sec04-rascunho', 'sec04-rascunho', 'Rascunho sintetico', 'left', 0);
`);

/* Fases. A = estado atual de producao (reproduzido); B = apos a migration; C = reaplicada; D = apos rollback;
   D2 = rollback reaplicado; E = migration reaplicada depois do rollback. */
const A = await fotografia();
const sondaA = await sonda();
await db.exec(MIGRATION);
const B = await fotografia();
const sondaB = await sonda();
await db.exec(MIGRATION);
const C = await fotografia();
await db.exec(ROLLBACK);
const D = await fotografia();
const sondaD = await sonda();
await db.exec(ROLLBACK);
const D2 = await fotografia();
await db.exec(MIGRATION);
const E = await fotografia();
/* A partir daqui o banco esta no estado FINAL (apos a SEC-04). */

/* ------------------------------------------------------------------ */
/* Controle: o "antes" reproduz os dois privilegios (senao o resto nada prova) */
/* ------------------------------------------------------------------ */
test("CONTROLE | antes da SEC-04 o estado reproduz a producao: anon executa is_portal_admin e authenticated tem MAINTAIN", () => {
  assert.equal(sondaA.anon_exec, true);
  assert.equal(sondaA.maintain, true);
  assert.equal(sondaA.anonChama.ok, true, "anon chamava a funcao e recebia o booleano");
  assert.equal(sondaA.anonChama.rows[0].v, false);
  assert.ok(entradas(A["fnacl:public.is_portal_admin()"]).includes("anon=EXECUTE/postgres"));
  assert.ok(entradas(A["rel:home_block_drafts"]).includes("authenticated=MAINTAIN/postgres"));
});

/* ------------------------------------------------------------------ */
/* 1) is_portal_admin(): anon sem EXECUTE; authenticated e service_role preservados */
/* ------------------------------------------------------------------ */
test("is_portal_admin | anon sem EXECUTE: efetivo, na ACL (nem anon nem PUBLIC) e ao chamar", () => {
  assert.equal(sondaB.anon_exec, false);
  const acl = entradas(B["fnacl:public.is_portal_admin()"]);
  assert.ok(!acl.some((e) => e.startsWith("anon=")), `ACL ainda cita anon: ${acl}`);
  assert.ok(!acl.some((e) => e.startsWith("PUBLIC=")), `ACL concede a PUBLIC: ${acl}`);
  assert.equal(sondaB.anonChama.ok, false);
  assert.equal(sondaB.anonChama.tipo, "GRANT", sondaB.anonChama.message);
});

test("is_portal_admin | authenticated continua com EXECUTE e a funcao responde certo por identidade", async () => {
  assert.equal(sondaB.auth_exec, true);
  assert.ok(entradas(B["fnacl:public.is_portal_admin()"]).includes("authenticated=EXECUTE/postgres"));
  for (const [quem, esperado] of [["OWNER", true], ["ADMIN", true], ["EDITOR", false], ["CLIENTE", false]]) {
    const r = await chama(quem, "public.is_portal_admin()");
    assert.equal(r.ok, true, `${quem}: ${r.message}`);
    assert.equal(r.rows[0].v, esperado, quem);
  }
});

test("is_portal_admin | service_role continua com EXECUTE e executa de verdade", async () => {
  assert.equal(sondaB.svc_exec, true);
  assert.ok(entradas(B["fnacl:public.is_portal_admin()"]).includes("service_role=EXECUTE/postgres"));
  const r = await chama("SERVICE", "public.is_portal_admin()");
  assert.equal(r.ok, true, r.message);
  assert.equal(r.rows[0].v, false, "sem auth.uid() a funcao devolve false");
});

/* ------------------------------------------------------------------ */
/* Owner continua administrando (RPCs executadas de verdade, em nivel mais alto da consulta) */
/* ------------------------------------------------------------------ */
test("Owner | op_snapshot() continua autorizada e devolve o documento", async () => {
  const r = await chama("OWNER", "public.op_snapshot()");
  assert.equal(r.ok, true, r.message);
  assert.equal(typeof r.rows[0].v.revision, "number");
});

test("Owner e admin | publicar rascunhos da Home continua funcionando (rascunho vira bloco publicado)", async () => {
  for (const quem of ["OWNER", "ADMIN"]) {
    const r = await como(quem, [
      "select count(*)::int as n from public.publish_home_block_drafts()",
      `select (select count(*)::int from public.home_block_drafts) as rascunhos,
              (select count(*)::int from public.home_blocks where id = 'sec04-rascunho') as publicado`,
    ]);
    assert.equal(r.ok, true, `${quem}: ${r.message}`);
    assert.deepEqual(r.rows[0], { rascunhos: 0, publicado: 1 }, quem);
  }
});

test("Owner | substituir os blocos da Home continua funcionando", async () => {
  const r = await como("OWNER", [
    "select count(*)::int as n from public.replace_home_blocks_editorial((select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) from public.home_blocks b))",
  ]);
  assert.equal(r.ok, true, r.message);
});

test("Owner | admin_list_accounts() continua autorizada (Central Administrativa)", async () => {
  const r = await como("OWNER", "select count(*)::int as n from public.admin_list_accounts()");
  assert.equal(r.ok, true, r.message);
  assert.ok(Number(r.rows[0].n) >= 0);
});

/* ------------------------------------------------------------------ */
/* blog_editor e cliente nao recebem privilegios administrativos */
/* ------------------------------------------------------------------ */
for (const quem of ["EDITOR", "CLIENTE"]) {
  test(`${quem} | sem acesso administrativo: RPCs negadas pela propria funcao e rascunhos invisiveis`, async () => {
    for (const expr of [
      "public.op_snapshot()",
      "(select count(*) from public.publish_home_block_drafts())",
      "(select count(*) from public.replace_home_blocks_editorial('[]'::jsonb))",
      "(select count(*) from public.admin_list_accounts())",
    ]) {
      const r = await chama(quem, expr);
      assert.equal(r.ok, false, `${quem} executou ${expr}`);
      assert.equal(r.tipo, "FUNCAO", `${expr}: ${r.tipo} ${r.message}`);
    }
    assert.equal((await como(quem, "select 1 from public.home_block_drafts")).n, 0, "RLS: rascunho do Owner invisivel");
    assert.equal((await como(quem, "update public.home_block_drafts set title = 'x'")).n, 0);
    assert.equal((await como(quem, "delete from public.home_block_drafts")).n, 0);
    const ins = await como(quem, "insert into public.home_block_drafts (id, slug, title, side, position) values ('x','x','x','left',0)");
    assert.equal(ins.ok, false);
    assert.equal(ins.tipo, "RLS", ins.message);
  });
}

/* ------------------------------------------------------------------ */
/* 2) home_block_drafts: sem MAINTAIN; SELECT/INSERT/UPDATE/DELETE preservados um a um */
/* ------------------------------------------------------------------ */
const pg17 = Number((await db.query("show server_version_num")).rows[0].server_version_num) >= 170000;
test("home_block_drafts | authenticated sem MAINTAIN: efetivo e na ACL", { skip: !pg17 && "PostgreSQL < 17: MAINTAIN nao existe" }, () => {
  assert.equal(sondaB.maintain, false);
  assert.ok(!entradas(B["rel:home_block_drafts"]).some((e) => e.endsWith("=MAINTAIN/postgres") && e.startsWith("authenticated=")));
});

test("home_block_drafts | continua sem TRUNCATE, REFERENCES e TRIGGER para authenticated e sem nada para anon", async () => {
  for (const p of ["TRUNCATE", "REFERENCES", "TRIGGER"]) {
    assert.equal((await db.query("select has_table_privilege('authenticated','public.home_block_drafts',$1) v", [p])).rows[0].v, false, p);
  }
  for (const p of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER", ...(pg17 ? ["MAINTAIN"] : [])]) {
    assert.equal((await db.query("select has_table_privilege('anon','public.home_block_drafts',$1) v", [p])).rows[0].v, false, `anon ${p}`);
  }
});

for (const [priv, chave] of [["SELECT", "sel"], ["INSERT", "ins"], ["UPDATE", "upd"], ["DELETE", "del"]]) {
  test(`home_block_drafts | authenticated preserva ${priv} (privilegio e uso real pelo Owner)`, async () => {
    assert.equal(sondaB[chave], true, `${priv} efetivo`);
    assert.ok(entradas(B["rel:home_block_drafts"]).includes(`authenticated=${priv}/postgres`), `${priv} na ACL`);
    const sql = {
      SELECT: "select 1 from public.home_block_drafts where id = 'sec04-rascunho'",
      INSERT: "insert into public.home_block_drafts (id, slug, title, side, position) values ('sec04-novo','sec04-novo','t','right',1)",
      UPDATE: "update public.home_block_drafts set title = 'editado' where id = 'sec04-rascunho'",
      DELETE: "delete from public.home_block_drafts where id = 'sec04-rascunho'",
    }[priv];
    const r = await como("OWNER", sql);
    assert.equal(r.ok, true, r.message);
    assert.equal(r.n, 1);
  });
}

/* ------------------------------------------------------------------ */
/* Nenhuma outra ACL, politica ou corpo de funcao mudou */
/* ------------------------------------------------------------------ */
test("ACL | a diferenca antes/depois e EXATAMENTE a pretendida: so uma entrada em cada um dos dois objetos", () => {
  const d = diferenca(A, B);
  assert.deepEqual(d.map((x) => x.k), ["fnacl:public.is_portal_admin()", "rel:home_block_drafts"], JSON.stringify(d));
  const [fn, rel] = d;
  assert.deepEqual(entradas(fn.antes).filter((e) => !entradas(fn.depois).includes(e)), ["anon=EXECUTE/postgres"]);
  assert.deepEqual(entradas(fn.depois).filter((e) => !entradas(fn.antes).includes(e)), [], "nada foi concedido");
  assert.deepEqual(entradas(rel.antes).filter((e) => !entradas(rel.depois).includes(e)), ["authenticated=MAINTAIN/postgres"]);
  assert.deepEqual(entradas(rel.depois).filter((e) => !entradas(rel.antes).includes(e)), [], "nada foi concedido");
});

test("ACL | politicas RLS, corpos de funcao, ACLs de colunas, de schemas e privilegios padrao ficam intactos", () => {
  const mudou = diferenca(A, B).map((x) => x.k).filter((k) => !["fnacl:public.is_portal_admin()", "rel:home_block_drafts"].includes(k));
  assert.deepEqual(mudou, []);
  for (const prefixo of ["pol:", "fncorpo:", "col:", "schema:", "defacl:"]) {
    assert.ok(Object.keys(B).some((k) => k.startsWith(prefixo)), `fotografia sem ${prefixo}: o teste nao estaria cobrindo nada`);
  }
});

/* ------------------------------------------------------------------ */
/* Idempotencia e rollback */
/* ------------------------------------------------------------------ */
test("IDEMPOTENCIA | reaplicar a migration nao muda nada", () => {
  assert.deepEqual(diferenca(B, C), []);
});

test("ROLLBACK | restaura EXATAMENTE os privilegios anteriores (ACL, politicas, corpos) e so eles", () => {
  assert.deepEqual(diferenca(A, D), [], "apos o rollback tudo volta ao estado anterior");
  assert.equal(sondaD.anon_exec, true);
  assert.equal(sondaD.maintain, true);
  assert.equal(sondaD.anonChama.ok, true);
  assert.equal(sondaD.auth_exec && sondaD.svc_exec && sondaD.sel && sondaD.ins && sondaD.upd && sondaD.del, true);
});

test("ROLLBACK | e idempotente e a migration pode ser reaplicada depois dele", () => {
  assert.deepEqual(diferenca(D, D2), []);
  assert.deepEqual(diferenca(B, E), [], "migration reaplicada depois do rollback leva ao mesmo estado");
  assert.equal(sondaB.anon_exec, false);
});

/* ------------------------------------------------------------------ */
/* Pre-condicoes: falha controlada e atomica (bancos minimos, descartaveis) */
/* ------------------------------------------------------------------ */
const FUNCAO_OK = `create function public.is_portal_admin() returns boolean language sql stable security definer set search_path = '' as $$ select false $$;
  revoke all on function public.is_portal_admin() from public;
  grant execute on function public.is_portal_admin() to anon, authenticated, service_role;`;
const TABELA_OK = `create table public.home_block_drafts (id text primary key);
  grant select, insert, update, delete on public.home_block_drafts to authenticated;`;

async function bancoMinimo(ddl) {
  const b = new PGlite();
  await b.exec("create role anon nologin; create role authenticated nologin; create role service_role nologin;");
  await b.exec(ddl);
  return b;
}
async function tentaAplicar(b, sql) {
  try { await b.exec(sql); return null; } catch (e) { await b.exec("rollback"); return e.message; }
}
const anonExecuta = async (b) => (await b.query("select has_function_privilege('anon','public.is_portal_admin()','execute') v")).rows[0].v;

const PRECONDICOES = [
  ["banco sem a funcao", "", /is_portal_admin\(\) nao existe/, null],
  ["funcao nao e SECURITY DEFINER com search_path fixo", `create function public.is_portal_admin() returns boolean language sql as $$ select false $$; grant execute on function public.is_portal_admin() to anon, authenticated, service_role; ${TABELA_OK}`, /SECURITY DEFINER com search_path fixo/, true],
  ["authenticated sem EXECUTE (a migration nao concede)", `${FUNCAO_OK} revoke execute on function public.is_portal_admin() from authenticated; ${TABELA_OK}`, /authenticated sem EXECUTE/, true],
  ["service_role so com EXECUTE herdado de PUBLIC (revogar PUBLIC o removeria)", `create function public.is_portal_admin() returns boolean language sql stable security definer set search_path = '' as $$ select false $$; grant execute on function public.is_portal_admin() to anon, authenticated; ${TABELA_OK}`, /service_role perdeu EXECUTE/, true],
  ["home_block_drafts ausente (desfaz tambem a revogacao ja feita em is_portal_admin)", FUNCAO_OK, /home_block_drafts nao existe/, true],
  ["authenticated sem UPDATE em home_block_drafts (a migration nao concede)", `${FUNCAO_OK} create table public.home_block_drafts (id text); grant select, insert, delete on public.home_block_drafts to authenticated;`, /authenticated sem UPDATE/, true],
];
for (const [titulo, ddl, erro, anonDeveContinuar] of PRECONDICOES) {
  test(`PRE-CONDICAO | ${titulo}: aborta com mensagem clara e nao altera nada`, async () => {
    const b = await bancoMinimo(ddl);
    try {
      const msg = await tentaAplicar(b, MIGRATION);
      assert.ok(msg, "devia abortar");
      assert.match(msg, erro);
      if (anonDeveContinuar) assert.equal(await anonExecuta(b), true, "transacao desfeita: anon segue como estava");
    } finally { await b.close(); }
  });
}

test("PRE-CONDICAO | o rollback tambem aborta, sem alterar nada, se authenticated nao tem EXECUTE", async () => {
  const b = await bancoMinimo(`${FUNCAO_OK} revoke execute on function public.is_portal_admin() from anon, authenticated; ${TABELA_OK}`);
  try {
    const msg = await tentaAplicar(b, ROLLBACK);
    assert.match(msg ?? "", /authenticated sem EXECUTE/);
    assert.equal(await anonExecuta(b), false, "o rollback abortado nao reabriu nada");
  } finally { await b.close(); }
});

/* ------------------------------------------------------------------ */
/* Estatico: a migration so remove */
/* ------------------------------------------------------------------ */
const semComentarios = (s) => s.replace(/--.*$/gm, "");
test("MIGRATION | so revoga: nenhum GRANT, nenhuma funcao, politica, DDL destrutivo ou escrita de dados", () => {
  const codigo = semComentarios(MIGRATION);
  assert.match(codigo, /^\s*begin;/im);
  assert.match(codigo, /^\s*commit;/im);
  assert.match(codigo, /revoke all on function public\.is_portal_admin\(\) from public, anon;/);
  assert.match(codigo, /revoke maintain on table public\.home_block_drafts from authenticated/);
  assert.match(codigo, /server_version_num/);
  assert.doesNotMatch(codigo, /\bgrant\b/i, "a migration nao concede nada");
  assert.doesNotMatch(codigo, /create (or replace )?function|create policy|alter policy|drop |truncate|alter table|insert\s+into|update\s+public|delete\s+from/i);
  assert.doesNotMatch(codigo, /revoke (all|select|insert|update|delete)[^;]*home_block_drafts/i, "nao revoga o CRUD de authenticated");
  assert.match(MIGRATION, new RegExp(`supabase/rollbacks/${ROLLBACK_ARQ.replace(/\./g, "\\.")}`), "o cabecalho aponta o rollback");
});

test("ROLLBACK | so concede os dois privilegios removidos e nada mais", () => {
  const codigo = semComentarios(ROLLBACK);
  const grants = codigo.match(/grant [^;']*?(?=\bto\b)/gi) ?? [];
  assert.deepEqual(
    grants.map((g) => g.trim().replace(/\s+/g, " ").toLowerCase()),
    ["grant execute on function public.is_portal_admin()", "grant maintain on table public.home_block_drafts"],
  );
  assert.doesNotMatch(codigo, /create (or replace )?function|create policy|drop |truncate|insert\s+into|delete\s+from/i);
});
