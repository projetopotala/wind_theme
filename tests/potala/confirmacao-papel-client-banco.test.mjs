import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

/* Confirmacao de atendimento para conta cujo cadastro vinculado nao tem o papel client (defeito de 16/11: aluno de Cursos). Migrations reais. */
const DIR = new URL("../../supabase/migrations/", import.meta.url);
const CORRECAO = "202611160011_confirmacao_papel_client.sql";
const ROLLBACK = readFileSync(new URL("../../supabase/rollbacks/202611160011_rollback_confirmacao_papel_client.sql", import.meta.url), "utf8");
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
  return { db, como, pedir, confirmar, contexto, doc };
}


const FUT = (dias, h = 10) => { const d = new Date(Date.now() + dias * 864e5); d.setUTCHours(h, 0, 0, 0); return [d, new Date(d.valueOf() + 3600e3)]; };
const perfil = (ctx, id, extra = {}) => ctx.doc("profiles", id, { display_name: "TESTE INTERNO " + id, email: "cliente@potala.test", roles: ["student"], active: true, ...extra });
const vincular = (ctx, uid, perfilId, ativo = true) => ctx.db.query("insert into public.appointment_profile_accounts(user_id, profile_id, active) values ($1,$2,$3)", [uid, perfilId, ativo]);
const rolesDe = async (db, id) => (await db.query("select document->'roles' r from public.op_records where collection='profiles' and id=$1", [id])).rows[0]?.r;
const auditorias = async (db) => Number((await db.query("select count(*) n from public.op_records where collection='audit_events' and document->>'action' = 'appointment.add_client_role'")).rows[0].n);
const vinculos = async (db) => Number((await db.query("select count(*) n from public.appointment_profile_accounts")).rows[0].n);

test("REPRODUCAO sem a correcao: conta vinculada a cadastro so 'student' e recusada (PT422) e o pedido segue recebida", async () => {
  const ctx = await montar({ comCorrecao: false });
  await perfil(ctx, U.cliente); await vincular(ctx, U.cliente, U.cliente);
  const id = await ctx.pedir();
  const [i, f] = FUT(2);
  await assert.rejects(() => ctx.confirmar(id, i, f), (e) => e.code === "PT422" && /precisa ser revisado/.test(e.message));
  assert.equal((await ctx.db.query("select status from public.appointment_requests where id=$1", [id])).rows[0].status, "recebida");
});

test("com a correcao: aluno vinculado e confirmado; papel client acrescentado sem remover student; auditado; cliente e profissional recebem; sala restrita", async () => {
  const ctx = await montar();
  await perfil(ctx, U.cliente); await vincular(ctx, U.cliente, U.cliente);
  const id = await ctx.pedir();
  const [i, f] = FUT(2);
  await ctx.confirmar(id, i, f);
  assert.deepEqual(await rolesDe(ctx.db, U.cliente), ["student", "client"]);
  assert.equal(await auditorias(ctx.db), 1);
  assert.equal(await vinculos(ctx.db), 2, "nenhum vinculo novo (so o do cliente e o do profissional)");
  const p = (await ctx.db.query("select status, reservation_schedule_id from public.appointment_requests where id=$1", [id])).rows[0];
  assert.equal(p.status, "encerrada");
  assert.ok(p.reservation_schedule_id);
  const minha = (await ctx.como(U.cliente, "select public.list_my_appointment_requests() as l")).rows[0].l.find((x) => x.id === id);
  assert.ok(minha.reservation_schedule_id, "cliente ve a consulta confirmada");
  const item = (await ctx.db.query("select document->>'client_id' c, document->>'professional_id' p from public.op_records where collection='schedule_items' and id=$1", [p.reservation_schedule_id])).rows[0];
  assert.equal(item.c, U.cliente);
  assert.equal(item.p, "perfil-prof", "profissional atribuido recebe a consulta");
  const [a, b] = [new Date(Date.now() + 10 * 60e3), null]; void b;
  const id2 = await ctx.pedir();
  await ctx.confirmar(id2, a, new Date(a.valueOf() + 1800e3));
  assert.equal((await ctx.contexto(U.cliente, id2)).state, "open");
  assert.equal((await ctx.contexto(U.prof, id2)).state, "open");
  assert.equal((await ctx.contexto(U.outro, id2)).state, "denied");
  assert.equal(await auditorias(ctx.db), 1, "papel ja existe: sem nova auditoria");
});

test("profissional vinculado que tambem pede atendimento: client e acrescentado e a consulta e confirmada", async () => {
  const ctx = await montar();
  await ctx.doc("profiles", U.outro, { display_name: "TESTE INTERNO Outro", email: "outro@potala.test", roles: ["professional"], active: true });
  await vincular(ctx, U.outro, U.outro);
  const id = await ctx.pedir(U.outro);
  const [i, f] = FUT(2);
  await ctx.confirmar(id, i, f);
  assert.deepEqual(await rolesDe(ctx.db, U.outro), ["professional", "client"]);
});

test("as validacoes legitimas continuam recusando e nada e alterado (papeis, vinculos, auditoria)", async () => {
  const [i, f] = FUT(2);
  const recusa = async (preparar, esperado, depois = async () => {}) => {
    const ctx = await montar();
    const alvo = await preparar(ctx);
    const antes = JSON.stringify([await rolesDe(ctx.db, U.cliente), await vinculos(ctx.db)]);
    const id = await ctx.pedir();
    await depois(ctx);
    await assert.rejects(() => ctx.confirmar(id, i, f), (e) => e.code === "PT422" && esperado.test(e.message), String(alvo));
    assert.equal(JSON.stringify([await rolesDe(ctx.db, U.cliente), await vinculos(ctx.db)]), antes);
    assert.equal(await auditorias(ctx.db), 0);
    assert.equal((await ctx.db.query("select status from public.appointment_requests where id=$1", [id])).rows[0].status, "recebida");
  };
  await recusa(async (c) => { await perfil(c, U.cliente, { email: "outra-pessoa@potala.test" }); await vincular(c, U.cliente, U.cliente); }, /precisa ser revisado/);
  await recusa(async (c) => { await perfil(c, U.cliente, { active: false }); await vincular(c, U.cliente, U.cliente); }, /precisa ser revisado/);
  await recusa(async (c) => { await perfil(c, U.cliente); await vincular(c, U.cliente, U.cliente, false); }, /inativo/);
  await recusa(async (c) => { await perfil(c, U.cliente); await vincular(c, U.cliente, U.cliente); }, /e-mail confirmado/, (c) => c.db.query("update auth.users set email_confirmed_at = null where id=$1", [U.cliente]));
  /* sem vinculo previo, cadastro unico achado so por e-mail continua exigindo client (nao ampliado); nada e vinculado */
  await recusa(async (c) => { await perfil(c, "perfil-so-email"); }, /habilitado como cliente/);
  /* sem vinculo previo e dois cadastros com o mesmo e-mail: recusa, sem adivinhar */
  await recusa(async (c) => { await perfil(c, "dup-1", { roles: ["client"] }); await perfil(c, "dup-2", { roles: ["client"] }); }, /duplicados/);
});

test("so a administracao confirma; conta comum nao acrescenta papel a ninguem", async () => {
  const ctx = await montar();
  await perfil(ctx, U.cliente); await vincular(ctx, U.cliente, U.cliente);
  const id = await ctx.pedir();
  const [i, f] = FUT(2);
  const u = (await ctx.db.query("select updated_at from public.appointment_requests where id=$1", [id])).rows[0].updated_at;
  await assert.rejects(() => ctx.como(U.cliente, "select public.confirm_appointment_request_reservation($1::uuid,$2::timestamptz,$3,$4::jsonb)", [id, u, "cccccccc-0000-4000-8000-0000000000aa", JSON.stringify({ starts_at: i.toISOString(), ends_at: f.toISOString() })]), (e) => e.code === "42501");
  assert.deepEqual(await rolesDe(ctx.db, U.cliente), ["student"]);
});

test("conflito de agenda depois do papel acrescentado: transacao inteira desfeita (papel e auditoria incluidos)", async () => {
  const ctx = await montar();
  await perfil(ctx, U.cliente); await vincular(ctx, U.cliente, U.cliente);
  const a = await ctx.pedir(U.outro);
  const [i, f] = FUT(3);
  await ctx.confirmar(a, i, f);
  const id = await ctx.pedir();
  await assert.rejects(() => ctx.confirmar(id, new Date(i.valueOf() + 900e3), new Date(f.valueOf() + 900e3)), (e) => e.code === "23P01");
  assert.deepEqual(await rolesDe(ctx.db, U.cliente), ["student"], "papel nao fica acrescentado apos falha");
  assert.equal(await auditorias(ctx.db), 0);
  assert.equal((await ctx.db.query("select status from public.appointment_requests where id=$1", [id])).rows[0].status, "recebida");
});

test("pedido com horario publicado vencido pode ser reagendado por conta de aluno", async () => {
  const ctx = await montar();
  await perfil(ctx, U.cliente); await vincular(ctx, U.cliente, U.cliente);
  const [i, f] = FUT(3);
  await ctx.db.query("insert into public.appointment_slots(id, offering_id, professional_profile_id, starts_at, ends_at, status, created_by) values ('55555555-5555-5555-5555-555555555555','oferta','perfil-prof',$1,$2,'available',$3)", [i, f, U.owner]);
  const r = (await ctx.como(U.cliente, "select public.submit_appointment_slot_request('aaaaaaaa-0000-0000-0000-000000000777'::uuid,'55555555-5555-5555-5555-555555555555') as r")).rows[0].r;
  await ctx.db.query("update public.appointment_slots set starts_at = now() - interval '5 hours', ends_at = now() - interval '4 hours' where id='55555555-5555-5555-5555-555555555555'");
  const [i2, f2] = FUT(2, 15);
  await ctx.confirmar(r.id, i2, f2);
  assert.equal((await ctx.db.query("select status, appointment_slot_id from public.appointment_requests where id=$1", [r.id])).rows[0].status, "encerrada");
});

test("migration so troca a funcao de confirmacao; rollback restaura a regra anterior", async () => {
  const sql = readFileSync(new URL(CORRECAO, DIR), "utf8").replace(/^--.*$/gm, "");
  assert.doesNotMatch(sql, /create policy|alter policy|drop policy|create table|alter table|appointment_room|livekit|_core\(.*\) *\n *returns/i);
  assert.equal((sql.match(/create or replace function/gi) || []).length, 1);
  const ctx = await montar();
  await ctx.db.exec(ROLLBACK);
  await perfil(ctx, U.cliente); await vincular(ctx, U.cliente, U.cliente);
  const id = await ctx.pedir();
  const [i, f] = FUT(2);
  await assert.rejects(() => ctx.confirmar(id, i, f), (e) => e.code === "PT422");
});
