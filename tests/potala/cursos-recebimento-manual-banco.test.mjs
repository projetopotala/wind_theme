import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

/* Recebimento manual (migration 202611160008) sobre a inscricao do aluno (202611160007). TODAS as migrations reais; cursos gravados pelo op_apply. */
const DIR = new URL("../../supabase/migrations/", import.meta.url);
const ROLLBACK = readFileSync(new URL("../../supabase/rollbacks/202611160008_rollback_cursos_recebimento_manual.sql", import.meta.url), "utf8");
const U = { owner: "00000000-0000-0000-0000-0000000000a1", a1: "00000000-0000-0000-0000-0000000000c1", a2: "00000000-0000-0000-0000-0000000000c2", a3: "00000000-0000-0000-0000-0000000000c3", w: "00000000-0000-0000-0000-0000000000d1", p: "00000000-0000-0000-0000-0000000000d2" };
const FUTURO = new Date(Date.now() + 10 * 864e5);

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
  await db.exec("grant usage on schema public, auth to anon, authenticated, service_role; grant execute on function auth.uid() to anon, authenticated, service_role");
  for (const [k, email] of [["owner", "owner@potala.test"], ["a1", "a1@potala.test"], ["a2", "a2@potala.test"], ["a3", "a3@potala.test"], ["w", "w@potala.test"], ["p", "p@potala.test"]]) {
    await db.query("insert into auth.users(id, email) values ($1,$2)", [U[k], email]);
  }
  await db.query("insert into public.users(id, role, name, email) values ($1,'owner','owner','owner@potala.test') on conflict (id) do update set role='owner'", [U.owner]);
  await db.query("insert into public.op_records(collection,id,document) values ('profiles','prof','{\"id\":\"prof\",\"display_name\":\"TESTE INTERNO Professora\",\"roles\":[\"professional\"],\"active\":true}'::jsonb)");
  await db.query("insert into public.op_records(collection,id,document) values ('profiles','aluno-op','{\"id\":\"aluno-op\",\"display_name\":\"TESTE INTERNO Aluno antigo\",\"roles\":[\"student\"],\"active\":true}'::jsonb)");
  const como = async (uid, sql, params, papel) => {
    await db.exec(`set test.uid = '${uid || ""}'; set role ${papel || (uid ? "authenticated" : "anon")}`);
    try { return await db.query(sql, params); } finally { await db.exec("reset role; set test.uid = ''"); }
  };
  let n = 0;
  const salvar = async (action, table, after) => {
    const rev = Number((await db.query("select revision from public.op_meta where id = 1")).rows[0].revision);
    return (await como(U.owner, "select public.op_apply($1,$2,$3,'{}'::jsonb,null,$4::jsonb) as r", [rev, `k-${++n}`, action, JSON.stringify([{ table, id: after.id, after }])])).rows[0].r;
  };
  let deslocamento = 0;
  const turmaAberta = async (id, { preco = 15000, vagas = 2, publicado = true } = {}) => {
    const inicio = new Date(FUTURO.valueOf() + (deslocamento++) * 3 * 3600e3);
    await salvar("definition.save", "activity_definitions", { id: `c-${id}`, title: `TESTE INTERNO ${id}`, kind: "course", summary: "Descrição", price_cents: preco, published: publicado });
    await salvar("offering.save", "activity_offerings", { id, title: `TESTE INTERNO ${id}`, definition_id: `c-${id}`, professional_id: "prof", mode: "online", capacity: vagas, price_cents: preco, summary: "Descrição", published: publicado });
    await db.query("insert into public.op_records(collection,id,document) values ('schedule_items',$1,$2::jsonb)", [`aula-${id}`, JSON.stringify({ id: `aula-${id}`, title: "Aula", kind: "course", offering_id: id, mode: "online", professional_id: "prof", starts_at: inicio.toISOString(), ends_at: new Date(inicio.valueOf() + 3600e3).toISOString(), status: "booked" })]);
  };
  const pedir = (uid, turma, chave = `aaaaaaaa-0000-4000-8000-${String(++n).padStart(12, "0")}`) =>
    como(uid, "select public.request_course_enrollment($1::uuid,$2) as r", [chave, turma]).then((x) => ({ ok: true, r: x.rows[0].r }), (e) => ({ ok: false, code: e.code, message: e.message }));
  const decidir = async (id, decisao, uid = U.owner) => {
    const u = (await db.query("select updated_at from public.course_enrollment_requests where id=$1", [id])).rows[0].updated_at;
    return como(uid, "select public.admin_decide_course_enrollment_request($1::uuid,$2::timestamptz,$3) as r", [id, u, decisao]).then((x) => ({ ok: true, r: x.rows[0].r }), (e) => ({ ok: false, code: e.code, message: e.message }));
  };
  const status = async (id) => (await db.query("select status from public.course_enrollment_requests where id=$1", [id])).rows[0].status;
  return { db, como, salvar, turmaAberta, pedir, decidir, status };
}


/* ---- Recebimento manual (migration 202611160008) ---- */
const HOJE = new Date().toISOString().slice(0, 10);
let seq = 0;
const chave = () => `cccccccc-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

async function pronto({ preco = 15000, vagas = 3, aluno = U.a1 } = {}) {
  const ctx = await montar();
  await ctx.db.query("insert into public.users(id, role, name, email) values ($1,'blog_editor','escritor','w@potala.test')", [U.w]);
  await ctx.turmaAberta("t1", { preco, vagas });
  const id = (await ctx.pedir(aluno, "t1")).r.id;
  if (preco > 0) assert.equal((await ctx.decidir(id, "aprovar")).ok, true);
  const versao = async () => (await ctx.db.query("select updated_at from public.course_enrollment_requests where id=$1", [id])).rows[0].updated_at;
  const receber = async (over = {}, uid = U.owner) => {
    const a = { k: chave(), id, v: await versao(), valor: 15000, forma: "pix", data: HOJE, ref: "Pix E2E123", ...over };
    return ctx.como(uid, "select public.admin_register_manual_course_payment($1::uuid,$2::uuid,$3::timestamptz,$4::integer,$5,$6::date,$7) as r",
      [a.k, a.id, a.v, a.valor, a.forma, a.data, a.ref]).then((x) => ({ ok: true, r: x.rows[0].r, k: a.k }), (e) => ({ ok: false, code: e.code, message: e.message, k: a.k }));
  };
  const corrigir = (pid, desfecho, motivo = "Conferido no extrato", uid = U.owner) =>
    ctx.como(uid, "select public.admin_reverse_manual_course_payment($1::uuid,$2,$3) as r", [pid, desfecho, motivo])
      .then((x) => ({ ok: true, r: x.rows[0].r }), (e) => ({ ok: false, code: e.code, message: e.message }));
  const q = async (sql, p = []) => (await ctx.db.query(sql, p)).rows;
  return { ...ctx, id, receber, corrigir, q, versao };
}

test("Owner confirma recebimento valido: recebimento manual, pedido matriculado e UMA matricula operacional", async () => {
  const { id, receber, q, status } = await pronto();
  const r = await receber();
  assert.equal(r.ok, true, r.message);
  assert.equal(r.r.status, "matriculada");
  assert.equal(await status(id), "matriculada");
  const pag = (await q("select source, method, amount_cents, received_on::text d, reference, status, recorded_by from public.course_enrollment_payments"));
  assert.equal(pag.length, 1);
  assert.deepEqual([pag[0].source, pag[0].method, pag[0].amount_cents, pag[0].reference, pag[0].status, pag[0].recorded_by], ["manual", "pix", 15000, "Pix E2E123", "registrado", U.owner]);
  const mats = await q("select id, document->>'status' s, document->>'offering_id' o from public.op_records where collection='enrollments'");
  assert.equal(mats.length, 1);
  assert.deepEqual([mats[0].s, mats[0].o], ["active", "t1"]);
  assert.equal((await q("select op_enrollment_id from public.course_enrollment_requests"))[0].op_enrollment_id, mats[0].id);
});

test("auditoria: origem manual, estados anterior e posterior, ator", async () => {
  const { receber, q } = await pronto();
  await receber();
  const ev = await q("select actor_kind, from_status, to_status, actor_id from public.course_enrollment_request_events order by id");
  assert.deepEqual(ev.map((e) => `${e.actor_kind}:${e.from_status}->${e.to_status}`), ["aluno:null->solicitada", "administracao:solicitada->aguardando_pagamento", "manual:aguardando_pagamento->pagamento_confirmado", "manual:pagamento_confirmado->matriculada"]);
  assert.equal(ev[2].actor_id, U.owner);
  const pe = await q("select action, from_status, to_status, request_from_status, request_to_status, actor_id from public.course_enrollment_payment_events");
  assert.deepEqual(pe.map((e) => [e.action, e.from_status, e.to_status, e.request_from_status, e.request_to_status, e.actor_id]), [["registrado", null, "registrado", "aguardando_pagamento", "matriculada", U.owner]]);
  const aud = await q("select document->>'action' a from public.op_records where collection='audit_events' and document->>'action'='enrollment.save'");
  assert.equal(aud.length, 1, "a matricula operacional tem o evento de auditoria da operacao");
});

test("Meu Potala: o aluno passa a ter o curso em andamento e o pedido matriculado", async () => {
  const { como, receber } = await pronto();
  await receber();
  const meus = (await como(U.a1, "select public.my_course_enrollment_requests() as l")).rows[0].l;
  assert.equal(meus[0].status, "matriculada");
  const vinculos = (await como(U.a1, "select public.my_course_enrollments() as l")).rows[0].l;
  assert.ok(JSON.stringify(vinculos).includes("t1"), "o vinculo de cursos do aluno inclui a turma");
});

test("valor divergente, forma invalida, data futura e 'outro' sem referencia sao recusados sem efeito", async () => {
  const { id, receber, q, status } = await pronto();
  for (const [over, codigo] of [[{ valor: 14999 }, "22023"], [{ valor: 0 }, "22023"], [{ valor: 15001 }, "22023"], [{ forma: "cartao" }, "22023"],
    [{ data: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10) }, "22023"], [{ forma: "outro", ref: "  " }, "22023"], [{ data: "2020-01-01" }, "22023"]]) {
    const r = await receber(over);
    assert.equal(r.ok, false);
    assert.equal(r.code, codigo, JSON.stringify(over));
  }
  assert.equal((await receber({ v: "2000-01-01T00:00:00Z" })).code, "PT409", "versao velha");
  assert.equal(await status(id), "aguardando_pagamento");
  assert.equal((await q("select count(*)::int n from public.course_enrollment_payments"))[0].n, 0);
  assert.equal((await q("select count(*)::int n from public.op_records where collection='enrollments'"))[0].n, 0);
});

test("so o Owner ativo: aluno, escritor, profissional, outro aluno e anonimo nao registram nem corrigem", async () => {
  const { id, receber, corrigir, q, status } = await pronto();
  for (const uid of [U.a1, U.a2, U.w, U.p, null]) {
    const r = await receber({}, uid);
    assert.equal(r.ok, false, String(uid));
    assert.ok(["42501", "42883"].includes(r.code) || /permission denied/i.test(r.message), `${uid}: ${r.code} ${r.message}`);
  }
  assert.equal(await status(id), "aguardando_pagamento");
  const ok = await receber();
  assert.equal(ok.ok, true);
  const pid = (await q("select id from public.course_enrollment_payments"))[0].id;
  for (const uid of [U.a1, U.w, U.p, null]) assert.equal((await corrigir(pid, "estorno_realizado", "motivo valido", uid)).ok, false);
  assert.equal((await q("select status from public.course_enrollment_payments"))[0].status, "registrado");
  /* Owner desativado tambem nao */
  await q("update public.users set active=false where id=$1", [U.owner]);
  assert.equal((await corrigir(pid, "estorno_realizado")).ok, false);
});

test("tabelas de recebimento e a funcao de pagamento do servidor nao ficam abertas ao navegador", async () => {
  const { como, id, q } = await pronto();
  for (const uid of [U.owner, U.a1, null]) {
    await assert.rejects(() => como(uid, "select * from public.course_enrollment_payments"), /permission denied/i);
    await assert.rejects(() => como(uid, "select * from public.course_enrollment_payment_events"), /permission denied/i);
    await assert.rejects(() => como(uid, "insert into public.course_enrollment_payments(idempotency_key,request_id,method,amount_cents,received_on) values (gen_random_uuid(),$1,'pix',1,current_date)", [id]), /permission denied/i);
    await assert.rejects(() => como(uid, "update public.course_enrollment_requests set status='matriculada' where id=$1", [id]), /permission denied/i);
  }
  for (const uid of [U.owner, U.a1]) {
    await assert.rejects(() => como(uid, "select public.confirm_course_enrollment_payment($1::uuid, 15000)", [id]), /permission denied/i, "so service_role");
  }
  assert.equal((await q("select has_function_privilege('anon','public.admin_register_manual_course_payment(uuid,uuid,timestamptz,integer,text,date,text)','execute') a"))[0].a, false);
  assert.equal((await q("select has_function_privilege('authenticated','public.confirm_course_enrollment_payment(uuid,integer)','execute') a"))[0].a, false);
});

test("pedido cancelado, recusado ou so solicitado nao pode ser confirmado", async () => {
  const ctx = await pronto({ vagas: 5 });
  const { id, receber, decidir, status, pedir, q } = ctx;
  assert.equal((await decidir(id, "cancelar")).ok, true);
  assert.equal((await receber()).code, "PT409");
  const b = (await pedir(U.a2, "t1")).r.id;
  const vb = (await q("select updated_at from public.course_enrollment_requests where id=$1", [b]))[0].updated_at;
  const tent = await ctx.como(U.owner, "select public.admin_register_manual_course_payment($1::uuid,$2::uuid,$3::timestamptz,15000,'pix',current_date,null)", [chave(), b, vb]).then(() => "ok", (e) => e.code);
  assert.equal(tent, "PT409", "solicitada ainda nao foi aprovada");
  assert.equal(await status(b), "solicitada");
  await decidir(b, "recusar");
  assert.equal(await status(b), "recusada");
  assert.equal((await q("select count(*)::int n from public.course_enrollment_payments"))[0].n, 0);
});

test("pedido gratuito nao tem recebimento; pedido ja matriculado nao e cobrado de novo", async () => {
  const g = await pronto({ preco: 0 });
  const t = await g.como(U.owner, "select public.admin_register_manual_course_payment($1::uuid,$2::uuid,$3::timestamptz,0,'pix',current_date,null)", [chave(), g.id, await g.versao()]).then(() => "ok", (e) => e.code);
  assert.ok(["PT409", "22023"].includes(t));
  const p = await pronto();
  assert.equal((await p.receber()).ok, true);
  const outra = await p.receber({ k: chave() });
  assert.equal(outra.code, "PT409", "ja matriculada: nenhum segundo recebimento");
  assert.equal((await p.q("select count(*)::int n from public.course_enrollment_payments"))[0].n, 1);
});

test("idempotencia: repetir a mesma chave nao duplica recebimento nem matricula", async () => {
  const { receber, q } = await pronto();
  const a = await receber();
  const b = await receber({ k: a.k });
  assert.equal(b.ok, true);
  assert.equal(b.r.replayed, true);
  assert.equal(b.r.payment_id, a.r.payment_id);
  assert.equal((await q("select count(*)::int n from public.course_enrollment_payments"))[0].n, 1);
  assert.equal((await q("select count(*)::int n from public.op_records where collection='enrollments'"))[0].n, 1);
  assert.equal((await q("select count(*)::int n from public.course_enrollment_request_events where actor_kind='manual'"))[0].n, 2);
});

test("duas confirmacoes simultaneas: exatamente um recebimento e uma matricula", async () => {
  const { id, receber, q, versao } = await pronto();
  const v = await versao();
  const [x, y] = await Promise.all([receber({ v, k: chave() }), receber({ v, k: chave() })]);
  assert.equal([x, y].filter((r) => r.ok).length, 1, JSON.stringify([x.message, y.message]));
  assert.equal([x, y].filter((r) => !r.ok)[0].code, "PT409");
  assert.equal((await q("select count(*)::int n from public.course_enrollment_payments"))[0].n, 1);
  assert.equal((await q("select count(*)::int n from public.op_records where collection='enrollments'"))[0].n, 1);
  /* a garantia de verdade vem do indice unico parcial: um segundo 'registrado' para o mesmo pedido e impossivel */
  await assert.rejects(() => q("insert into public.course_enrollment_payments(idempotency_key,request_id,method,amount_cents,received_on) values (gen_random_uuid(),$1,'pix',15000,current_date)", [id]), (e) => e.code === "23505");
});

test("falha intermediaria: se a matricula nao puder ser criada, nada fica pago (tudo desfeito)", async () => {
  const { db, id, receber, q, status } = await pronto();
  /* dois cadastros operacionais com o e-mail do aluno: a matricula recusa (PT422) e a transacao inteira volta */
  for (const n of ["dup1", "dup2"]) await db.query("insert into public.op_records(collection,id,document) values ('profiles',$1,$2::jsonb)", [n, JSON.stringify({ id: n, display_name: n, email: "a1@potala.test", roles: ["student"], active: true })]);
  const r = await receber();
  assert.equal(r.ok, false);
  assert.equal(r.code, "PT422");
  assert.equal(await status(id), "aguardando_pagamento");
  assert.equal((await q("select count(*)::int n from public.course_enrollment_payments"))[0].n, 0);
  assert.equal((await q("select count(*)::int n from public.course_enrollment_payment_events"))[0].n, 0);
  assert.equal((await q("select count(*)::int n from public.course_enrollment_request_events where actor_kind='manual'"))[0].n, 0);
  assert.equal((await q("select count(*)::int n from public.op_records where collection='enrollments'"))[0].n, 0);
});

test("nao confunde o aluno: usa o cadastro vinculado/unico e nao cria duplicado quando ja existe", async () => {
  const { db, receber, q } = await pronto();
  await db.query("insert into public.op_records(collection,id,document) values ('profiles','aluno-a1',$1::jsonb)", [JSON.stringify({ id: "aluno-a1", display_name: "Aluno A1", email: "A1@potala.test", roles: ["student"], active: true })]);
  assert.equal((await receber()).ok, true);
  const mat = (await q("select document->>'profile_id' p from public.op_records where collection='enrollments'"))[0];
  assert.equal(mat.p, "aluno-a1");
  assert.equal((await q("select count(*)::int n from public.op_records where collection='profiles'"))[0].n, 3, "nenhum cadastro novo");
});

test("correcao 'registro incorreto': matricula cancelada, volta a aguardar pagamento, recebimento anulado e pode ser refeito", async () => {
  const { id, receber, corrigir, q, status } = await pronto();
  const a = await receber();
  const pid = a.r.payment_id;
  assert.equal((await corrigir(pid, "registro_incorreto", "x")).code, "22023", "motivo curto");
  const c = await corrigir(pid, "registro_incorreto", "Pix não caiu na conta");
  assert.equal(c.ok, true, c.message);
  assert.equal(await status(id), "aguardando_pagamento");
  const pag = (await q("select status, reversal_reason, reversed_by from public.course_enrollment_payments"))[0];
  assert.deepEqual([pag.status, pag.reversal_reason, pag.reversed_by], ["anulado", "Pix não caiu na conta", U.owner]);
  assert.equal((await q("select document->>'status' s from public.op_records where collection='enrollments'"))[0].s, "cancelled", "matricula cancelada, nao apagada");
  assert.equal((await corrigir(pid, "registro_incorreto", "Pix não caiu na conta")).r.replayed, true);
  assert.equal((await corrigir(pid, "estorno_realizado", "Outro motivo válido")).code, "PT409", "ja corrigido");
  const nova = await receber();
  assert.equal(nova.ok, true, nova.message);
  assert.equal(await status(id), "matriculada");
  const mats = await q("select document->>'status' s from public.op_records where collection='enrollments'");
  assert.equal(mats.length, 1, "a mesma matricula e reativada");
  assert.equal(mats[0].s, "active");
  assert.deepEqual((await q("select status from public.course_enrollment_payments order by recorded_at")).map((x) => x.status), ["anulado", "registrado"]);
});

test("cancelar a inscricao nao implica devolucao; o estorno so existe quando o Owner o registra", async () => {
  const { id, receber, decidir, corrigir, q, status, como } = await pronto();
  const a = await receber();
  assert.equal((await decidir(id, "cancelar")).ok, true);
  assert.equal(await status(id), "cancelada");
  assert.equal((await q("select status from public.course_enrollment_payments"))[0].status, "registrado", "cancelar nao estorna");
  const lista = (await como(U.owner, "select public.admin_list_course_enrollment_requests() as l")).rows[0].l;
  assert.equal(lista[0].status, "cancelada");
  assert.equal(lista[0].payment.status, "registrado", "a lista mostra recebimento sem estorno");
  const e = await corrigir(a.r.payment_id, "estorno_realizado", "Devolvido por Pix em 16/11");
  assert.equal(e.ok, true, e.message);
  assert.equal((await q("select status from public.course_enrollment_payments"))[0].status, "estornado");
  assert.equal(await status(id), "cancelada");
  assert.equal((await q("select count(*)::int n from public.course_enrollment_payments"))[0].n, 1, "nada apagado");
  assert.equal((await q("select count(*)::int n from public.course_enrollment_payment_events"))[0].n, 2);
});

test("estorno de matricula ativa: cancela a matricula e marca estornado; nada e apagado e a trilha e imutavel", async () => {
  const { receber, corrigir, q, status, id, db } = await pronto();
  const a = await receber();
  assert.equal((await corrigir(a.r.payment_id, "estorno_realizado", "Devolvido ao aluno")).ok, true);
  assert.equal(await status(id), "cancelada");
  assert.equal((await q("select document->>'status' s from public.op_records where collection='enrollments'"))[0].s, "cancelled");
  await assert.rejects(() => db.query("delete from public.course_enrollment_payments"), /não podem ser apagados/);
  await assert.rejects(() => db.query("update public.course_enrollment_payments set amount_cents=1"), /não podem ser alterados/);
  await assert.rejects(() => db.query("update public.course_enrollment_payments set status='registrado', reversed_at=null, reversal_reason=null"), /já foi corrigido|não podem ser alterados|violates check/);
  await assert.rejects(() => db.query("delete from public.course_enrollment_payment_events"), /trilha/);
  await assert.rejects(() => db.query("update public.course_enrollment_payment_events set note='x'"), /trilha/);
});

test("lista do Owner traz o recebimento (origem manual) e a vaga continua contada pela matricula", async () => {
  const { receber, como } = await pronto({ vagas: 1 });
  await receber();
  const l = (await como(U.owner, "select public.admin_list_course_enrollment_requests() as l")).rows[0].l;
  assert.equal(l[0].payment.source, "manual");
  assert.equal(l[0].payment.amount_cents, 15000);
  assert.equal(l[0].seats_taken, 1, "uma vaga, nao duas");
});

test("compatibilidade com o servidor/Asaas: confirmacao do servidor depois do recebimento manual nao duplica nada", async () => {
  const { id, receber, como, q } = await pronto();
  await receber();
  const r = (await como(null, "select public.confirm_course_enrollment_payment($1::uuid, 15000) as r", [id], "service_role")).rows[0].r;
  assert.equal(r.replayed, true);
  assert.equal((await q("select count(*)::int n from public.op_records where collection='enrollments'"))[0].n, 1);
  assert.equal((await q("select count(*)::int n from public.course_enrollment_payments"))[0].n, 1);
  /* e o inverso: pago pelo servidor, o Owner nao registra de novo */
  const b = await pronto();
  await b.como(null, "select public.confirm_course_enrollment_payment($1::uuid, 15000)", [b.id], "service_role");
  assert.equal((await b.receber()).code, "PT409");
});

test("regressao: fila antiga (aprovar, recusar, cancelar) e matricula gratuita seguem iguais", async () => {
  const { turmaAberta, pedir, decidir, status, db } = await montar();
  await turmaAberta("g", { preco: 0, vagas: 2 });
  const g = (await pedir(U.a1, "g")).r.id;
  assert.equal((await decidir(g, "aprovar")).ok, true);
  assert.equal(await status(g), "matriculada");
  assert.equal(Number((await db.query("select count(*) n from public.course_enrollment_payments")).rows[0].n), 0);
});

test("cobranca online aberta ou paga (tabela da #79) bloqueia o recebimento manual; cancelada/expirada nao", async () => {
  const { db, receber, q, status, id } = await pronto();
  await db.exec("create table public.course_payment_checkouts (id uuid primary key default gen_random_uuid(), request_id uuid not null, status text not null)");
  for (const aberto of ["creating", "active", "paid", "manual_review", "disputed"]) {
    await db.query("delete from public.course_payment_checkouts");
    await db.query("insert into public.course_payment_checkouts(request_id, status) values ($1,$2)", [id, aberto]);
    const r = await receber();
    assert.equal(r.code, "PT409", aberto);
    assert.match(r.message, /cobrança online/);
  }
  assert.equal(await status(id), "aguardando_pagamento");
  assert.equal((await q("select count(*)::int n from public.course_enrollment_payments"))[0].n, 0);
  for (const fechado of ["canceled", "expired", "failed", "refunded"]) {
    await db.query("delete from public.course_payment_checkouts");
    await db.query("insert into public.course_payment_checkouts(request_id, status) values ($1,$2)", [id, fechado]);
  }
  const ok = await receber();
  assert.equal(ok.ok, true, ok.message);
});

test("rollback: sem recebimentos remove tudo; com recebimentos preserva a auditoria", async () => {
  const a = await pronto();
  await a.db.exec(ROLLBACK);
  assert.equal(Number((await a.q("select count(*) n from pg_proc where proname like 'admin_%manual_course_payment'"))[0].n), 0);
  assert.equal(Number((await a.q("select count(*) n from pg_class where relname='course_enrollment_payments'"))[0].n), 0);
  assert.equal(Number((await a.q("select count(*) n from pg_proc where proname='confirm_course_enrollment_payment'"))[0].n), 1);
  const b = await pronto();
  await b.receber();
  await b.db.exec(ROLLBACK);
  assert.equal(Number((await b.q("select count(*) n from public.course_enrollment_payments"))[0].n), 1, "recebimento preservado");
  assert.equal(Number((await b.q("select count(*) n from public.course_enrollment_payment_events"))[0].n), 1);
  assert.equal(Number((await b.q("select count(*) n from public.course_enrollment_requests where status='matriculada'"))[0].n), 1);
  assert.equal(Number((await b.q("select count(*) n from pg_proc where proname='admin_list_course_enrollment_requests'"))[0].n), 1);
});
