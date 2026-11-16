import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

/* PR A de Cursos (migration 202611160006), com TODAS as migrations reais e o caminho do painel (op_apply). */
const DIR = new URL("../../supabase/migrations/", import.meta.url);
const ROLLBACK = readFileSync(new URL("../../supabase/rollbacks/202611160006_rollback_cursos_catalogo_simples.sql", import.meta.url), "utf8");
const U = { owner: "00000000-0000-0000-0000-0000000000a1", aluno: "00000000-0000-0000-0000-0000000000c1", outro: "00000000-0000-0000-0000-0000000000c2" };
const FUTURO = new Date(Date.now() + 10 * 864e5);

async function montar() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth; create schema extensions; create schema storage;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz default now(), deleted_at timestamptz, raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    create table storage.buckets(id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, owner_id text, metadata jsonb);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as $x$ select string_to_array(name, '/') $x$;
    create function auth.role() returns text language sql stable as $$ select 'authenticated' $$;
  `);
  for (const a of readdirSync(DIR).sort()) await db.exec(readFileSync(new URL(a, DIR), "utf8"));
  await db.exec("grant usage on schema public, auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated");
  for (const [k, email] of [["owner", "owner@potala.test"], ["aluno", "aluno@potala.test"], ["outro", "outro@potala.test"]]) {
    await db.query("insert into auth.users(id, email) values ($1,$2)", [U[k], email]);
  }
  await db.query("insert into public.users(id, role, name, email) values ($1,'owner','owner','owner@potala.test') on conflict (id) do update set role='owner'", [U.owner]);
  await db.query("insert into public.op_records(collection,id,document) values ('profiles','prof','{\"id\":\"prof\",\"display_name\":\"TESTE INTERNO Professora\",\"email\":\"prof@potala.test\",\"phone\":\"11999990000\",\"roles\":[\"professional\"],\"active\":true}'::jsonb)");
  const como = async (uid, sql, params) => {
    await db.exec(`set test.uid = '${uid || ""}'; set role ${uid ? "authenticated" : "anon"}`);
    try { return await db.query(sql, params); } finally { await db.exec("reset role; set test.uid = ''"); }
  };
  let n = 0;
  const salvar = async (action, table, after) => {
    const rev = Number((await db.query("select revision from public.op_meta where id = 1")).rows[0].revision);
    const r = await como(U.owner, "select public.op_apply($1,$2,$3,'{}'::jsonb,null,$4::jsonb) as r", [rev, `chave-${++n}`, action, JSON.stringify([{ table, id: after.id, after }])]);
    return r.rows[0].r;
  };
  const aula = (id, oferta, inicio = FUTURO) => db.query("insert into public.op_records(collection,id,document) values ('schedule_items',$1,$2::jsonb)",
    [id, JSON.stringify({ id, title: "Aula", kind: "course", offering_id: oferta, mode: "online", professional_id: "prof", starts_at: inicio.toISOString(), ends_at: new Date(inicio.valueOf() + 3600e3).toISOString(), status: "booked", online_url: "https://meet.exemplo.com/SEGREDO" })]);
  const abertas = async (uid = null) => (await como(uid, "select public.list_public_courses() as l")).rows[0].l;
  const outros = async (uid = null) => (await como(uid, "select public.list_public_course_definitions() as l")).rows[0].l;
  return { db, como, salvar, aula, abertas, outros };
}

const curso = (id, extra = {}) => ({ id, title: `TESTE INTERNO ${id}`, kind: "course", summary: "Descrição oficial", price_cents: 15000, published: true, ...extra });
const turma = (id, def, extra = {}) => ({ id, title: `TESTE INTERNO turma ${id}`, definition_id: def, professional_id: "prof", mode: "online", capacity: 3, price_cents: 15000, published: true, summary: "Descrição oficial", ...extra });

test("rascunho nao aparece; aprovado sem turma vai para 'Outros cursos', sem preco", async () => {
  const { salvar, abertas, outros } = await montar();
  await salvar("definition.save", "activity_definitions", curso("rascunho", { published: false }));
  await salvar("definition.save", "activity_definitions", curso("sem-descricao", { summary: "" }));
  await salvar("definition.save", "activity_definitions", curso("aprovado"));
  const o = await outros();
  assert.deepEqual(o.map((x) => x.id), ["aprovado"]);
  assert.equal("price_cents" in o[0], false, "sem turma nao oferece preco/pagamento");
  assert.equal((await abertas()).length, 0);
});

test("turma completa vai para 'Inscricoes abertas' com preco em centavos; incompleta nao", async () => {
  const { salvar, aula, abertas, outros } = await montar();
  await salvar("definition.save", "activity_definitions", curso("c1"));
  await salvar("offering.save", "activity_offerings", turma("t1", "c1"));
  await aula("a1", "t1");
  let lista = await abertas();
  assert.equal(lista.length, 1);
  assert.equal(lista[0].price_cents, 15000);
  assert.equal(lista[0].spots_left, 3);
  assert.equal(lista[0].teacher_name, "TESTE INTERNO Professora");
  assert.ok(!JSON.stringify(lista).includes("SEGREDO") && !JSON.stringify(lista).includes("11999990000"));
  assert.deepEqual(await outros(), [], "curso com turma aberta nao repete em Outros");

  /* sem valor, sem aula futura ou curso em rascunho: a turma some e o curso volta para Outros (se publicado) */
  await salvar("offering.save", "activity_offerings", turma("t1", "c1", { price_cents: null }));
  await salvar("definition.save", "activity_definitions", curso("c1", { price_cents: null }));
  assert.equal((await abertas()).length, 0, "sem valor nao abre inscricoes");
  assert.deepEqual((await outros()).map((x) => x.id), ["c1"]);
  await salvar("offering.save", "activity_offerings", turma("t1", "c1", { price_cents: 0 }));
  lista = await abertas();
  assert.equal(lista[0].price_cents, 0, "gratuito explicito");
  await salvar("definition.save", "activity_definitions", curso("c1", { published: false }));
  assert.equal((await abertas()).length, 0, "curso em rascunho esconde a turma");
  assert.equal((await outros()).length, 0);
});

test("interesse: so autenticado, sem duplicar, curso precisa estar publicado; cada um le so o seu; Owner ve todos", async () => {
  const { db, como, salvar } = await montar();
  await salvar("definition.save", "activity_definitions", curso("c1"));
  await salvar("definition.save", "activity_definitions", curso("rascunho", { published: false }));
  const reg = (uid, id) => como(uid, "select public.register_course_interest($1) as r", [id]).then((x) => ({ ok: true, r: x.rows[0].r }), (e) => ({ ok: false, code: e.code, message: e.message }));
  assert.equal((await reg(null, "c1")).ok, false, "anonimo nao registra");
  const a = await reg(U.aluno, "c1");
  assert.equal(a.ok, true, a.message);
  assert.equal(a.r.new, true);
  assert.equal((await reg(U.aluno, "c1")).r.new, false, "sem duplicar");
  assert.equal((await reg(U.aluno, "rascunho")).code, "22023");
  assert.equal((await reg(U.aluno, "nao-existe")).code, "22023");
  await reg(U.outro, "c1");
  assert.equal(Number((await db.query("select count(*) n from public.course_interests")).rows[0].n), 2);
  const meus = (await como(U.aluno, "select user_id from public.course_interests")).rows;
  assert.deepEqual(meus.map((x) => x.user_id), [U.aluno], "RLS: cada aluno le apenas o proprio");
  await assert.rejects(() => como(U.aluno, "insert into public.course_interests(user_id, course_id) values ($1,'c1')", [U.outro]));
  await assert.rejects(() => como(U.aluno, "select public.admin_list_course_interests()"), /administra/);
  const todos = (await como(U.owner, "select public.admin_list_course_interests() as l")).rows[0].l;
  assert.equal(todos.length, 2);
  assert.ok(todos.every((i) => i.course_title === "TESTE INTERNO c1" && i.email));
});

test("rollback volta ao catalogo anterior e remove apenas o que a migration criou", async () => {
  const { db, salvar } = await montar();
  await salvar("definition.save", "activity_definitions", curso("c1"));
  const antes = Number((await db.query("select count(*) n from public.op_records")).rows[0].n);
  await db.exec(ROLLBACK);
  assert.equal(Number((await db.query("select count(*) n from public.op_records")).rows[0].n), antes);
  assert.equal((await db.query("select to_regclass('public.course_interests') t")).rows[0].t, null);
  assert.equal(Number((await db.query("select count(*) n from pg_proc where proname in ('list_public_course_definitions','register_course_interest','admin_list_course_interests')")).rows[0].n), 0);
  assert.equal(Number((await db.query("select count(*) n from pg_proc where proname='list_public_courses'")).rows[0].n), 1);
});
