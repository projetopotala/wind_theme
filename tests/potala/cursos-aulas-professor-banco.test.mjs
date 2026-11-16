import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

/*
 * Banco real (PGlite): my_teaching_courses(), my_course_enrollments() e course_room_state()
 * (202611160009) sobre as migrations 202611110001/0002. O professor atribuido a turma entra sem
 * matricula e sem pagamento; o aluno exige matricula ativa; ambos recebem o MESMO link e so dentro
 * da janela (15 min antes ate 30 min depois do fim); revogar a atribuicao revoga novas autorizacoes.
 * O link e externo: estes testes provam quem RECEBE o link e quando, nao o controle do provedor.
 */
const sql = (nome) => readFileSync(new URL(`../../supabase/migrations/${nome}`, import.meta.url), "utf8");
const U = {
  prof: "00000000-0000-4000-8000-0000000000b1",
  outroProf: "00000000-0000-4000-8000-0000000000b2",
  aluna: "00000000-0000-4000-8000-0000000000b3",
  semConta: "00000000-0000-4000-8000-0000000000b4",
  profInativo: "00000000-0000-4000-8000-0000000000b5",
  semPapel: "00000000-0000-4000-8000-0000000000b6",
  outraAluna: "00000000-0000-4000-8000-0000000000b7",
};
const EMAIL = { prof: "prof@example.invalid", outroProf: "outro-prof@example.invalid", aluna: "aluna@example.invalid", semConta: "sc@example.invalid", profInativo: "pi@example.invalid", semPapel: "sp@example.invalid", outraAluna: "oa@example.invalid" };
const min = (n) => new Date(Date.now() + n * 60000).toISOString();
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
  await put("profiles", "p-outra", { display_name: "Outra aluna", email: EMAIL.outraAluna, roles: ["client"], active: true });
  await put("profiles", "p-inativo", { display_name: "Inativo", email: EMAIL.profInativo, roles: ["professional"], active: false });
  await put("profiles", "p-sempapel", { display_name: "Sem papel", email: EMAIL.semPapel, roles: ["client"], active: true });
  await put("activity_definitions", "def", { title: "Curso Sintetico", kind: "course" });
  await conta(U.prof, "p-prof"); await conta(U.outroProf, "p-outro"); await conta(U.profInativo, "p-inativo"); await conta(U.semPapel, "p-sempapel");

  /* Padrao: uma aula que comeca em 5 min (janela aberta). */
  const turma = async (ref, { prof = "p-prof", modo = "online", aulas = [{}] } = {}) => {
    await put("activity_offerings", ref, { definition_id: "def", title: `Turma ${ref}`, professional_id: prof, mode: modo, capacity: 10 });
    for (const [i, aula] of aulas.entries()) {
      await put("schedule_items", `s-${ref}-${i}`, { offering_id: ref, status: "booked", mode: "online", starts_at: min(5), ends_at: min(65), online_url: LINK, ...aula });
    }
  };
  const chamar = async (fn, uid, papel = "authenticated") => {
    await db.exec(`set test.uid = '${uid || ""}'; set role ${papel}`);
    try { return (await db.query(`select public.${fn}() as r`)).rows[0].r; } finally { await db.exec("reset role"); }
  };
  const ensina = (uid, papel) => chamar("my_teaching_courses", uid, papel);
  const aluno = (uid) => chamar("my_course_enrollments", uid);
  const matricula = (id, perfil, offering, status = "active") => put("enrollments", id, { profile_id: perfil, offering_id: offering, status });
  const foto = async () => (await db.query("select md5(coalesce(string_agg(collection||id||document::text,'|' order by collection,id),'')) h, count(*)::int n from public.op_records")).rows[0];
  const estado = async (ini, fim, em) => (await db.query("select public.course_room_state($1::timestamptz,$2::timestamptz,$3::timestamptz) s", [ini, fim, em])).rows[0].s;
  return { db, put, turma, ensina, aluno, matricula, foto, estado };
}
const por = (lista, ref) => lista.find((x) => x.course_ref === ref);

test("professor atribuido recebe a turma e o link SEM matricula e sem pagamento; ler nao grava nada", async () => {
  const { turma, ensina, foto } = await montar();
  await turma("t1");
  const antes = await foto();
  const r = await ensina(U.prof);
  assert.equal(r.length, 1);
  assert.equal(r[0].course_ref, "t1");
  assert.equal(r[0].join_url, LINK);
  assert.equal(r[0].room_state, "aberta");
  assert.equal(r[0].modality, "Online");
  assert.equal(r[0].students, 0, "nenhuma matricula foi criada para o professor");
  assert.deepEqual(await foto(), antes, "nem matricula, nem pedido, nem registro algum");
});

test("aluno exige matricula ATIVA: sem matricula, espera, cancelada, outra turma, outro aluno; ativa recebe", async () => {
  const { turma, aluno, matricula } = await montar();
  await turma("t1");
  await turma("t2");
  assert.deepEqual(await aluno(U.aluna), [], "sem matricula, nada");
  await matricula("e-espera", "p-aluna", "t1", "waitlist");
  assert.equal(por(await aluno(U.aluna), "t1").join_url, null, "lista de espera nao recebe link");
  await matricula("e-canc", "p-outra", "t1", "cancelled");
  assert.deepEqual(await aluno(U.outraAluna), [], "matricula cancelada nem aparece");
  await matricula("e-t2", "p-outra", "t2", "active");
  const outra = await aluno(U.outraAluna);
  assert.equal(por(outra, "t2").join_url, LINK);
  assert.equal(por(outra, "t1"), undefined, "aluna de outra turma nao recebe a turma t1");
  assert.equal(por(await aluno(U.aluna), "t2"), undefined);
});

test("professor e aluno matriculado entram na MESMA sala", async () => {
  const { turma, ensina, aluno, matricula } = await montar();
  await turma("t1");
  await matricula("e1", "p-aluna", "t1");
  const doAluno = por(await aluno(U.aluna), "t1");
  const doProf = (await ensina(U.prof))[0];
  assert.equal(doAluno.join_url, LINK);
  assert.equal(doProf.join_url, doAluno.join_url);
  assert.equal(doProf.join_opens_at, doAluno.join_opens_at, "mesma janela");
  assert.equal(doProf.students, 1);
});

test("nao atribuido, sem vinculo, vinculo inativo, perfil inativo, sem papel, removido da turma: nada", async () => {
  const { db, turma, ensina } = await montar();
  await turma("t1");
  assert.deepEqual(await ensina(U.outroProf), [], "profissional de outra turma");
  assert.deepEqual(await ensina(U.aluna), [], "aluna");
  assert.deepEqual(await ensina(U.semConta), [], "sem vinculo");
  await turma("t-inativo", { prof: "p-inativo" });
  assert.deepEqual(await ensina(U.profInativo), [], "perfil inativo");
  await turma("t-sempapel", { prof: "p-sempapel" });
  assert.deepEqual(await ensina(U.semPapel), [], "perfil sem papel professional");
  await db.query(`update public.op_records set document = jsonb_set(document,'{professional_id}','"p-outro"') where collection='activity_offerings' and id='t1'`);
  assert.deepEqual(await ensina(U.prof), [], "removido da turma perde a autorizacao na hora");
  assert.equal((await ensina(U.outroProf))[0].join_url, LINK);
  await db.query(`update public.op_records set document = jsonb_set(document,'{professional_id}','"p-prof"') where collection='activity_offerings' and id='t1'`);
  assert.equal((await ensina(U.prof))[0].join_url, LINK);
  await db.query("update public.appointment_profile_accounts set active=false where user_id=$1", [U.prof]);
  assert.deepEqual(await ensina(U.prof), [], "vinculo da conta desativado");
  await db.query("update public.appointment_profile_accounts set active=true where user_id=$1", [U.prof]);
  await db.query(`update public.op_records set document = jsonb_set(document,'{active}','false') where collection='profiles' and id='p-prof'`);
  assert.deepEqual(await ensina(U.prof), [], "perfil do professor desativado");
});

test("anonimo e negado; credencial/regra privada nao e chamavel por anon nem authenticated", async () => {
  const { db, ensina, aluno } = await montar();
  await assert.rejects(() => ensina(null, "anon"), /permission denied|42501|Entre na sua conta/i);
  await assert.rejects(() => aluno(null).then(() => { throw new Error("nao devia"); }), /Entre na sua conta/);
  await assert.rejects(() => db.exec("set role anon; select public.my_course_enrollments()").finally(() => db.exec("reset role")), /permission denied/i);
  const f = (await db.query(`select has_function_privilege('anon','public.course_room_state(timestamptz,timestamptz,timestamptz)','execute') a, has_function_privilege('authenticated','public.course_room_state(timestamptz,timestamptz,timestamptz)','execute') b`)).rows[0];
  assert.deepEqual(f, { a: false, b: false });
});

test("janela: limites EXATOS (15 min antes e 30 min depois do fim, inclusivos) e fuso America/Sao_Paulo", async () => {
  const { estado } = await montar();
  const ini = "2026-11-16T19:00:00-03:00", fim = "2026-11-16T20:00:00-03:00";
  assert.equal(await estado(ini, fim, "2026-11-16T18:44:59-03:00"), "abre_depois", "15min01s antes: bloqueado");
  assert.equal(await estado(ini, fim, "2026-11-16T18:44:00-03:00"), "abre_depois", "16 min antes: bloqueado");
  assert.equal(await estado(ini, fim, "2026-11-16T18:45:00-03:00"), "aberta", "exatamente 15 min antes: liberado");
  assert.equal(await estado(ini, fim, "2026-11-16T19:30:00-03:00"), "aberta", "durante a aula");
  assert.equal(await estado(ini, fim, "2026-11-16T20:00:00-03:00"), "aberta", "no fim previsto");
  assert.equal(await estado(ini, fim, "2026-11-16T20:30:00-03:00"), "aberta", "exatamente 30 min depois: ainda liberado");
  assert.equal(await estado(ini, fim, "2026-11-16T20:30:01-03:00"), "encerrada", "depois da janela");
  /* o mesmo instante em UTC (22:00Z = 19:00 em Sao Paulo) da o mesmo resultado */
  assert.equal(await estado("2026-11-16T22:00:00Z", "2026-11-16T23:00:00Z", "2026-11-16T21:45:00Z"), "aberta");
  assert.equal(await estado("2026-11-16T22:00:00Z", "2026-11-16T23:00:00Z", "2026-11-16T21:44:59Z"), "abre_depois");
  /* aula que atravessa a meia-noite */
  assert.equal(await estado("2026-11-16T23:50:00-03:00", "2026-11-17T01:00:00-03:00", "2026-11-17T00:30:00-03:00"), "aberta");
  assert.equal(await estado("2026-11-16T23:50:00-03:00", "2026-11-17T01:00:00-03:00", "2026-11-17T01:30:01-03:00"), "encerrada");
  assert.equal(await estado(null, fim, ini), null);
});

test("janela de ponta a ponta com now(): +16 min nao libera (e diz quando abre); +14, em andamento e +29 apos o fim liberam; +31 apos o fim nao", async () => {
  const { turma, ensina, aluno, matricula } = await montar();
  await turma("t-16", { aulas: [{ starts_at: min(16), ends_at: min(76) }] });
  await turma("t-14", { aulas: [{ starts_at: min(14), ends_at: min(74) }] });
  await turma("t-agora", { aulas: [{ starts_at: min(-20), ends_at: min(40) }] });
  await turma("t-29", { aulas: [{ starts_at: min(-90), ends_at: min(-29) }] });
  await turma("t-31", { aulas: [{ starts_at: min(-92), ends_at: min(-31) }] });
  for (const t of ["t-16", "t-14", "t-agora", "t-29", "t-31"]) await matricula(`e-${t}`, "p-aluna", t);
  for (const lista of [await ensina(U.prof), await aluno(U.aluna)]) {
    assert.equal(por(lista, "t-16").join_url, null);
    assert.equal(por(lista, "t-16").room_state, "abre_depois");
    assert.ok(por(lista, "t-16").next_session_at, "a aula continua visivel");
    assert.ok(por(lista, "t-16").join_opens_at, "informa quando a sala abre");
    assert.equal(por(lista, "t-14").join_url, LINK);
    assert.equal(por(lista, "t-agora").join_url, LINK);
    assert.equal(por(lista, "t-29").join_url, LINK);
    assert.equal(por(lista, "t-31").join_url, null);
    assert.equal(por(lista, "t-31").next_session_at, null, "depois da janela nao ha nova autorizacao");
  }
  const t16 = por(await ensina(U.prof), "t-16");
  assert.equal(new Date(t16.join_opens_at).getTime() + 15 * 60000, new Date(t16.next_session_at).getTime(), "abre 15 min antes do inicio");
});

test("aula cancelada, presencial, sem link, http/javascript: nao liberam sala online", async () => {
  const { turma, ensina, aluno, matricula } = await montar();
  await turma("t-canc", { aulas: [{ status: "cancelled" }] });
  await turma("t-presencial", { modo: "presencial" });
  await turma("t-aula-presencial", { aulas: [{ mode: "presencial" }] });
  await turma("t-http", { aulas: [{ online_url: "http://meet.example.invalid/x" }] });
  await turma("t-js", { aulas: [{ online_url: "javascript:alert(1)" }] });
  await turma("t-sem-link", { aulas: [{ online_url: "" }] });
  for (const t of ["t-canc", "t-presencial", "t-aula-presencial", "t-http", "t-js", "t-sem-link"]) await matricula(`e-${t}`, "p-aluna", t);
  for (const lista of [await ensina(U.prof), await aluno(U.aluna)]) {
    for (const t of ["t-canc", "t-presencial", "t-aula-presencial", "t-http", "t-js", "t-sem-link"]) assert.equal(por(lista, t).join_url, null, t);
  }
});

test("aulas encostadas: a aula da janela aberta vence a que acabou de terminar; so uma aula libera link por vez", async () => {
  const { turma, ensina } = await montar();
  await turma("t-seq", { aulas: [
    { starts_at: min(-70), ends_at: min(-10), online_url: "https://meet.example.invalid/anterior" },
    { starts_at: min(5), ends_at: min(65), online_url: "https://meet.example.invalid/atual" },
    { starts_at: min(3000), ends_at: min(3060), online_url: "https://meet.example.invalid/futura" },
  ] });
  const r = (await ensina(U.prof))[0];
  assert.equal(r.join_url, "https://meet.example.invalid/atual");
});

test("professor que tambem e aluno de OUTRA turma: ensina so a sua; a do outro continua exigindo matricula ativa", async () => {
  const { turma, ensina, aluno, matricula } = await montar();
  await turma("t-minha");
  await turma("t-do-outro", { prof: "p-outro" });
  assert.deepEqual((await ensina(U.prof)).map((x) => x.course_ref), ["t-minha"]);
  assert.equal((await aluno(U.prof)).length, 0, "ensinar nao vira matricula nem libera o curso do outro");
  await matricula("e-x", "p-prof", "t-do-outro", "waitlist");
  assert.equal(por(await aluno(U.prof), "t-do-outro").join_url, null);
  await matricula("e-y", "p-prof", "t-do-outro", "active");
  assert.equal(por(await aluno(U.prof), "t-do-outro").join_url, LINK, "com matricula valida, regra normal de aluno");
});

test("definicao e permissoes; nada grava", async () => {
  const { db, turma, ensina, aluno, foto } = await montar();
  const f = (await db.query(`select p.proname, p.prosecdef, p.provolatile, p.proconfig, has_function_privilege('anon',p.oid,'execute') anon, has_function_privilege('authenticated',p.oid,'execute') auth from pg_proc p where p.proname in ('my_teaching_courses','my_course_enrollments') order by 1`)).rows;
  for (const x of f) {
    assert.equal(x.prosecdef, true, x.proname);
    assert.equal(x.provolatile, "s", x.proname);
    assert.ok(x.proconfig.includes('search_path=""'), x.proname);
    assert.equal(x.anon, false, x.proname);
    assert.equal(x.auth, true, x.proname);
  }
  await turma("t1");
  const antes = await foto();
  await ensina(U.prof); await aluno(U.aluna); await ensina(U.prof);
  assert.deepEqual(await foto(), antes);
});

test("o rollback devolve my_course_enrollments ao corpo anterior, remove as funcoes novas e nao toca nos dados", async () => {
  const { db, turma, matricula, aluno, foto } = await montar();
  await turma("t-longe", { aulas: [{ starts_at: min(2 * 1440), ends_at: min(2 * 1440 + 60) }] });
  await matricula("e1", "p-aluna", "t-longe");
  assert.equal(por(await aluno(U.aluna), "t-longe").join_url, null, "com a migration: fora da janela");
  const antes = await foto();
  await db.exec(readFileSync(new URL("../../supabase/rollbacks/202611160009_rollback_cursos_aulas_do_professor.sql", import.meta.url), "utf8"));
  assert.equal((await db.query("select count(*)::int n from pg_proc where proname in ('my_teaching_courses','course_room_state')")).rows[0].n, 0);
  assert.equal(por(await aluno(U.aluna), "t-longe").join_url, LINK, "comportamento anterior restaurado (sem janela)");
  assert.deepEqual(await foto(), antes);
});
