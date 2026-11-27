import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

/*
 * PAY-06 | Painel financeiro administrativo: leitura exclusiva do Owner ativo, sem escrita, sem dados sensiveis.
 * Aplica TODAS as migrations reais (incluindo 202611250002 e 202611250003) em PGlite; cada teste roda em transacao
 * desfeita. Sem rede, sem credencial, sem Asaas. Limite: o PGlite nao simula concorrencia real entre conexoes.
 */
const DIR = new URL("../../supabase/migrations/", import.meta.url);
const U = { A: "00000000-0000-0000-0000-0000000000a1", B: "00000000-0000-0000-0000-0000000000b1", OWNER: "00000000-0000-0000-0000-0000000000f1" };
const OFERTA = "pay06-oferta";
const ROLLBACK_PAY06 = new URL("../../supabase/rollbacks/202611260001_rollback_pay06_painel_financeiro_leitura.sql", import.meta.url);
const U2 = { ADMIN: "00000000-0000-0000-0000-0000000000a9", INATIVO: "00000000-0000-0000-0000-0000000000a8", COMUM: "00000000-0000-0000-0000-0000000000a7" };

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
for (const a of readdirSync(DIR).sort()) await db.exec(readFileSync(new URL(a, DIR), "utf8"));
await db.exec("grant usage on schema public, auth to anon, authenticated, service_role; grant execute on function auth.uid() to anon, authenticated, service_role");
for (const [k, e] of [["A", "a"], ["B", "b"], ["OWNER", "owner"]]) await db.query("insert into auth.users(id, email) values ($1,$2)", [U[k], `${e}@pay06.test`]);
after(async () => { await db.close(); });

async function tx(fn) { await db.exec("begin"); try { return await fn(); } finally { await db.exec("rollback"); } }
async function como(papel, uid, sql, params = []) {
  await db.exec("savepoint cmd");
  try {
    await db.exec(`set local role ${papel}`);
    await db.query("select set_config('test.uid', $1, true)", [uid ?? ""]);
    const r = await db.query(sql, params);
    await db.exec("reset role");
    await db.exec("release savepoint cmd");
    return { ok: true, rows: r.rows };
  } catch (e) {
    await db.exec("rollback to savepoint cmd");
    await db.exec("reset role");
    return { ok: false, code: e.code, message: String(e.message) };
  }
}
const svc = (sql, params) => como("service_role", null, sql, params);
const anon = (sql, params) => como("anon", null, sql, params);
const ligar = (v = true) => db.query("update public.pay_runtime_settings set charges_enabled = $1", [v]);

async function semear({ habilitar = true } = {}) {
  const ids = {};
  if (habilitar) await ligar(true);
  await db.query("insert into public.appointment_service_prices(offering_id, amount_cents, active) values ($1, 15000, true)", [OFERTA]);
  for (const k of ["A", "B"]) {
    const r = await db.query(`insert into public.appointment_requests(idempotency_key, service, modality, requester_name, contact_type, contact, preferred_date, preferred_period, requester_user_id, offering_id)
      values (gen_random_uuid(), 'Atendimento teste', 'online', $1, 'email', $2, current_date + 3, 'tarde', $3, $4) returning id`, [`Cliente ${k}`, `${k.toLowerCase()}@pay06.test`, U[k], OFERTA]);
    const s = await db.query(`insert into public.appointment_slots(offering_id, professional_profile_id, starts_at, ends_at, status, held_by_request_id, created_by)
      values ($1, $2, now() + interval '3 days', now() + interval '3 days 1 hour', 'held', $3, $4) returning id`, [OFERTA, `prof-${k}`, r.rows[0].id, U.OWNER]);
    await db.query("update public.appointment_requests set appointment_slot_id = $1 where id = $2", [s.rows[0].id, r.rows[0].id]);
    ids[k] = { req: r.rows[0].id, slot: s.rows[0].id };
  }
  await db.query(`insert into public.pay_pilot_authorizations(request_id,user_id,expires_at,enabled,created_by)
    values ($1,$2,now()+interval '2 hours',true,$3),($4,$5,now()+interval '2 hours',true,$3)`,
  [ids.A.req, U.A, U.OWNER, ids.B.req, U.B]);
  return ids;
}
const KEY = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function preparar(k, ids, n = k === "A" ? 1 : 2) {
  const r = await svc("select public.pay_prepare_appointment_payment($1,$2,$3,30) as v", [U[k], ids[k].req, KEY(n)]);
  return r.ok ? { ok: true, v: r.rows[0].v } : r;
}
const prov = (pay) => `pay_${pay.id.slice(0, 8)}`;
let evN = 0;
async function evento(pay, ev, { valor = 15000, id = null, provider = null, ref = undefined } = {}) {
  const r = await svc("select public.pay_apply_webhook_event($1,$2,$3,$4,$5,$6,$7,$8,$9) as v",
    [id ?? `evt_${++evN}`, ev, "2026-11-25 10:00:00", provider ?? prov(pay), ref === undefined ? pay.external_reference : ref, valor, null, "X", "PIX"]);
  assert.equal(r.ok, true, r.message);
  return r.rows[0].v.resultado;
}
const registrar = async (pay, qr = "000201") => {
  const r = await svc("select public.pay_register_provider_charge($1,$2,$3,now() + interval '1 day') as v", [pay.id, prov(pay), qr]);
  assert.equal(r.ok, true, r.message);
};

/* ---------------- Papeis ---------------- */
for (const [k, e] of [["ADMIN", "admin"], ["INATIVO", "inativo"], ["COMUM", "comum"]]) await db.query("insert into auth.users(id, email) values ($1,$2)", [U2[k], `${e}@pay06.test`]);
await db.query("insert into public.users(id, role, name, email, active) values ($1,'owner','Owner',$2,true), ($3,'admin','Admin',$4,true), ($5,'owner','Inativo',$6,false)",
  [U.OWNER, "owner@pay06.test", U2.ADMIN, "admin@pay06.test", U2.INATIVO, "inativo@pay06.test"]);
const owner = (sql, params) => como("authenticated", U.OWNER, sql, params);
const por = (uid, sql, params) => como("authenticated", uid, sql, params);

const LISTA = "select public.admin_list_appointment_payments($1, $2) as v";
const EVENTOS = "select public.admin_list_appointment_payment_events($1) as v";
const VISAO = "select public.admin_pay_overview() as v";
async function comPagamento() {
  const ids = await semear();
  const a = await preparar("A", ids); assert.equal(a.ok, true, a.message);
  const pay = (await db.query("select * from public.appointment_payments where request_id=$1", [ids.A.req])).rows[0];
  await registrar(pay, "00020126580014br.gov.bcb.pix0136SEGREDO-DO-PIX");
  return { ids, pay };
}

/* ---------------- Autorizacao ---------------- */
test("Owner ativo le visao geral, lista e eventos", () => tx(async () => {
  const { pay } = await comPagamento();
  const v = await owner(VISAO); assert.equal(v.ok, true, v.message);
  assert.equal(v.rows[0].v.total, 1);
  const l = await owner(LISTA, [null, 50]); assert.equal(l.ok, true, l.message);
  assert.equal(l.rows[0].v.length, 1);
  assert.equal(l.rows[0].v[0].servico, "Atendimento teste");
  assert.equal(l.rows[0].v[0].amount_cents, 15000);
  const e = await owner(EVENTOS, [pay.id]); assert.equal(e.ok, true, e.message);
  assert.deepEqual(Object.keys(e.rows[0].v).sort(), ["eventos", "revisoes"]);
}));

test("negado: admin comum, Owner inativo, usuario comum, cliente dono do pagamento e sem login", () => tx(async () => {
  const { pay } = await comPagamento();
  for (const [nome, uid] of [["admin", U2.ADMIN], ["owner inativo", U2.INATIVO], ["sem papel", U2.COMUM], ["cliente A", U.A], ["cliente B", U.B]]) {
    for (const [sql, params] of [[VISAO, []], [LISTA, [null, 50]], [EVENTOS, [pay.id]]]) {
      const r = await por(uid, sql, params);
      assert.equal(r.ok, false, `${nome} nao pode ler`);
      assert.equal(r.code, "42501", nome);
    }
  }
  const semLogin = await como("authenticated", "", VISAO); assert.equal(semLogin.ok, false); assert.equal(semLogin.code, "42501");
}));

test("anon nao executa nenhuma das tres funcoes e nao le as tabelas", () => tx(async () => {
  const { pay } = await comPagamento();
  for (const [sql, params] of [[VISAO, []], [LISTA, [null, 50]], [EVENTOS, [pay.id]]]) {
    const r = await anon(sql, params); assert.equal(r.ok, false); assert.equal(r.code, "42501");
  }
  for (const t of ["appointment_payments", "appointment_payment_events", "pay_reconciliation_log", "pay_runtime_settings"]) {
    const r = await anon(`select count(*) from public.${t}`); assert.equal(r.ok, false, t);
  }
  /* O Owner nao ganha leitura direta nas tabelas internas: so pelas funcoes (a leitura propria do cliente na cobranca e da PAY-01). */
  for (const t of ["appointment_payment_events", "pay_reconciliation_log", "pay_runtime_settings"]) {
    const o = await owner(`select count(*) from public.${t}`); assert.equal(o.ok, false, `${t}: sem leitura direta`);
  }
}));

/* ---------------- Somente leitura ---------------- */
test("as funcoes sao STABLE, nao ha funcao de escrita nova e nenhuma tabela e escrita", () => tx(async () => {
  const f = await db.query(`select p.proname, p.provolatile, p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('admin_pay_overview','admin_list_appointment_payments','admin_list_appointment_payment_events') order by 1`);
  assert.equal(f.rows.length, 3);
  for (const r of f.rows) { assert.equal(r.provolatile, "s", r.proname); assert.equal(r.prosecdef, true, r.proname); }
  const { pay } = await comPagamento();
  const antes = JSON.stringify((await db.query("select * from public.appointment_payments order by id")).rows);
  const evAntes = (await db.query("select count(*) n from public.appointment_payment_events")).rows[0].n;
  await owner(VISAO); await owner(LISTA, [null, 50]); await owner(EVENTOS, [pay.id]);
  assert.equal(JSON.stringify((await db.query("select * from public.appointment_payments order by id")).rows), antes);
  assert.equal((await db.query("select count(*) n from public.appointment_payment_events")).rows[0].n, evAntes);
  // o Owner tambem nao consegue escrever pelo caminho do painel
  for (const sql of ["update public.appointment_payments set status = 'recebido'", "delete from public.appointment_payments", "insert into public.appointment_payment_events(provider_event_id, event, outcome) values ('x','PAYMENT_X','aplicado')"]) {
    const r = await owner(sql); assert.equal(r.ok, false, sql);
  }
}));

/* ---------------- Dados minimos ---------------- */
test("a lista nao traz CPF, nome, contato, Pix, id do provedor nem referencia externa", () => tx(async () => {
  const { pay } = await comPagamento();
  const l = await owner(LISTA, [null, 50]);
  const texto = JSON.stringify(l.rows[0].v);
  for (const proibido of ["SEGREDO-DO-PIX", "00020126", pay.external_reference, `pay_${pay.id.slice(0, 8)}`, "client_id", "idempotency", "provider_payment_id", "pix_copy_paste", "cpf", "Cliente A", "a@pay06.test"]) {
    assert.equal(texto.toLowerCase().includes(proibido.toLowerCase()), false, proibido);
  }
  assert.deepEqual(Object.keys(l.rows[0].v[0]).sort(), ["amount_cents", "confirmed_at", "created_at", "due_date", "eventos", "eventos_com_falha", "failure_reason", "id", "last_event_at", "received_at", "refunded_at", "reservation_outcome", "revisoes_abertas", "servico", "status", "updated_at"]);
  const e = await owner(EVENTOS, [pay.id]);
  assert.equal(JSON.stringify(e.rows[0].v).includes("provider_payment_id"), false);
}));

/* ---------------- Estados e falhas ---------------- */
test("estados: vazio, filtro por situacao, limite e situacao invalida", () => tx(async () => {
  const vazio = await owner(LISTA, [null, 50]); assert.deepEqual(vazio.rows[0].v, []);
  const v0 = await owner(VISAO); assert.equal(v0.rows[0].v.total, 0); assert.deepEqual(v0.rows[0].v.por_situacao, {});
  await comPagamento();
  assert.equal((await owner(LISTA, ["aguardando_pagamento", 50])).rows[0].v.length, 1);
  assert.equal((await owner(LISTA, ["recebido", 50])).rows[0].v.length, 0);
  assert.equal((await owner(LISTA, [null, 0])).rows[0].v.length, 1, "limite minimo 1");
  const ruim = await owner(LISTA, ["inventado", 50]); assert.equal(ruim.ok, false); assert.equal(ruim.code, "22023");
  const v1 = await owner(VISAO); assert.equal(v1.rows[0].v.por_situacao.aguardando_pagamento, 1);
}));

test("visao geral mostra a trava geral: fechada por padrao e reflete o banco", () => tx(async () => {
  await db.query("update public.pay_runtime_settings set charges_enabled = false");
  assert.equal((await owner(VISAO)).rows[0].v.charges_enabled, false);
  await db.query("update public.pay_runtime_settings set charges_enabled = true");
  assert.equal((await owner(VISAO)).rows[0].v.charges_enabled, true);
}));

test("falhas: evento divergente e pendencia de revisao aparecem na lista e no historico", () => tx(async () => {
  const { pay } = await comPagamento();
  await evento(pay, "PAYMENT_RECEIVED", { valor: 99999 });
  const l = (await owner(LISTA, [null, 50])).rows[0].v[0];
  assert.ok(l.eventos >= 1);
  assert.ok(l.eventos_com_falha >= 1 || l.revisoes_abertas >= 1 || l.status === "divergente", JSON.stringify(l));
  const e = (await owner(EVENTOS, [pay.id])).rows[0].v;
  assert.ok(e.eventos.length >= 1);
  assert.ok(e.eventos.some((x) => x.resultado === "divergencia") || e.revisoes.length >= 1, JSON.stringify(e));
  assert.deepEqual(Object.keys(e.eventos[0]).sort(), ["de", "evento", "para", "recebido_em", "resultado", "valor_cents"]);
}));

test("historico de uma cobranca inexistente e vazio e nao vaza outras", () => tx(async () => {
  await comPagamento();
  const e = await owner(EVENTOS, ["00000000-0000-4000-8000-0000000000ff"]);
  assert.equal(e.ok, true); assert.deepEqual(e.rows[0].v, { eventos: [], revisoes: [] });
  const nulo = await owner(EVENTOS, [null]); assert.equal(nulo.ok, false); assert.equal(nulo.code, "22023");
}));

/* ---------------- Rollback ---------------- */
test("rollback remove so as tres funcoes e preserva as tabelas e os dados", () => tx(async () => {
  await comPagamento();
  const antes = (await db.query("select count(*) n from public.appointment_payments")).rows[0].n;
  await db.exec(readFileSync(ROLLBACK_PAY06, "utf8"));
  const sobrou = await db.query("select proname from pg_proc where proname in ('admin_pay_overview','admin_list_appointment_payments','admin_list_appointment_payment_events')");
  assert.equal(sobrou.rows.length, 0);
  assert.equal((await db.query("select count(*) n from public.appointment_payments")).rows[0].n, antes);
  assert.equal((await db.query("select count(*) n from pg_proc where proname = 'course_payment_is_owner'")).rows[0].n, 1, "nao remove a funcao compartilhada");
}));
