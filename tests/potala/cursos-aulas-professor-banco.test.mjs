import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

/*
 * Banco real (PGlite): my_teaching_courses() (202611160009) ao lado de my_course_enrollments().
 * O professor atribuido a turma entra sem matricula e sem pagamento; o aluno continua exigindo
 * matricula; quem nao e o professor da turma nada recebe; revogar a atribuicao revoga o acesso.
 */
const sql = (nome) => readFileSync(new URL(`../../supabase/migrations/${nome}`, import.meta.url), "utf8");
const U = {
  prof: "00000000-0000-4000-8000-0000000000b1",
  outroProf: "00000000-0000-4000-8000-0000000000b2",
  aluna: "00000000-0000-4000-8000-0000000000b3",
  semConta: "00000000-0000-4000-8000-0000000000b4",
  profInativo: "00000000-0000-4000-8000-0000000000b5",
  semPapel: "00000000-0000-4000-8000-0000000000b6",
};
const EMAIL = { prof: "prof@example.invalid", outroProf: "outro-prof@example.invalid", aluna: "aluna@example.invalid", semConta: "sc@example.invalid", profInativo: "pi@example.invalid", semPapel: "sp@example.invalid" };
const dia = (n, horas = 0) => new Date(Date.now() + n * 86400000 + horas * 3600000).toISOString();
const LINK = "https://meet.example.invalid/sala-da-turma";

async function montar() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, deleted_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table public.op_records(collection text not null, id text not null, document jsonb not null, updated_at timestamptz not null default now(), primary key(collection,id));
    create table public.appointment_profile_accounts(user_id uuid primary key references auth.users(id), profile_id text not null unique, active boolean not null default true);
    revoke all on all tables in schema public from anon, authenticated;
  `);
  for (const [k, id] of Object.entries(U)) await db.query("insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())", [id, EMAIL[k]]);
  await db.exec(sql("202611110001_my_course_enrollments.sql"));
  await db.exec(sql("202611110002_my_course_enrollments_online_link.sql"));
  await db.exec(sql("202611160009_cursos_aulas_do_professor.sql"));
  await db.exec("grant usage on schema public, auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon");

  const put = (c, id, d) => db.query("insert into public.op_records(collection,id,document) values ($1,$2,$3::jsonb)", [c, id, JSON.stringify({ id, ...d })]);
  const conta = (uid, perfil, ativo = true) => db.query("insert into public.appointment_profile_accounts(user_id,profile_id,active) values ($1,$2,$3)", [uid, perfil, ativo]);
  await put("profiles", "p-prof", { display_name: "Profa. Sintetica", email: EMAIL.prof, roles: ["professional"], active: true });
  await put("profiles", "p-outro", { display_name: "Outro Prof", email: EMAIL.outroProf, roles: ["professional"], active: true });
  await put("profiles", "p-aluna", { display_name: "Aluna", email: EMAIL.aluna, roles: ["client"], active: true });
  await put("profiles", "p-inativo", { display_name: "Inativo", email: EMAIL.profInativo, roles: ["professional"], active: false });
  await put("profiles", "p-sempapel", { display_name: "Sem papel", email: EMAIL.semPapel, roles: ["client"], active: true });
  await put("activity_definitions", "def", { title: "Curso Sintetico", kind: "course" });
  await conta(U.prof, "p-prof"); await conta(U.outroProf, "p-outro"); await conta(U.profInativo, "p-inativo"); await conta(U.semPapel, "p-sempapel");

  const turma = async (ref, { prof = "p-prof", modo = "online", aulas = [{}] } = {}) => {
    await put("activity_offerings", ref, { definition_id: "def", title: `Turma ${ref}`, professional_id: prof, mode: modo, capacity: 10 });
    for (const [i, aula] of aulas.entries()) {
      await put("schedule_items", `s-${ref}-${i}`, { offering_id: ref, status: "booked", mode: "online", starts_at: dia(2), ends_at: dia(2, 1), online_url: LINK, ...aula });
    }
  };
  const chamar = async (fn, uid, papel = "authenticated") => {
    await db.exec(`set test.uid = '${uid || ""}'; set role ${papel}`);
    try { return (await db.query(`select public.${fn}() as r`)).rows[0].r; } finally { await db.exec("reset role"); }
  };
  const ensina = (uid, papel) => chamar("my_teaching_courses", uid, papel);
  const aluno = (uid) => chamar("my_course_enrollments", uid);
  const foto = async () => (await db.query("select md5(coalesce(string_agg(collection||id||document::text,'|' order by collection,id),'')) h, count(*)::int n from public.op_records")).rows[0];
  return { db, put, turma, ensina, aluno, foto };
}

test("professor atribuido recebe a turma e o link da proxima aula SEM matricula e sem pagamento", async () => {
  const { turma, ensina, foto } = await montar();
  await turma("t1");
  const antes = await foto();
  const r = await ensina(U.prof);
  assert.equal(r.length, 1);
  assert.equal(r[0].course_ref, "t1");
  assert.equal(r[0].join_url, LINK);
  assert.equal(r[0].modality, "Online");
  assert.equal(r[0].students, 0);
  assert.deepEqual(await foto(), antes, "ler nao cria matricula, pedido nem registro algum");
});

test("aluno continua exigindo matricula valida; professor e aluno entram na MESMA sala", async () => {
  const { put, turma, ensina, aluno } = await montar();
  await turma("t1");
  assert.deepEqual(await aluno(U.aluna), [], "sem matricula, nada");
  await put("enrollments", "e1", { profile_id: "p-aluna", offering_id: "t1", status: "waitlist" });
  assert.equal((await aluno(U.aluna))[0].join_url, null, "lista de espera nao recebe link");
  await put("enrollments", "e2", { profile_id: "p-aluna", offering_id: "t1", status: "active" });
  const doAluno = (await aluno(U.aluna)).find((x) => x.course_ref === "t1");
  const doProf = (await ensina(U.prof))[0];
  assert.equal(doAluno.join_url, LINK);
  assert.equal(doProf.join_url, doAluno.join_url, "mesma sala");
  assert.equal(doProf.students, 1);
});

test("professor nao atribuido, conta sem vinculo, vinculo inativo, perfil inativo ou sem papel: nada", async () => {
  const { db, turma, ensina } = await montar();
  await turma("t1");
  assert.deepEqual(await ensina(U.outroProf), [], "profissional de outra turma");
  assert.deepEqual(await ensina(U.aluna), [], "aluna");
  assert.deepEqual(await ensina(U.semConta), [], "sem vinculo");
  await turma("t-inativo", { prof: "p-inativo" });
  assert.deepEqual(await ensina(U.profInativo), [], "perfil inativo");
  await turma("t-sempapel", { prof: "p-sempapel" });
  assert.deepEqual(await ensina(U.semPapel), [], "perfil sem papel professional");
  await db.query("update public.appointment_profile_accounts set active=false where user_id=$1", [U.prof]);
  assert.deepEqual(await ensina(U.prof), [], "vinculo da conta desativado");
});

test("anonimo e negado", async () => {
  const { ensina } = await montar();
  await assert.rejects(() => ensina(null, "anon"), /permission denied|42501|Entre na sua conta/i);
  await assert.rejects(() => ensina(null, "authenticated"), /Entre na sua conta/);
});

test("so a proxima aula libera link: posterior, passada, cancelada, presencial e nao-https nao", async () => {
  const { turma, ensina } = await montar();
  await turma("t-ordem", { aulas: [
    { online_url: "https://meet.example.invalid/depois", starts_at: dia(5), ends_at: dia(5, 1) },
    { online_url: "https://meet.example.invalid/proxima", starts_at: dia(1), ends_at: dia(1, 1) },
    { online_url: "https://meet.example.invalid/passada", starts_at: dia(-1), ends_at: dia(-1, 1) },
    { online_url: "https://meet.example.invalid/cancelada", status: "cancelled", starts_at: dia(0, 1), ends_at: dia(0, 2) },
  ] });
  await turma("t-andamento", { aulas: [{ online_url: "https://meet.example.invalid/agora", starts_at: dia(0, -1), ends_at: dia(0, 1) }] });
  await turma("t-so-passada", { aulas: [{ starts_at: dia(-3), ends_at: dia(-3, 1) }] });
  await turma("t-presencial", { modo: "presencial" });
  await turma("t-http", { aulas: [{ online_url: "http://meet.example.invalid/x" }] });
  await turma("t-js", { aulas: [{ online_url: "javascript:alert(1)" }] });
  await turma("t-sem-link", { aulas: [{ online_url: "" }] });
  const r = Object.fromEntries((await ensina(U.prof)).map((x) => [x.course_ref, x.join_url]));
  assert.equal(r["t-ordem"], "https://meet.example.invalid/proxima");
  assert.equal(r["t-andamento"], "https://meet.example.invalid/agora");
  for (const k of ["t-so-passada", "t-presencial", "t-http", "t-js", "t-sem-link"]) assert.equal(r[k], null, k);
});

test("revogar a atribuicao da turma revoga o acesso na hora (e reatribuir devolve)", async () => {
  const { db, turma, ensina } = await montar();
  await turma("t1");
  assert.equal((await ensina(U.prof)).length, 1);
  await db.query(`update public.op_records set document = jsonb_set(document,'{professional_id}','"p-outro"') where collection='activity_offerings' and id='t1'`);
  assert.deepEqual(await ensina(U.prof), []);
  assert.equal((await ensina(U.outroProf))[0].join_url, LINK);
  await db.query(`update public.op_records set document = jsonb_set(document,'{professional_id}','"p-prof"') where collection='activity_offerings' and id='t1'`);
  assert.equal((await ensina(U.prof)).length, 1);
});

test("professor que tambem e aluno de OUTRA turma: ensina so a sua; a do outro continua exigindo matricula ativa", async () => {
  const { put, turma, ensina, aluno } = await montar();
  await turma("t-minha");
  await turma("t-do-outro", { prof: "p-outro" });
  const r = await ensina(U.prof);
  assert.deepEqual(r.map((x) => x.course_ref), ["t-minha"]);
  assert.equal((await aluno(U.prof)).length, 0, "ensinar nao vira matricula nem libera o curso do outro");
  await put("enrollments", "e-x", { profile_id: "p-prof", offering_id: "t-do-outro", status: "waitlist" });
  assert.equal((await aluno(U.prof)).find((x) => x.course_ref === "t-do-outro").join_url, null);
});

test("definicao e permissoes: security definer, search_path vazio, so authenticated executa, nada grava", async () => {
  const { db, turma, ensina, foto } = await montar();
  const f = (await db.query(`select p.prosecdef, p.provolatile, p.proconfig, has_function_privilege('anon',p.oid,'execute') anon, has_function_privilege('authenticated',p.oid,'execute') auth from pg_proc p where p.proname='my_teaching_courses'`)).rows[0];
  assert.equal(f.prosecdef, true);
  assert.equal(f.provolatile, "s");
  assert.ok(f.proconfig.includes('search_path=""'));
  assert.equal(f.anon, false);
  assert.equal(f.auth, true);
  await turma("t1");
  const antes = await foto();
  await ensina(U.prof);
  await ensina(U.prof);
  assert.deepEqual(await foto(), antes);
});

test("o rollback remove so a funcao e nao toca nos dados", async () => {
  const { db, turma, foto } = await montar();
  await turma("t1");
  const antes = await foto();
  await db.exec(readFileSync(new URL("../../supabase/rollbacks/202611160009_rollback_cursos_aulas_do_professor.sql", import.meta.url), "utf8"));
  assert.equal((await db.query("select count(*)::int n from pg_proc where proname='my_teaching_courses'")).rows[0].n, 0);
  assert.deepEqual(await foto(), antes);
});
