import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

/* PR B (migration 202611160007): inscricao pedida pelo aluno. TODAS as migrations reais; cursos gravados pelo op_apply. */
const DIR = new URL("../../supabase/migrations/", import.meta.url);
const ROLLBACK = readFileSync(new URL("../../supabase/rollbacks/202611160007_rollback_cursos_inscricao_aluno.sql", import.meta.url), "utf8");
/* Reversoes em ordem inversa: a do recebimento manual (202611160008) sai antes da desta migration. */
const ROLLBACK_RECEBIMENTO = readFileSync(new URL("../../supabase/rollbacks/202611160008_rollback_cursos_recebimento_manual.sql", import.meta.url), "utf8");
const U = { owner: "00000000-0000-0000-0000-0000000000a1", a1: "00000000-0000-0000-0000-0000000000c1", a2: "00000000-0000-0000-0000-0000000000c2", a3: "00000000-0000-0000-0000-0000000000c3" };
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
  await db.exec("grant usage on schema public, auth to anon, authenticated, service_role; grant execute on function auth.uid() to anon, authenticated, service_role");
  for (const [k, email] of [["owner", "owner@potala.test"], ["a1", "a1@potala.test"], ["a2", "a2@potala.test"], ["a3", "a3@potala.test"]]) {
    await db.query("insert into auth.users(id, email) values ($1,$2)", [U[k], email]);
  }
  await db.query("insert into public.users(id, role, name, email) values ($1,'owner','owner','owner@potala.test') on conflict (id) do update set role='owner'", [U.owner]);
  await db.query("insert into public.op_records(collection,id,document) values ('profiles','prof','{\"id\":\"prof\",\"display_name\":\"TESTE INTERNO Professora\",\"roles\":[\"professional\"],\"active\":true}'::jsonb)");
  await db.query("insert into public.op_records(collection,id,document) values ('profiles','aluno-op','{\"id\":\"aluno-op\",\"display_name\":\"TESTE INTERNO Aluno antigo\",\"roles\":[\"student\"],\"active\":true}'::jsonb)");
  const como = async (uid, sql, params, papel) => {
    await db.exec(`set test.uid = '${uid || ""}'; set role ${papel || (uid ? "authenticated" : "anon")}`);
    try { return await db.query(sql, params); } finally { await db.exec("reset role; set test.uid = ''"); }
  };
  let n = 0;
  const salvar = async (action, table, after) => {
    const rev = Number((await db.query("select revision from public.op_meta where id = 1")).rows[0].revision);
    return (await como(U.owner, "select public.op_apply($1,$2,$3,'{}'::jsonb,null,$4::jsonb) as r", [rev, `k-${++n}`, action, JSON.stringify([{ table, id: after.id, after }])])).rows[0].r;
  };
  let deslocamento = 0;
  const turmaAberta = async (id, { preco = 15000, vagas = 2, publicado = true } = {}) => {
    const inicio = new Date(FUTURO.valueOf() + (deslocamento++) * 3 * 3600e3);
    await salvar("definition.save", "activity_definitions", { id: `c-${id}`, title: `TESTE INTERNO ${id}`, kind: "course", summary: "Descrição", price_cents: preco, published: publicado });
    await salvar("offering.save", "activity_offerings", { id, title: `TESTE INTERNO ${id}`, definition_id: `c-${id}`, professional_id: "prof", mode: "online", capacity: vagas, price_cents: preco, summary: "Descrição", published: publicado });
    await db.query("insert into public.op_records(collection,id,document) values ('schedule_items',$1,$2::jsonb)", [`aula-${id}`, JSON.stringify({ id: `aula-${id}`, title: "Aula", kind: "course", offering_id: id, mode: "online", professional_id: "prof", starts_at: inicio.toISOString(), ends_at: new Date(inicio.valueOf() + 3600e3).toISOString(), status: "booked" })]);
  };
  const pedir = (uid, turma, chave = `aaaaaaaa-0000-4000-8000-${String(++n).padStart(12, "0")}`) =>
    como(uid, "select public.request_course_enrollment($1::uuid,$2) as r", [chave, turma]).then((x) => ({ ok: true, r: x.rows[0].r }), (e) => ({ ok: false, code: e.code, message: e.message }));
  const decidir = async (id, decisao, uid = U.owner) => {
    const u = (await db.query("select updated_at from public.course_enrollment_requests where id=$1", [id])).rows[0].updated_at;
    return como(uid, "select public.admin_decide_course_enrollment_request($1::uuid,$2::timestamptz,$3) as r", [id, u, decisao]).then((x) => ({ ok: true, r: x.rows[0].r }), (e) => ({ ok: false, code: e.code, message: e.message }));
  };
  const status = async (id) => (await db.query("select status from public.course_enrollment_requests where id=$1", [id])).rows[0].status;
  return { db, como, salvar, turmaAberta, pedir, decidir, status };
}

test("so turma aberta recebe pedido; rascunho e curso sem turma nao", async () => {
  const { salvar, turmaAberta, pedir } = await montar();
  await turmaAberta("rascunho", { publicado: false });
  await salvar("definition.save", "activity_definitions", { id: "sem-turma", title: "TESTE INTERNO sem turma", kind: "course", summary: "D", published: true });
  assert.equal((await pedir(U.a1, "rascunho")).code, "22023");
  assert.equal((await pedir(U.a1, "sem-turma")).code, "22023");
  assert.equal((await pedir(null, "rascunho")).ok, false, "anonimo nao pede");
  await turmaAberta("t1");
  const r = await pedir(U.a1, "t1");
  assert.equal(r.ok, true, r.message);
  assert.equal(r.r.status, "solicitada", "pedido nao vira matricula sozinho");
});

test("duplicidade bloqueada; repeticao da mesma chave nao cria outro", async () => {
  const { db, turmaAberta, pedir } = await montar();
  await turmaAberta("t1");
  const chave = "bbbbbbbb-0000-4000-8000-000000000001";
  assert.equal((await pedir(U.a1, "t1", chave)).ok, true);
  assert.equal((await pedir(U.a1, "t1", chave)).r.replayed, true);
  assert.equal((await pedir(U.a1, "t1")).code, "PT409");
  assert.equal(Number((await db.query("select count(*) n from public.course_enrollment_requests")).rows[0].n), 1);
});

test("capacidade: pedidos pendentes reservam vaga; recusa e cancelamento liberam; matricula manual respeita pedidos", async () => {
  const { db, como, salvar, turmaAberta, pedir, decidir } = await montar();
  await turmaAberta("t1", { vagas: 2 });
  const p1 = (await pedir(U.a1, "t1")).r.id;
  await pedir(U.a2, "t1");
  assert.equal((await pedir(U.a3, "t1")).code, "23514", "turma lotada recusa");
  let lista = (await como(null, "select public.list_public_courses() as l")).rows[0].l;
  assert.equal(lista[0].spots_left, 0);
  assert.equal(lista[0].availability, "esgotado");
  /* matricula manual pela operacao tambem e barrada */
  const manual = await salvar("enrollment.save", "enrollments", { id: "e-manual", profile_id: "aluno-op", offering_id: "t1", status: "active" }).then(() => "ok", (e) => e.code);
  assert.equal(manual, "23514");
  assert.equal((await decidir(p1, "recusar")).ok, true);
  lista = (await como(null, "select public.list_public_courses() as l")).rows[0].l;
  assert.equal(lista[0].spots_left, 1, "recusa libera a vaga");
  assert.equal((await pedir(U.a3, "t1")).ok, true);
  void db;
});

test("aprovacao: gratuito vira matriculada; pago fica aguardando pagamento e so o servidor confirma", async () => {
  const { db, como, turmaAberta, pedir, decidir, status } = await montar();
  await turmaAberta("gratis", { preco: 0 });
  await turmaAberta("pago", { preco: 15000 });
  const g = (await pedir(U.a1, "gratis")).r.id;
  const p = (await pedir(U.a1, "pago")).r.id;
  assert.equal((await decidir(g, "aprovar", U.a2)).code, "42501", "usuario comum nao aprova");
  assert.equal((await decidir(g, "aprovar")).ok, true);
  assert.equal(await status(g), "matriculada");
  assert.equal((await decidir(p, "aprovar")).ok, true);
  assert.equal(await status(p), "aguardando_pagamento");
  /* nem aluno nem Owner marcam pagamento */
  await assert.rejects(() => como(U.a1, "select public.confirm_course_enrollment_payment($1::uuid, 15000)", [p]), /permission denied/i);
  await assert.rejects(() => como(U.owner, "select public.confirm_course_enrollment_payment($1::uuid, 15000)", [p]), /permission denied/i);
  await assert.rejects(() => como(U.owner, "update public.course_enrollment_requests set status='matriculada' where id=$1", [p]), /permission denied/i);
  /* servidor (webhook futuro): valor errado recusa; certo matricula; repetir e idempotente */
  await assert.rejects(() => como(null, "select public.confirm_course_enrollment_payment($1::uuid, 100)", [p], "service_role"), /Valor pago/);
  const c = (await como(null, "select public.confirm_course_enrollment_payment($1::uuid, 15000) as r", [p], "service_role")).rows[0].r;
  assert.equal(c.status, "matriculada");
  assert.equal((await como(null, "select public.confirm_course_enrollment_payment($1::uuid, 15000) as r", [p], "service_role")).rows[0].r.replayed, true);
  const eventos = (await db.query("select actor_kind, from_status, to_status from public.course_enrollment_request_events where request_id=$1 order by id", [p])).rows;
  assert.deepEqual(eventos.map((e) => `${e.actor_kind}:${e.from_status}->${e.to_status}`),
    ["aluno:null->solicitada", "administracao:solicitada->aguardando_pagamento", "servidor:aguardando_pagamento->pagamento_confirmado", "servidor:pagamento_confirmado->matriculada"]);
});

test("cancelamento: aluno cancela antes de pagar; Owner cancela matriculada; estados finais travam", async () => {
  const { como, turmaAberta, pedir, decidir, status } = await montar();
  await turmaAberta("t1", { preco: 0, vagas: 5 });
  const a = (await pedir(U.a1, "t1")).r.id;
  await assert.rejects(() => como(U.a2, "select public.cancel_my_course_enrollment_request($1::uuid)", [a]), /inexistente/, "outro aluno nao cancela");
  await como(U.a1, "select public.cancel_my_course_enrollment_request($1::uuid)", [a]);
  assert.equal(await status(a), "cancelada");
  assert.equal((await decidir(a, "aprovar")).code, "22023", "cancelada nao volta");
  const b = (await pedir(U.a1, "t1")).r.id;
  await decidir(b, "aprovar");
  await assert.rejects(() => como(U.a1, "select public.cancel_my_course_enrollment_request($1::uuid)", [b]), /não permitida/, "aluno nao cancela matricula");
  assert.equal((await decidir(b, "cancelar")).ok, true);
  assert.equal(await status(b), "cancelada");
  /* decisao com dado velho (updated_at antigo) e recusada */
  const c = (await pedir(U.a2, "t1")).r.id;
  const r = await como(U.owner, "select public.admin_decide_course_enrollment_request($1::uuid,'2000-01-01'::timestamptz,'aprovar')", [c]).then(() => "ok", (e) => e.code);
  assert.equal(r, "PT409");
});

test("isolamento: cada aluno ve so os seus; Owner ve todos; anonimo nada", async () => {
  const { como, turmaAberta, pedir } = await montar();
  await turmaAberta("t1", { vagas: 5 });
  await pedir(U.a1, "t1"); await pedir(U.a2, "t1");
  const meus = (await como(U.a1, "select public.my_course_enrollment_requests() as l")).rows[0].l;
  assert.equal(meus.length, 1);
  assert.equal(meus[0].status, "solicitada");
  assert.equal(meus[0].course_title, "TESTE INTERNO t1");
  assert.equal((await como(U.a1, "select count(*) n from public.course_enrollment_requests")).rows[0].n, 1, "RLS");
  await assert.rejects(() => como(U.a1, "select * from public.course_enrollment_request_events"), /permission denied/i);
  await assert.rejects(() => como(U.a1, "select public.admin_list_course_enrollment_requests()"), /administra/);
  await assert.rejects(() => como(null, "select * from public.course_enrollment_requests"), /permission denied/i);
  const todos = (await como(U.owner, "select public.admin_list_course_enrollment_requests() as l")).rows[0].l;
  assert.equal(todos.length, 2);
  assert.ok(todos.every((x) => x.student_email && x.capacity === 5 && x.seats_taken === 2));
});

test("regressao: matriculas existentes intactas e continuam contando vagas", async () => {
  const { db, salvar, turmaAberta, pedir } = await montar();
  await turmaAberta("t1", { vagas: 2 });
  await salvar("enrollment.save", "enrollments", { id: "e-antiga", profile_id: "aluno-op", offering_id: "t1", status: "active" });
  const antes = (await db.query("select document::text d from public.op_records where id='e-antiga'")).rows[0].d;
  assert.equal((await pedir(U.a1, "t1")).ok, true);
  assert.equal((await pedir(U.a2, "t1")).code, "23514", "vaga ocupada pela matricula antiga conta");
  assert.equal((await db.query("select document::text d from public.op_records where id='e-antiga'")).rows[0].d, antes);
});

test("rollback: preserva pedidos reais; sem pedidos remove tudo", async () => {
  const a = await montar();
  await a.turmaAberta("t1");
  await a.pedir(U.a1, "t1");
  await a.db.exec(ROLLBACK_RECEBIMENTO);
  await a.db.exec(ROLLBACK);
  assert.equal(Number((await a.db.query("select count(*) n from public.course_enrollment_requests")).rows[0].n), 1);
  assert.equal(Number((await a.db.query("select count(*) n from pg_proc where proname='request_course_enrollment'")).rows[0].n), 0);
  const b = await montar();
  await b.db.exec(ROLLBACK_RECEBIMENTO);
  await b.db.exec(ROLLBACK);
  assert.equal((await b.db.query("select to_regclass('public.course_enrollment_requests') t")).rows[0].t, null);
  assert.equal(Number((await b.db.query("select count(*) n from pg_trigger where tgname='op_enrollment_respeita_pedidos'")).rows[0].n), 0);
});

test("matricula de verdade: gratuito aprovado vira matricula da operacao e aparece em Meu Potala (uma vaga so)", async () => {
  const { db, como, turmaAberta, pedir, decidir } = await montar();
  await turmaAberta("t1", { preco: 0, vagas: 2 });
  const rev0 = Number((await db.query("select revision from public.op_meta where id=1")).rows[0].revision);
  const id = (await pedir(U.a1, "t1")).r.id;
  assert.equal((await decidir(id, "aprovar")).ok, true);
  const req = (await db.query("select status, op_enrollment_id from public.course_enrollment_requests where id=$1", [id])).rows[0];
  assert.equal(req.status, "matriculada");
  const mat = (await db.query("select document from public.op_records where collection='enrollments' and id=$1", [req.op_enrollment_id])).rows[0].document;
  assert.equal(mat.status, "active");
  assert.equal(mat.offering_id, "t1");
  const perfil = (await db.query("select document from public.op_records where collection='profiles' and id=$1", [mat.profile_id])).rows[0].document;
  assert.equal(perfil.email, "a1@potala.test");
  assert.deepEqual(perfil.roles, ["student"]);
  assert.equal(Number((await db.query("select count(*) n from public.appointment_profile_accounts where user_id=$1 and profile_id=$2", [U.a1, mat.profile_id])).rows[0].n), 1);
  assert.ok(Number((await db.query("select revision from public.op_meta where id=1")).rows[0].revision) > rev0, "revisao da operacao avancou");
  const auditoria = (await db.query("select document->>'action' a from public.op_records where collection='audit_events' and document->'changes'->0->>'id'=$1", [req.op_enrollment_id])).rows;
  assert.deepEqual(auditoria.map((x) => x.a), ["enrollment.save"]);
  const meus = (await como(U.a1, "select public.my_course_enrollments() as l")).rows[0].l;
  assert.equal(meus.length, 1, "o curso aparece em Meu Potala -> Em curso");
  assert.equal(meus[0].course_ref, "t1");
  const aberta = (await como(null, "select public.list_public_courses() as l")).rows[0].l[0];
  assert.equal(aberta.spots_left, 1, "a vaga conta uma vez");
  assert.equal((await pedir(U.a1, "t1")).code, "PT409", "ja matriculado nao pede de novo");
});

test("pago: so vira matricula da operacao depois da confirmacao do servidor; cancelar devolve a vaga", async () => {
  const { db, como, turmaAberta, pedir, decidir, status } = await montar();
  await turmaAberta("t1", { preco: 15000, vagas: 1 });
  const id = (await pedir(U.a1, "t1")).r.id;
  await decidir(id, "aprovar");
  assert.equal(Number((await db.query("select count(*) n from public.op_records where collection='enrollments'")).rows[0].n), 0, "aguardando pagamento: sem matricula");
  await como(null, "select public.confirm_course_enrollment_payment($1::uuid, 15000)", [id], "service_role");
  const opId = (await db.query("select op_enrollment_id from public.course_enrollment_requests where id=$1", [id])).rows[0].op_enrollment_id;
  assert.ok(opId);
  assert.equal((await como(null, "select public.list_public_courses() as l")).rows[0].l[0].availability, "esgotado");
  assert.equal((await decidir(id, "cancelar")).ok, true);
  assert.equal(await status(id), "cancelada");
  const doc = (await db.query("select document from public.op_records where id=$1", [opId])).rows[0].document;
  assert.equal(doc.status, "cancelled", "matricula operacional cancelada junto");
  assert.equal((await como(null, "select public.list_public_courses() as l")).rows[0].l[0].spots_left, 1, "vaga devolvida");
});

test("cadastro existente com o mesmo e-mail e reaproveitado; e-mail ambiguo e recusado sem gravar nada", async () => {
  const { db, turmaAberta, pedir, decidir, status } = await montar();
  await db.query("insert into public.op_records(collection,id,document) values ('profiles','existente','{\"id\":\"existente\",\"display_name\":\"TESTE INTERNO A2\",\"email\":\"a2@potala.test\",\"roles\":[\"client\"],\"active\":true}'::jsonb)");
  await turmaAberta("t1", { preco: 0, vagas: 5 });
  const a = (await pedir(U.a2, "t1")).r.id;
  await decidir(a, "aprovar");
  const doc = (await db.query("select document from public.op_records where collection='enrollments' and document->>'request_id'=$1", [a])).rows[0].document;
  assert.equal(doc.profile_id, "existente", "nao cria cadastro repetido");
  for (const n of [1, 2]) await db.query("insert into public.op_records(collection,id,document) values ('profiles',$1,$2::jsonb)", [`dup${n}`, JSON.stringify({ id: `dup${n}`, display_name: "TESTE INTERNO dup", email: "a3@potala.test", roles: ["client"], active: true })]);
  const b = (await pedir(U.a3, "t1"));
  assert.equal(b.code, "PT422", "pedido ja recusa quando o e-mail e ambiguo");
  void status;
});

test("aprovacao que falha na operacao nao muda o pedido (tudo ou nada)", async () => {
  const { db, turmaAberta, pedir, decidir, status } = await montar();
  await turmaAberta("t1", { preco: 0, vagas: 5 });
  const id = (await pedir(U.a1, "t1")).r.id;
  /* cadastro com o id da conta ja usado por outra coisa: a criacao do perfil conflita */
  await db.query("insert into public.op_records(collection,id,document) values ('profiles',$1,'{\"display_name\":\"TESTE INTERNO outro\",\"email\":\"outro@x.test\",\"roles\":[\"client\"],\"active\":true}'::jsonb)", [U.a1]);
  const r = await decidir(id, "aprovar");
  assert.equal(r.ok, false);
  assert.equal(await status(id), "solicitada", "rollback da transacao");
  assert.equal(Number((await db.query("select count(*) n from public.op_records where collection='enrollments'")).rows[0].n), 0);
});
