import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const DIR = new URL("../../supabase/migrations/", import.meta.url);
const ROLLBACK = new URL("../../supabase/rollbacks/202611270001_rollback_pay10_central_precos_piloto.sql", import.meta.url);
const U = { OWNER: "00000000-0000-0000-0000-0000000000f1", CLIENT: "00000000-0000-0000-0000-0000000000a1", OTHER: "00000000-0000-0000-0000-0000000000b1" };
const OFFER = "pay10-oferta-real";
const PROF = "pay10-profissional";
const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth; create schema extensions; create schema storage;
  create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz default now(), deleted_at timestamptz, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
  create function auth.role() returns text language sql stable as $$ select 'authenticated' $$;
  create table storage.buckets(id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, owner_id text, metadata jsonb);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $x$ select string_to_array(name, '/') $x$;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`);
for (const file of readdirSync(DIR).sort()) await db.exec(readFileSync(new URL(file, DIR), "utf8"));
await db.exec("grant usage on schema public, auth to anon, authenticated, service_role; grant execute on function auth.uid() to anon, authenticated, service_role");
for (const [id, name] of [[U.OWNER, "Owner"], [U.CLIENT, "Cliente Piloto"], [U.OTHER, "Outro Cliente"]])
  await db.query("insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,jsonb_build_object('full_name',$3::text))", [id, `${name.replaceAll(" ", ".").toLowerCase()}@pay10.test`, name]);
await db.query("insert into public.users(id,role,name,email,active) values ($1,'owner','Owner','owner@pay10.test',true)", [U.OWNER]);
after(async () => db.close());

async function tx(fn) { await db.exec("begin"); try { return await fn(); } finally { await db.exec("rollback"); } }
async function as(uid, sql, params = [], role = "authenticated") {
  await db.exec("savepoint cmd");
  try { await db.exec(`set local role ${role}`); await db.query("select set_config('test.uid',$1,true)", [uid ?? ""]); const r = await db.query(sql, params); await db.exec("reset role"); await db.exec("release savepoint cmd"); return { ok: true, rows: r.rows }; }
  catch (e) { await db.exec("rollback to savepoint cmd"); await db.exec("reset role"); return { ok: false, code: e.code, message: String(e.message) }; }
}
const owner = (sql, params) => as(U.OWNER, sql, params);
const client = (sql, params) => as(U.CLIENT, sql, params);

async function seed({ test = false, price = false } = {}) {
  const title = test ? "TESTE INTERNO - Demo" : "Atendimento Potala";
  const prof = test ? "Profissional de Demonstração" : "Profissional Potala";
  await db.query("insert into public.op_records(collection,id,document) values ('profiles',$1::text,jsonb_build_object('id',$1::text,'display_name',$2::text,'active',true,'published',true,'roles',jsonb_build_array('professional')))", [PROF, prof]);
  await db.query("insert into public.op_records(collection,id,document) values ('activity_offerings',$1::text,jsonb_build_object('id',$1::text,'title',$2::text,'active',true,'published',true,'mode','online','professional_id',$3::text))", [OFFER, title, PROF]);
  if (price) await db.query("insert into public.appointment_service_prices(offering_id,amount_cents,active) values ($1,15000,true)", [OFFER]);
  const req = (await db.query(`insert into public.appointment_requests(idempotency_key,service,modality,requester_name,contact_type,contact,preferred_date,preferred_period,requester_user_id,offering_id)
    values(gen_random_uuid(),'Atendimento Potala','online','Cliente','email','cliente@pay10.test',current_date+3,'tarde',$1,$2) returning id`, [U.CLIENT, OFFER])).rows[0].id;
  const slot = (await db.query(`insert into public.appointment_slots(offering_id,professional_profile_id,starts_at,ends_at,status,held_by_request_id,created_by)
    values($1,$2,now()+interval '3 days',now()+interval '3 days 1 hour','held',$3,$4) returning id`, [OFFER, PROF, req, U.OWNER])).rows[0].id;
  await db.query("update public.appointment_requests set appointment_slot_id=$1 where id=$2", [slot, req]);
  return { req, slot };
}

test("somente Owner lista e altera; cliente nao le tabela nem executa RPCs", () => tx(async () => {
  await seed();
  assert.equal((await owner("select public.admin_list_appointment_service_prices() v")).ok, true);
  for (const sql of ["select public.admin_list_appointment_service_prices()", "select public.admin_set_appointment_service_price($1,15000,true)", "select public.admin_list_pay_pilot_candidates()"])
    assert.equal((await client(sql, sql.includes("$1") ? [OFFER] : [])).code, "42501", sql);
  assert.equal((await client("select * from public.appointment_service_prices")).ok, false);
}));

test("preco: valida oferta, profissional, teste, valor; atualiza, ativa e desativa com auditoria", () => tx(async () => {
  await seed();
  for (const amount of [0, -1, 100000000]) { const r = await owner("select public.admin_set_appointment_service_price($1,$2,true)", [OFFER, amount]); assert.equal(r.ok, false); assert.equal(r.code, "22023"); }
  assert.equal((await owner("select public.admin_set_appointment_service_price('inexistente',15000,true)")).ok, false);
  let r = await owner("select public.admin_set_appointment_service_price($1,15000,true) v", [OFFER]); assert.equal(r.ok, true, r.message);
  r = await owner("select public.admin_set_appointment_service_price($1,17500,false) v", [OFFER]); assert.equal(r.ok, true, r.message);
  const row = (await db.query("select * from public.appointment_service_prices where offering_id=$1", [OFFER])).rows[0];
  assert.equal(row.amount_cents, 17500); assert.equal(row.currency, "BRL"); assert.equal(row.active, false);
  assert.equal((await db.query("select count(*)::int n from public.op_records where collection='audit_events' and document->>'action'='appointment_price.changed'")).rows[0].n, 2);
}));

test("oferta ou profissional de teste/demonstracao nao recebe preco", () => tx(async () => {
  await seed({ test: true });
  const r = await owner("select public.admin_set_appointment_service_price($1,15000,true)", [OFFER]);
  assert.equal(r.ok, false); assert.equal(r.code, "22023"); assert.match(r.message, /teste|demonstracao/i);
}));

test("candidato mostra motivo; wrapper deriva user_id e so autoriza pedido elegivel", () => tx(async () => {
  const { req } = await seed();
  let list = (await owner("select public.admin_list_pay_pilot_candidates() v")).rows[0].v;
  assert.equal(list[0].eligible, false); assert.match(list[0].ineligible_reason, /preco/i);
  await owner("select public.admin_set_appointment_service_price($1,15000,true)", [OFFER]);
  list = (await owner("select public.admin_list_pay_pilot_candidates() v")).rows[0].v;
  assert.equal(list[0].eligible, true); assert.equal("contact" in list[0], false); assert.equal("email" in list[0], false);
  const auth = await owner("select public.admin_set_pay_pilot_authorization_for_request($1,now()+interval '2 hours',true) v", [req]);
  assert.equal(auth.ok, true, auth.message); assert.equal(auth.rows[0].v.user_id, U.CLIENT);
  const mismatch = await owner("select public.admin_set_pay_pilot_authorization($1,$2,now()+interval '2 hours',true)", [req, U.OTHER]);
  assert.equal(mismatch.ok, false); assert.equal(mismatch.code, "22023");
  assert.equal((await db.query("select count(*)::int n from public.appointment_payments")).rows[0].n, 0);
  assert.equal((await db.query("select charges_enabled from public.pay_runtime_settings")).rows[0].charges_enabled, false);
}));

test("expiracao, revogacao e pedido inelegivel sao aplicados no servidor", () => tx(async () => {
  const { req, slot } = await seed({ price: true });
  assert.equal((await owner("select public.admin_set_pay_pilot_authorization_for_request($1,now()-interval '1 minute',true)", [req])).ok, false);
  assert.equal((await owner("select public.admin_set_pay_pilot_authorization_for_request($1,now()+interval '2 hours',true)", [req])).ok, true);
  assert.equal((await owner("select public.admin_set_pay_pilot_authorization_for_request($1,null,false)", [req])).ok, true);
  assert.equal((await db.query("select enabled from public.pay_pilot_authorizations where request_id=$1", [req])).rows[0].enabled, false);
  await db.query("update public.appointment_slots set starts_at=now()-interval '1 hour', ends_at=now() where id=$1", [slot]);
  const expiredSlot = await owner("select public.admin_set_pay_pilot_authorization_for_request($1,now()+interval '2 hours',true)", [req]);
  assert.equal(expiredSlot.ok, false); assert.equal(expiredSlot.code, "22023");
}));

test("tentativas repetidas/concomitantes permanecem idempotentes e uma unica linha", () => tx(async () => {
  const { req } = await seed({ price: true });
  const [a, b] = await Promise.all([
    owner("select public.admin_set_appointment_service_price($1,15000,true)", [OFFER]),
    owner("select public.admin_set_appointment_service_price($1,15000,true)", [OFFER]),
  ]);
  assert.equal(a.ok && b.ok, true);
  const [x, y] = await Promise.all([
    owner("select public.admin_set_pay_pilot_authorization_for_request($1,now()+interval '2 hours',true)", [req]),
    owner("select public.admin_set_pay_pilot_authorization_for_request($1,now()+interval '2 hours',true)", [req]),
  ]);
  assert.equal(x.ok && y.ok, true);
  assert.equal((await db.query("select count(*)::int n from public.appointment_service_prices where offering_id=$1", [OFFER])).rows[0].n, 1);
  assert.equal((await db.query("select count(*)::int n from public.pay_pilot_authorizations where request_id=$1", [req])).rows[0].n, 1);
}));

test("rollback remove portas PAY-10 e preserva dados financeiros", () => tx(async () => {
  const { req } = await seed({ price: true });
  await owner("select public.admin_set_pay_pilot_authorization_for_request($1,now()+interval '2 hours',true)", [req]);
  await db.exec(readFileSync(ROLLBACK, "utf8"));
  const f = await db.query("select count(*)::int n from pg_proc where proname like 'admin_%pay_pilot_candidates' or proname='admin_set_appointment_service_price'");
  assert.equal(f.rows[0].n, 0);
  assert.equal((await db.query("select count(*)::int n from public.appointment_service_prices")).rows[0].n, 1);
  assert.equal((await db.query("select count(*)::int n from public.pay_pilot_authorizations")).rows[0].n, 1);
}));
