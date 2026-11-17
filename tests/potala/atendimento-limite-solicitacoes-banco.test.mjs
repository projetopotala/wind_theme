import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

/*
 * Limite de solicitacoes: pedidos JA ATENDIDOS (consulta marcada) nao contam no teto de 5 por contato em 24h.
 * Causa observada em Production: contato com 5 pedidos, 0 abertos, 5 com consulta marcada, bloqueado com PT429.
 * Todas as migrations reais (auth/storage simulados); so dados ficticios.
 */
const DIR = new URL("../../supabase/migrations/", import.meta.url);
const DIA = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
const U = { owner: "00000000-0000-0000-0000-0000000000a1", cliente: "00000000-0000-0000-0000-0000000000c1", outro: "00000000-0000-0000-0000-0000000000c2", semEmail: "00000000-0000-0000-0000-0000000000c3" };
let seq = 0;
const chave = () => `dddddddd-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

async function montar({ rollback = false } = {}) {
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
  if (rollback) await db.exec(readFileSync(new URL("../../supabase/rollbacks/202611170001_rollback_limite_solicitacoes_sem_consultas.sql", import.meta.url), "utf8"));
  await db.exec("grant usage on schema public, auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated");
  for (const [k, email, ok] of [["owner", "owner@potala.test", true], ["cliente", "cliente@potala.test", true], ["outro", "outro@potala.test", true], ["semEmail", "sem@potala.test", false]]) {
    await db.query("insert into auth.users(id, email, email_confirmed_at) values ($1,$2,$3)", [U[k], email, ok ? new Date().toISOString() : null]);
  }
  await db.query("insert into public.users(id, role, name, email) values ($1,'owner','owner','owner@potala.test') on conflict (id) do update set role='owner'", [U.owner]);
  const doc = (col, id, d) => db.query("insert into public.op_records(collection, id, document) values ($1,$2,$3::jsonb)", [col, id, JSON.stringify({ id, ...d })]);
  await doc("profiles", "prof", { display_name: "TESTE INTERNO Profissional", email: "prof@potala.test", roles: ["professional"], active: true, published: true });
  await doc("activity_definitions", "def", { title: "TESTE INTERNO Cadastro de Servico", kind: "appointment" });
  await doc("activity_offerings", "ativo", { title: "TESTE INTERNO online", definition_id: "def", mode: "online", capacity: 1, active: true });
  await doc("activity_offerings", "inativo", { title: "TESTE INTERNO inativo", definition_id: "def", mode: "online", capacity: 1, active: false });
  await doc("offering_professionals", "v1", { offering_id: "ativo", professional_id: "prof", active: true });
  const como = async (uid, sql, params) => {
    await db.exec(`set test.uid = '${uid}'; set role authenticated`);
    try { return await db.query(sql, params); } finally { await db.exec("reset role; set test.uid = ''"); }
  };
  const pedir = async (uid, extra = {}) => {
    const a = { oferta: "ativo", modo: "online", dia: DIA, periodo: "tarde", k: chave(), ...extra };
    try { return { ok: true, r: (await como(uid, "select public.submit_authenticated_appointment_request($1::uuid,$2,$3,$4::date,$5) as r", [a.k, a.oferta, a.modo, a.dia, a.periodo])).rows[0].r, k: a.k }; }
    catch (e) { return { ok: false, code: e.code, message: e.message, k: a.k }; }
  };
  const total = async () => Number((await db.query("select count(*) n from public.appointment_requests")).rows[0].n);
  return { db, como, pedir, total };
}

const confirmar = async (db, como, pedidoId, n = 1) => {
  const p = (await db.query("select updated_at from public.appointment_requests where id=$1", [pedidoId])).rows[0];
  const ini = new Date(Date.now() + (8 + n) * 864e5); ini.setUTCHours(13, 0, 0, 0);
  const fim = new Date(ini.valueOf() + 3600e3);
  const x = await como(U.owner, "select public.confirm_appointment_request_reservation($1::uuid,$2::timestamptz,$3,$4::jsonb) as r",
    [pedidoId, p.updated_at, chave(), JSON.stringify({ starts_at: ini.toISOString(), ends_at: fim.toISOString(), professional_profile_id: "prof", offering_id: "ativo", room_id: null, notes: "" })]);
  return x.rows[0].r;
};

test("primeiro pedido valido e aceito; repetir a mesma chave nao duplica", async () => {
  const { pedir, total } = await montar();
  const a = await pedir(U.cliente);
  assert.equal(a.ok, true, a.message);
  assert.equal(a.r.status, "recebida");
  const b = await pedir(U.cliente, { k: a.k });
  assert.equal(b.ok, true);
  assert.equal(b.r.id, a.r.id, "mesma chave devolve o mesmo pedido");
  assert.equal(await total(), 1);
});

test("servico inativo e recusado; servico ativo e aceito", async () => {
  const { pedir } = await montar();
  const inativo = await pedir(U.cliente, { oferta: "inativo" });
  assert.equal(inativo.ok, false);
  assert.equal(inativo.code, "22023");
  assert.equal((await pedir(U.cliente, { oferta: "ativo" })).ok, true);
});

test("limite legitimo: 5 pedidos abertos em 24h, o 6o e recusado com PT429 e a mensagem do limite diario", async () => {
  const { pedir, total } = await montar();
  for (let i = 0; i < 5; i++) assert.equal((await pedir(U.cliente)).ok, true, `pedido ${i + 1}`);
  const sexto = await pedir(U.cliente);
  assert.equal(sexto.ok, false);
  assert.equal(sexto.code, "PT429");
  assert.match(sexto.message, /Limite de recebimento/);
  assert.equal(await total(), 5, "o recusado nao e gravado");
  /* repetir o 6o com a mesma chave continua recusado e sem duplicar */
  assert.equal((await pedir(U.cliente, { k: sexto.k })).code, "PT429");
  assert.equal(await total(), 5);
  /* outro cliente nao e afetado pelo limite do primeiro (limite por contato) */
  assert.equal((await pedir(U.outro)).ok, true);
});

test("REGRESSAO: pedidos ja atendidos (consulta marcada) nao contam no limite; o cliente volta a poder pedir", async () => {
  const { db, como, pedir, total } = await montar();
  const ids = [];
  for (let i = 0; i < 5; i++) { const r = await pedir(U.cliente); assert.equal(r.ok, true); ids.push(r.r.id); }
  assert.equal((await pedir(U.cliente)).code, "PT429", "com 5 abertos esta no limite");
  /* o Owner atende um pedido de verdade (RPC de confirmacao) ... */
  const conf = await confirmar(db, como, ids[0]);
  assert.ok(conf, "confirmacao feita");
  assert.ok((await db.query("select reservation_schedule_id from public.appointment_requests where id=$1", [ids[0]])).rows[0].reservation_schedule_id);
  const depois = await pedir(U.cliente);
  assert.equal(depois.ok, true, depois.message);
  assert.equal(await total(), 6);
  /* ... e os demais ficam atendidos: cenario de Production (5 pedidos, todos com consulta marcada, 0 abertos) */
  await db.query("update public.appointment_requests set reservation_schedule_id = 'consulta-' || id::text, status = 'encerrada' where reservation_schedule_id is null");
  for (let i = 0; i < 3; i++) assert.equal((await pedir(U.cliente)).ok, true, `novo pedido ${i + 1} apos atendimentos`);
  /* o teto continua valendo para pedidos nao atendidos */
  for (let i = 0; i < 2; i++) assert.equal((await pedir(U.cliente)).ok, true);
  assert.equal((await pedir(U.cliente)).code, "PT429");
});

test("cancelados e encerrados SEM consulta continuam contando (anti-spam preservado)", async () => {
  const { db, pedir } = await montar();
  for (let i = 0; i < 5; i++) assert.equal((await pedir(U.cliente)).ok, true);
  await db.query("update public.appointment_requests set status = 'cancelada' where requester_user_id = $1", [U.cliente]);
  assert.equal((await pedir(U.cliente)).code, "PT429", "cancelar nao libera o limite");
});

test("liberacao correta depois do periodo de 24h", async () => {
  const { db, pedir } = await montar();
  for (let i = 0; i < 5; i++) assert.equal((await pedir(U.cliente)).ok, true);
  assert.equal((await pedir(U.cliente)).code, "PT429");
  await db.query("update public.appointment_requests set created_at = now() - interval '25 hours'");
  assert.equal((await pedir(U.cliente)).ok, true, "depois de 24h volta a aceitar");
});

test("limite global por minuto continua ativo", async () => {
  const { db, pedir, total } = await montar();
  for (let i = 0; i < 60; i++) {
    await db.query(`insert into public.appointment_requests(idempotency_key, service, modality, requester_name, contact_type, contact, preferred_date, preferred_period)
      values ($1::uuid, 'TESTE INTERNO', 'online', 'Fulano Ficticio', 'email', $2, $3::date, 'tarde')`, [chave(), `massa${i}@potala.test`, DIA]);
  }
  const r = await pedir(U.cliente);
  assert.equal(r.code, "PT429");
  assert.equal(await total(), 60);
});

test("sem autorizacao indevida: anonimo, e-mail nao confirmado e chamada direta da funcao interna", async () => {
  const { db, como, pedir } = await montar();
  await db.exec("set role anon");
  await assert.rejects(() => db.query("select public.submit_authenticated_appointment_request($1::uuid,'ativo','online',$2::date,'tarde')", [chave(), DIA]), /permission denied/i);
  await db.exec("reset role");
  const semEmail = await pedir(U.semEmail);
  assert.equal(semEmail.ok, false);
  assert.equal(semEmail.code, "42501");
  await assert.rejects(() => como(U.cliente, "select public.submit_appointment_request($1::uuid,'Servico X','online','Fulano','email','x@potala.test',$2::date,'tarde')", [chave(), DIA]), /permission denied/i);
  /* o cliente nao enxerga pedidos de outro */
  await pedir(U.outro);
  assert.equal((await como(U.cliente, "select public.list_my_appointment_requests() as l")).rows[0].l.length, 0);
});

test("pedido confirmado aparece para o cliente, com a consulta marcada, e o Owner segue vendo a fila", async () => {
  const { db, como, pedir } = await montar();
  const r = await pedir(U.cliente);
  await confirmar(db, como, r.r.id);
  const meus = (await como(U.cliente, "select public.list_my_appointment_requests() as l")).rows[0].l;
  assert.equal(meus.length, 1);
  assert.equal(meus[0].id, r.r.id);
  assert.notEqual(meus[0].status, "recebida", "deixou de aguardar");
  const fila = await como(U.owner, "select status, reservation_schedule_id from public.appointment_requests where id=$1", [r.r.id]);
  assert.ok(fila.rows[0].reservation_schedule_id);
});

test("rollback restaura o comportamento anterior (pedidos atendidos voltam a contar)", async () => {
  const { db, pedir } = await montar({ rollback: true });
  for (let i = 0; i < 5; i++) assert.equal((await pedir(U.cliente)).ok, true);
  await db.query("update public.appointment_requests set reservation_schedule_id = 'c-' || id::text, status = 'encerrada'");
  assert.equal((await pedir(U.cliente)).code, "PT429", "comportamento original reproduzido pelo rollback");
});

test("a migration nova nao muda permissoes: EXECUTE de submit_appointment_request segue so para quem tinha", async () => {
  const { db } = await montar();
  const acl = (await db.query("select proacl::text a from pg_proc where proname='submit_appointment_request'")).rows[0].a;
  const rollbackAcl = (await (await montar({ rollback: true })).db.query("select proacl::text a from pg_proc where proname='submit_appointment_request'")).rows[0].a;
  assert.equal(acl, rollbackAcl, "mesma ACL antes e depois");
});
