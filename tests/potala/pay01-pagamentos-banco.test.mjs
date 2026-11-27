import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { ESTADOS, EVENTO_PARA_ESTADO, aplicarEventoAsaas } from "../../supabase/functions/_shared/pagamentos/estados.ts";

/*
 * PAY-01 | Banco financeiro dos pagamentos de atendimentos, executado de verdade em PGlite.
 * Aplica TODAS as migrations reais (incluindo a 202611250002) e exercita as funcoes como service_role e as
 * leituras como authenticated (Cliente A, Cliente B) ou anon. Cada teste roda em transacao desfeita (rollback).
 * Sem rede, sem credencial, sem Asaas: os eventos sao payloads simulados.
 * Limites do PGlite: ver docs/pay-01-pagamentos-asaas.md (concorrencia real entre conexoes nao e simulada).
 */
const DIR = new URL("../../supabase/migrations/", import.meta.url);
const MIGRATION = new URL("202611250002_pay01_pagamentos_atendimento.sql", DIR);
const ROLLBACK = new URL("../../supabase/rollbacks/202611250002_rollback_pay01_pagamentos_atendimento.sql", import.meta.url);
const U = { A: "00000000-0000-0000-0000-0000000000a1", B: "00000000-0000-0000-0000-0000000000b1", OWNER: "00000000-0000-0000-0000-0000000000f1" };
const OFERTA = "pay01-oferta";

async function montar(ate) {
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
  for (const a of readdirSync(DIR).sort()) {
    if (ate === "antes" && a >= "202611250002") break;
    await db.exec(readFileSync(new URL(a, DIR), "utf8"));
  }
  await db.exec("grant usage on schema public, auth to anon, authenticated, service_role; grant execute on function auth.uid() to anon, authenticated, service_role");
  for (const [k, e] of [["A", "a"], ["B", "b"], ["OWNER", "owner"]]) await db.query("insert into auth.users(id, email) values ($1,$2)", [U[k], `${e}@pay01.test`]);
  return db;
}
const db = await montar();
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
const cliente = (k, sql, params) => como("authenticated", U[k], sql, params);

// Cenario: A e B tem solicitacao com horario reservado (held) da mesma oferta, preco ativo de R$ 150,00.
async function semear({ preco = true, piloto = true } = {}) {
  const ids = {};
  // PAY-02: a chave geral de cobrancas nasce DESLIGADA; os testes de PAY-01 a ligam so dentro da transacao do cenario.
  if ((await db.query("select to_regclass('public.pay_runtime_settings') as t")).rows[0].t) await db.query("update public.pay_runtime_settings set charges_enabled = true");
  if (preco) await db.query("insert into public.appointment_service_prices(offering_id, amount_cents, active) values ($1, 15000, true)", [OFERTA]);
  for (const k of ["A", "B"]) {
    const r = await db.query(`insert into public.appointment_requests(idempotency_key, service, modality, requester_name, contact_type, contact, preferred_date, preferred_period, requester_user_id, offering_id)
      values (gen_random_uuid(), 'Atendimento teste', 'online', $1, 'email', $2, current_date + 3, 'tarde', $3, $4) returning id`, [`Cliente ${k}`, `${k.toLowerCase()}@pay01.test`, U[k], OFERTA]);
    const s = await db.query(`insert into public.appointment_slots(offering_id, professional_profile_id, starts_at, ends_at, status, held_by_request_id, created_by)
      values ($1, $2, now() + interval '3 days', now() + interval '3 days 1 hour', 'held', $3, $4) returning id`, [OFERTA, `prof-${k}`, r.rows[0].id, U.OWNER]);
    await db.query("update public.appointment_requests set appointment_slot_id = $1 where id = $2", [s.rows[0].id, r.rows[0].id]);
    ids[k] = { req: r.rows[0].id, slot: s.rows[0].id };
  }
  if (piloto && (await db.query("select to_regclass('public.pay_pilot_authorizations') as t")).rows[0].t) {
    await db.query(`insert into public.pay_pilot_authorizations(request_id,user_id,expires_at,enabled,created_by)
      values ($1,$2,now()+interval '2 hours',true,$3),($4,$5,now()+interval '2 hours',true,$3)`,
    [ids.A.req, U.A, U.OWNER, ids.B.req, U.B]);
  }
  return ids;
}
const KEY = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function preparar(k, ids, n = k === "A" ? 1 : 2, quem = U[k]) {
  const r = await svc("select public.pay_prepare_appointment_payment($1,$2,$3,30) as v", [quem, ids[k].req, KEY(n)]);
  return r.ok ? { ok: true, v: r.rows[0].v } : r;
}
async function ownerAtivo() {
  await db.query("insert into public.users(id,email,name,role,active) values ($1,$2,'Owner','owner',true) on conflict (id) do update set role='owner',active=true", [U.OWNER, "owner@pay01.test"]);
}
async function autorizarPiloto(ids, k = "A", { expira = "2 hours", enabled = true, user = U[k] } = {}) {
  await ownerAtivo();
  return como("authenticated", U.OWNER,
    "select public.admin_set_pay_pilot_authorization($1,$2,now() + $3::interval,$4) as v",
    [ids[k].req, user, expira, enabled]);
}
let evN = 0;
const prov = (pay) => `pay_${pay.id.slice(0, 8)}`;
async function evento(pay, ev, { valor = 15000, original = null, tipo = "PIX", id = null, ref = undefined, provider = null } = {}) {
  const r = await svc("select public.pay_apply_webhook_event($1,$2,$3,$4,$5,$6,$7,$8,$9) as v",
    [id ?? `evt_${++evN}`, ev, "2026-11-25 10:00:00", provider ?? prov(pay), ref === undefined ? pay.external_reference : ref, valor, original, "X", tipo]);
  assert.equal(r.ok, true, r.message);
  return r.rows[0].v.resultado;
}
const estado = async (id) => (await db.query("select status, reservation_outcome, received_at, confirmed_at from public.appointment_payments where id=$1", [id])).rows[0];
const permite = async (req) => (await svc("select public.pay_payment_allows_confirmation($1) as v", [req])).rows[0].v;
async function pagoAte(k, ids, eventos) { // cria, registra no "Asaas" e aplica eventos
  const p = (await preparar(k, ids)).v;
  const reg = await svc("select public.pay_register_provider_charge($1,$2,'000201',now() + interval '1 day') as v", [p.id, prov(p)]);
  assert.equal(reg.ok, true, reg.message);
  for (const e of eventos) await evento(p, e);
  return p;
}

/* ---------------- Privilegios e isolamento ---------------- */
test("privilegios | apenas leituras minimas dos proprios pedidos sao autenticadas; entradas financeiras so por service_role", async () => {
  const fns = (await db.query("select p.oid::regprocedure::text as sig, p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'pay\\_%'")).rows;
  assert.ok(fns.length >= 13);
  for (const f of fns) {
    for (const papel of ["anon", "authenticated"]) {
      const esperado = papel === "authenticated" && ["pay_my_pilot_requests", "pay_my_appointment_payment_options"].includes(f.proname);
      assert.equal((await db.query("select has_function_privilege($1,$2::regprocedure,'execute') v", [papel, f.sig])).rows[0].v, esperado, `${papel} executa ${f.sig}`);
    }
  }
  for (const nome of ["pay_prepare_appointment_payment", "pay_register_provider_charge", "pay_fail_creation", "pay_apply_webhook_event", "pay_list_expired_holds", "pay_payment_allows_confirmation", "pay_next_state"]) {
    const f = fns.find((x) => x.proname === nome);
    assert.equal((await db.query("select has_function_privilege('service_role',$1::regprocedure,'execute') v", [f.sig])).rows[0].v, true, nome);
  }
  const sec = (await db.query("select proname, prosecdef, proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('pay_prepare_appointment_payment','pay_apply_webhook_event','pay_register_provider_charge','pay_fail_creation')")).rows;
  for (const f of sec) { assert.equal(f.prosecdef, true); assert.ok((f.proconfig ?? []).some((c) => /^search_path=/.test(c)), f.proname); }
});

/* ---------------- PAY-08: piloto restrito ---------------- */
test("PAY-08 | nasce vazio, cliente nao se autoriza e somente Owner ativo administra o par pedido/cliente", () => tx(async () => {
  const ids = await semear({ piloto: false });
  await db.query("update public.pay_runtime_settings set charges_enabled=false");
  assert.equal((await db.query("select count(*)::int n from public.pay_pilot_authorizations")).rows[0].n, 0);
  assert.equal((await cliente("A", "select * from public.pay_pilot_authorizations")).ok, false, "sem leitura direta");
  assert.equal((await cliente("A", "select public.admin_set_pay_pilot_authorization($1,$2,now()+interval '1 hour',true)", [ids.A.req, U.A])).code, "42501");
  const ok = await autorizarPiloto(ids);
  assert.equal(ok.ok, true, ok.message);
  const listaA = await cliente("A", "select * from public.pay_my_pilot_requests()");
  assert.deepEqual(listaA.rows.map((x) => x.request_id), [ids.A.req]);
  assert.deepEqual((await cliente("B", "select * from public.pay_my_pilot_requests()")).rows, []);
  const errado = await autorizarPiloto(ids, "A", { user: U.B });
  assert.equal(errado.ok, false); assert.equal(errado.code, "22023");
}));

test("PAY-08 | as duas travas sao obrigatorias; chave aberta libera somente autorizacao exata e vigente", () => tx(async () => {
  const ids = await semear({ piloto: false });
  await db.query("update public.pay_runtime_settings set charges_enabled=false");
  assert.equal((await preparar("A", ids, 101)).code, "PT503", "tentativa direta sem piloto");
  assert.equal((await preparar("B", ids, 102)).code, "PT503", "outro pedido continua bloqueado");
  assert.equal((await autorizarPiloto(ids)).ok, true);
  assert.equal((await preparar("A", ids, 103)).code, "PT503", "piloto nunca contorna a parada global");
  await db.query("update public.pay_runtime_settings set charges_enabled=true");
  const primeiro = await preparar("A", ids, 103);
  assert.equal(primeiro.ok, true, primeiro.message);
  const repetido = await preparar("A", ids, 103);
  assert.deepEqual([repetido.v.id, repetido.v.replayed], [primeiro.v.id, true]);
  assert.equal((await db.query("select count(*)::int n from public.appointment_payments")).rows[0].n, 1, "dois cliques nao duplicam");
  assert.equal((await preparar("B", ids, 104)).code, "PT503", "autorizacao nao vaza a outro pedido");
}));

test("PAY-08 | expirada/revogada bloqueiam imediatamente novas cobrancas; preco e slot continuam obrigatorios", () => tx(async () => {
  const ids = await semear({ piloto: false });
  await db.query("update public.pay_runtime_settings set charges_enabled=true");
  await ownerAtivo();
  await db.query("insert into public.pay_pilot_authorizations(request_id,user_id,expires_at,enabled,created_by) values ($1,$2,now()-interval '1 minute',true,$3)", [ids.A.req, U.A, U.OWNER]);
  assert.equal((await preparar("A", ids, 105)).code, "PT503", "expirada");
  assert.equal((await autorizarPiloto(ids)).ok, true);
  await db.query("update public.pay_pilot_authorizations set enabled=false where request_id=$1", [ids.A.req]);
  assert.equal((await preparar("A", ids, 106)).code, "PT503", "revogada");
  await db.query("update public.pay_pilot_authorizations set enabled=true,expires_at=now()+interval '1 hour' where request_id=$1", [ids.A.req]);
  await db.query("update public.appointment_service_prices set active=false where offering_id=$1", [OFERTA]);
  assert.equal((await preparar("A", ids, 107)).code, "PT422", "piloto nao substitui preco aprovado");
  await db.query("update public.appointment_service_prices set active=true where offering_id=$1", [OFERTA]);
  await db.query("update public.appointment_slots set status='available',held_by_request_id=null where id=$1", [ids.A.slot]);
  assert.equal((await preparar("A", ids, 108)).code, "22023", "piloto nao substitui slot futuro reservado");
}));

test("PAY-08 | revogar novas cobrancas nao interrompe webhook nem reconciliacao de cobranca existente", () => tx(async () => {
  const ids = await semear({ piloto: false });
  await db.query("update public.pay_runtime_settings set charges_enabled=true");
  assert.equal((await autorizarPiloto(ids)).ok, true);
  const pay = (await preparar("A", ids, 109)).v;
  await svc("select public.pay_register_provider_charge($1,$2,null,null)", [pay.id, prov(pay)]);
  await db.query("update public.appointment_payments set created_at=now()-interval '30 minutes' where id=$1", [pay.id]);
  await db.query("update public.pay_pilot_authorizations set enabled=false where request_id=$1", [ids.A.req]);
  await db.query("update public.pay_runtime_settings set charges_enabled=false");
  const fila = await svc("select payment_id, motivo from public.pay_list_reconcilable(now(), 10)");
  assert.equal(fila.ok, true, fila.message);
  assert.deepEqual(fila.rows, [{ payment_id: pay.id, motivo: "sem_qr" }]);
  assert.equal(await evento(pay, "PAYMENT_RECEIVED"), "aplicado");
  assert.equal((await estado(pay.id)).status, "recebido");
  assert.equal((await preparar("B", ids, 110)).code, "PT503", "nenhuma nova cobranca nasce durante o acompanhamento");
}));

test("privilegios | anon e authenticated nao chamam as RPCs financeiras (GRANT negado)", () => tx(async () => {
  const ids = await semear();
  for (const papel of [["anon", null], ["authenticated", U.A]]) {
    for (const sql of [
      ["select public.pay_prepare_appointment_payment($1,$2,$3,30)", [U.A, ids.A.req, KEY(1)]],
      ["select public.pay_apply_webhook_event('e1','PAYMENT_RECEIVED',null,'p1','r',15000,null,'X','PIX')", []],
      ["select public.pay_payment_allows_confirmation($1)", [ids.A.req]],
      ["select * from public.pay_list_expired_holds()", []],
    ]) {
      const r = await como(papel[0], papel[1], sql[0], sql[1]);
      assert.equal(r.ok, false, `${papel[0]}: ${sql[0]}`);
      assert.equal(r.code, "42501");
    }
  }
}));

test("privilegios | tabelas: precos e eventos fechados; cobrancas so leitura do dono, em colunas seguras", () => tx(async () => {
  const ids = await semear();
  const p = (await preparar("A", ids)).v;
  for (const papel of [["anon", null], ["authenticated", U.A]]) {
    for (const t of ["appointment_service_prices", "appointment_payment_events"]) assert.equal((await como(papel[0], papel[1], `select count(*) from public.${t}`)).ok, false, `${papel[0]} le ${t}`);
  }
  assert.equal((await como("anon", null, "select count(*) from public.appointment_payments")).ok, false);
  assert.equal((await cliente("A", "select id, status, amount_cents from public.appointment_payments")).rows.length, 1);
  for (const sql of [
    "select provider_payment_id from public.appointment_payments", "select idempotency_key from public.appointment_payments",
    "select external_reference from public.appointment_payments", "select client_id from public.appointment_payments", "select * from public.appointment_payments",
    "update public.appointment_payments set status = 'recebido'", "update public.appointment_payments set amount_cents = 1",
    "delete from public.appointment_payments",
    `insert into public.appointment_payments(request_id, client_id, offering_id, idempotency_key, external_reference, amount_cents, due_date, hold_expires_at) values ('${ids.A.req}','${U.A}','x',gen_random_uuid(),'r',1,current_date,now())`,
  ]) {
    const r = await cliente("A", sql);
    assert.equal(r.ok, false, sql);
    assert.equal(r.code, "42501", `${sql}: ${r.message}`);
  }
  assert.ok(p.id);
}));

test("isolamento | Cliente A nao ve nem altera cobranca do Cliente B (RLS); B nao ve a de A", () => tx(async () => {
  const ids = await semear();
  const pA = (await preparar("A", ids, 1)).v; const pB = (await preparar("B", ids, 2)).v;
  assert.deepEqual((await cliente("A", "select id from public.appointment_payments")).rows.map((x) => x.id), [pA.id]);
  assert.deepEqual((await cliente("B", "select id from public.appointment_payments")).rows.map((x) => x.id), [pB.id]);
  assert.equal((await cliente("A", "select id from public.appointment_payments where id = $1", [pB.id])).rows.length, 0);
  assert.equal((await como("authenticated", "00000000-0000-0000-0000-0000000000e1", "select id from public.appointment_payments")).rows.length, 0);
  const upd = await cliente("A", "update public.appointment_payments set status='recebido' where id=$1", [pB.id]);
  assert.equal(upd.ok, false);
}));

/* ---------------- Intencao de pagamento ---------------- */
test("prepare | valor vem do banco, associa cliente e solicitacao, reserva expira antes do atendimento", () => tx(async () => {
  const ids = await semear();
  const r = await preparar("A", ids);
  assert.equal(r.ok, true, r.message);
  assert.deepEqual([r.v.status, r.v.amount_cents, r.v.replayed, r.v.service_title], ["criando", 15000, false, OFERTA]);
  const linha = (await db.query("select * from public.appointment_payments where id=$1", [r.v.id])).rows[0];
  assert.deepEqual([linha.client_id, linha.request_id, linha.currency, linha.billing_type, linha.reservation_outcome], [U.A, ids.A.req, "BRL", "PIX", "pendente"]);
  assert.equal(linha.external_reference, `appointment:${linha.id}`);
  const slot = (await db.query("select starts_at from public.appointment_slots where id=$1", [ids.A.slot])).rows[0];
  assert.ok(linha.hold_expires_at <= slot.starts_at && linha.hold_expires_at > new Date());
  // o servidor nao aceita valor do navegador: nao existe parametro para isso; mudar o preco muda a proxima cobranca
  await db.query("update public.appointment_service_prices set amount_cents = 9900 where offering_id=$1", [OFERTA]);
  assert.equal((await preparar("B", ids, 2)).v.amount_cents, 9900);
  assert.equal((await db.query("select amount_cents from public.appointment_payments where id=$1", [r.v.id])).rows[0].amount_cents, 15000, "cobranca existente mantem o valor congelado");
}));

test("prepare | sem preco ativo (PT422), solicitacao alheia, horario nao reservado e estados invalidos sao recusados", () => tx(async () => {
  const semPreco = await semear({ preco: false });
  assert.equal((await preparar("A", semPreco)).code, "PT422");
  await db.query("insert into public.appointment_service_prices(offering_id, amount_cents, active) values ($1, 15000, false)", [OFERTA]);
  assert.equal((await preparar("A", semPreco)).code, "PT422", "preco inativo");
  await db.query("update public.appointment_service_prices set active = true");
  assert.equal((await preparar("A", semPreco, 2, U.B)).code, "P0002", "usuario B nao prepara pagamento da solicitacao de A");
  await db.query("update public.appointment_slots set starts_at = now() - interval '1 hour', ends_at = now() - interval '30 minutes' where id=$1", [semPreco.A.slot]);
  assert.equal((await preparar("A", semPreco, 3)).code, "22023", "horario no passado");
  await db.query("update public.appointment_slots set starts_at = now() + interval '2 days', ends_at = now() + interval '2 days 1 hour', status='available', held_by_request_id=null where id=$1", [semPreco.B.slot]);
  assert.equal((await preparar("B", semPreco, 4)).code, "22023", "horario nao esta mais reservado");
  await db.query("update public.appointment_requests set status='cancelada' where id=$1", [semPreco.B.req]);
  assert.equal((await preparar("B", semPreco, 5)).code, "22023", "solicitacao cancelada");
  for (const args of [[null, semPreco.A.req, KEY(9)], [U.A, null, KEY(9)], [U.A, semPreco.A.req, null]]) {
    assert.equal((await svc("select public.pay_prepare_appointment_payment($1,$2,$3,30)", args)).code, "22023");
  }
  assert.equal((await svc("select public.pay_prepare_appointment_payment($1,$2,$3,4)", [U.A, semPreco.A.req, KEY(9)])).code, "22023");
}));

test("prepare | idempotencia: mesma chave devolve a mesma cobranca; outra chave nao duplica; chave de outro usuario e negada", () => tx(async () => {
  const ids = await semear();
  const a = (await preparar("A", ids, 1)).v;
  const b = (await preparar("A", ids, 1)).v;
  assert.deepEqual([b.id, b.replayed], [a.id, true]);
  const c = (await preparar("A", ids, 2)).v;
  assert.deepEqual([c.id, c.replayed], [a.id, true], "uma cobranca aberta por solicitacao");
  assert.equal((await db.query("select count(*)::int n from public.appointment_payments where request_id=$1", [ids.A.req])).rows[0].n, 1);
  assert.equal((await preparar("A", ids, 1, U.B)).code, "42501", "B reutilizando a chave de A");
  await db.exec("savepoint dup");
  await assert.rejects(db.query("insert into public.appointment_payments(request_id, client_id, offering_id, idempotency_key, external_reference, amount_cents, due_date, hold_expires_at) values ($1,$2,$3,gen_random_uuid(),'dup',1,current_date,now())", [ids.A.req, U.A, OFERTA]), /uma_aberta_por_solicitacao|duplicate key/);
  await db.exec("rollback to savepoint dup");
}));

test("conflito de horarios | dois clientes disputando o mesmo horario: so quem o reservou paga; o outro nao prepara", () => tx(async () => {
  const ids = await semear();
  // A protecao ja existente do agendamento (indice unico do slot ativo) impede B de tomar o horario de A.
  await db.exec("savepoint disputa");
  await assert.rejects(db.query("update public.appointment_requests set appointment_slot_id = $1 where id=$2", [ids.A.slot, ids.B.req]), /appointment_requests_active_slot_uidx|duplicate key/);
  await db.exec("rollback to savepoint disputa");
  assert.equal((await preparar("A", ids, 1)).ok, true);
  // B so paga o horario que ele mesmo reservou; se esse horario foi liberado para outro, nao prepara
  await db.query("update public.appointment_slots set status='available', held_by_request_id=null where id=$1", [ids.B.slot]);
  assert.equal((await preparar("B", ids, 7)).code, "22023");
}));

test("registro | register vincula o Asaas e nao retrocede estado se o webhook veio antes; troca de id e recusada; falha so cancela 'criando'", () => tx(async () => {
  const ids = await semear();
  const p = (await preparar("A", ids)).v;
  assert.equal(await evento(p, "PAYMENT_CREATED"), "aplicado"); // webhook antes do register: casa por external_reference
  assert.equal((await estado(p.id)).status, "aguardando_pagamento");
  assert.equal((await db.query("select provider_payment_id from public.appointment_payments where id=$1", [p.id])).rows[0].provider_payment_id, prov(p));
  await evento(p, "PAYMENT_RECEIVED");
  const reg = await svc("select public.pay_register_provider_charge($1,$2,'000201',now() + interval '1 day') as v", [p.id, prov(p)]);
  assert.equal(reg.rows[0].v.status, "recebido", "register tardio nao retrocede");
  assert.equal((await svc("select public.pay_register_provider_charge($1,'outro_id','x',now())", [p.id])).code, "23503");
  await svc("select public.pay_fail_creation($1,'x')", [p.id]);
  assert.equal((await estado(p.id)).status, "recebido", "fail so atua em criando");
  const q = (await preparar("B", ids, 5)).v;
  await svc("select public.pay_fail_creation($1,'asaas_http_400')", [q.id]);
  assert.equal((await estado(q.id)).status, "cancelado");
  assert.equal((await preparar("B", ids, 6)).v.replayed, false, "cobranca cancelada libera nova tentativa");
}));

/* ---------------- Webhook no banco ---------------- */
test("webhook | pagamento nao confirmado nao libera o atendimento; so 'recebido' com reserva valida", () => tx(async () => {
  const ids = await semear();
  const p = await pagoAte("A", ids, ["PAYMENT_CREATED"]);
  assert.equal(await permite(ids.A.req), false, "pendente nao e pago");
  assert.equal(await evento(p, "PAYMENT_CONFIRMED"), "aplicado");
  assert.equal((await estado(p.id)).confirmed_at !== null, true);
  assert.equal(await permite(ids.A.req), false, "confirmado (saldo indisponivel) nao libera ate aprovacao do Owner");
  assert.equal(await evento(p, "PAYMENT_RECEIVED"), "aplicado");
  const e = await estado(p.id);
  assert.deepEqual([e.status, e.reservation_outcome, e.received_at !== null], ["recebido", "elegivel", true]);
  assert.equal(await permite(ids.A.req), true);
  assert.equal(await permite(ids.B.req), false, "pagamento de A nao libera a solicitacao de B");
}));

test("webhook | agenda intacta: o pagamento NAO confirma nem libera o horario sozinho (PAY-02)", () => tx(async () => {
  const ids = await semear();
  const antes = (await db.query("select r.status rs, s.status ss, r.reservation_schedule_id from public.appointment_requests r join public.appointment_slots s on s.id=r.appointment_slot_id where r.id=$1", [ids.A.req])).rows[0];
  await pagoAte("A", ids, ["PAYMENT_CREATED", "PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);
  const depois = (await db.query("select r.status rs, s.status ss, r.reservation_schedule_id from public.appointment_requests r join public.appointment_slots s on s.id=r.appointment_slot_id where r.id=$1", [ids.A.req])).rows[0];
  assert.deepEqual(depois, antes);
  assert.deepEqual([depois.rs, depois.ss], ["recebida", "held"]);
}));

test("webhook | evento duplicado (mesmo id) e ignorado; uma unica linha na trilha", () => tx(async () => {
  const ids = await semear();
  const p = await pagoAte("A", ids, []);
  assert.equal(await evento(p, "PAYMENT_RECEIVED", { id: "evt_dup" }), "aplicado");
  const t0 = (await estado(p.id)).received_at;
  assert.equal(await evento(p, "PAYMENT_RECEIVED", { id: "evt_dup" }), "duplicado");
  assert.equal(await evento(p, "PAYMENT_REFUNDED", { id: "evt_dup" }), "duplicado", "mesmo id nunca reaplica, mesmo com outro corpo");
  assert.equal((await estado(p.id)).status, "recebido");
  assert.deepEqual((await estado(p.id)).received_at, t0);
  assert.equal((await db.query("select count(*)::int n from public.appointment_payment_events where provider_event_id='evt_dup'")).rows[0].n, 1);
}));

test("webhook | fora de ordem: evento antigo nao reverte; mesmo evento com id novo e sem mudanca", () => tx(async () => {
  const ids = await semear();
  const p = await pagoAte("A", ids, ["PAYMENT_RECEIVED"]);
  assert.equal(await evento(p, "PAYMENT_CREATED"), "obsoleto");
  assert.equal(await evento(p, "PAYMENT_CONFIRMED"), "obsoleto");
  assert.equal(await evento(p, "PAYMENT_OVERDUE"), "obsoleto");
  assert.equal(await evento(p, "PAYMENT_RECEIVED"), "sem_mudanca");
  assert.equal((await estado(p.id)).status, "recebido");
  assert.equal(await permite(ids.A.req), true);
}));

test("webhook | valor, meio e moeda conferidos: divergencia nao libera; juros/multa com valor original igual e aceito", () => tx(async () => {
  const ids = await semear();
  const p = await pagoAte("A", ids, []);
  assert.equal(await evento(p, "PAYMENT_RECEIVED", { valor: 100 }), "divergencia");
  assert.equal((await estado(p.id)).status, "divergente");
  assert.equal(await permite(ids.A.req), false);
  assert.equal(await evento(p, "PAYMENT_RECEIVED"), "sem_mudanca", "divergente so sai por reconciliacao manual");
  const q = await pagoAte("B", ids, []);
  assert.equal(await evento(q, "PAYMENT_RECEIVED", { valor: 15250, original: 15000 }), "aplicado");
  assert.equal((await estado(q.id)).status, "recebido");
}));

test("webhook | meio de pagamento diferente do cobrado e divergencia", () => tx(async () => {
  const ids = await semear();
  const p = await pagoAte("A", ids, []);
  assert.equal(await evento(p, "PAYMENT_RECEIVED", { tipo: "CREDIT_CARD" }), "divergencia");
}));

test("webhook | pagamento sem cobranca correspondente e registrado para reconciliacao, sem alterar nada", () => tx(async () => {
  const ids = await semear();
  const p = (await preparar("A", ids)).v;
  const r = await evento(p, "PAYMENT_RECEIVED", { provider: "pay_desconhecido", ref: "appointment:inexistente" });
  assert.equal(r, "sem_correspondencia");
  assert.equal((await estado(p.id)).status, "criando");
  assert.equal((await db.query("select outcome from public.appointment_payment_events where provider_payment_id='pay_desconhecido'")).rows[0].outcome, "sem_correspondencia");
  // id do provedor de B com a referencia externa de A: o evento e incoerente e nunca confirma ninguem
  const pB = await pagoAte("B", ids, ["PAYMENT_CREATED"]);
  const forj = await evento(p, "PAYMENT_RECEIVED", { provider: prov(pB), ref: p.external_reference });
  assert.equal(forj, "divergencia");
  assert.equal((await estado(pB.id)).status, "divergente");
  assert.equal((await estado(p.id)).status, "criando");
  assert.equal(await permite(ids.B.req), false);
  assert.equal(await permite(ids.A.req), false);
}));

test("reserva expirada | pagamento que chega depois do prazo ou apos cancelamento e 'pagamento_tardio' e nao libera", () => tx(async () => {
  const ids = await semear();
  const p = await pagoAte("A", ids, ["PAYMENT_CREATED"]);
  await db.query("update public.appointment_payments set hold_expires_at = now() - interval '1 minute' where id=$1", [p.id]);
  assert.deepEqual((await svc("select payment_id from public.pay_list_expired_holds()")).rows.map((x) => x.payment_id), [p.id]);
  await evento(p, "PAYMENT_RECEIVED");
  assert.deepEqual([(await estado(p.id)).status, (await estado(p.id)).reservation_outcome], ["recebido", "pagamento_tardio"]);
  assert.equal(await permite(ids.A.req), false);
  assert.equal((await svc("select * from public.pay_list_expired_holds()")).rows.length, 0, "pago nao aparece como reserva sem pagamento");
  // horario liberado/cancelado antes do pagamento
  const q = await pagoAte("B", ids, ["PAYMENT_CREATED"]);
  await db.query("update public.appointment_requests set status='cancelada' where id=$1", [ids.B.req]);
  await evento(q, "PAYMENT_RECEIVED");
  assert.equal((await estado(q.id)).reservation_outcome, "pagamento_tardio");
}));

test("cancelamento e estorno | DELETED cancela; dinheiro em cobranca cancelada diverge; estorno de pago vai para revisao", () => tx(async () => {
  const ids = await semear();
  const p = await pagoAte("A", ids, ["PAYMENT_CREATED"]);
  assert.equal(await evento(p, "PAYMENT_DELETED"), "aplicado");
  assert.equal(await evento(p, "PAYMENT_RECEIVED"), "divergencia");
  assert.equal((await estado(p.id)).status, "divergente");
  const q = await pagoAte("B", ids, ["PAYMENT_RECEIVED"]);
  assert.equal(await permite(ids.B.req), true);
  assert.equal(await evento(q, "PAYMENT_REFUNDED"), "aplicado");
  const e = await estado(q.id);
  assert.deepEqual([e.status, e.reservation_outcome], ["estornado", "revisao"]);
  assert.equal(await permite(ids.B.req), false, "estornado nao autoriza");
  assert.equal(await evento(q, "PAYMENT_RECEIVED"), "obsoleto");
  assert.equal((await estado(q.id)).status, "estornado");
}));

test("contestacao | chargeback sobre pago leva a em_contestacao e revisao", () => tx(async () => {
  const ids = await semear();
  const p = await pagoAte("A", ids, ["PAYMENT_RECEIVED"]);
  assert.equal(await evento(p, "PAYMENT_CHARGEBACK_REQUESTED"), "aplicado");
  const e = await estado(p.id);
  assert.deepEqual([e.status, e.reservation_outcome], ["em_contestacao", "revisao"]);
  assert.equal(await permite(ids.A.req), false);
}));

test("eventos informativos e desconhecidos ficam registrados sem mudar estado; payload invalido e recusado", () => tx(async () => {
  const ids = await semear();
  const p = await pagoAte("A", ids, ["PAYMENT_RECEIVED"]);
  assert.equal(await evento(p, "PAYMENT_BANK_SLIP_VIEWED"), "sem_mudanca");
  assert.equal(await evento(p, "PAYMENT_ALGO_NOVO"), "sem_mudanca");
  assert.equal((await estado(p.id)).status, "recebido");
  for (const args of [["", "PAYMENT_RECEIVED"], ["e", "payment_received"], ["e", null]]) {
    const r = await svc("select public.pay_apply_webhook_event($1,$2,null,'p',null,1,null,null,null)", args);
    assert.equal(r.code, "22023");
  }
}));

/* ---------------- Integridade ---------------- */
test("integridade | valor, moeda, vinculo e id do provedor sao imutaveis; trilha de eventos e append-only", () => tx(async () => {
  const ids = await semear();
  const p = await pagoAte("A", ids, ["PAYMENT_CREATED"]);
  for (const sql of ["update public.appointment_payments set amount_cents = 1 where id=$1", "update public.appointment_payments set request_id = '" + ids.B.req + "' where id=$1",
    "update public.appointment_payments set client_id = '" + U.B + "' where id=$1", "update public.appointment_payments set external_reference = 'x' where id=$1",
    "update public.appointment_payments set provider_payment_id = 'outro' where id=$1"]) {
    await db.exec("savepoint imut");
    await assert.rejects(db.query(sql, [p.id]), /nao podem ser alterados|nao pode ser trocado/, sql);
    await db.exec("rollback to savepoint imut");
  }
}));

test("integridade | trilha append-only e unicidade do evento", () => tx(async () => {
  const ids = await semear();
  const p = await pagoAte("A", ids, ["PAYMENT_CREATED"]);
  await db.exec("savepoint s1");
  await assert.rejects(db.query("update public.appointment_payment_events set outcome='aplicado'"), /append-only/);
  await db.exec("rollback to savepoint s1");
  await assert.rejects(db.query("delete from public.appointment_payment_events"), /append-only/);
  await db.exec("rollback to savepoint s1");
  await assert.rejects(db.query("insert into public.appointment_payment_events(provider_event_id, event, outcome) select provider_event_id, event, outcome from public.appointment_payment_events limit 1"), /duplicate key|unique/);
  void p;
}));

test("integridade | moeda e valor invalidos nas tabelas sao recusados por CHECK", () => tx(async () => {
  for (const [sql, re] of [
    ["insert into public.appointment_service_prices(offering_id, amount_cents) values ('x', 0)", /check/i],
    ["insert into public.appointment_service_prices(offering_id, amount_cents, currency) values ('y', 100, 'USD')", /check/i],
  ]) { await db.exec("savepoint c"); await assert.rejects(db.query(sql), re); await db.exec("rollback to savepoint c"); }
  const r = await db.query("select count(*)::int n from public.appointment_service_prices");
  assert.equal(r.rows[0].n, 0, "nenhum preco real e cadastrado pela migration");
}));

test("paridade | SQL pay_next_state e TypeScript concordam em TODAS as combinacoes de estado x evento", async () => {
  const eventos = [...Object.keys(EVENTO_PARA_ESTADO), "PAYMENT_ALGO_NOVO"];
  for (const atual of ESTADOS) for (const ev of eventos) {
    const sql = (await db.query("select * from public.pay_next_state($1,$2)", [atual, ev])).rows[0];
    const ts = aplicarEventoAsaas(atual, ev);
    assert.deepEqual([sql.outcome, sql.next_state, sql.known], [ts.resultado, ts.proximo, ts.conhecido], `${atual} + ${ev}`);
  }
  for (const s of ESTADOS) assert.equal((await db.query("select public.pay_state_clears_reservation($1) v", [s])).rows[0].v, s === "recebido");
});

/* ---------------- Migration: pre-requisitos, escopo e rollback ---------------- */
test("migration | nenhum preco, usuario ou permissao e criado; nao altera objetos anteriores; so objetos pay/appointment_payment*", () => {
  const sql = readFileSync(MIGRATION, "utf8");
  assert.doesNotMatch(sql, /insert\s+into\s+public\.appointment_service_prices/i);
  assert.doesNotMatch(sql, /(insert\s+into|update|delete\s+from)\s+(public\.)?(users|portal_module_permissions|op_records)\b/i);
  assert.doesNotMatch(sql, /alter\s+table\s+public\.appointment_(requests|slots)\b/i);
  const codigo = sql.replace(/--.*$/gm, "");
  for (const m of codigo.matchAll(/grant\s+([^;]*?)\s+to\s+([^;]*);/gi)) {
    assert.doesNotMatch(m[2], /\banon\b/i, `grant para anon: ${m[0]}`);
    if (/\bauthenticated\b/i.test(m[2])) assert.match(m[0], /^grant select \([^)]*\)\s+on public\.appointment_payments to authenticated;$/i, `unico grant permitido a authenticated: ${m[0]}`);
  }
  assert.doesNotMatch(codigo, /api[_ ]?key|access_token|secret/i, "nenhuma credencial no banco");
  assert.match(sql, /^\s*begin;/im); assert.match(sql, /^\s*commit;/im);
  assert.doesNotMatch(sql, /drop\s+table|truncate/i);
});

test("migration | pre-requisito ausente aborta sem criar nada", async () => {
  const b = new PGlite();
  await b.exec("create schema auth; create table auth.users(id uuid primary key);");
  await assert.rejects(b.exec(readFileSync(MIGRATION, "utf8")), /pre-requisitos ausentes/);
  await b.exec("rollback"); // a migration roda em begin;...commit; e o erro deixa a transacao aberta: o operador reverte
  assert.equal((await b.query("select to_regclass('public.appointment_payments') v")).rows[0].v, null);
  await b.close();
});

test("rollback | remove tudo, recusa se houver registros financeiros e permite reaplicar a migration", async () => {
  const b = await montar("antes");
  await b.exec(readFileSync(MIGRATION, "utf8"));
  const objetos = async () => (await b.query(`select
    (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'pay\\_%') fn,
    (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'appointment\\_pay%' or c.relname = 'appointment_service_prices') tb`)).rows[0];
  assert.ok((await objetos()).fn >= 13);
  // com registro: aborta e nada muda
  await b.query("insert into public.appointment_service_prices(offering_id, amount_cents, active) values ('o', 100, true)");
  await b.query(`insert into public.appointment_requests(idempotency_key, service, modality, requester_name, contact_type, contact, preferred_date, preferred_period, requester_user_id, offering_id)
    values (gen_random_uuid(),'Atendimento teste','online','Cliente C','email','c@pay01.test', current_date,'tarde',$1,'o')`, [U.A]);
  const req = (await b.query("select id from public.appointment_requests limit 1")).rows[0].id;
  await b.query("insert into public.appointment_payments(request_id, client_id, offering_id, idempotency_key, external_reference, amount_cents, due_date, hold_expires_at) values ($1,$2,'o',gen_random_uuid(),'r',100,current_date,now())", [req, U.A]);
  await assert.rejects(b.exec(readFileSync(ROLLBACK, "utf8")), /existem cobrancas registradas/);
  await b.exec("rollback");
  assert.ok((await objetos()).fn >= 13 && (await b.query("select count(*)::int n from public.appointment_payments")).rows[0].n === 1);
  await b.query("delete from public.appointment_payments");
  await b.exec(readFileSync(ROLLBACK, "utf8"));
  assert.deepEqual(await objetos(), { fn: 0, tb: 0 });
  assert.equal((await b.query("select count(*)::int n from public.appointment_requests")).rows[0].n, 1, "dados anteriores preservados");
  await b.exec(readFileSync(MIGRATION, "utf8")); // reaplicavel apos o rollback
  assert.ok((await objetos()).fn >= 13);
  await b.close();
});

/* ---------------- B1: id externo preservado; indice so e liberado por cancelamento comprovado ----------------
 * Concorrencia REAL entre conexoes nao e simulavel em PGlite (conexao unica): a serializacao vem de `for update` e do
 * indice unico, validados aqui apenas pela logica sequencial. */
const contar = async (req) => Number((await db.query("select count(*)::int as n from public.appointment_payments where request_id=$1", [req])).rows[0].n);

test("B1 | registro em duas etapas: id externo primeiro (sem Pix), Pix depois; payload nulo nunca apaga o Pix; outro id e recusado", () => tx(async () => {
  const ids = await semear();
  const p = (await preparar("A", ids)).v;
  assert.deepEqual([p.provider_payment_id, p.pix_ready, p.status], [null, false, "criando"]);
  const r1 = await svc("select public.pay_register_provider_charge($1,$2,null,null) as v", [p.id, prov(p)]);
  assert.equal(r1.ok, true, r1.message);
  assert.deepEqual([r1.rows[0].v.status, r1.rows[0].v.provider_payment_id, r1.rows[0].v.pix_ready], ["aguardando_pagamento", prov(p), false]);
  const r2 = await svc("select public.pay_register_provider_charge($1,$2,'000201',now() + interval '1 day') as v", [p.id, prov(p)]);
  assert.equal(r2.rows[0].v.pix_ready, true);
  const r3 = await svc("select public.pay_register_provider_charge($1,$2,null,null) as v", [p.id, prov(p)]);
  assert.equal(r3.rows[0].v.pix_ready, true);
  assert.equal((await db.query("select pix_copy_paste from public.appointment_payments where id=$1", [p.id])).rows[0].pix_copy_paste, "000201");
  assert.equal((await svc("select public.pay_register_provider_charge($1,'pay_outro',null,null)", [p.id])).ok, false);
}));

test("B1 | pay_fail_creation NAO cancela cobranca com id externo; o indice segue bloqueando outra cobranca (mesma chave ou outra)", () => tx(async () => {
  const ids = await semear();
  const p = (await preparar("A", ids)).v;
  await svc("select public.pay_register_provider_charge($1,$2,null,null)", [p.id, prov(p)]);
  assert.equal((await svc("select public.pay_fail_creation($1,'asaas_http_400')", [p.id])).ok, true);
  const st = (await db.query("select status, failure_reason from public.appointment_payments where id=$1", [p.id])).rows[0];
  assert.deepEqual([st.status, st.failure_reason], ["aguardando_pagamento", null]);
  for (const n of [1, 77]) {
    const o = await preparar("A", ids, n);
    assert.deepEqual([o.v.id, o.v.replayed], [p.id, true], `chave ${n}`);
  }
  assert.equal(await contar(ids.A.req), 1);
}));

test("B1 | linha 'criando' que ja ganhou id por evento informativo (PAYMENT_UPDATED) tambem nao pode ser cancelada por pay_fail_creation", () => tx(async () => {
  const ids = await semear();
  const p = (await preparar("A", ids)).v;
  assert.equal(await evento(p, "PAYMENT_UPDATED"), "sem_mudanca"); // vincula o id por externalReference sem sair de 'criando'
  const antes = (await db.query("select status, provider_payment_id from public.appointment_payments where id=$1", [p.id])).rows[0];
  assert.deepEqual([antes.status, antes.provider_payment_id], ["criando", prov(p)]);
  await svc("select public.pay_fail_creation($1,'qualquer')", [p.id]);
  assert.equal((await estado(p.id)).status, "criando");
  assert.equal((await preparar("A", ids, 77)).v.replayed, true);
  assert.equal(await contar(ids.A.req), 1);
}));

test("B1 | criacao inconclusiva ('criando' sem id): nova tentativa (qualquer chave) devolve a MESMA linha; pay_fail_creation so cancela quando nada foi criado", () => tx(async () => {
  const ids = await semear();
  const p = (await preparar("A", ids)).v;
  for (const n of [1, 77]) {
    const o = await preparar("A", ids, n);
    assert.deepEqual([o.v.id, o.v.replayed, o.v.status, o.v.provider_payment_id], [p.id, true, "criando", null], `chave ${n}`);
  }
  assert.equal(await contar(ids.A.req), 1);
  await svc("select public.pay_fail_creation($1,'antes_da_cobranca')", [p.id]); // aqui e legitimo: sem id externo
  assert.equal((await estado(p.id)).status, "cancelado");
  const nova = await preparar("A", ids, 78);
  assert.deepEqual([nova.v.id === p.id, nova.v.replayed], [false, false]);
}));

test("B1 | queda entre a criacao externa e a gravacao interna: fica 'criando' ate o PAYMENT_CREATED (por externalReference) vincular o id; depois so recupera o QR", () => tx(async () => {
  const ids = await semear();
  const p = (await preparar("A", ids)).v; // processo caiu aqui: Asaas criou a cobranca, o banco nao soube o id
  assert.equal((await preparar("A", ids, 77)).v.replayed, true); // bloqueado, sem segunda cobranca
  assert.equal(await evento(p, "PAYMENT_CREATED"), "aplicado"); // vincula por externalReference
  const linha = (await db.query("select status, provider_payment_id, pix_copy_paste from public.appointment_payments where id=$1", [p.id])).rows[0];
  assert.deepEqual([linha.status, linha.provider_payment_id, linha.pix_copy_paste], ["aguardando_pagamento", prov(p), null]);
  const rep = (await preparar("A", ids, 77)).v;
  assert.deepEqual([rep.id, rep.provider_payment_id, rep.pix_ready], [p.id, prov(p), false]); // o handler recupera o QR com este id
  const reg = await svc("select public.pay_register_provider_charge($1,$2,'000201',now() + interval '1 day') as v", [p.id, prov(p)]);
  assert.equal(reg.rows[0].v.pix_ready, true);
  assert.equal(await contar(ids.A.req), 1);
}));

test("B1 | 'vencido' ainda bloqueia nova cobranca (o Pix vencido pode ser pago); so o cancelamento confirmado pelo Asaas libera o indice", () => tx(async () => {
  const ids = await semear();
  const p = await pagoAte("A", ids, ["PAYMENT_CREATED", "PAYMENT_OVERDUE"]);
  assert.equal((await estado(p.id)).status, "vencido");
  const o = await preparar("A", ids, 78);
  assert.deepEqual([o.v.id, o.v.replayed], [p.id, true]);
  assert.equal(await contar(ids.A.req), 1);
  assert.equal(await evento(p, "PAYMENT_DELETED"), "aplicado");
  assert.equal((await estado(p.id)).status, "cancelado");
  const nova = await preparar("A", ids, 79);
  assert.deepEqual([nova.v.id === p.id, nova.v.replayed], [false, false]);
  assert.equal(await contar(ids.A.req), 2);
}));

test("B1 | criar a cobranca nunca e pagamento: sem PAYMENT_RECEIVED nada e recebido nem libera confirmacao", () => tx(async () => {
  const ids = await semear();
  const p = await pagoAte("A", ids, ["PAYMENT_CREATED"]);
  const st = await estado(p.id);
  assert.deepEqual([st.status, st.received_at, st.confirmed_at, st.reservation_outcome], ["aguardando_pagamento", null, null, "pendente"]);
  assert.equal(await permite(ids.A.req), false);
}));

test("R4 | estorno em andamento: estado e historico preservados, elegibilidade vai para revisao e a confirmacao deixa de ser permitida", () => tx(async () => {
  const ids = await semear();
  const p = await pagoAte("A", ids, ["PAYMENT_RECEIVED"]);
  assert.deepEqual([(await estado(p.id)).reservation_outcome, await permite(ids.A.req)], ["elegivel", true]);
  assert.equal(await evento(p, "PAYMENT_REFUND_IN_PROGRESS", { id: "evt_refund_1" }), "aplicado");
  assert.equal(await evento(p, "PAYMENT_REFUND_IN_PROGRESS", { id: "evt_refund_1" }), "duplicado");
  const st = await estado(p.id);
  assert.deepEqual([st.status, st.reservation_outcome, await permite(ids.A.req)], ["recebido", "revisao", false]);
  const hist = (await db.query("select event, outcome, from_status, to_status from public.appointment_payment_events where payment_id=$1 order by id", [p.id])).rows;
  assert.deepEqual(hist.at(-1), { event: "PAYMENT_REFUND_IN_PROGRESS", outcome: "aplicado", from_status: "recebido", to_status: "recebido" });
  assert.equal(hist.length, 2);
  assert.equal(await evento(p, "PAYMENT_REFUND_DENIED"), "sem_mudanca"); // nao devolve a elegibilidade sozinho
  assert.deepEqual([(await estado(p.id)).reservation_outcome, await permite(ids.A.req)], ["revisao", false]);
  // estorno em andamento antes do RECEIVED (fora de ordem): continua em revisao depois de recebido
  const q = await pagoAte("B", ids, ["PAYMENT_CREATED", "PAYMENT_REFUND_IN_PROGRESS"]);
  assert.equal((await estado(q.id)).reservation_outcome, "revisao");
  await evento(q, "PAYMENT_RECEIVED");
  assert.deepEqual([(await estado(q.id)).status, (await estado(q.id)).reservation_outcome, await permite(ids.B.req)], ["recebido", "revisao", false]);
}));
