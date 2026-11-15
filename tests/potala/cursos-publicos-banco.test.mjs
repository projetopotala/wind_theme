import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

/*
 * Cursos publicos NO BANCO (migration 202611160001), com as migrations reais da operacao.
 * So auth.users/auth.uid() e public.users sao simulados. Dados sinteticos "TESTE INTERNO".
 */
const mig = (n) => readFileSync(new URL(`../../supabase/migrations/${n}`, import.meta.url), "utf8");
const ROLLBACK = readFileSync(new URL("../../supabase/rollbacks/202611160001_rollback_cursos_publicos.sql", import.meta.url), "utf8");
const FUTURO = "2099-01-10T13:00:00+00";

async function montar({ aplicar = true } = {}) {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz default now(), deleted_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table public.users(id uuid primary key, role text not null, active boolean not null default true, name text, email text);
    create table public.appointment_profile_accounts(user_id uuid primary key, profile_id text not null unique, active boolean not null default true, updated_at timestamptz not null default now());
    create function public.is_portal_admin() returns boolean language sql stable security definer set search_path = '' as $$
      select (select auth.uid()) is not null and exists (select 1 from public.users where id = (select auth.uid()) and role in ('owner','admin') and active = true) $$;
  `);
  await db.exec(mig("202609170001_operacao_do_instituto.sql"));
  await db.exec(mig("202610230001_restore_operational_guard.sql"));
  await db.exec("grant usage on schema public, auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated");
  const doc = (col, id, d) => db.query("insert into public.op_records(collection, id, document) values ($1,$2,$3::jsonb)", [col, id, JSON.stringify({ id, ...d })]);
  await doc("activity_definitions", "d-curso", { title: "Yoga", kind: "course" });
  await doc("activity_definitions", "d-oficina", { title: "Oficina", kind: "workshop" });
  await doc("activity_definitions", "d-atend", { title: "Consulta", kind: "appointment" });
  await doc("activity_definitions", "d-loc", { title: "Locacao", kind: "rental" });
  await doc("profiles", "prof", { display_name: "TESTE INTERNO Professora", email: "prof@potala.test", phone: "11999990000", roles: ["professional"], active: true });
  await doc("profiles", "al-1", { display_name: "TESTE INTERNO Aluno 1", email: "aluno1@potala.test", roles: ["student"], active: true });
  await doc("profiles", "al-2", { display_name: "TESTE INTERNO Aluno 2", email: "aluno2@potala.test", roles: ["student"], active: true });
  await doc("rooms", "sala", { code: "S1", name: "TESTE INTERNO Sala", status: "available", capacity: 20 });
  await doc("activity_offerings", "pub", { title: "TESTE INTERNO Curso publicado", definition_id: "d-curso", professional_id: "prof", mode: "online", capacity: 2, published: true, summary: "Resumo do curso", price_text: "R$ 100", image: "media/cursos/a.jpg" });
  await doc("activity_offerings", "oficina", { title: "TESTE INTERNO Oficina publicada", definition_id: "d-oficina", mode: "presencial", published: true });
  await doc("activity_offerings", "sem-marca", { title: "TESTE INTERNO Sem divulgacao", definition_id: "d-curso", capacity: 5 });
  await doc("activity_offerings", "falso", { title: "TESTE INTERNO published falso", definition_id: "d-curso", published: false });
  await doc("activity_offerings", "texto", { title: "TESTE INTERNO published texto", definition_id: "d-curso", published: "sim" });
  await doc("activity_offerings", "atend", { title: "TESTE INTERNO Atendimento", definition_id: "d-atend", published: true });
  await doc("activity_offerings", "loc", { title: "TESTE INTERNO Locacao", definition_id: "d-loc", published: true });
  await doc("activity_offerings", "inativa", { title: "TESTE INTERNO Inativa", definition_id: "d-curso", published: true, active: false });
  await doc("activity_offerings", "sem-def", { title: "TESTE INTERNO Sem atividade", published: true });
  await doc("activity_offerings", "img-ruim", { title: "TESTE INTERNO Imagem externa", definition_id: "d-curso", published: true, image: "https://x.exemplo/a.jpg" });
  await doc("enrollments", "e1", { profile_id: "al-1", offering_id: "pub", status: "active" });
  await doc("enrollments", "e2", { profile_id: "al-2", offering_id: "pub", status: "cancelled" });
  await doc("schedule_items", "s1", { offering_id: "pub", title: "Aula 1", starts_at: FUTURO, ends_at: "2099-01-10T14:00:00+00", status: "booked", mode: "online", online_url: "https://meet.exemplo.com/SEGREDO" });
  await doc("schedule_items", "s0", { offering_id: "pub", room_id: "sala", title: "Aula passada", starts_at: "2020-01-10T13:00:00+00", ends_at: "2020-01-10T14:00:00+00", status: "booked" });
  if (aplicar) await db.exec(mig("202611160001_cursos_publicos.sql"));
  const como = async (papel, sql, params) => { await db.exec(`set role ${papel}`); try { return await db.query(sql, params); } finally { await db.exec("reset role"); } };
  return { db, como };
}

test("anonimo ve so turmas ativas, marcadas e de atividade publicavel", async () => {
  const { como } = await montar();
  const r = await como("anon", "select public.list_public_courses() as c");
  const ids = r.rows[0].c.map((x) => x.id).sort();
  assert.deepEqual(ids, ["img-ruim", "oficina", "pub"]);
});

test("nenhum dado de aluno, contato ou link privado vaza", async () => {
  const { como } = await montar();
  const texto = JSON.stringify((await como("anon", "select public.list_public_courses() as c")).rows[0].c);
  for (const proibido of ["aluno1@", "aluno2@", "al-1", "al-2", "prof@potala", "11999990000", "SEGREDO", "meet.exemplo", "online_url", "profile_id", "enrollments"]) {
    assert.ok(!texto.includes(proibido), `vazou: ${proibido}`);
  }
});

test("vagas contam inscricoes ativas/concluidas e a proxima aula e futura", async () => {
  const { como, db } = await montar();
  const lista = (await como("anon", "select public.list_public_courses() as c")).rows[0].c;
  const pub = lista.find((x) => x.id === "pub");
  assert.equal(pub.capacity, 2);
  assert.equal(pub.spots_left, 1); /* cancelada nao ocupa vaga */
  assert.equal(pub.availability, "aberta");
  assert.equal(pub.teacher_name, "TESTE INTERNO Professora");
  assert.equal(pub.mode, "online");
  assert.equal(pub.kind, "course");
  assert.equal(pub.image, "media/cursos/a.jpg");
  assert.equal(new Date(pub.next_session.starts_at).toISOString(), new Date("2099-01-10T13:00:00Z").toISOString());
  assert.deepEqual(Object.keys(pub.next_session).sort(), ["ends_at", "mode", "starts_at"]);
  /* lotar: segunda inscricao ativa */
  await db.query("insert into public.op_records(collection,id,document) values ('enrollments','e3','{\"id\":\"e3\",\"profile_id\":\"al-2\",\"offering_id\":\"pub\",\"status\":\"active\"}'::jsonb)");
  const cheia = (await como("anon", "select public.list_public_courses() as c")).rows[0].c.find((x) => x.id === "pub");
  assert.equal(cheia.availability, "esgotado");
  assert.equal(cheia.spots_left, 0);
  /* sem capacidade = sem limite; imagem fora de media/ some */
  const livre = lista.find((x) => x.id === "oficina");
  assert.equal(livre.capacity, null);
  assert.equal(livre.availability, "aberta");
  assert.equal(lista.find((x) => x.id === "img-ruim").image, null);
});

test("anonimo nao le op_records direto; so a funcao e publica", async () => {
  const { como } = await montar();
  await assert.rejects(() => como("anon", "select * from public.op_records limit 1"), /permission denied/i);
  const priv = (await como("anon", "select has_function_privilege('anon','public.list_public_courses()','execute') as a, has_function_privilege('public','public.list_public_courses()','execute') as p")).rows[0];
  assert.equal(priv.a, true);
  const authn = (await como("authenticated", "select public.list_public_courses() as c")).rows[0].c;
  assert.equal(authn.length, 3);
});

test("sem turmas divulgadas devolve lista vazia", async () => {
  const { db, como } = await montar();
  await db.exec("update public.op_records set document = document - 'published' where collection = 'activity_offerings'");
  assert.deepEqual((await como("anon", "select public.list_public_courses() as c")).rows[0].c, []);
});

test("a funcao e somente leitura (nao altera registros)", async () => {
  const { db, como } = await montar();
  const antes = (await db.query("select md5(string_agg(document::text, '|' order by collection, id)) as h, count(*) as n from public.op_records")).rows[0];
  await como("anon", "select public.list_public_courses()");
  const depois = (await db.query("select md5(string_agg(document::text, '|' order by collection, id)) as h, count(*) as n from public.op_records")).rows[0];
  assert.deepEqual(depois, antes);
});

test("rollback remove a funcao e preserva os dados; reaplicar e seguro", async () => {
  const { db } = await montar();
  const n = async () => Number((await db.query("select count(*) as n from public.op_records")).rows[0].n);
  const antes = await n();
  await db.exec(ROLLBACK);
  assert.equal((await db.query("select count(*) as n from pg_proc where proname = 'list_public_courses'")).rows[0].n, 0);
  assert.equal(await n(), antes);
  await db.exec(mig("202611160001_cursos_publicos.sql"));
  await db.exec(mig("202611160001_cursos_publicos.sql"));
  assert.equal((await db.query("select count(*) as n from pg_proc where proname = 'list_public_courses'")).rows[0].n, 1);
});
