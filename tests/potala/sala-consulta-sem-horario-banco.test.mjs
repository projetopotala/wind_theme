import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

/* Sala online de consulta confirmada SEM slot (defeito de 16/11, pedido 8085edc1). Todas as migrations reais. */
const DIR = new URL("../../supabase/migrations/", import.meta.url);
const CORRECAO = "202611160005_sala_consulta_sem_horario.sql";
const ROLLBACK = readFileSync(new URL("../../supabase/rollbacks/202611160005_rollback_sala_consulta_sem_horario.sql", import.meta.url), "utf8");
const U = { owner: "00000000-0000-0000-0000-0000000000a1", prof: "00000000-0000-0000-0000-0000000000b1", cliente: "00000000-0000-0000-0000-0000000000c1", outro: "00000000-0000-0000-0000-0000000000c2" };
const DIA = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);

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
  for (const [k, email] of [["owner", "owner@potala.test"], ["prof", "prof@potala.test"], ["cliente", "cliente@potala.test"], ["outro", "outro@potala.test"]]) {
    await db.query("insert into auth.users(id, email) values ($1,$2)", [U[k], email]);
  }
  await db.query("insert into public.users(id, role, name, email) values ($1,'owner','owner','owner@potala.test') on conflict (id) do update set role='owner'", [U.owner]);
  const doc = (col, id, d) => db.query("insert into public.op_records(collection, id, document) values ($1,$2,$3::jsonb)", [col, id, JSON.stringify({ id, ...d })]);
  await doc("profiles", "perfil-prof", { display_name: "TESTE INTERNO Profissional", email: "prof@potala.test", roles: ["professional"], active: true, published: true });
  await doc("activity_definitions", "def", { title: "TESTE INTERNO Meditação", kind: "appointment" });
  await doc("activity_offerings", "oferta", { title: "TESTE INTERNO Meditação online", definition_id: "def", professional_id: "perfil-prof", mode: "online", capacity: 1 });
  await doc("activity_offerings", "presencial", { title: "TESTE INTERNO Presencial", definition_id: "def", professional_id: "perfil-prof", mode: "presencial", capacity: 1 });
  await doc("rooms", "sala1", { code: "S1", name: "TESTE INTERNO Sala", status: "available", capacity: 5 });
  await db.query("insert into public.appointment_profile_accounts(user_id, profile_id, active) values ($1,'perfil-prof',true)", [U.prof]);
  const como = async (uid, sql, params) => {
    await db.exec(`set test.uid = '${uid}'; set role authenticated`);
    try { return await db.query(sql, params); } finally { await db.exec("reset role; set test.uid = ''"); }
  };
  let n = 0;
  const pedir = async (uid = U.cliente, oferta = "oferta", modo = "online") => {
    const chave = `bbbbbbbb-0000-0000-0000-${String(++n).padStart(12, "0")}`;
    const r = (await como(uid, "select public.submit_authenticated_appointment_request($1::uuid,$2,$3,$4::date,'manha') as r", [chave, oferta, modo, DIA])).rows[0].r;
    return r.id;
  };
  const confirmar = async (id, inicio, fim, extra = {}) => {
    const u = (await db.query("select updated_at from public.appointment_requests where id=$1", [id])).rows[0].updated_at;
    const chave = `cccccccc-0000-4000-8000-${String(++n).padStart(12, "0")}`;
    return (await como(U.owner, "select public.confirm_appointment_request_reservation($1::uuid,$2::timestamptz,$3,$4::jsonb) as r", [id, u, chave, JSON.stringify({ starts_at: inicio.toISOString(), ends_at: fim.toISOString(), ...extra })])).rows[0].r;
  };
  const contexto = async (uid, id) => (await como(uid, "select public.appointment_room_context($1::uuid) as c", [id])).rows[0].c;
  return { db, como, pedir, confirmar, contexto };
}
const emBreve = () => { const i = new Date(Date.now() + 5 * 60e3); return [i, new Date(i.valueOf() + 30 * 60e3)]; };

test("REPRODUCAO sem a correcao: consulta confirmada sem slot nao abre a sala", async () => {
  const { pedir, confirmar, contexto } = await montar({ comCorrecao: false });
  const id = await pedir();
  await confirmar(id, ...emBreve());
  assert.equal((await contexto(U.cliente, id)).state, "not_confirmed", "defeito de Production");
});

test("com a correcao: cliente e profissional vinculado entram; outras contas nao", async () => {
  const { pedir, confirmar, contexto } = await montar();
  const id = await pedir();
  const [ini, fim] = emBreve();
  await confirmar(id, ini, fim);
  const c = await contexto(U.cliente, id);
  assert.equal(c.state, "open");
  assert.equal(c.role, "client");
  assert.equal(new Date(c.starts_at).toISOString(), ini.toISOString());
  const p = await contexto(U.prof, id);
  assert.equal(p.state, "open");
  assert.equal(p.role, "professional");
  assert.equal((await contexto(U.outro, id)).state, "denied", "outro cliente com o ID nao entra");
  assert.equal((await contexto(U.owner, id)).state, "denied", "Owner nao e participante");
});

test("pedido pendente, presencial, cancelado na agenda e fora da janela continuam bloqueados", async () => {
  const { db, pedir, confirmar, contexto } = await montar();
  const pendente = await pedir();
  assert.equal((await contexto(U.cliente, pendente)).state, "not_confirmed");

  const presencial = await pedir(U.cliente, "presencial", "presencial");
  assert.equal((await contexto(U.cliente, presencial)).state, "not_confirmed");

  const cedo = await pedir(U.outro);
  const ini = new Date(Date.now() + 2 * 864e5);
  await confirmar(cedo, ini, new Date(ini.valueOf() + 3600e3));
  assert.equal((await contexto(U.outro, cedo)).state, "too_early");

  const cancelada = await pedir(U.cliente);
  const ini2 = new Date(Date.now() + 3 * 864e5);
  await confirmar(cancelada, ini2, new Date(ini2.valueOf() + 3600e3));
  await db.query("update public.op_records set document = jsonb_set(document,'{status}','\"cancelled\"') where collection='schedule_items' and document->>'appointment_request_id'=$1", [cancelada]);
  assert.equal((await contexto(U.cliente, cancelada)).state, "not_confirmed");
});

test("caminho com slot pre-cadastrado continua igual", async () => {
  const { db, como, contexto } = await montar();
  const [ini, fim] = emBreve();
  await db.query("insert into public.appointment_slots(id, offering_id, professional_profile_id, starts_at, ends_at, status, created_by) values ('33333333-3333-3333-3333-333333333333','oferta','perfil-prof',$1,$2,'available',$3)", [ini, fim, U.owner]);
  const r = (await como(U.cliente, "select public.submit_appointment_slot_request('aaaaaaaa-0000-0000-0000-000000000301'::uuid,'33333333-3333-3333-3333-333333333333') as r")).rows[0].r;
  const u = (await db.query("select updated_at from public.appointment_requests where id=$1", [r.id])).rows[0].updated_at;
  await como(U.owner, "select public.confirm_appointment_request_reservation($1::uuid,$2::timestamptz,$3,$4::jsonb)", [r.id, u, "cccccccc-0000-4000-8000-000000000301", JSON.stringify({ starts_at: ini.toISOString(), ends_at: fim.toISOString() })]);
  const c = await contexto(U.cliente, r.id);
  assert.equal(c.state, "open");
  assert.equal(new Date(c.starts_at).toISOString(), ini.toISOString());
});

test("revogacao: sala sem slot so entra na fila depois do fim (+30 min); auxiliar nao e publico", async () => {
  const { db, como, pedir, confirmar } = await montar();
  const ativa = await pedir();
  await confirmar(ativa, ...emBreve());
  const passada = await pedir(U.outro);
  const ini = new Date(Date.now() - 3 * 3600e3);
  await confirmar(passada, ini, new Date(ini.valueOf() + 3600e3)).catch(() => null);
  for (const [id, nome] of [[ativa, "potala-" + "a".repeat(32)], [passada, "potala-" + "b".repeat(32)]]) {
    await db.query("insert into public.appointment_room_sessions(request_id, provider, provider_room_name) values ($1,'livekit',$2)", [id, nome]).catch(() => null);
  }
  const fila = (await db.query("select request_id from public.appointment_rooms_pending_revocation(50)")).rows.map((x) => x.request_id);
  assert.ok(!fila.includes(ativa), "sala em andamento nao e revogada");
  assert.equal(Number((await db.query("select count(*) n from public.appointment_room_sessions where request_id=$1", [ativa])).rows[0].n), 1, "sessao LiveKit da consulta criada");
  /* a consulta termina: a sala entra na fila de revogacao e pode ser marcada como revogada */
  await db.query("update public.op_records set document = document || jsonb_build_object('starts_at', (now() - interval '3 hours')::text, 'ends_at', (now() - interval '2 hours')::text) where collection='schedule_items' and document->>'appointment_request_id'=$1", [ativa]);
  const fila2 = (await db.query("select session_id, request_id from public.appointment_rooms_pending_revocation(50)")).rows;
  const minha = fila2.find((x) => x.request_id === ativa);
  assert.ok(minha, "sala vencida entra na fila");
  assert.equal((await db.query("select public.mark_appointment_room_revoked($1::uuid) as ok", [minha.session_id])).rows[0].ok, true);
  await assert.rejects(() => como(U.cliente, "select * from public.appointment_request_booked_window($1::uuid)", [ativa]), /permission denied/i);
});

test("rollback restaura o comportamento anterior", async () => {
  const { db, pedir, confirmar, contexto } = await montar();
  const id = await pedir();
  await confirmar(id, ...emBreve());
  await db.exec(ROLLBACK);
  assert.equal((await contexto(U.cliente, id)).state, "not_confirmed");
  assert.equal(Number((await db.query("select count(*) n from pg_proc where proname='appointment_request_booked_window'")).rows[0].n), 0);
});
