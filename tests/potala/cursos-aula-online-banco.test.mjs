import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

/*
 * Banco real (PGlite, em memoria): my_course_enrollments() depois das migrations 202611110001 e
 * 202611110002. Foco: o link da aula online (join_url) so chega ao aluno certo, na hora certa.
 */
const sql = (nome) => readFileSync(new URL(`../../supabase/migrations/${nome}`, import.meta.url), "utf8");
const U = {
  aluna: "00000000-0000-4000-8000-0000000000a1",
  outro: "00000000-0000-4000-8000-0000000000a2",
  semPerfil: "00000000-0000-4000-8000-0000000000a3",
};
const EMAIL = { aluna: "aluna@example.invalid", outro: "outro@example.invalid", semPerfil: "sem-perfil@example.invalid" };
const dia = (n, horas = 0) => new Date(Date.now() + n * 86400000 + horas * 3600000).toISOString();
const LINK = "https://meet.example.invalid/sala-ok";

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
  for (const [k, id] of Object.entries(U)) {
    await db.query("insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())", [id, EMAIL[k]]);
  }
  await db.exec(sql("202611110001_my_course_enrollments.sql"));
  await db.exec(sql("202611110002_my_course_enrollments_online_link.sql"));
  await db.exec("grant usage on schema public, auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon");

  const put = (colecao, id, documento) => db.query("insert into public.op_records(collection,id,document) values ($1,$2,$3::jsonb)", [colecao, id, JSON.stringify({ id, ...documento })]);
  await put("profiles", "p-prof", { display_name: "Profa. Sintetica", email: "prof@example.invalid", roles: ["professional"], active: true });
  await put("profiles", "p-aluna", { display_name: "Aluna", email: EMAIL.aluna, roles: ["client"], active: true });
  await put("profiles", "p-outro", { display_name: "Outro", email: EMAIL.outro, roles: ["client"], active: true });
  await put("activity_definitions", "def", { title: "Curso Sintetico", kind: "course" });

  /* Uma turma: oferta + inscricao da dona + aulas. Cada cenario usa a sua turma. */
  const turma = async (ref, { dona = "p-aluna", modo = "online", inscricao = "active", aulas = [] } = {}) => {
    await put("activity_offerings", ref, { definition_id: "def", title: `Turma ${ref}`, professional_id: "p-prof", mode: modo, capacity: 10 });
    await put("enrollments", `e-${ref}`, { profile_id: dona, offering_id: ref, status: inscricao });
    for (const [i, aula] of aulas.entries()) {
      await put("schedule_items", `s-${ref}-${i}`, {
        offering_id: ref, status: "booked", mode: "online", starts_at: dia(2), ends_at: dia(2, 1), online_url: LINK, ...aula,
      });
    }
  };

  const como = async (uid, papel = "authenticated") => {
    await db.exec(`set test.uid = '${uid || ""}'; set role ${papel}`);
    try { return (await db.query("select public.my_course_enrollments() as r")).rows[0].r; } finally { await db.exec("reset role"); }
  };
  const link = (linhas, ref) => linhas.find((x) => x.course_ref === ref)?.join_url;
  return { db, put, turma, como, link };
}

test("aluna com inscricao ativa em turma online recebe o link da proxima aula online", async () => {
  const { db, turma, como, link } = await montar();
  await turma("t-ok", { aulas: [{}] });
  const r = await como(U.aluna);
  assert.equal(link(r, "t-ok"), LINK);
  const linha = r.find((x) => x.course_ref === "t-ok");
  assert.equal(linha.modality, "Online");
  assert.equal(linha.status, "proximo_encontro");
  assert.ok(linha.next_session_at, "a proxima aula continua aparecendo");
  assert.deepEqual(Object.keys(linha).sort(), ["course_ref", "course_title", "enrolled_at", "id", "join_url", "modality", "next_session_at", "status", "teacher_name"]);
  await db.close();
});

test("lista de espera e concluida nao recebem link; cancelada nem aparece", async () => {
  const { db, turma, como, link } = await montar();
  await turma("t-espera", { inscricao: "waitlist", aulas: [{}] });
  await turma("t-feita", { inscricao: "completed", aulas: [{}] });
  await turma("t-cancelada", { inscricao: "cancelled", aulas: [{}] });
  const r = await como(U.aluna);
  assert.equal(link(r, "t-espera"), null);
  assert.equal(link(r, "t-feita"), null);
  assert.ok(!r.some((x) => x.course_ref === "t-cancelada"), "cancelada nao aparece");
  assert.ok(!JSON.stringify(r).includes(LINK), "o link nao vaza por nenhum outro campo");
  await db.close();
});

test("turma presencial ou aula presencial nao entrega link", async () => {
  const { db, turma, como, link } = await montar();
  await turma("t-pres", { modo: "presencial", aulas: [{ mode: "presencial", online_url: LINK }] });
  await turma("t-pres-com-aula-online", { modo: "presencial", aulas: [{}] });
  await turma("t-online-aula-pres", { aulas: [{ mode: "presencial" }] });
  const r = await como(U.aluna);
  for (const ref of ["t-pres", "t-pres-com-aula-online", "t-online-aula-pres"]) assert.equal(link(r, ref), null, ref);
  await db.close();
});

test("sem link cadastrado, ou sem aula futura, o link e nulo", async () => {
  const { db, turma, como, link } = await montar();
  await turma("t-sem-link", { aulas: [{ online_url: "" }] });
  await turma("t-sem-campo", { aulas: [{ online_url: undefined }] });
  await turma("t-sem-aula", { aulas: [] });
  await turma("t-so-passada", { aulas: [{ starts_at: dia(-3), ends_at: dia(-3, 1) }] });
  await turma("t-so-cancelada", { aulas: [{ status: "cancelled" }] });
  const r = await como(U.aluna);
  for (const ref of ["t-sem-link", "t-sem-campo", "t-sem-aula", "t-so-passada", "t-so-cancelada"]) assert.equal(link(r, ref), null, ref);
  await db.close();
});

test("so https e aceito: http, javascript:, data:, ftp:, espacos, aspas, tags e links gigantes viram nulo", async () => {
  const { db, turma, como, link } = await montar();
  const INSEGUROS = {
    http: "http://meet.example.invalid/a",
    js: "javascript:alert(1)",
    data: "data:text/html,<script>alert(1)</script>",
    ftp: "ftp://meet.example.invalid/a",
    espaco: "https://meet.example.invalid/a b",
    semHost: "https://",
    aspas: 'https://meet.example.invalid/a"onmouseover="x',
    tag: "https://meet.example.invalid/<script>",
    barra: "https://meet.example.invalid\\evil",
    longo: `https://meet.example.invalid/${"a".repeat(2000)}`,
    relativo: "/sala/123",
    esquemaMisto: "HtTpS://\njavascript:alert(1)",
  };
  for (const [nome, url] of Object.entries(INSEGUROS)) await turma(`t-x-${nome}`, { aulas: [{ online_url: url }] });
  await turma("t-maiusculo", { aulas: [{ online_url: "HTTPS://Meet.Example.Invalid/Sala?x=1&y=2" }] });
  const r = await como(U.aluna);
  for (const nome of Object.keys(INSEGUROS)) assert.equal(link(r, `t-x-${nome}`), null, nome);
  assert.equal(link(r, "t-maiusculo"), "HTTPS://Meet.Example.Invalid/Sala?x=1&y=2", "https em maiusculas e valido");
  await db.close();
});

test("o link e o da PROXIMA aula futura; passada e cancelada nao contam; aula em andamento conta", async () => {
  const { db, turma, como, link } = await montar();
  await turma("t-dois", { aulas: [
    { online_url: "https://meet.example.invalid/depois", starts_at: dia(5), ends_at: dia(5, 1) },
    { online_url: "https://meet.example.invalid/antes", starts_at: dia(1), ends_at: dia(1, 1) },
    { online_url: "https://meet.example.invalid/passada", starts_at: dia(-1), ends_at: dia(-1, 1) },
    { online_url: "https://meet.example.invalid/cancelada", status: "cancelled", starts_at: dia(0, 1), ends_at: dia(0, 2) },
  ] });
  await turma("t-andamento", { aulas: [{ online_url: "https://meet.example.invalid/agora", starts_at: dia(0, -1), ends_at: dia(0, 1) }] });
  const r = await como(U.aluna);
  assert.equal(link(r, "t-dois"), "https://meet.example.invalid/antes");
  assert.equal(link(r, "t-andamento"), "https://meet.example.invalid/agora");
  await db.close();
});

test("outra conta nunca recebe o link da aluna; anonimo e negado; conta sem cadastro nao ve nada", async () => {
  const { db, turma, como } = await montar();
  await turma("t-aluna", { aulas: [{ online_url: "https://meet.example.invalid/so-da-aluna" }] });
  await turma("t-outro", { dona: "p-outro", aulas: [{ online_url: "https://meet.example.invalid/so-do-outro" }] });
  const doOutro = await como(U.outro);
  assert.deepEqual(doOutro.map((x) => x.course_ref), ["t-outro"]);
  assert.ok(!JSON.stringify(doOutro).includes("so-da-aluna"), "link da aluna nao chega ao outro");
  const daAluna = await como(U.aluna);
  assert.ok(!JSON.stringify(daAluna).includes("so-do-outro"), "link do outro nao chega a aluna");
  assert.deepEqual(await como(U.semPerfil), []);
  await assert.rejects(como(null), (erro) => erro.code === "42501" || /Entre na sua conta/.test(erro.message));
  await assert.rejects(como(null, "anon"), /permission denied/i);
  await db.close();
});

test("permissoes e definicao continuam as homologadas; a funcao nao grava nada", async () => {
  const { db, turma, como } = await montar();
  await turma("t-ok", { aulas: [{}] });
  const fp = async () => (await db.query("select md5(string_agg(collection||id||updated_at::text||document::text, ',' order by collection, id)) as h, count(*)::int as n from public.op_records")).rows[0];
  const antes = await fp();
  await como(U.aluna); await como(U.outro);
  assert.deepEqual(await fp(), antes, "op_records identico depois das consultas");
  const f = (await db.query(`
    select p.prosecdef as definer, p.provolatile as vol,
      (select bool_or(replace(c, '"', '') = 'search_path=') from unnest(p.proconfig) c) as search_path_vazio,
      has_function_privilege('authenticated', p.oid, 'execute') as auth_exec,
      has_function_privilege('anon', p.oid, 'execute') as anon_exec,
      exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_exec
    from pg_proc p where p.oid = 'public.my_course_enrollments()'::regprocedure`)).rows[0];
  assert.deepEqual(f, { definer: true, vol: "s", search_path_vazio: true, auth_exec: true, anon_exec: false, public_exec: false });
  await db.close();
});
