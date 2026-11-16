import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

/* Pedido de atendimento SEM horario, com TODAS as migrations reais (auth/storage simulados). */
const DIR = new URL("../../supabase/migrations/", import.meta.url);
const DIA = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
const U = { owner: "00000000-0000-0000-0000-0000000000a1", prof: "00000000-0000-0000-0000-0000000000b1", cliente: "00000000-0000-0000-0000-0000000000c1", outro: "00000000-0000-0000-0000-0000000000c2" };

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
  await db.exec("grant usage on schema public, auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated");
  for (const [k, email] of [["owner", "owner@potala.test"], ["prof", "prof@potala.test"], ["cliente", "cliente@potala.test"], ["outro", "outro@potala.test"]]) {
    await db.query("insert into auth.users(id, email) values ($1,$2)", [U[k], email]);
  }
  await db.query("insert into public.users(id, role, name, email) values ($1,'owner','owner','owner@potala.test') on conflict (id) do update set role='owner'", [U.owner]);
  const doc = (col, id, d) => db.query("insert into public.op_records(collection, id, document) values ($1,$2,$3::jsonb)", [col, id, JSON.stringify({ id, ...d })]);
  await doc("profiles", "perfil-prof", { display_name: "TESTE INTERNO Profissional", email: "prof@potala.test", roles: ["professional"], active: true, published: true });
  await doc("activity_definitions", "def", { title: "TESTE INTERNO Meditação", kind: "appointment" });
  await doc("activity_offerings", "oferta", { title: "TESTE INTERNO Meditação online", definition_id: "def", professional_id: "perfil-prof", mode: "online", capacity: 1 });
  await db.query("insert into public.appointment_profile_accounts(user_id, profile_id, active) values ($1,'perfil-prof',true)", [U.prof]);
  const como = async (uid, sql, params) => {
    await db.exec(`set test.uid = '${uid}'; set role authenticated`);
    try { return await db.query(sql, params); } finally { await db.exec("reset role; set test.uid = ''"); }
  };
  const pedir = async (uid, chave, extra = {}) => {
    const a = { oferta: "oferta", modo: "online", dia: DIA, periodo: "tarde", ...extra };
    try { return { ok: true, r: (await como(uid, "select public.submit_authenticated_appointment_request($1::uuid,$2,$3,$4::date,$5) as r", [chave, a.oferta, a.modo, a.dia, a.periodo])).rows[0].r }; }
    catch (e) { return { ok: false, code: e.code, message: e.message }; }
  };
  return { db, como, pedir };
}

test("cliente pede sem horario: pedido gravado com a identidade da sessao e estado recebida", async () => {
  const { db, como, pedir } = await montar();
  assert.equal((await como(U.cliente, "select public.list_appointment_offerings() as l")).rows[0].l.length, 1, "servico publicado aparece");
  const r = await pedir(U.cliente, "bbbbbbbb-0000-0000-0000-000000000001");
  assert.equal(r.ok, true, r.message);
  assert.equal(r.r.status, "recebida");
  const linha = (await db.query("select requester_user_id, offering_id, preferred_date::text d, preferred_period, status, appointment_slot_id, reservation_schedule_id from public.appointment_requests")).rows[0];
  assert.equal(linha.requester_user_id, U.cliente);
  assert.equal(linha.offering_id, "oferta");
  assert.equal(linha.d, DIA);
  assert.equal(linha.preferred_period, "tarde");
  assert.equal(linha.status, "recebida");
  assert.equal(linha.appointment_slot_id, null, "nenhum horario reservado");
  assert.equal(linha.reservation_schedule_id, null, "nenhuma consulta marcada");
  /* repetir o envio (mesma chave) nao duplica */
  assert.equal((await pedir(U.cliente, "bbbbbbbb-0000-0000-0000-000000000001")).ok, true);
  assert.equal(Number((await db.query("select count(*) n from public.appointment_requests")).rows[0].n), 1);
});

test("aparece em Meu Potala do cliente, nao para outro cliente, e chega a fila do Owner", async () => {
  const { como, pedir } = await montar();
  await pedir(U.cliente, "bbbbbbbb-0000-0000-0000-000000000002");
  const meus = (await como(U.cliente, "select public.list_my_appointment_requests() as l")).rows[0].l;
  assert.equal(meus.length, 1);
  const deOutro = (await como(U.outro, "select public.list_my_appointment_requests() as l")).rows[0].l;
  assert.equal(deOutro.length, 0, "isolamento entre clientes");
  const diretoOutro = await como(U.outro, "select count(*) n from public.appointment_requests").catch(() => ({ rows: [{ n: 0 }] }));
  assert.equal(Number(diretoOutro.rows[0].n), 0, "RLS: outro cliente nao le a tabela");
  const fila = await como(U.owner, "select status, offering_id from public.appointment_requests");
  assert.equal(fila.rows.length, 1, "Owner ve o pedido na fila");
  assert.equal(fila.rows[0].status, "recebida");
});

test("anonimo nao pede; modalidade ou servico errados sao recusados", async () => {
  const { db, pedir } = await montar();
  await db.exec("set role anon");
  await assert.rejects(() => db.query("select public.submit_authenticated_appointment_request('bbbbbbbb-0000-0000-0000-000000000009'::uuid,'oferta','online','2026-12-01'::date,'tarde')"), /permission denied/i);
  await db.exec("reset role");
  assert.equal((await pedir(U.cliente, "bbbbbbbb-0000-0000-0000-000000000003", { modo: "presencial" })).code, "22023");
  assert.equal((await pedir(U.cliente, "bbbbbbbb-0000-0000-0000-000000000004", { oferta: "nao-existe" })).code, "22023");
});
