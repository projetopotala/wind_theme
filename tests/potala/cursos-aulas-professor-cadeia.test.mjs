import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

/*
 * Cadeia REAL de migrations (inscricao 0007, recebimento manual 0008, aulas do professor 0009):
 * pedido -> aprovacao -> recebimento -> matricula -> sala, e o professor sem cobranca nem matricula.
 */
const DIR = new URL("../../supabase/migrations/", import.meta.url);
const U = { owner: "00000000-0000-0000-0000-0000000000a1", aluna: "00000000-0000-0000-0000-0000000000c1", prof: "00000000-0000-0000-0000-0000000000d2" };
const LINK = "https://meet.example.invalid/sala-da-turma";
const min = (n) => new Date(Date.now() + n * 60000).toISOString();
const dataEmSaoPaulo = (data = new Date()) => {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(data).map(({ type, value }) => [type, value]),
  );
  return `${partes.year}-${partes.month}-${partes.day}`;
};
const HOJE = dataEmSaoPaulo();

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
  await db.exec("grant usage on schema public, auth to anon, authenticated, service_role; grant execute on function auth.uid() to anon, authenticated, service_role");
  for (const [k, email] of [["owner", "owner@potala.test"], ["aluna", "aluna@potala.test"], ["prof", "prof@potala.test"]]) await db.query("insert into auth.users(id, email) values ($1,$2)", [U[k], email]);
  await db.query("insert into public.users(id, role, name, email) values ($1,'owner','owner','owner@potala.test') on conflict (id) do update set role='owner'", [U.owner]);
  await db.query("insert into public.op_records(collection,id,document) values ('profiles','prof','{\"id\":\"prof\",\"display_name\":\"TESTE INTERNO Professora\",\"email\":\"prof@potala.test\",\"roles\":[\"professional\"],\"active\":true}'::jsonb)");
  await db.query("insert into public.appointment_profile_accounts(user_id, profile_id, active) values ($1,'prof',true)", [U.prof]);
  const como = async (uid, sql, params) => {
    await db.exec(`set test.uid = '${uid || ""}'; set role ${uid ? "authenticated" : "anon"}`);
    try { return await db.query(sql, params); } finally { await db.exec("reset role; set test.uid = ''"); }
  };
  let n = 0;
  const salvar = async (action, table, after) => {
    const rev = Number((await db.query("select revision from public.op_meta where id = 1")).rows[0].revision);
    return como(U.owner, "select public.op_apply($1,$2,$3,'{}'::jsonb,null,$4::jsonb) as r", [rev, `k-${++n}`, action, JSON.stringify([{ table, id: after.id, after }])]);
  };
  await salvar("definition.save", "activity_definitions", { id: "c-t1", title: "TESTE INTERNO curso", kind: "course", summary: "Descricao", price_cents: 15000, published: true });
  await salvar("offering.save", "activity_offerings", { id: "t1", title: "TESTE INTERNO turma", definition_id: "c-t1", professional_id: "prof", mode: "online", capacity: 5, price_cents: 15000, summary: "Descricao", published: true });
  await db.query("insert into public.op_records(collection,id,document) values ('schedule_items','aula-t1',$1::jsonb)", [JSON.stringify({ id: "aula-t1", title: "Aula", kind: "course", offering_id: "t1", mode: "online", professional_id: "prof", starts_at: min(5), ends_at: min(65), status: "booked", online_url: LINK })]);
  const ensina = async () => (await como(U.prof, "select public.my_teaching_courses() as r")).rows[0].r;
  const meus = async (uid) => (await como(uid, "select public.my_course_enrollments() as r")).rows[0].r;
  const q = async (sql, p = []) => (await db.query(sql, p)).rows;
  const dinheiro = async () => (await q(`select
      (select count(*)::int from public.course_enrollment_requests) pedidos,
      (select count(*)::int from public.course_enrollment_payments) recebimentos,
      (select count(*)::int from public.course_enrollment_payment_events) eventos_rec,
      (select count(*)::int from public.course_enrollment_request_events) eventos,
      (select count(*)::int from public.op_records where collection='enrollments') matriculas,
      (select md5(coalesce(string_agg(id::text||status||price_cents::text,'|' order by id),'')) from public.course_enrollment_requests) h_pedidos`))[0];
  return { db, como, ensina, meus, q, dinheiro };
}

test("professor entra sem pagar e sem matricula; aluno so entra depois de pedido aprovado + recebimento + matricula; estorno revoga", async () => {
  const { como, ensina, meus, q, dinheiro } = await montar();

  /* 1. Professor: link imediato, e NADA e criado em pedidos, recebimentos ou matriculas. */
  const base = await dinheiro();
  assert.deepEqual([base.pedidos, base.recebimentos, base.matriculas], [0, 0, 0]);
  const t = await ensina();
  assert.equal(t.length, 1);
  assert.equal(t[0].join_url, LINK);
  assert.deepEqual(await dinheiro(), base, "ler as aulas nao cria cobranca, pedido, recebimento nem matricula");

  /* 2. Aluna sem matricula: sem acesso. */
  assert.deepEqual(await meus(U.aluna), []);

  /* 3. Pedido solicitado / aguardando pagamento NAO libera a sala. */
  const pedido = (await como(U.aluna, "select public.request_course_enrollment($1::uuid,$2) as r", ["aaaaaaaa-0000-4000-8000-000000000001", "t1"])).rows[0].r;
  assert.equal(pedido.status, "solicitada");
  assert.deepEqual(await meus(U.aluna), [], "solicitada: sem matricula, sem link");
  const v1 = (await q("select updated_at from public.course_enrollment_requests where id=$1", [pedido.id]))[0].updated_at;
  await como(U.owner, "select public.admin_decide_course_enrollment_request($1::uuid,$2::timestamptz,'aprovar') as r", [pedido.id, v1]);
  assert.equal((await q("select status from public.course_enrollment_requests"))[0].status, "aguardando_pagamento");
  assert.deepEqual(await meus(U.aluna), [], "aguardando pagamento: sem matricula, sem link");

  /* 4. Recebimento registrado pelo Owner -> matricula -> mesma sala do professor. */
  const v2 = (await q("select updated_at from public.course_enrollment_requests where id=$1", [pedido.id]))[0].updated_at;
  const rec = (await como(U.owner, "select public.admin_register_manual_course_payment($1::uuid,$2::uuid,$3::timestamptz,15000,'pix',$4::date,'Pix E2E') as r", ["cccccccc-0000-4000-8000-000000000001", pedido.id, v2, HOJE])).rows[0].r;
  assert.equal(rec.status, "matriculada");
  const doAluno = (await meus(U.aluna)).find((x) => x.course_ref === "t1");
  assert.equal(doAluno.join_url, LINK);
  assert.equal((await ensina())[0].join_url, doAluno.join_url, "professor e aluna: mesma sala");
  const apos = await dinheiro();
  assert.deepEqual([apos.pedidos, apos.recebimentos, apos.matriculas], [1, 1, 1], "so a aluna tem pedido, recebimento e matricula");
  assert.equal((await q("select count(*)::int n from public.course_enrollment_requests where user_id=$1", [U.prof]))[0].n, 0, "nenhum pedido do professor");
  assert.equal((await q("select count(*)::int n from public.op_records where collection='enrollments' and document->>'profile_id'='prof'"))[0].n, 0, "nenhuma matricula do professor");
  assert.equal((await ensina())[0].students, 1);

  /* 5. A leitura do professor, depois disso, ainda nao altera o financeiro. */
  const antesLeitura = await dinheiro();
  await ensina(); await ensina();
  assert.deepEqual(await dinheiro(), antesLeitura);

  /* 6. Estorno (matricula cancelada): a aluna perde a autorizacao; o professor continua. */
  const pid = (await q("select id from public.course_enrollment_payments"))[0].id;
  await como(U.owner, "select public.admin_reverse_manual_course_payment($1::uuid,'estorno_realizado','Conferido') as r", [pid]);
  assert.equal(((await meus(U.aluna)).find((x) => x.course_ref === "t1") || {}).join_url ?? null, null, "matricula cancelada nao libera sala");
  assert.equal((await ensina())[0].join_url, LINK, "o professor continua com o vinculo");
});

test("a unica diferenca do professor e o vinculo: sem atribuicao a turma nao aparece, mesmo sendo profissional ativo", async () => {
  const { db, ensina } = await montar();
  await db.query(`update public.op_records set document = jsonb_set(document,'{professional_id}','"outra-prof"') where collection='activity_offerings' and id='t1'`);
  assert.deepEqual(await ensina(), []);
});
