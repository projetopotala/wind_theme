import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

/*
 * PAY-02 | Banco: chave geral desligada, pagador minimizado, reconciliacao, revisoes e liberacao de reservas.
 * Aplica TODAS as migrations reais (incluindo 202611250002 e 202611250003) em PGlite; cada teste roda em transacao
 * desfeita. Sem rede, sem credencial, sem Asaas. Limite: o PGlite nao simula concorrencia real entre conexoes.
 */
const DIR = new URL("../../supabase/migrations/", import.meta.url);
const ROLLBACK = new URL("../../supabase/rollbacks/202611250003_rollback_pay02_pagador_reconciliacao.sql", import.meta.url);
const PAY08_ROLLBACK = new URL("../../supabase/rollbacks/202611260002_rollback_pay08_piloto_pix.sql", import.meta.url);
const U = { A: "00000000-0000-0000-0000-0000000000a1", B: "00000000-0000-0000-0000-0000000000b1", OWNER: "00000000-0000-0000-0000-0000000000f1" };
const OFERTA = "pay02-oferta";

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
for (const [k, e] of [["A", "a"], ["B", "b"], ["OWNER", "owner"]]) await db.query("insert into auth.users(id, email) values ($1,$2)", [U[k], `${e}@pay02.test`]);
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
const anon = (sql, params) => como("anon", null, sql, params);
const ligar = (v = true) => db.query("update public.pay_runtime_settings set charges_enabled = $1", [v]);

async function semear({ habilitar = true } = {}) {
  const ids = {};
  if (habilitar) await ligar(true);
  await db.query("insert into public.appointment_service_prices(offering_id, amount_cents, active) values ($1, 15000, true)", [OFERTA]);
  for (const k of ["A", "B"]) {
    const r = await db.query(`insert into public.appointment_requests(idempotency_key, service, modality, requester_name, contact_type, contact, preferred_date, preferred_period, requester_user_id, offering_id)
      values (gen_random_uuid(), 'Atendimento teste', 'online', $1, 'email', $2, current_date + 3, 'tarde', $3, $4) returning id`, [`Cliente ${k}`, `${k.toLowerCase()}@pay02.test`, U[k], OFERTA]);
    const s = await db.query(`insert into public.appointment_slots(offering_id, professional_profile_id, starts_at, ends_at, status, held_by_request_id, created_by)
      values ($1, $2, now() + interval '3 days', now() + interval '3 days 1 hour', 'held', $3, $4) returning id`, [OFERTA, `prof-${k}`, r.rows[0].id, U.OWNER]);
    await db.query("update public.appointment_requests set appointment_slot_id = $1 where id = $2", [s.rows[0].id, r.rows[0].id]);
    ids[k] = { req: r.rows[0].id, slot: s.rows[0].id };
  }
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
const expirar = (pay, h = "1 hour") => db.query(`update public.appointment_payments set hold_expires_at = now() - interval '${h}' where id = $1`, [pay.id]);
const envelhecer = (pay, min) => db.query(`update public.appointment_payments set created_at = now() - interval '${min} minutes' where id = $1`, [pay.id]);
const estado = async (id) => (await db.query("select status, reservation_outcome from public.appointment_payments where id=$1", [id])).rows[0];
const revisoes = async (kind) => (await db.query("select kind, payment_id, provider_payment_id from public.pay_reconciliation_log where resolved_at is null" + (kind ? " and kind = $1" : ""), kind ? [kind] : [])).rows;

/* ---------------- Chave geral ---------------- */
test("chave geral | nasce DESLIGADA: nenhuma cobranca nova (PT503), nem direto pelo service_role; ligar libera; desligar nao apaga as existentes", () => tx(async () => {
  assert.equal((await svc("select public.pay_charges_enabled() as v")).rows[0].v, false);
  const ids = await semear({ habilitar: false });
  const bloqueado = await preparar("A", ids);
  assert.equal(bloqueado.ok, false); assert.equal(bloqueado.code, "PT503");
  assert.equal((await db.query("select count(*)::int n from public.appointment_payments")).rows[0].n, 0);
  const direto = await svc(`insert into public.appointment_payments(request_id, client_id, offering_id, idempotency_key, external_reference, amount_cents, due_date, hold_expires_at)
    values ($1,$2,$3,$4,'appointment:x',100,current_date, now()+interval '1 hour')`, [ids.A.req, U.A, OFERTA, KEY(9)]);
  assert.equal(direto.code, "PT503");
  await ligar(true);
  const p = (await preparar("A", ids)).v;
  assert.equal(p.status, "criando");
  await ligar(false); // desligar depois: a cobranca existente continua acessivel (replay), mas ninguem mais cria
  assert.equal((await preparar("A", ids)).v.replayed, true);
  assert.equal((await preparar("B", ids)).code, "PT503");
}));

test("parada de emergencia | com a chave desligada nenhuma cobranca nasce, mas as existentes continuam sendo acompanhadas (webhook, estorno, expiracao)", () => tx(async () => {
  const ids = await semear();
  const a = (await preparar("A", ids)).v; await registrar(a);
  const b = (await preparar("B", ids)).v; await registrar(b);
  await ligar(false);
  // novas: bloqueadas
  assert.equal((await svc(`insert into public.appointment_payments(request_id, client_id, offering_id, idempotency_key, external_reference, amount_cents, due_date, hold_expires_at)
    values ($1,$2,$3,$4,'appointment:y',100,current_date, now()+interval '1 hour')`, [ids.A.req, U.A, OFERTA, KEY(8)])).code, "PT503");
  // existentes: o dinheiro que chega e o estorno seguem sendo aplicados
  assert.equal(await evento(a, "PAYMENT_RECEIVED"), "aplicado");
  assert.equal((await estado(a.id)).status, "recebido");
  assert.equal(await evento(a, "PAYMENT_REFUND_IN_PROGRESS"), "aplicado");
  // e a reserva nao paga vence e pode ser liberada
  await evento(b, "PAYMENT_DELETED");
  await expirar(b);
  assert.equal((await svc("select public.pay_release_expired_hold($1, now()) as v", [b.id])).rows[0].v, "liberada");
}));

test("chave geral | so o servidor a le; anon e authenticated nao enxergam nem alteram a tabela", () => tx(async () => {
  for (const q of [(s, p) => anon(s, p), (s, p) => cliente("A", s, p)]) {
    assert.equal((await q("select * from public.pay_runtime_settings")).ok, false);
    assert.equal((await q("update public.pay_runtime_settings set charges_enabled = true")).ok, false);
    assert.equal((await q("select public.pay_charges_enabled()")).ok, false);
  }
  assert.equal((await db.query("select charges_enabled from public.pay_runtime_settings")).rows.length, 1);
  assert.equal((await db.query("select charges_enabled from public.pay_runtime_settings")).rows[0].charges_enabled, false);
}));

/* ---------------- Privilegios ---------------- */
test("privilegios | funcoes novas: so service_role executa; anon/authenticated nunca", async () => {
  const nomes = ["pay_charges_enabled", "pay_get_payer", "pay_save_payer", "pay_log_review", "pay_open_reviews", "pay_resolve_review", "pay_list_reconcilable",
    "pay_list_expired_unpaid", "pay_unknown_charges", "pay_release_expired_hold", "pay_insert_guard", "pay_review_on_change", "pay_review_on_event", "pay_settings_touch"];
  const fns = (await db.query("select p.oid::regprocedure::text as sig, p.proname, p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname = any($1)", [nomes])).rows;
  assert.equal(fns.length, nomes.length);
  for (const f of fns) {
    for (const papel of ["anon", "authenticated"]) assert.equal((await db.query("select has_function_privilege($1,$2::regprocedure,'execute') v", [papel, f.sig])).rows[0].v, false, `${papel} executa ${f.sig}`);
  }
  for (const nome of nomes.filter((n) => !["pay_insert_guard", "pay_review_on_change", "pay_review_on_event", "pay_settings_touch"].includes(n))) {
    const f = fns.find((x) => x.proname === nome);
    assert.equal((await db.query("select has_function_privilege('service_role',$1::regprocedure,'execute') v", [f.sig])).rows[0].v, true, nome);
  }
  for (const f of fns.filter((x) => x.proname !== "pay_settings_touch")) assert.equal(f.prosecdef, true, `${f.proname} security definer`);
  const cfg = (await db.query("select proname, proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname = any($1)", [nomes])).rows;
  for (const f of cfg) assert.ok((f.proconfig ?? []).some((c) => /^search_path=/.test(c)), `${f.proname} sem search_path fixo`);
});

/* ---------------- Pagador ---------------- */
test("pagador | tabela guarda so id do Asaas, tipo e 4 ultimos digitos; nunca o documento completo", async () => {
  const cols = (await db.query("select column_name from information_schema.columns where table_schema='public' and table_name='pay_payer_profiles' order by column_name")).rows.map((r) => r.column_name);
  assert.deepEqual(cols, ["asaas_customer_id", "created_at", "document_kind", "document_last4", "user_id"]);
  // 4 digitos e o maximo aceito: um documento inteiro (CPF/CNPJ) e recusado pela propria tabela
  await db.exec("begin");
  try {
    for (const inteiro of ["52998224725", "11444777000161"]) assert.equal((await svc("select public.pay_save_payer($1,'cus_x','cpf',$2)", [U.A, inteiro])).ok, false, inteiro);
  } finally { await db.exec("rollback"); }
});

test("pagador | RLS: cada cliente le so o proprio; asaas_customer_id fica oculto; anon e escrita de cliente negados", () => tx(async () => {
  await svc("select public.pay_save_payer($1,'cus_A','cpf','4725')", [U.A]);
  await svc("select public.pay_save_payer($1,'cus_B','cnpj','0001')", [U.B]);
  const a = await cliente("A", "select user_id, document_kind, document_last4 from public.pay_payer_profiles");
  assert.deepEqual(a.rows.map((r) => [r.user_id, r.document_kind, r.document_last4]), [[U.A, "cpf", "4725"]]);
  assert.equal((await cliente("A", "select asaas_customer_id from public.pay_payer_profiles")).ok, false);
  assert.equal((await cliente("A", "select * from public.pay_payer_profiles")).ok, false);
  assert.equal((await cliente("A", "select user_id from public.pay_payer_profiles where user_id = $1", [U.B])).rows.length, 0);
  assert.equal((await anon("select user_id from public.pay_payer_profiles")).ok, false);
  for (const sql of ["insert into public.pay_payer_profiles(user_id, asaas_customer_id, document_kind, document_last4) values ($1,'x','cpf','1111')", "update public.pay_payer_profiles set document_last4='0000'", "delete from public.pay_payer_profiles"]) {
    assert.equal((await cliente("A", sql, sql.includes("$1") ? [U.A] : [])).ok, false, sql);
  }
  assert.equal((await db.query("select count(*)::int n from public.pay_payer_profiles")).rows[0].n, 2);
}));

test("pagador | salvar e idempotente; nunca troca em silencio o cliente do Asaas; dados invalidos recusados; sai junto com a conta", () => tx(async () => {
  assert.equal((await svc("select public.pay_save_payer($1,'cus_1','cpf','4725')", [U.A])).ok, true);
  assert.equal((await svc("select public.pay_save_payer($1,'cus_1','cpf','4725')", [U.A])).ok, true);
  assert.equal((await svc("select public.pay_save_payer($1,'cus_2','cpf','4725')", [U.A])).code, "23503");
  assert.equal((await svc("select public.pay_save_payer($1,'cus_1','cpf','4725')", [U.B])).ok, false); // mesmo cliente Asaas em outro usuario: unique
  for (const [k, l] of [["rg", "1234"], ["cpf", "123"], ["cpf", "12345"], ["cpf", "abcd"]]) assert.equal((await svc("select public.pay_save_payer($1,'cus_9',$2,$3)", [U.B, k, l])).ok, false, `${k}/${l}`);
  assert.deepEqual((await svc("select public.pay_get_payer($1) as v", [U.A])).rows[0].v, { asaas_customer_id: "cus_1", document_kind: "cpf", document_last4: "4725" });
  assert.equal((await svc("select public.pay_get_payer($1) as v", [U.B])).rows[0].v, null);
  await db.query("delete from auth.users where id = $1", [U.A]);
  assert.equal((await db.query("select count(*)::int n from public.pay_payer_profiles")).rows[0].n, 0);
}));

/* ---------------- Reconciliacao: listas ---------------- */
test("reconciliacao | lista 'sem_id', 'sem_qr' e 'conferir' respeitando a idade minima; nada com cobranca ja resolvida", () => tx(async () => {
  const ids = await semear();
  const a = (await preparar("A", ids)).v; // criando, sem id
  const b = (await preparar("B", ids)).v; // vira aguardando sem QR
  await registrar(b, null);
  const lista = async (min = 10) => (await svc("select * from public.pay_list_reconcilable(now(), $1)", [min])).rows;
  assert.deepEqual(await lista(), [], "recem-criadas nao entram");
  await envelhecer(a, 11); await envelhecer(b, 3);
  const l = await lista();
  assert.deepEqual(l.map((x) => [x.payment_id === a.id ? "A" : "B", x.motivo]).sort(), [["A", "sem_id"], ["B", "sem_qr"]]);
  assert.equal(l.find((x) => x.payment_id === a.id).provider_payment_id, null);
  // com o Pix gravado e evento recente, B so volta a ser conferida depois da idade minima sem eventos
  await svc("select public.pay_register_provider_charge($1,$2,'000201',now() + interval '1 day')", [b.id, prov(b)]);
  assert.deepEqual((await lista()).map((x) => x.motivo), ["sem_id"]);
  await db.query("update public.appointment_payments set last_event_at = now() - interval '30 minutes' where id = $1", [b.id]);
  assert.deepEqual((await lista()).map((x) => x.motivo).sort(), ["conferir", "sem_id"]);
  await evento(b, "PAYMENT_RECEIVED");
  await db.query("update public.appointment_payments set last_event_at = now() where id = $1", [b.id]);
  assert.deepEqual((await lista()).map((x) => x.motivo), ["sem_id"], "recebido e recente: nao e reconsultado");
  assert.equal((await cliente("A", "select * from public.pay_list_reconcilable()")).ok, false);
}));

test("reconciliacao | nao conhecidas: devolve so o que o banco nao tem (nem por id, nem por referencia)", () => tx(async () => {
  const ids = await semear();
  const a = (await preparar("A", ids)).v; await registrar(a);
  const itens = [{ id: prov(a), ref: "appointment:x" }, { id: "pay_zzz", ref: a.external_reference }, { id: "pay_orfa", ref: "appointment:nao-existe" }, { id: "pay_orfa2", ref: null }];
  const r = (await svc("select public.pay_unknown_charges($1::jsonb) as v", [JSON.stringify(itens)])).rows[0].v;
  assert.deepEqual(r.map((x) => x.id), ["pay_orfa", "pay_orfa2"]);
  assert.deepEqual((await svc("select public.pay_unknown_charges('{\"x\":1}'::jsonb) as v")).rows[0].v, []);
}));

/* ---------------- Revisoes ---------------- */
test("revisao | abre uma vez por (pagamento, tipo) enquanto aberta; exige justificativa para fechar; tipo invalido recusado", () => tx(async () => {
  const ids = await semear(); const a = (await preparar("A", ids)).v;
  assert.equal((await svc("select public.pay_log_review($1,null,'sem_id_no_provedor','{\"x\":1}'::jsonb) as v", [a.id])).rows[0].v, true);
  assert.equal((await svc("select public.pay_log_review($1,null,'sem_id_no_provedor') as v", [a.id])).rows[0].v, false);
  assert.equal((await svc("select public.pay_log_review($1,null,'multiplas_no_provedor') as v", [a.id])).rows[0].v, true);
  assert.equal((await svc("select public.pay_log_review(null,'pay_o','orfa_no_provedor') as v")).rows[0].v, true);
  assert.equal((await svc("select public.pay_log_review(null,'pay_o','orfa_no_provedor') as v")).rows[0].v, false);
  assert.equal((await svc("select public.pay_log_review($1,null,'inventado') as v", [a.id])).ok, false);
  const abertas = (await svc("select * from public.pay_open_reviews()")).rows;
  assert.equal(abertas.length, 3);
  assert.equal((await svc("select public.pay_resolve_review($1, '  ')", [abertas[0].id])).code, "22023");
  assert.equal((await svc("select public.pay_resolve_review($1, 'Conferido no painel do Asaas pelo Owner.') as v", [abertas[0].id])).rows[0].v, true);
  assert.equal((await svc("select public.pay_resolve_review($1, 'de novo') as v", [abertas[0].id])).rows[0].v, false);
  assert.equal((await svc("select * from public.pay_open_reviews()")).rows.length, 2);
  assert.equal((await svc("select public.pay_log_review($1,null,'sem_id_no_provedor') as v", [a.id])).rows[0].v, true, "fechada, pode reabrir");
  assert.equal((await cliente("A", "select * from public.pay_reconciliation_log")).ok, false);
  assert.equal((await anon("select * from public.pay_open_reviews()")).ok, false);
}));

test("revisao automatica | pagamento sem atendimento, estorno em curso, divergencia de valor e dinheiro sem encaixe abrem revisao", () => tx(async () => {
  const ids = await semear();
  // (1) pago depois que o horario saiu da reserva: pagamento_tardio -> pago_sem_atendimento
  const a = (await preparar("A", ids)).v; await registrar(a);
  await db.query("update public.appointment_slots set status='available', held_by_request_id=null where id=$1", [ids.A.slot]);
  assert.equal(await evento(a, "PAYMENT_RECEIVED"), "aplicado");
  assert.equal((await estado(a.id)).reservation_outcome, "pagamento_tardio");
  assert.deepEqual((await revisoes("pago_sem_atendimento")).map((r) => r.payment_id), [a.id]);
  // (2) estorno em andamento sobre pagamento elegivel: revisao_financeira
  const b = (await preparar("B", ids)).v; await registrar(b);
  await evento(b, "PAYMENT_RECEIVED");
  assert.equal((await estado(b.id)).reservation_outcome, "elegivel");
  await evento(b, "PAYMENT_REFUND_IN_PROGRESS");
  assert.deepEqual((await revisoes("revisao_financeira")).map((r) => r.payment_id), [b.id]);
}));

test("revisao automatica | dinheiro em cobranca cancelada vira divergente com revisao; CONFIRMED atrasado apos RECEIVED e normal e NAO abre revisao", () => tx(async () => {
  const ids = await semear();
  const a = (await preparar("A", ids)).v; await registrar(a);
  await evento(a, "PAYMENT_DELETED");
  assert.equal((await estado(a.id)).status, "cancelado");
  assert.equal(await evento(a, "PAYMENT_RECEIVED"), "divergencia");
  assert.equal((await estado(a.id)).status, "divergente");
  assert.deepEqual((await revisoes("divergencia_financeira")).map((r) => r.payment_id), [a.id]);
  const b = (await preparar("B", ids)).v; await registrar(b);
  await evento(b, "PAYMENT_RECEIVED");
  assert.equal(await evento(b, "PAYMENT_CONFIRMED"), "obsoleto", "fora de ordem");
  assert.equal((await estado(b.id)).status, "recebido");
  assert.deepEqual(await revisoes("divergencia_status"), []);
  assert.equal((await revisoes()).filter((r) => r.payment_id === b.id).length, 0, "nada aberto para o pagamento de B");
}));

test("revisao automatica | divergencia de valor e dinheiro para cobranca desconhecida", () => tx(async () => {
  const ids = await semear();
  const a = (await preparar("A", ids)).v; await registrar(a);
  assert.equal(await evento(a, "PAYMENT_RECEIVED", { valor: 9999 }), "divergencia");
  assert.equal((await estado(a.id)).status, "divergente");
  assert.deepEqual((await revisoes("divergencia_financeira")).map((r) => r.payment_id), [a.id]);
  // A conta Asaas e compartilhada: dinheiro de cobranca que o banco nao conhece e REGISTRADO como evento, mas NAO abre
  // revisao (senao cada recebimento alheio aos atendimentos inundaria a fila). Orfas nossas sao achadas pelo reconciliador.
  assert.equal((await svc("select public.pay_apply_webhook_event('evt_x','PAYMENT_RECEIVED','2026-11-25','pay_desconhecida','appointment:nada',15000,null,'RECEIVED','PIX') as v")).rows[0].v.resultado, "sem_correspondencia");
  assert.equal((await db.query("select count(*)::int as n from public.appointment_payment_events where provider_event_id = 'evt_x' and outcome = 'sem_correspondencia'")).rows[0].n, 1);
  await svc("select public.pay_apply_webhook_event('evt_y','PAYMENT_RECEIVED','2026-11-25','pay_de_outro_uso',null,9900,null,'RECEIVED','PIX')");
  assert.equal((await revisoes("orfa_no_provedor")).length, 0);
}));

/* ---------------- Expiracao e liberacao de reservas ---------------- */
test("expiracao | lista reservas vencidas e nao pagas; pagamento em curso ou recebido nunca entra", () => tx(async () => {
  const ids = await semear();
  const a = (await preparar("A", ids)).v; await registrar(a);
  const b = (await preparar("B", ids)).v; await registrar(b);
  await expirar(a); await expirar(b);
  const ate = async () => (await svc("select * from public.pay_list_expired_unpaid()")).rows;
  assert.deepEqual((await ate()).map((x) => x.status).sort(), ["aguardando_pagamento", "aguardando_pagamento"]);
  assert.deepEqual(Object.keys((await ate())[0]).sort(), ["amount_cents", "external_reference", "payment_id", "provider_payment_id", "request_id", "status"]);
  await evento(a, "PAYMENT_AUTHORIZED");   // em_processamento: nao pode soltar o horario por baixo
  await evento(b, "PAYMENT_RECEIVED");     // recebido
  assert.deepEqual(await ate(), []);
  assert.equal((await cliente("A", "select * from public.pay_list_expired_unpaid()")).ok, false);
}));

test("liberar reserva | so com cobranca CANCELADA, prazo vencido e solicitacao aberta: cancela o pedido, solta o horario, registra o evento", () => tx(async () => {
  const ids = await semear();
  const a = (await preparar("A", ids)).v; await registrar(a);
  assert.equal((await svc("select public.pay_release_expired_hold($1) as v", [a.id])).rows[0].v, "cobranca_nao_cancelada");
  await evento(a, "PAYMENT_DELETED");
  assert.equal((await svc("select public.pay_release_expired_hold($1) as v", [a.id])).rows[0].v, "prazo_nao_venceu");
  await expirar(a);
  const lista = (await svc("select * from public.pay_list_expired_unpaid()")).rows;
  assert.deepEqual(lista.map((x) => x.status), ["cancelado"], "cancelada com horario ainda preso entra na lista");
  assert.equal((await svc("select public.pay_release_expired_hold($1) as v", [a.id])).rows[0].v, "liberada");
  const slot = (await db.query("select status, held_by_request_id from public.appointment_slots where id=$1", [ids.A.slot])).rows[0];
  assert.deepEqual([slot.status, slot.held_by_request_id], ["available", null]);
  const req = (await db.query("select status, cancelled_by from public.appointment_requests where id=$1", [ids.A.req])).rows[0];
  assert.deepEqual([req.status, req.cancelled_by], ["cancelada", null]);
  const ev = (await db.query("select event_type, from_status, to_status, actor_id from public.appointment_request_events where request_id=$1 order by id desc limit 1", [ids.A.req])).rows[0];
  assert.deepEqual([ev.event_type, ev.to_status, ev.actor_id], ["cancelled", "cancelada", null]);
  assert.equal((await svc("select public.pay_release_expired_hold($1) as v", [a.id])).rows[0].v, "solicitacao_ja_tratada");
  assert.deepEqual((await svc("select * from public.pay_list_expired_unpaid()")).rows, []);
  // o outro cliente nao foi tocado
  assert.equal((await db.query("select status from public.appointment_slots where id=$1", [ids.B.slot])).rows[0].status, "held");
  assert.equal((await db.query("select status from public.appointment_requests where id=$1", [ids.B.req])).rows[0].status, "recebida");
  assert.equal((await cliente("A", "select public.pay_release_expired_hold($1)", [a.id])).ok, false);
}));

test("liberar reserva | NUNCA com cobranca viva, recebida, em processamento ou outra cobranca aberta; inexistente e inofensivo", () => tx(async () => {
  const ids = await semear();
  const a = (await preparar("A", ids)).v; await registrar(a); await expirar(a);
  for (const ev of [null, "PAYMENT_AUTHORIZED", "PAYMENT_RECEIVED"]) {
    if (ev) await evento(a, ev);
    assert.equal((await svc("select public.pay_release_expired_hold($1) as v", [a.id])).rows[0].v, "cobranca_nao_cancelada", ev ?? "aguardando");
  }
  assert.equal((await db.query("select status from public.appointment_slots where id=$1", [ids.A.slot])).rows[0].status, "held");
  assert.equal((await svc("select public.pay_release_expired_hold('00000000-0000-4000-8000-0000000000ff') as v")).rows[0].v, "inexistente");
  // criando sem id (resultado inconclusivo): tambem nao libera
  const b = (await preparar("B", ids)).v; await expirar(b);
  assert.equal((await svc("select public.pay_release_expired_hold($1) as v", [b.id])).rows[0].v, "cobranca_nao_cancelada");
  assert.equal((await db.query("select status from public.appointment_slots where id=$1", [ids.B.slot])).rows[0].status, "held");
}));

test("liberar reserva | cobranca cancelada ANTES do POST (prova de nao criacao) tambem libera apos o prazo; outro cliente nao e tocado", () => tx(async () => {
  const ids = await semear();
  const a = (await preparar("A", ids)).v;
  await svc("select public.pay_fail_creation($1,'antes_da_cobranca')", [a.id]);
  await expirar(a);
  assert.equal((await svc("select public.pay_release_expired_hold($1) as v", [a.id])).rows[0].v, "liberada");
  assert.equal((await db.query("select status from public.appointment_slots where id=$1", [ids.A.slot])).rows[0].status, "available");
  assert.equal((await db.query("select status from public.appointment_slots where id=$1", [ids.B.slot])).rows[0].status, "held", "o horario do outro cliente nao e tocado");
}));

test("liberar reserva | com outra cobranca aberta para a mesma solicitacao, nao libera", () => tx(async () => {
  const ids = await semear();
  const a = (await preparar("A", ids)).v; await registrar(a); await evento(a, "PAYMENT_DELETED"); await expirar(a);
  const nova = (await preparar("A", ids, 5)).v; // nova cobranca permitida porque a anterior foi cancelada
  assert.notEqual(nova.id, a.id);
  assert.equal((await svc("select public.pay_release_expired_hold($1) as v", [a.id])).rows[0].v, "outra_cobranca_aberta");
  assert.equal((await db.query("select status from public.appointment_slots where id=$1", [ids.A.slot])).rows[0].status, "held");
}));

/* ---------------- Migration ---------------- */
test("migration | so objetos novos; PAY-01 intacta; reversao remove somente a PAY-02 e a PAY-02 pode ser reaplicada", () => tx(async () => {
  const tabelas = async () => (await db.query("select table_name from information_schema.tables where table_schema='public' and table_name like 'pay\\_%' order by 1")).rows.map((r) => r.table_name);
  assert.deepEqual(await tabelas(), ["pay_payer_profiles", "pay_pilot_authorizations", "pay_reconciliation_log", "pay_runtime_settings"]);
  assert.equal((await db.query("select count(*)::int n from public.pay_runtime_settings where charges_enabled")).rows[0].n, 0, "nasce desligada");
  assert.equal((await db.query("select count(*)::int n from public.appointment_service_prices")).rows[0].n, 0, "nenhum preco criado");
  await db.exec(readFileSync(PAY08_ROLLBACK, "utf8"));
  await db.exec(readFileSync(ROLLBACK, "utf8"));
  assert.deepEqual(await tabelas(), []);
  assert.ok((await db.query("select to_regclass('public.appointment_payments') t")).rows[0].t, "PAY-01 permanece");
  assert.equal((await db.query("select count(*)::int n from pg_trigger where tgname in ('appointment_payments_insert_guard','appointment_payments_review_on_change','appointment_payment_events_review')")).rows[0].n, 0);
  assert.ok((await db.query("select to_regprocedure('public.pay_apply_webhook_event(text,text,text,text,text,integer,integer,text,text)') t")).rows[0].t);
  await db.exec(readFileSync(new URL("202611250003_pay02_pagador_reconciliacao.sql", DIR), "utf8"));
  assert.deepEqual(await tabelas(), ["pay_payer_profiles", "pay_reconciliation_log", "pay_runtime_settings"]);
}));
