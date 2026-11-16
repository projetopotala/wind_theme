import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

/* Owner reagenda pedido que escolheu horario publicado (defeito de 16/11: slot passado e horario travado). Todas as migrations reais. */
const DIR = new URL("../../supabase/migrations/", import.meta.url);
const CORRECAO = "202611160010_reagendar_pedido_com_horario_publicado.sql";
const ROLLBACK = readFileSync(new URL("../../supabase/rollbacks/202611160010_rollback_reagendar_pedido_com_horario_publicado.sql", import.meta.url), "utf8");
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


let seq = 0;
async function pedidoComSlot(ctx, { ini, fim }) {
  const { db, como } = ctx;
  const sid = `44444444-4444-4444-4444-${String(++seq).padStart(12, "0")}`;
  await db.query("insert into public.appointment_slots(id, offering_id, professional_profile_id, starts_at, ends_at, status, created_by) values ($1,'oferta','perfil-prof',$2,$3,'available',$4)", [sid, ini, fim, U.owner]);
  const r = (await como(U.cliente, "select public.submit_appointment_slot_request($1::uuid,$2::uuid) as r", [`aaaaaaaa-0000-0000-0000-${String(seq).padStart(12, "0")}`, sid])).rows[0].r;
  return { id: r.id, sid };
}
const slotDe = async (db, sid) => (await db.query("select status, held_by_request_id from public.appointment_slots where id=$1", [sid])).rows[0];
const pedidoDe = async (db, id) => (await db.query("select status, appointment_slot_id, reservation_schedule_id from public.appointment_requests where id=$1", [id])).rows[0];
const FUT = (dias, h = 10) => { const d = new Date(Date.now() + dias * 864e5); d.setUTCHours(h, 0, 0, 0); return [d, new Date(d.valueOf() + 3600e3)]; };

test("REPRODUCAO sem a correcao: horario diferente do slot e recusado pelo banco", async () => {
  const ctx = await montar({ comCorrecao: false });
  const [ini, fim] = FUT(3);
  const { id } = await pedidoComSlot(ctx, { ini, fim });
  const [i2, f2] = FUT(4);
  await assert.rejects(() => ctx.confirmar(id, i2, f2), /diverge do slot/);
});

test("mesmo horario do slot: continua igual (slot booked, pedido mantem o slot)", async () => {
  const ctx = await montar();
  const [ini, fim] = FUT(3);
  const { id, sid } = await pedidoComSlot(ctx, { ini, fim });
  await ctx.confirmar(id, ini, fim);
  assert.equal((await slotDe(ctx.db, sid)).status, "booked");
  const p = await pedidoDe(ctx.db, id);
  assert.equal(p.status, "encerrada");
  assert.equal(p.appointment_slot_id, sid);
});

test("Owner reagenda para outro horario futuro: pedido original encerrado, slot liberado, consulta e sala no novo horario", async () => {
  const ctx = await montar();
  const [ini, fim] = FUT(3);
  const { id, sid } = await pedidoComSlot(ctx, { ini, fim });
  const novo = new Date(Date.now() + 10 * 60e3);
  await ctx.confirmar(id, novo, new Date(novo.valueOf() + 1800e3));
  const p = await pedidoDe(ctx.db, id);
  assert.equal(p.status, "encerrada", "mesma solicitacao original");
  assert.ok(p.reservation_schedule_id, "consulta na agenda");
  assert.equal(p.appointment_slot_id, null, "pedido deixa de apontar para o slot");
  const slot = await slotDe(ctx.db, sid);
  assert.equal(slot.status, "available", "slot futuro volta a ficar disponivel");
  assert.equal(slot.held_by_request_id, null);
  const c = await ctx.contexto(U.cliente, id);
  assert.equal(c.state, "open", "sala abre na janela do NOVO horario");
  assert.equal(new Date(c.starts_at).toISOString(), novo.toISOString());
  assert.equal((await ctx.contexto(U.prof, id)).state, "open");
  assert.equal((await ctx.contexto(U.outro, id)).state, "denied");
  const n = Number((await ctx.db.query("select count(*) n from public.op_records where collection='schedule_items' and document->>'appointment_request_id'=$1", [id])).rows[0].n);
  assert.equal(n, 1, "sem duplicidade");
});

test("slot ja passado: Owner reagenda para o futuro e o slot antigo fica cancelado", async () => {
  const ctx = await montar();
  const [ini, fim] = FUT(3);
  const { id, sid } = await pedidoComSlot(ctx, { ini, fim });
  await ctx.db.query("update public.appointment_slots set starts_at = now() - interval '5 hours', ends_at = now() - interval '4 hours' where id=$1", [sid]);
  const [i2, f2] = FUT(2, 15);
  await ctx.confirmar(id, i2, f2);
  assert.equal((await slotDe(ctx.db, sid)).status, "cancelled");
  assert.equal((await pedidoDe(ctx.db, id)).status, "encerrada");
});

test("conflito de agenda no reagendamento: nada muda (pedido pendente, slot ainda preso)", async () => {
  const ctx = await montar();
  const [ini, fim] = FUT(3);
  const a = await pedidoComSlot(ctx, { ini, fim });
  const [i2, f2] = FUT(5);
  await ctx.confirmar(a.id, i2, f2);
  const [ini3, fim3] = FUT(4);
  const b = await pedidoComSlot(ctx, { ini: ini3, fim: fim3 });
  await assert.rejects(() => ctx.confirmar(b.id, new Date(i2.valueOf() + 900e3), new Date(f2.valueOf() + 900e3)), (e) => e.code === "23P01");
  const p = await pedidoDe(ctx.db, b.id);
  assert.equal(p.status, "recebida");
  assert.equal(p.appointment_slot_id, b.sid);
  assert.equal((await slotDe(ctx.db, b.sid)).status, "held");
});

test("migration nao mexe em RLS, tabelas, LiveKit nem salas; rollback restaura o texto anterior", () => {
  const sql = readFileSync(new URL(CORRECAO, DIR), "utf8").replace(/^--.*$/gm, "");
  assert.doesNotMatch(sql, /create policy|alter policy|drop policy|create table|alter table|appointment_room|livekit/i);
  assert.match(ROLLBACK, /diverge do slot solicitado/);
  assert.doesNotMatch(ROLLBACK, /sync_appointment_slot_state/);
});
