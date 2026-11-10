// "Quero atender": matriz de segurança da migration 202611100002 em Postgres real (PGlite, em memória).
// Não toca o Supabase. Stubs mínimos de auth.users/auth.uid(), users, op_records e das tabelas de vínculo.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { before } from "node:test";

import { PGlite } from "@electric-sql/pglite";

const MIGRATION = new URL("../../supabase/migrations/202611100002_professional_applications.sql", import.meta.url);
const sql = await readFile(MIGRATION, "utf8");

const U = {
  owner: "00000000-0000-4000-8000-0000000000a1",
  admin: "00000000-0000-4000-8000-0000000000a2",
  ana: "00000000-0000-4000-8000-0000000000b1",
  bia: "00000000-0000-4000-8000-0000000000b2",
  caio: "00000000-0000-4000-8000-0000000000b3",
  dora: "00000000-0000-4000-8000-0000000000b4",
  edu: "00000000-0000-4000-8000-0000000000b5",
  fabi: "00000000-0000-4000-8000-0000000000b6",
  gus: "00000000-0000-4000-8000-0000000000b7",
  nao: "00000000-0000-4000-8000-0000000000b8", // e-mail não confirmado
  rita: "00000000-0000-4000-8000-0000000000b9", // para o limite de envios
};

const db = new PGlite();

async function como(uid, consulta, params = [], papel = "authenticated") {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false); set role ${papel};`);
  try {
    const r = await db.query(consulta, params);
    await db.exec("reset role");
    return { ok: true, v: r.rows[0] && Object.values(r.rows[0])[0], rows: r.rows };
  } catch (e) {
    await db.exec("reset role");
    return { ok: false, code: e.code, msg: e.message };
  }
}
const enviar = (uid, nome = "Dra. Ana Lima", esp = "Psicologia clínica", texto = "Atendo adultos há dez anos, com foco em ansiedade.", tel = null) =>
  como(uid, "select public.submit_professional_application($1,$2,$3,$4) as r", [nome, esp, texto, tel]);
const minha = (uid) => como(uid, "select public.my_professional_application() as r");
const listar = (uid, st = "pending") => como(uid, "select public.admin_list_professional_applications($1) as r", [st]);
const aprovar = (uid, id) => como(uid, "select public.admin_approve_professional_application($1) as r", [id]);
const recusar = (uid, id, nota = null) => como(uid, "select public.admin_reject_professional_application($1,$2) as r", [id, nota]);
const q = async (consulta, params = []) => (await db.query(consulta, params)).rows;
const pendente = async (uid) => (await q("select id from public.professional_applications where user_id=$1 and status='pending'", [uid]))[0]?.id;

before(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, deleted_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon; grant usage on schema public to authenticated, anon;
    create table public.users (id uuid primary key references auth.users(id), role text not null check (role in ('owner','admin')), active boolean not null default true);
    create table public.portal_module_permissions (user_id uuid, module text, level text);
    create table public.op_records (collection text not null, id text not null, document jsonb not null, updated_at timestamptz default now(), primary key (collection, id));
    create table public.appointment_profile_accounts (user_id uuid primary key, profile_id text unique not null, active boolean not null default true, updated_at timestamptz default now());
    create table public.admin_access_events (
      id bigint generated always as identity primary key, actor_id uuid references auth.users(id) on delete set null,
      action text not null check (action in ('link_professional','activate_professional_link','deactivate_professional_link','professional_role_revoked')),
      target_user_id uuid references auth.users(id) on delete set null, target_profile_id text, before jsonb, after jsonb,
      created_at timestamptz not null default clock_timestamp());
    alter table public.admin_access_events enable row level security;
    revoke all on table public.admin_access_events from public, anon, authenticated;
  `);
  for (const [nome, id] of Object.entries(U)) {
    await db.query("insert into auth.users values ($1,$2,$3)", [id, `${nome}@exemplo.test`, nome === "nao" ? null : "2026-11-01T10:00:00Z"]);
  }
  await db.query("insert into public.users values ($1,'owner',true),($2,'admin',true)", [U.owner, U.admin]);
  await db.exec(sql);
});

test("sem login: enviar e consultar são recusados (42501)", async () => {
  assert.equal((await enviar(null)).code, "42501");
  assert.equal((await minha(null)).code, "42501");
});

test("anon não executa nenhuma das funções (sem EXECUTE)", async () => {
  const r = await como(null, "select public.my_professional_application() as r", [], "anon");
  assert.equal(r.ok, false);
  assert.equal(r.code, "42501");
  const r2 = await como(null, "select public.admin_list_professional_applications() as r", [], "anon");
  assert.equal(r2.code, "42501");
});

test("e-mail não confirmado não envia", async () => {
  const r = await enviar(U.nao);
  assert.equal(r.ok, false);
  assert.equal(r.code, "42501");
  assert.match(r.msg, /Confirme seu e-mail/);
  assert.equal((await q("select count(*)::int n from public.professional_applications where user_id=$1", [U.nao]))[0].n, 0);
});

test("solicitação válida: fica pendente, identidade e e-mail vêm do banco", async () => {
  const r = await enviar(U.ana, "  Dra. Ana Lima ", "Psicologia clínica", "Atendo adultos há dez anos, com foco em ansiedade.", "(11) 99999-0000");
  assert.equal(r.ok, true);
  assert.equal(r.v.status, "pending");
  const [linha] = await q("select * from public.professional_applications where user_id=$1", [U.ana]);
  assert.equal(linha.user_id, U.ana);
  assert.equal(linha.applicant_email, "ana@exemplo.test");
  assert.equal(linha.display_name, "Dra. Ana Lima");
  assert.equal(linha.status, "pending");
  const meu = await minha(U.ana);
  assert.equal(meu.v.status, "pending");
  assert.equal("presentation" in meu.v, false, "a própria consulta não devolve dados de terceiros nem campos internos");
});

test("o navegador não escolhe user_id nem status: a função não tem esses parâmetros", async () => {
  const [{ args }] = await q("select pg_get_function_arguments('public.submit_professional_application(text,text,text,text)'::regprocedure) args");
  assert.doesNotMatch(args, /user|status|role|email/i);
});

test("duplicidade: segunda solicitação pendente é recusada (23505) e o índice único existe", async () => {
  const r = await enviar(U.ana);
  assert.equal(r.code, "23505");
  assert.equal((await q("select count(*)::int n from public.professional_applications where user_id=$1 and status='pending'", [U.ana]))[0].n, 1);
  await assert.rejects(
    db.query("insert into public.professional_applications (user_id, applicant_email, display_name, specialty, presentation) values ($1,'x@x','Nome X','Esp','Apresentação com mais de vinte caracteres')", [U.ana]),
    (e) => e.code === "23505",
  );
});

test("validação: campos curtos, telefone inválido e caracteres de controle (22023)", async () => {
  assert.equal((await enviar(U.bia, "Bi", "Psicologia", "Apresentação longa o bastante para passar na regra.")).code, "22023");
  assert.equal((await enviar(U.bia, "Bia Souza", "Psicologia", "curta")).code, "22023");
  assert.equal((await enviar(U.bia, "Bia Souza", "Psicologia", "Apresentação longa o bastante para passar na regra.", "abc")).code, "22023");
  assert.equal((await enviar(U.bia, "Bia\u0007 Souza", "Psicologia", "Apresentação longa o bastante para passar na regra.")).code, "22023");
  assert.equal((await enviar(U.bia, "Bia Souza", "Psicologia", "x".repeat(1501))).code, "22023");
  assert.equal((await q("select count(*)::int n from public.professional_applications where user_id=$1", [U.bia]))[0].n, 0);
});

test("acesso indevido: ninguém lê nem altera a tabela diretamente, nem a solicitação de outra pessoa", async () => {
  await enviar(U.bia, "Bia Souza", "Nutrição", "Atendo online e presencial, com foco em nutrição esportiva.");
  for (const uid of [U.ana, U.bia]) {
    assert.equal((await como(uid, "select * from public.professional_applications")).code, "42501");
    assert.equal((await como(uid, "update public.professional_applications set status='approved'")).code, "42501");
    assert.equal((await como(uid, "delete from public.professional_applications")).code, "42501");
    assert.equal((await como(uid, "insert into public.professional_applications (user_id, applicant_email, display_name, specialty, presentation) values ($1,'a@a','Nome','Esp','Apresentação com mais de vinte caracteres')", [uid])).code, "42501");
  }
  const daAna = await minha(U.ana);
  const daBia = await minha(U.bia);
  assert.notEqual(daAna.v.id, daBia.v.id);
  assert.equal(daBia.v.specialty, "Nutrição");
  assert.equal((await minha(U.caio)).v, null, "quem não enviou não vê nada");
  assert.equal((await listar(U.ana)).code, "42501", "profissional candidato não lista as solicitações");
});

test("usuário comum não aprova nem recusa, nem o próprio pedido; admin comum também não (42501)", async () => {
  const idAna = await pendente(U.ana);
  for (const uid of [U.ana, U.bia, U.admin]) {
    assert.equal((await aprovar(uid, idAna)).code, "42501", `aprovar como ${uid}`);
    assert.equal((await recusar(uid, idAna)).code, "42501", `recusar como ${uid}`);
    assert.equal((await listar(uid)).code, "42501", `listar como ${uid}`);
  }
  assert.equal((await q("select status from public.professional_applications where id=$1", [idAna]))[0].status, "pending");
  assert.equal((await q("select count(*)::int n from public.appointment_profile_accounts"))[0].n, 0);
});

test("owner lista pendentes com e-mail do banco", async () => {
  const r = await listar(U.owner);
  assert.equal(r.ok, true);
  assert.equal(r.v.length, 2);
  assert.ok(r.v.every((a) => a.status === "pending" && a.email.endsWith("@exemplo.test")));
  assert.equal((await listar(U.owner, "invalido")).code, "22023");
});

test("aprovação cria cadastro NÃO publicado, vínculo ativo e auditoria; sem privilégio administrativo ou editorial", async () => {
  const id = await pendente(U.ana);
  const antesUsers = await q("select id, role from public.users order by id");
  const antesPerm = (await q("select count(*)::int n from public.portal_module_permissions"))[0].n;
  const r = await aprovar(U.owner, id);
  assert.equal(r.ok, true);
  assert.equal(r.v.status, "approved");
  assert.equal(r.v.changed, true);
  assert.equal(r.v.published, false);
  const [perfil] = await q("select id, document from public.op_records where collection='profiles' and id=$1", [r.v.profile_id]);
  assert.deepEqual(perfil.document.roles.sort(), ["client", "professional"]);
  assert.equal(perfil.document.published, false);
  assert.equal(perfil.document.active, true);
  assert.equal(perfil.document.email, "ana@exemplo.test");
  assert.equal(perfil.document.professional_title, "Psicologia clínica");
  const [vinculo] = await q("select * from public.appointment_profile_accounts where user_id=$1", [U.ana]);
  assert.equal(vinculo.profile_id, perfil.id);
  assert.equal(vinculo.active, true);
  const [app] = await q("select * from public.professional_applications where id=$1", [id]);
  assert.equal(app.status, "approved");
  assert.equal(app.decided_by, U.owner);
  assert.equal(app.profile_id, perfil.id);
  const eventos = await q("select * from public.admin_access_events where action='professional_application_approved'");
  assert.equal(eventos.length, 1);
  assert.equal(eventos[0].actor_id, U.owner);
  assert.equal(eventos[0].target_user_id, U.ana);
  assert.equal(eventos[0].target_profile_id, perfil.id);
  assert.equal(eventos[0].after.published, false);
  // nada administrativo ou editorial mudou
  assert.deepEqual(await q("select id, role from public.users order by id"), antesUsers);
  assert.equal((await q("select count(*)::int n from public.portal_module_permissions"))[0].n, antesPerm);
  assert.equal((await q("select count(*)::int n from public.users where id=$1", [U.ana]))[0].n, 0);
  // e continua sem poder usar as RPCs do Owner
  assert.equal((await listar(U.ana)).code, "42501");
  assert.equal((await aprovar(U.ana, id)).code, "42501");
});

test("aprovação repetida é idempotente: sem segundo cadastro, vínculo ou evento", async () => {
  const [{ id }] = await q("select id from public.professional_applications where user_id=$1", [U.ana]);
  const de = await aprovar(U.owner, id);
  assert.equal(de.ok, true);
  assert.equal(de.v.changed, false);
  assert.equal((await q("select count(*)::int n from public.op_records where collection='profiles'"))[0].n, 1);
  assert.equal((await q("select count(*)::int n from public.appointment_profile_accounts"))[0].n, 1);
  assert.equal((await q("select count(*)::int n from public.admin_access_events where action='professional_application_approved'"))[0].n, 1);
});

test("quem já é profissional não envia nova solicitação (23505)", async () => {
  assert.equal((await enviar(U.ana)).code, "23505");
});

test("aprovações concorrentes da mesma solicitação resultam em um único efeito", async () => {
  await enviar(U.caio, "Caio Prado", "Fisioterapia", "Atendo lesões esportivas e reabilitação há oito anos.");
  const id = await pendente(U.caio);
  const [a, b] = await Promise.all([aprovar(U.owner, id), aprovar(U.owner, id)]);
  assert.equal(a.ok && b.ok, true);
  assert.equal([a.v.changed, b.v.changed].filter(Boolean).length, 1);
  assert.equal((await q("select count(*)::int n from public.appointment_profile_accounts where user_id=$1", [U.caio]))[0].n, 1);
  assert.equal((await q("select count(*)::int n from public.op_records where collection='profiles' and document->>'email'='caio@exemplo.test'"))[0].n, 1);
  assert.equal((await q("select count(*)::int n from public.admin_access_events where action='professional_application_approved' and target_user_id=$1", [U.caio]))[0].n, 1);
});

test("aprovar e recusar competindo: só uma decisão vale", async () => {
  await enviar(U.dora, "Dora Reis", "Yoga terapêutica", "Conduzo práticas individuais e em grupo há seis anos.");
  const id = await pendente(U.dora);
  const [a, b] = await Promise.all([aprovar(U.owner, id), recusar(U.owner, id, "teste")]);
  assert.equal([a.ok, b.ok].filter(Boolean).length, 1);
  const [{ status }] = await q("select status from public.professional_applications where id=$1", [id]);
  assert.ok(["approved", "rejected"].includes(status));
  const aprov = (await q("select count(*)::int n from public.admin_access_events where target_user_id=$1 and action='professional_application_approved'", [U.dora]))[0].n;
  const recus = (await q("select count(*)::int n from public.admin_access_events where target_user_id=$1 and action='professional_application_rejected'", [U.dora]))[0].n;
  assert.equal(aprov + recus, 1);
  assert.equal((await q("select count(*)::int n from public.appointment_profile_accounts where user_id=$1", [U.dora]))[0].n, aprov);
});

test("recusa: registra nota e auditoria, não cria cadastro nem vínculo; repetir é idempotente; decisão final não se inverte", async () => {
  await enviar(U.edu, "Edu Matos", "Reiki", "Atendo presencialmente, com formação de seis anos.");
  const id = await pendente(U.edu);
  const r = await recusar(U.owner, id, "Faltam informações de formação.");
  assert.equal(r.v.status, "rejected");
  assert.equal(r.v.changed, true);
  const [app] = await q("select * from public.professional_applications where id=$1", [id]);
  assert.equal(app.decision_note, "Faltam informações de formação.");
  assert.equal(app.decided_by, U.owner);
  assert.equal((await q("select count(*)::int n from public.op_records where document->>'email'='edu@exemplo.test'"))[0].n, 0);
  assert.equal((await q("select count(*)::int n from public.appointment_profile_accounts where user_id=$1", [U.edu]))[0].n, 0);
  assert.equal((await q("select count(*)::int n from public.admin_access_events where action='professional_application_rejected' and target_user_id=$1", [U.edu]))[0].n, 1);
  assert.equal((await recusar(U.owner, id)).v.changed, false);
  assert.equal((await aprovar(U.owner, id)).code, "22023", "recusada não vira aprovada");
  assert.equal((await recusar(U.owner, (await q("select id from public.professional_applications where user_id=$1", [U.ana]))[0].id)).code, "22023", "aprovada não vira recusada");
  assert.equal((await minha(U.edu)).v.decision_note, "Faltam informações de formação.");
  assert.equal((await recusar(U.owner, id, "x".repeat(501))).code, "22023");
  assert.equal((await recusar(U.owner, "00000000-0000-4000-8000-00000000ffff")).code, "P0002");
});

test("depois de recusada a pessoa pode reenviar; o limite é de 3 envios em 24 h (PT429)", async () => {
  assert.equal((await enviar(U.edu, "Edu Matos", "Reiki", "Segunda versão com formação e experiência detalhadas.")).ok, true);
  for (let i = 0; i < 3; i++) {
    const id = await pendente(U.rita) ?? (await enviar(U.rita, "Rita Alves", "Pilates", `Tentativa ${i} com texto suficiente para a regra.`)).v?.id;
    if (i < 3 && id) await recusar(U.owner, id ?? (await pendente(U.rita)));
  }
  const quarta = await enviar(U.rita, "Rita Alves", "Pilates", "Quarta tentativa com texto suficiente para a regra.");
  assert.equal(quarta.code, "PT429");
});

test("conta que já tem cadastro operacional vinculado ganha o papel nele, sem segundo cadastro", async () => {
  await db.query("insert into public.op_records (collection,id,document) values ('profiles','cli-fabi',$1)", [JSON.stringify({ id: "cli-fabi", display_name: "Fabi Cardoso", email: "fabi@exemplo.test", roles: ["client"], active: true, published: false, phone: "11 90000-0000", professional_title: "Título do Owner" })]);
  await db.query("insert into public.appointment_profile_accounts (user_id, profile_id, active) values ($1,'cli-fabi',true)", [U.fabi]);
  await enviar(U.fabi, "Fabiana Cardoso", "Terapia ocupacional", "Atendo crianças e adultos, com experiência em reabilitação.");
  const r = await aprovar(U.owner, await pendente(U.fabi));
  assert.equal(r.v.profile_id, "cli-fabi");
  assert.equal(r.v.profile_created, false);
  const [{ document: d }] = await q("select document from public.op_records where id='cli-fabi'");
  assert.deepEqual(d.roles.sort(), ["client", "professional"]);
  assert.equal(d.professional_title, "Título do Owner", "dados que o Owner já mantém não são sobrescritos");
  assert.equal(d.phone, "11 90000-0000");
  assert.equal(d.published, false);
  assert.equal((await q("select count(*)::int n from public.appointment_profile_accounts where user_id=$1", [U.fabi]))[0].n, 1);
});

test("cadastro sem vínculo com o mesmo e-mail é associado, não duplicado", async () => {
  await db.query("insert into public.op_records (collection,id,document) values ('profiles','sec-gus',$1)", [JSON.stringify({ id: "sec-gus", display_name: "Gus Lemos", email: "GUS@exemplo.test", roles: ["client"], active: true, published: false })]);
  await enviar(U.gus, "Gustavo Lemos", "Massoterapia", "Atendo em clínica própria, com técnicas de relaxamento.");
  const r = await aprovar(U.owner, await pendente(U.gus));
  assert.equal(r.v.profile_id, "sec-gus");
  assert.equal(r.v.profile_created, false);
  assert.equal((await q("select count(*)::int n from public.op_records where collection='profiles' and lower(document->>'email')='gus@exemplo.test'"))[0].n, 1);
  assert.equal((await q("select active from public.appointment_profile_accounts where user_id=$1", [U.gus]))[0].active, true);
});

test("vínculo desativado, cadastro desativado e cadastro de outra conta NÃO são reativados nem tomados", async () => {
  // vínculo desativado
  await db.query("update public.appointment_profile_accounts set active=false where user_id=$1", [U.gus]);
  await db.query("update public.op_records set document = jsonb_set(document,'{roles}','[\"client\"]') where id='sec-gus'");
  await db.query("update public.professional_applications set status='rejected', decided_at=now() where user_id=$1", [U.gus]);
  await enviar(U.gus, "Gustavo Lemos", "Massoterapia", "Nova solicitação depois de ter o vínculo desativado pelo Owner.");
  const id = await pendente(U.gus);
  const r = await aprovar(U.owner, id);
  assert.equal(r.code, "22023");
  assert.match(r.msg, /desativado/);
  assert.equal((await q("select active from public.appointment_profile_accounts where user_id=$1", [U.gus]))[0].active, false);
  assert.equal((await q("select status from public.professional_applications where id=$1", [id]))[0].status, "pending");
  assert.equal((await q("select document->'roles' r from public.op_records where id='sec-gus'"))[0].r.includes("professional"), false);
  // cadastro desativado
  await db.query("update public.appointment_profile_accounts set active=true where user_id=$1", [U.gus]);
  await db.query("update public.op_records set document = jsonb_set(document,'{active}','false') where id='sec-gus'");
  assert.equal((await aprovar(U.owner, id)).code, "22023");
  await db.query("update public.op_records set document = jsonb_set(document,'{active}','true') where id='sec-gus'");
  // cadastro com o e-mail vinculado a OUTRA conta
  const [{ n: antes }] = await q("select count(*)::int n from public.admin_access_events");
  await db.query("insert into auth.users values ('00000000-0000-4000-8000-0000000000c1','hana@exemplo.test','2026-11-01T10:00:00Z')");
  await db.query("insert into public.op_records (collection,id,document) values ('profiles','outra',$1)", [JSON.stringify({ id: "outra", display_name: "Hana", email: "hana@exemplo.test", roles: ["client"], active: true })]);
  await db.query("insert into public.appointment_profile_accounts (user_id, profile_id) values ($1,'outra')", [U.owner]);
  await enviar("00000000-0000-4000-8000-0000000000c1", "Hana Teles", "Podologia", "Atendo em consultório com mais de dez anos de prática.");
  // a Hana ainda não tem vínculo, mas o cadastro com o e-mail dela já pertence a outra conta
  assert.equal((await aprovar(U.owner, await pendente("00000000-0000-4000-8000-0000000000c1"))).code, "23505");
  assert.equal((await q("select count(*)::int n from public.admin_access_events"))[0].n, antes, "falhas não auditam decisões");
});

test("conta excluída ou sem confirmação no momento da aprovação não é aprovada", async () => {
  await db.query("insert into auth.users values ('00000000-0000-4000-8000-0000000000c2','ivo@exemplo.test','2026-11-01T10:00:00Z')");
  await enviar("00000000-0000-4000-8000-0000000000c2", "Ivo Barros", "Quiropraxia", "Atendo com técnicas manuais há doze anos, em consultório.");
  await db.query("update auth.users set deleted_at=now() where id='00000000-0000-4000-8000-0000000000c2'");
  assert.equal((await aprovar(U.owner, await pendente("00000000-0000-4000-8000-0000000000c2"))).code, "P0002");
  assert.equal((await q("select count(*)::int n from public.appointment_profile_accounts where user_id='00000000-0000-4000-8000-0000000000c2'"))[0].n, 0);
});

test("auditoria: só decisões bem-sucedidas, com quem decidiu; tabela de eventos continua fechada", async () => {
  const eventos = await q("select action, actor_id from public.admin_access_events order by id");
  assert.ok(eventos.length >= 5);
  assert.ok(eventos.every((e) => e.actor_id === U.owner));
  assert.ok(eventos.every((e) => ["professional_application_approved", "professional_application_rejected"].includes(e.action)));
  assert.equal((await como(U.owner, "select * from public.admin_access_events")).code, "42501");
  // as ações antigas continuam aceitas pelo CHECK recriado
  await db.query("insert into public.admin_access_events (actor_id, action) values ($1,'link_professional'),($1,'professional_role_revoked')", [U.owner]);
});

test("migration: sem is_portal_admin, sem leitura de metadados do navegador, sem remoções, grants e RLS corretos", () => {
  const codigo = sql.replace(/--.*$/gm, "");
  assert.doesNotMatch(codigo, /is_portal_admin/);
  assert.doesNotMatch(codigo, /raw_user_meta_data|user_metadata|request\.jwt\.claim/);
  assert.doesNotMatch(codigo, /\bdelete\s+from\b|\btruncate\b|\bdrop\s+(table|function|column|schema)\b/i);
  assert.doesNotMatch(codigo, /insert into public\.users|update public\.users|portal_module_permissions|blog_editor/i);
  assert.match(codigo, /alter table public\.professional_applications enable row level security;/);
  assert.match(codigo, /revoke all on table public\.professional_applications from public, anon, authenticated;/);
  assert.doesNotMatch(codigo, /create policy/i);
  assert.doesNotMatch(codigo, /grant (select|insert|update|delete|all)[^;]*on (table )?public\.professional_applications/i);
  const funcoes = [...codigo.matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1]);
  assert.deepEqual(funcoes.sort(), ["admin_approve_professional_application", "admin_list_professional_applications", "admin_reject_professional_application", "my_professional_application", "submit_professional_application"]);
  assert.equal((codigo.match(/security definer/g) ?? []).length, 5);
  assert.equal((codigo.match(/set search_path = ''/g) ?? []).length, 5);
  assert.equal((codigo.match(/revoke all on function public\.\w+\([^)]*\) from public, anon;/g) ?? []).length, 5);
  for (const f of ["admin_list_professional_applications", "admin_approve_professional_application", "admin_reject_professional_application"]) {
    const corpo = codigo.slice(codigo.indexOf(`function public.${f}(`));
    assert.match(corpo.slice(0, 1200), /u\.role = 'owner' and u\.active\) then\s+raise exception .*errcode = '42501'/s, f);
  }
  assert.match(codigo, /pg_advisory_xact_lock\(hashtextextended\('potala-vinculo-conta:'/);
  assert.match(codigo, /pg_advisory_xact_lock\(hashtextextended\('potala-vinculo-perfil:'/);
  assert.match(codigo, /'published', false/);
  assert.doesNotMatch(codigo, /\{published\}/);
});
