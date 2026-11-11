import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { applyScheduleCommand } from "../../outputs/js/admin/operations/schedule.js";
import { paraModelo, unirInscricoes } from "../../outputs/js/conta/adaptadores/supabase.js";

/*
 * Banco real (PGlite, em memória, descartado ao fim): my_course_enrollments().
 * As inscrições são produzidas pelo MESMO motor administrativo que o painel
 * "Cursos e atividades" usa (applyScheduleCommand) e gravadas em op_records.
 */
const mig = readFileSync(new URL("../../supabase/migrations/202611110001_my_course_enrollments.sql", import.meta.url), "utf8");
const U = {
  aluna: "00000000-0000-0000-0000-0000000000a1", outro: "00000000-0000-0000-0000-0000000000a2",
  semEmail: "00000000-0000-0000-0000-0000000000a3", semPerfil: "00000000-0000-0000-0000-0000000000a4",
  dup: "00000000-0000-0000-0000-0000000000a5", inativa: "00000000-0000-0000-0000-0000000000a6",
  vinculada: "00000000-0000-0000-0000-0000000000a7", vincInativo: "00000000-0000-0000-0000-0000000000a8",
  vincPerfilInativo: "00000000-0000-0000-0000-0000000000a9", intruso: "00000000-0000-0000-0000-0000000000b1",
  vincEmailOutro: "00000000-0000-0000-0000-0000000000b2",
};
const EMAIL = {
  aluna: "aluna@example.invalid", outro: "outro@example.invalid", dup: "dup@example.invalid", inativa: "inativa@example.invalid",
  vinculada: "vinculada@example.invalid", intruso: "intruso@example.invalid", vincEmailOutro: "outro@example.invalid",
};
const FUTURO = new Date(Date.now() + 3 * 86400000).toISOString();
const FUTURO_FIM = new Date(Date.now() + 3 * 86400000 + 3600000).toISOString();
const PASSADO = new Date(Date.now() - 3 * 86400000).toISOString();
const PASSADO_FIM = new Date(Date.now() - 3 * 86400000 + 3600000).toISOString();

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
    const confirmado = k === "semEmail" ? null : new Date().toISOString();
    await db.query("insert into auth.users(id,email,email_confirmed_at) values ($1,$2,$3)", [id, EMAIL[k] || `${k}@example.invalid`, confirmado]);
  }
  await db.exec(mig);
  await db.exec("grant usage on schema public, auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon");

  /* O Owner cadastra tudo pelo motor administrativo. */
  const ctx = { id: (() => { let n = 0; return () => `id-${++n}`; })(), now: "2026-11-01T12:00:00Z", actor: "owner" };
  const state = { profiles: [], activity_definitions: [], activity_offerings: [], enrollments: [], schedule_items: [] };
  const run = (type, payload) => applyScheduleCommand(state, { type, payload }, ctx);
  /* O motor gera os ids; guardamos o id de cada pessoa pelo apelido. */
  const P = {};
  const pessoa = (apelido, nome, email, extra = {}) => { P[apelido] = run("person.save", { display_name: nome, email, roles: ["client"], ...extra }).id; };
  P.ana = run("person.save", { display_name: "Dra. Ana", email: "ana@example.invalid", roles: ["professional"] }).id;
  pessoa("aluna", "Aluna Sintética", EMAIL.aluna);
  pessoa("outro", "Outro Aluno", EMAIL.outro);
  pessoa("dup1", "Duplicada 1", EMAIL.dup); pessoa("dup2", "Duplicada 2", "dup2@example.invalid");
  pessoa("inativa", "Inativa", EMAIL.inativa, { active: false });
  pessoa("vinculada", "Vinculada", "outro-email@example.invalid");
  pessoa("vincInativo", "Vinc Inativo", "vi@example.invalid");
  pessoa("vincPerfilInativo", "Vinc Perfil Inativo", "vpi@example.invalid", { active: false });
  const def = run("definition.save", { title: "Filosofia Prática", kind: "course" });
  const turma = run("offering.save", { title: "Turma de Filosofia — Noite", definition_id: def.id, professional_id: P.ana, mode: "online", capacity: 10 });
  const turma2 = run("offering.save", { title: "Oficina Presencial", definition_id: def.id, mode: "presencial", capacity: 10 });
  const inscrever = (profile_id, offering_id, status = "active") => run("enrollment.save", { profile_id, offering_id, status });
  const e1 = inscrever(P.aluna, turma.id);
  const e2 = inscrever(P.outro, turma2.id);
  inscrever(P.inativa, turma.id);
  inscrever(P.vinculada, turma.id);
  inscrever(P.vincInativo, turma.id);
  inscrever(P.vincPerfilInativo, turma.id);
  inscrever(P.dup1, turma.id); inscrever(P.dup2, turma.id);
  const e3 = inscrever(P.aluna, turma2.id, "waitlist");
  const mk = (collection, row) => db.query("insert into public.op_records(collection,id,document) values ($1,$2,$3::jsonb)", [collection, row.id, JSON.stringify(row)]);
  for (const c of ["profiles", "activity_definitions", "activity_offerings", "enrollments"]) for (const row of state[c]) await mk(c, row);
  /* Mesmo e-mail em dois cadastros (o motor administrativo recusa; o banco precisa resistir mesmo assim). */
  await db.query("update public.op_records set document = jsonb_set(document,'{email}',to_jsonb($1::text)) where collection='profiles' and id=$2", [EMAIL.dup, P.dup2]);
  await db.query("insert into public.appointment_profile_accounts(user_id,profile_id,active) values ($1,$5,true),($2,$6,false),($3,$7,true),($4,$8,true)", [U.vinculada, U.vincInativo, U.vincPerfilInativo, U.vincEmailOutro, P.vinculada, P.vincInativo, P.vincPerfilInativo, P.outro]);
  const como = async (uid, papel = "authenticated") => {
    await db.exec(`set test.uid = '${uid || ""}'; set role ${papel}`);
    try { return (await db.query("select public.my_course_enrollments() as r")).rows[0].r; } finally { await db.exec("reset role"); }
  };
  return { db, como, turma, turma2, e1, e2, e3, mk, state, P };
}

test("Owner inscreve pelo painel e a aluna vê curso, professor, modalidade e estado", async () => {
  const { db, como, turma } = await montar();
  const r = await como(U.aluna);
  assert.equal(r.length, 2);
  const online = r.find((x) => x.course_ref === turma.id);
  assert.equal(online.course_title, "Turma de Filosofia — Noite");
  assert.equal(online.teacher_name, "Dra. Ana");
  assert.equal(online.modality, "Online");
  assert.equal(online.status, "inscrito");
  assert.equal(online.next_session_at, null, "turma sem aula não promete data");
  assert.deepEqual(Object.keys(online).sort(), ["course_ref", "course_title", "enrolled_at", "id", "modality", "next_session_at", "status", "teacher_name"]);
  await db.close();
});

test("aula futura vira próximo encontro; aula passada ou cancelada não conta", async () => {
  const { db, como, turma, mk } = await montar();
  await mk("schedule_items", { id: "s-passada", offering_id: turma.id, status: "booked", starts_at: PASSADO, ends_at: PASSADO_FIM });
  await mk("schedule_items", { id: "s-cancelada", offering_id: turma.id, status: "cancelled", starts_at: FUTURO, ends_at: FUTURO_FIM });
  assert.equal((await como(U.aluna)).find((x) => x.course_ref === turma.id).status, "inscrito");
  await mk("schedule_items", { id: "s-futura", offering_id: turma.id, status: "booked", starts_at: FUTURO, ends_at: FUTURO_FIM });
  const online = (await como(U.aluna)).find((x) => x.course_ref === turma.id);
  assert.equal(online.status, "proximo_encontro");
  assert.equal(new Date(online.next_session_at).toISOString(), FUTURO);
  await db.close();
});

test("lista de espera, concluída e cancelada", async () => {
  const { db, como, turma2, turma, e3 } = await montar();
  assert.equal((await como(U.aluna)).find((x) => x.course_ref === turma2.id).status, "aguardando_turma");
  await db.query("update public.op_records set document = jsonb_set(document,'{status}','\"completed\"') where collection='enrollments' and id=$1", [e3.id]);
  assert.equal((await como(U.aluna)).find((x) => x.course_ref === turma2.id).status, "concluido");
  await db.query("update public.op_records set document = jsonb_set(document,'{status}','\"cancelled\"') where collection='enrollments' and id=$1", [e3.id]);
  const r = await como(U.aluna);
  assert.equal(r.length, 1);
  assert.ok(!r.some((x) => x.course_ref === turma2.id), "cancelada não aparece");
  assert.ok(r.some((x) => x.course_ref === turma.id));
  await db.close();
});

test("cada pessoa vê só a própria inscrição; conta sem inscrição, sem e-mail confirmado ou sem cadastro vê vazio", async () => {
  const { db, como, turma2 } = await montar();
  const outro = await como(U.vincEmailOutro);
  assert.deepEqual(outro.map((x) => x.course_ref), [turma2.id]);
  assert.ok(!(await como(U.aluna)).some((x) => x.id === outro[0].id), "a aluna não vê a inscrição do outro");
  assert.deepEqual(await como(U.semPerfil), [], "conta sem cadastro operacional");
  assert.deepEqual(await como(U.semEmail), [], "e-mail não confirmado");
  await db.close();
});

test("anônimo e sessão ausente são negados; a função não aceita parâmetro de conta", async () => {
  const { db, como } = await montar();
  await assert.rejects(como("", "authenticated"), (e) => e.code === "42501");
  await assert.rejects(como("", "anon"), (e) => e.code === "42501");
  await assert.rejects(db.query("select public.my_course_enrollments($1::uuid)", [U.aluna]), (e) => e.code === "42883");
  await db.close();
});

test("vínculo válido prevalece; vínculo inativo ou com perfil inativo não cai para o e-mail", async () => {
  const { db, como, turma } = await montar();
  const v = await como(U.vinculada);
  assert.equal(v.length, 1);
  assert.equal(v[0].course_ref, turma.id);
  assert.deepEqual(await como(U.vincInativo), [], "vínculo inativo");
  assert.deepEqual(await como(U.vincPerfilInativo), [], "perfil do vínculo inativo");
  const comEmailDeOutroPerfil = await como(U.vincEmailOutro);
  assert.ok(comEmailDeOutroPerfil.every((x) => x.id !== undefined));
  await db.close();
});

test("e-mail confirmado com correspondência única associa; duplicados, inativo e perfil já vinculado a outra conta, não", async () => {
  const { db, como } = await montar();
  assert.equal((await como(U.aluna)).length, 2, "correspondência única");
  assert.deepEqual(await como(U.dup), [], "dois cadastros com o mesmo e-mail");
  assert.deepEqual(await como(U.inativa), [], "cadastro inativo");
  /* Duas contas confirmadas com o mesmo e-mail (o Auth não permite; o banco resiste mesmo assim): ninguém é associado. */
  await db.query("update auth.users set email = $1 where id = $2", [EMAIL.aluna, U.intruso]);
  assert.deepEqual(await como(U.intruso), [], "conta com e-mail repetido");
  assert.deepEqual(await como(U.aluna), [], "a original também deixa de ser associada por e-mail");
  await db.close();
});

test("perfil já vinculado a outra conta não é alcançado por e-mail", async () => {
  const { db, como } = await montar();
  await db.query("insert into auth.users(id,email,email_confirmed_at) values ('00000000-0000-0000-0000-0000000000c1',$1,now())", ["outro@example.invalid"]);
  assert.deepEqual(await como("00000000-0000-0000-0000-0000000000c1"), [], "o perfil 'outro' está vinculado a vincEmailOutro");
  await db.close();
});

test("aluno não grava inscrição, vínculo nem lê op_records; a função só lê e anon não executa", async () => {
  const { db, como } = await montar();
  const antes = (await db.query("select (select count(*) from public.op_records)::int a, (select count(*) from public.appointment_profile_accounts)::int b")).rows[0];
  await db.exec(`set test.uid = '${U.aluna}'; set role authenticated`);
  await assert.rejects(db.query("insert into public.op_records(collection,id,document) values ('enrollments','x','{}'::jsonb)"), (e) => e.code === "42501");
  await assert.rejects(db.query("update public.op_records set document='{}'::jsonb"), (e) => e.code === "42501");
  await assert.rejects(db.query("select * from public.op_records"), (e) => e.code === "42501");
  await assert.rejects(db.query("insert into public.appointment_profile_accounts values ($1,'qualquer',true)", [U.intruso]), (e) => e.code === "42501");
  await db.exec("reset role");
  await como(U.aluna); await como(U.aluna);
  const depois = (await db.query("select (select count(*) from public.op_records)::int a, (select count(*) from public.appointment_profile_accounts)::int b")).rows[0];
  assert.deepEqual(depois, antes, "nenhuma escrita");
  await db.exec(`set test.uid = '${U.aluna}'; set role anon`);
  await assert.rejects(db.query("select public.my_course_enrollments()"), (e) => e.code === "42501");
  await db.exec("reset role");
  await db.close();
});

test("a saída da função vira o modelo do Meu Potala sem adaptação", async () => {
  const { db, como, turma } = await montar();
  const linhas = await como(U.aluna);
  const modelos = linhas.map((l) => paraModelo("inscricoes", l, U.aluna));
  const m = modelos.find((x) => x.cursoRef === turma.id);
  assert.equal(m.curso, "Turma de Filosofia — Noite");
  assert.equal(m.professor, "Dra. Ana");
  assert.equal(m.modalidade, "Online");
  assert.equal(m.status, "inscrito");
  assert.equal(m.proximaAula, null);
  assert.equal(m.conteudoHref, null);
  assert.equal(m.imagem, null);
  await db.close();
});

test("união com a tabela antiga: registros antigos permanecem e a mesma turma não duplica", () => {
  const novo = [{ cursoRef: "T1", curso: "Nova" }];
  const antigo = [{ cursoRef: "T1", curso: "Antiga repetida" }, { cursoRef: "legado-9", curso: "Só no legado" }];
  assert.deepEqual(unirInscricoes(novo, antigo).map((x) => x.curso), ["Nova", "Só no legado"]);
  assert.deepEqual(unirInscricoes([], antigo).length, 2);
});
