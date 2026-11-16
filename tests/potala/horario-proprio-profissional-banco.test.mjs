import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

/*
 * Defeito de 16/11: o Profissional solicitava o proprio horario, o horario ficava retido (held) e sumia
 * para o Cliente. Monta TODAS as migrations reais (auth/storage simulados) e reproduz com e sem a correcao.
 */
const DIR = new URL("../../supabase/migrations/", import.meta.url);
const CORRECAO = "202611160002_horario_proprio_profissional.sql";
const ROLLBACK = readFileSync(new URL("../../supabase/rollbacks/202611160002_rollback_horario_proprio_profissional.sql", import.meta.url), "utf8");
const U = { owner: "00000000-0000-0000-0000-0000000000a1", prof: "00000000-0000-0000-0000-0000000000b1", cliente: "00000000-0000-0000-0000-0000000000c1", outro: "00000000-0000-0000-0000-0000000000c2" };

async function montar({ comCorrecao = true } = {}) {
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
  for (const a of readdirSync(DIR).sort()) {
    if (a === CORRECAO && !comCorrecao) continue;
    await db.exec(readFileSync(new URL(a, DIR), "utf8"));
  }
  await db.exec("grant usage on schema public, auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated");
  for (const [k, papel, email] of [["owner", "owner", "owner@potala.test"], ["prof", "user", "prof@potala.test"], ["cliente", "user", "cliente@potala.test"], ["outro", "user", "outro@potala.test"]]) {
    await db.query("insert into auth.users(id, email) values ($1,$2)", [U[k], email]);
    if (papel === "owner") await db.query("insert into public.users(id, role, name, email) values ($1,$2,$3,$4) on conflict (id) do update set role = excluded.role", [U[k], papel, k, email]);
  }
  const doc = (col, id, d) => db.query("insert into public.op_records(collection, id, document) values ($1,$2,$3::jsonb)", [col, id, JSON.stringify({ id, ...d })]);
  await doc("profiles", "perfil-prof", { display_name: "TESTE INTERNO Profissional", email: "prof@potala.test", roles: ["professional"], active: true, published: true });
  await doc("activity_definitions", "def", { title: "TESTE INTERNO Atendimento", kind: "appointment" });
  await doc("activity_offerings", "oferta", { title: "TESTE INTERNO Atendimento online", definition_id: "def", professional_id: "perfil-prof", mode: "online", capacity: 1 });
  await db.query("insert into public.appointment_profile_accounts(user_id, profile_id, active) values ($1,'perfil-prof',true)", [U.prof]);
  await db.query("insert into public.appointment_slots(id, offering_id, professional_profile_id, starts_at, ends_at, status, created_by) values ('11111111-1111-1111-1111-111111111111','oferta','perfil-prof', now() + interval '2 days', now() + interval '2 days 40 minutes','available',$1)", [U.owner]);
  const como = async (uid, sql, params) => {
    await db.exec(`set test.uid = '${uid}'; set role authenticated`);
    try { return await db.query(sql, params); } finally { await db.exec("reset role; set test.uid = ''"); }
  };
  const lista = async (uid) => (await como(uid, "select public.list_available_appointment_slots() as l")).rows[0].l;
  const pedir = async (uid, chave) => {
    try { return { ok: true, r: (await como(uid, "select public.submit_appointment_slot_request($1::uuid,'11111111-1111-1111-1111-111111111111') as r", [chave])).rows[0].r }; }
    catch (e) { return { ok: false, code: e.code, message: e.message }; }
  };
  return { db, lista, pedir };
}

test("REPRODUCAO sem a correcao: o profissional pede o proprio horario e ele some para o cliente", async () => {
  const { lista, pedir } = await montar({ comCorrecao: false });
  assert.equal((await lista(U.cliente)).length, 1);
  assert.equal((await pedir(U.prof, "aaaaaaaa-0000-0000-0000-000000000001")).ok, true, "defeito: o banco aceitava");
  assert.equal((await lista(U.cliente)).length, 0, "defeito: cliente fica sem horario");
});

test("com a correcao: profissional nao ve nem pede o proprio horario; cliente continua vendo", async () => {
  const { lista, pedir, db } = await montar();
  assert.equal((await lista(U.prof)).length, 0, "nao e oferecido ao proprio profissional");
  const r = await pedir(U.prof, "aaaaaaaa-0000-0000-0000-000000000002");
  assert.equal(r.ok, false);
  assert.equal(r.code, "42501");
  assert.equal((await db.query("select status from public.appointment_slots")).rows[0].status, "available", "nada retido");
  assert.equal((await lista(U.cliente)).length, 1, "cliente ve o horario");
});

test("com a correcao: cliente solicita, horario fica retido e some para os outros (conflito preservado)", async () => {
  const { lista, pedir, db } = await montar();
  const r = await pedir(U.cliente, "aaaaaaaa-0000-0000-0000-000000000003");
  assert.equal(r.ok, true, r.message);
  assert.equal(r.r.status, "recebida", "pedido, nao reserva confirmada");
  assert.equal((await db.query("select status from public.appointment_slots")).rows[0].status, "held");
  assert.equal((await lista(U.outro)).length, 0);
  const segundo = await pedir(U.outro, "aaaaaaaa-0000-0000-0000-000000000004");
  assert.equal(segundo.ok, false);
  assert.equal(segundo.code, "PT409");
});

test("anonimo continua sem horarios; rollback restaura o comportamento anterior", async () => {
  const { db, lista, pedir } = await montar();
  await db.exec("set role anon");
  await assert.rejects(() => db.query("select public.list_available_appointment_slots()"), /permission denied/i);
  await db.exec("reset role");
  await db.exec(ROLLBACK);
  assert.equal((await lista(U.prof)).length, 1, "rollback volta ao estado de Production");
  assert.equal((await pedir(U.prof, "aaaaaaaa-0000-0000-0000-000000000005")).ok, true);
});
