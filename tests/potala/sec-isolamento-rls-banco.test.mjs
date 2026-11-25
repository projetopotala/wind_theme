import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

/*
 * SEC-03 | Isolamento RLS entre clientes, executado de verdade.
 *
 * Aplica TODAS as migrations reais do repositorio em um PGlite e exercita cada operacao como
 * `authenticated` (Cliente A, Cliente B, profissional vinculado, Owner) ou `anon`, com `SET ROLE`.
 * Cada caso roda numa transacao que e desfeita (rollback): um caso nunca contamina o seguinte.
 *
 * O que este teste cobre: GRANT (tabela e coluna), RLS (USING e WITH CHECK), isolamento por auth.uid(),
 * troca de user_id/origin, agenda pessoal x operacional e RPCs administrativas.
 * O que ele NAO prova (limites do PGlite): ver o bloco "LIMITES" no fim do arquivo.
 *
 * Regra de ouro dos casos de RPC: a funcao e chamada em `select public.f() as v`, no nivel mais alto da
 * consulta. Uma funcao STABLE dentro de `select count(*) from (select public.f()) q` e descartada pelo
 * planejador (coluna nao usada) e nunca executa, o que aprovaria o teste por engano. O caso "controle"
 * confirma que a funcao realmente rodou.
 */
const DIR = new URL("../../supabase/migrations/", import.meta.url);
const U = {
  A: "00000000-0000-0000-0000-0000000000a1",
  B: "00000000-0000-0000-0000-0000000000b1",
  C: "00000000-0000-0000-0000-0000000000c1", // profissional vinculado ao perfil p1
  OWNER: "00000000-0000-0000-0000-0000000000f1",
  TERCEIRO: "00000000-0000-0000-0000-0000000000e1", // id que nao existe em auth.users
};
const ENR = { A: "00000000-0000-0000-0000-00000000ea01", B: "00000000-0000-0000-0000-00000000eb01" };
const DIA = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);

async function montar() {
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
    -- Como no Supabase hospedado (conferido em producao): objetos novos em public nascem com acesso total a
    -- anon, authenticated e service_role. Sao as REVOGACOES das migrations que fecham a porta; sem isto o teste
    -- seria brando demais.
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  `);
  for (const a of readdirSync(DIR).sort()) await db.exec(readFileSync(new URL(a, DIR), "utf8"));
  await db.exec("grant usage on schema public, auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated");
  for (const [k, email] of [["A", "a"], ["B", "b"], ["C", "c"], ["OWNER", "owner"]]) {
    await db.query("insert into auth.users(id, email) values ($1,$2)", [U[k], `${email}@sec03.test`]);
  }
  await db.query("insert into public.users(id, role, name, email) values ($1,'owner','owner','owner@sec03.test') on conflict (id) do update set role='owner'", [U.OWNER]);
  const ids = (t) => `(${t}), `;
  void ids;
  const dono = async (sql, p) => db.query(sql, p);
  for (const k of ["A", "B"]) {
    const x = k.toLowerCase();
    await dono("insert into public.saved_items(user_id,item_type,item_ref,title,href) values ($1,'artigo',$2,$3,'/x')", [U[k], `sec03-${x}`, `salvo ${k}`]);
    await dono("insert into public.history_items(user_id,item_type,item_ref,title,href) values ($1,'artigo',$2,$3,'/x')", [U[k], `sec03-${x}`, `historico ${k}`]);
    await dono("insert into public.followed_items(user_id,subject_type,subject_ref,label) values ($1,'tema',$2,$3)", [U[k], `sec03-${x}`, `tema ${k}`]);
    await dono("insert into public.notification_preferences(user_id,kind,enabled) values ($1,'lembrete',true)", [U[k]]);
    await dono("insert into public.schedule_items(user_id,kind,title,starts_at,origin) values ($1,'outro',$2,now(),'pessoal'),($1,'outro',$3,now(),'instituto')", [U[k], `${k} pessoal`, `${k} instituto`]);
    await dono("insert into public.enrollments(id,user_id,course_ref,course_title,status) values ($1,$2,$3,$4,'inscrito')", [ENR[k], U[k], `sec03-${x}`, `curso ${k}`]);
    await dono("insert into public.course_progress(enrollment_id) values ($1)", [ENR[k]]);
    await dono("insert into public.notifications(user_id,kind,title) values ($1,'lembrete',$2)", [U[k], `aviso ${k}`]);
  }
  const doc = (col, id, d) => db.query("insert into public.op_records(collection, id, document) values ($1,$2,$3::jsonb)", [col, id, JSON.stringify({ id, ...d })]);
  await doc("profiles", "sec03-p1", { display_name: "TESTE INTERNO Profissional", email: "c@sec03.test", roles: ["professional"], active: true, published: true });
  await db.query("insert into public.appointment_profile_accounts(user_id, profile_id, active) values ($1,'sec03-p1',true)", [U.C]);
  const pedido = (nome, email, uid, prof, periodo) => db.query(
    `insert into public.appointment_requests(idempotency_key,service,modality,requester_name,contact_type,contact,preferred_date,preferred_period,requester_user_id,professional_profile_id)
     values (gen_random_uuid(),'Consulta sintetica','presencial',$1,'email',$2,$3::date,$4,$5,$6)`, [nome, email, DIA, periodo, uid, prof]);
  await pedido("Cliente Sintetico A", "a@sec03.test", U.A, "sec03-p1", "manha");
  await pedido("Cliente Sintetico B", "b@sec03.test", U.B, "sec03-p2", "manha");
  await pedido("Cliente Sintetico A", "a@sec03.test", U.A, null, "tarde");
  return db;
}

const db = await montar();
after(async () => { await db.close(); });

function classificar(e) {
  const m = String(e.message || "");
  if (/row-level security/i.test(m)) return "RLS";
  if (/permission denied/i.test(m)) return "GRANT";
  if (e.code === "42501") return "FUNCAO"; // negado pela validacao interna da funcao (raise 42501)
  return `OUTRO:${e.code ?? "?"}`;
}

/* Executa como a identidade pedida, dentro de uma transacao sempre desfeita. */
async function como(quem, sql) {
  const role = quem === "anon" ? "anon" : "authenticated";
  const uid = quem === "anon" ? "" : U[quem];
  await db.exec("begin");
  try {
    await db.exec(`set local role ${role}; set local test.uid = '${uid}'`);
    const r = await db.query(sql);
    const n = /^\s*(insert|update|delete)\b/i.test(sql) ? (r.affectedRows ?? 0) : r.rows.length;
    return { ok: true, rows: r.rows, n };
  } catch (e) {
    return { ok: false, tipo: classificar(e), code: e.code, message: e.message };
  } finally {
    await db.exec("rollback");
  }
}

function conferir(r, esperado, rotulo) {
  if (esperado.erro) {
    assert.equal(r.ok, false, `${rotulo}: devia ser negado, mas rodou (n=${r.n})`);
    const aceitos = Array.isArray(esperado.erro) ? esperado.erro : [esperado.erro];
    assert.ok(aceitos.includes(r.tipo), `${rotulo}: negado por ${r.tipo} (${r.message}), esperado ${aceitos.join("|")}`);
    return;
  }
  assert.equal(r.ok, true, `${rotulo}: erro inesperado ${r.tipo} ${r.message}`);
  if (esperado.min !== undefined) assert.ok(r.n >= esperado.min, `${rotulo}: n=${r.n}, esperado >= ${esperado.min}`);
  else assert.equal(r.n, esperado.n, `${rotulo}: n=${r.n}, esperado ${esperado.n}`);
}

/* ------------------------------------------------------------------ */
/* Controle: as identidades de teste sao as que dizem ser              */
/* ------------------------------------------------------------------ */
test("CONTROLE: auth.uid() e current_user refletem a identidade simulada", async () => {
  const a = await como("A", "select auth.uid()::text as uid, current_user as papel");
  assert.deepEqual(a.rows[0], { uid: U.A, papel: "authenticated" });
  const b = await como("B", "select auth.uid()::text as uid, current_user as papel");
  assert.deepEqual(b.rows[0], { uid: U.B, papel: "authenticated" });
  const x = await como("anon", "select auth.uid() as uid, current_user as papel");
  assert.deepEqual(x.rows[0], { uid: null, papel: "anon" });
});

test("CONTROLE: o dono (postgres) ve as linhas de B, entao um 0 como A e efeito de RLS e nao de fixture vazia", async () => {
  for (const [t, col] of [["saved_items", "user_id"], ["history_items", "user_id"], ["followed_items", "user_id"], ["notification_preferences", "user_id"], ["schedule_items", "user_id"], ["profiles", "id"], ["enrollments", "user_id"], ["notifications", "user_id"]]) {
    const n = Number((await db.query(`select count(*) n from public.${t} where ${col} = $1`, [U.B])).rows[0].n);
    assert.ok(n >= 1, `${t}: fixture de B ausente`);
  }
  assert.equal(Number((await db.query("select count(*) n from public.course_progress where enrollment_id = $1", [ENR.B])).rows[0].n), 1);
});

/* ------------------------------------------------------------------ */
/* Matriz Cliente A x Cliente B nas nove tabelas pessoais              */
/* ------------------------------------------------------------------ */
const PESSOAIS = [
  ["saved_items", "user_id"], ["history_items", "user_id"], ["followed_items", "user_id"],
  ["notification_preferences", "user_id"], ["schedule_items", "user_id"], ["profiles", "id"],
  ["enrollments", "user_id"], ["notifications", "user_id"],
];
const casos = [];
const caso = (id, quem, desc, sql, esperado) => casos.push({ id, quem, desc, sql, esperado });

for (const [t, c] of PESSOAIS) {
  caso(`R ${t}`, "A", "le os proprios", `select 1 from public.${t} where ${c} = '${U.A}'`, { min: 1 });
  caso(`R ${t}`, "A", "nao le os de B", `select 1 from public.${t} where ${c} = '${U.B}'`, { n: 0 });
  caso(`R ${t}`, "A", "nenhuma linha de outro dono, mesmo sem filtro", `select 1 from public.${t} where ${c} <> '${U.A}'`, { n: 0 });
  caso(`R ${t}`, "B", "nao le os de A (sentido inverso)", `select 1 from public.${t} where ${c} = '${U.A}'`, { n: 0 });
  caso(`R ${t}`, "anon", "anonimo nao le", `select 1 from public.${t}`, { erro: "GRANT" });
}
caso("R course_progress", "A", "le o proprio", `select 1 from public.course_progress where enrollment_id = '${ENR.A}'`, { n: 1 });
caso("R course_progress", "A", "nao le o de B", `select 1 from public.course_progress where enrollment_id = '${ENR.B}'`, { n: 0 });
caso("R course_progress", "A", "nenhum progresso de outra inscricao", `select 1 from public.course_progress where enrollment_id <> '${ENR.A}'`, { n: 0 });
caso("R course_progress", "B", "nao le o de A (sentido inverso)", `select 1 from public.course_progress where enrollment_id = '${ENR.A}'`, { n: 0 });
caso("R course_progress", "anon", "anonimo nao le", "select 1 from public.course_progress", { erro: "GRANT" });

const INS = {
  saved_items: (u) => `insert into public.saved_items(user_id,item_type,item_ref,title,href) values ('${u}','artigo','x-novo','t','/x')`,
  history_items: (u) => `insert into public.history_items(user_id,item_type,item_ref,title,href) values ('${u}','artigo','x-novo','t','/x')`,
  followed_items: (u) => `insert into public.followed_items(user_id,subject_type,subject_ref,label) values ('${u}','tema','x-novo','t')`,
  notification_preferences: (u) => `insert into public.notification_preferences(user_id,kind,enabled) values ('${u}','nova_turma',true)`,
  schedule_items: (u) => `insert into public.schedule_items(user_id,kind,title,starts_at,origin) values ('${u}','outro','t',now(),'pessoal')`,
};
for (const t of Object.keys(INS)) {
  caso(`I ${t}`, "A", "insere para si (positivo)", INS[t](U.A), { n: 1 });
  caso(`I ${t}`, "A", "nao insere em nome de B", INS[t](U.B), { erro: "RLS" });
  caso(`I ${t}`, "anon", "anonimo nao insere", INS[t](U.A), { erro: "GRANT" });
}
caso("I profiles", "A", "nao cria perfil com id de terceiro", `insert into public.profiles(id) values ('${U.TERCEIRO}')`, { erro: "RLS" });
caso("I schedule_items", "A", "nao cria item com origin=instituto", `insert into public.schedule_items(user_id,kind,title,starts_at,origin) values ('${U.A}','outro','t',now(),'instituto')`, { erro: "RLS" });
for (const quem of ["A", "B"]) {
  const u = U[quem], x = quem;
  caso("I enrollments", x, "cliente nao grava inscricao (sem INSERT)", `insert into public.enrollments(user_id,course_ref,course_title,status) values ('${u}','x','x','inscrito')`, { erro: "GRANT" });
  caso("I notifications", x, "cliente nao cria aviso (sem INSERT)", `insert into public.notifications(user_id,kind,title) values ('${u}','lembrete','x')`, { erro: "GRANT" });
  caso("I course_progress", x, "cliente nao grava progresso (sem INSERT)", `insert into public.course_progress(enrollment_id) values ('${ENR[x]}')`, { erro: "GRANT" });
}
caso("I enrollments", "A", "nem em nome de B", `insert into public.enrollments(user_id,course_ref,course_title,status) values ('${U.B}','x','x','inscrito')`, { erro: "GRANT" });
caso("I notifications", "A", "nem em nome de B", `insert into public.notifications(user_id,kind,title) values ('${U.B}','lembrete','x')`, { erro: "GRANT" });

const UPD = {
  saved_items: "set title = 'hack'", history_items: "set title = 'hack'", followed_items: "set label = 'hack'",
  notification_preferences: "set enabled = false", schedule_items: "set title = 'hack'", profiles: "set display_name = 'hack'",
};
for (const [t, c] of PESSOAIS.filter(([t]) => UPD[t])) {
  caso(`U ${t}`, "A", "atualiza o proprio (positivo)", `update public.${t} ${UPD[t]} where ${c} = '${U.A}'${t === "schedule_items" ? " and origin = 'pessoal'" : ""}`, { min: 1 });
  caso(`U ${t}`, "A", "nao atualiza o de B (USING)", `update public.${t} ${UPD[t]} where ${c} = '${U.B}'`, { n: 0 });
  caso(`U ${t}`, "anon", "anonimo nao atualiza", `update public.${t} ${UPD[t]}`, { erro: "GRANT" });
}
caso("U notifications", "A", "marca o proprio aviso como lido (positivo)", `update public.notifications set read_at = now() where user_id = '${U.A}'`, { n: 1 });
caso("U notifications", "A", "nao marca o aviso de B", `update public.notifications set read_at = now() where user_id = '${U.B}'`, { n: 0 });
caso("U notifications", "A", "outra coluna alem de read_at e negada (GRANT por coluna)", `update public.notifications set title = 'x' where user_id = '${U.A}'`, { erro: "GRANT" });
caso("U enrollments", "A", "cliente nao altera inscricao", `update public.enrollments set status = 'concluido' where user_id = '${U.A}'`, { erro: "GRANT" });
caso("U course_progress", "A", "cliente nao altera progresso", `update public.course_progress set lessons_total = 9 where enrollment_id = '${ENR.A}'`, { erro: "GRANT" });

for (const [t, c] of PESSOAIS.filter(([t]) => ["saved_items", "history_items", "followed_items", "notification_preferences", "schedule_items"].includes(t))) {
  caso(`D ${t}`, "A", "apaga o proprio pessoal (positivo)", `delete from public.${t} where ${c} = '${U.A}'${t === "schedule_items" ? " and origin = 'pessoal'" : ""}`, { min: 1 });
  caso(`D ${t}`, "A", "nao apaga o de B (USING)", `delete from public.${t} where ${c} = '${U.B}'`, { n: 0 });
  caso(`D ${t}`, "anon", "anonimo nao apaga", `delete from public.${t}`, { erro: "GRANT" });
}
for (const [t, c] of [["profiles", "id"], ["notifications", "user_id"], ["enrollments", "user_id"]]) caso(`D ${t}`, "A", "cliente nao apaga (sem DELETE)", `delete from public.${t} where ${c} = '${U.A}'`, { erro: "GRANT" });
caso("D course_progress", "A", "cliente nao apaga progresso (sem DELETE)", `delete from public.course_progress where enrollment_id = '${ENR.A}'`, { erro: "GRANT" });

/* Troca de dono (user_id/id) e de origin: o WITH CHECK barra a linha nova */
for (const [t, c] of PESSOAIS.filter(([t]) => ["saved_items", "history_items", "followed_items", "notification_preferences", "schedule_items"].includes(t))) {
  caso(`O ${t}`, "A", "nao transfere o proprio registro para B", `update public.${t} set ${c} = '${U.B}' where ${c} = '${U.A}'`, { erro: "RLS" });
}
caso("O profiles", "A", "nao troca o proprio id", `update public.profiles set id = '${U.TERCEIRO}' where id = '${U.A}'`, { erro: "RLS" });
caso("O schedule_items", "A", "nao promove compromisso pessoal a instituto", `update public.schedule_items set origin = 'instituto' where user_id = '${U.A}' and origin = 'pessoal'`, { erro: "RLS" });
caso("O schedule_items", "A", "nao edita item do Instituto", `update public.schedule_items set title = 'hack' where user_id = '${U.A}' and origin = 'instituto'`, { n: 0 });
caso("O schedule_items", "A", "nao rebaixa item do Instituto a pessoal", `update public.schedule_items set origin = 'pessoal' where user_id = '${U.A}' and origin = 'instituto'`, { n: 0 });
caso("O schedule_items", "A", "nao apaga item do Instituto", `delete from public.schedule_items where user_id = '${U.A}' and origin = 'instituto'`, { n: 0 });
caso("O schedule_items", "A", "le o proprio item do Instituto", `select 1 from public.schedule_items where user_id = '${U.A}' and origin = 'instituto'`, { n: 1 });

for (const c of casos) {
  test(`${c.id} | ${c.quem}: ${c.desc}`, async () => {
    conferir(await como(c.quem, c.sql), c.esperado, `${c.id} ${c.quem}`);
  });
}

/* ------------------------------------------------------------------ */
/* Agenda pessoal x operacional e RPCs administrativas                 */
/* ------------------------------------------------------------------ */
const chamar = (quem, expr) => como(quem, `select ${expr} as v`);

test("CONTROLE de RPC: o Owner executa op_snapshot de verdade (devolve a revisao e as colecoes)", async () => {
  const r = await chamar("OWNER", "public.op_snapshot()");
  assert.equal(r.ok, true, r.message);
  assert.equal(typeof r.rows[0].v.revision, "number", "a funcao rodou e devolveu o documento");
  assert.ok(Array.isArray(r.rows[0].v.schedule_items), "colecao operacional de agenda presente");
});

test("AGENDA: compromissos pessoais (public.schedule_items) nao aparecem na agenda operacional (op_records)", async () => {
  const snap = (await chamar("OWNER", "public.op_snapshot()")).rows[0].v;
  const titulos = JSON.stringify(snap.schedule_items);
  for (const t of ["A pessoal", "A instituto", "B pessoal", "B instituto"]) assert.ok(!titulos.includes(t), `"${t}" nao devia estar na agenda operacional`);
  assert.equal(Number((await db.query("select count(*) n from public.op_records where collection = 'schedule_items'")).rows[0].n), 0);
});

test("AGENDA: nenhum cliente le a agenda operacional (op_records sem GRANT)", async () => {
  for (const quem of ["A", "B", "C", "anon"]) conferir(await como(quem, "select 1 from public.op_records"), { erro: "GRANT" }, `op_records ${quem}`);
  for (const t of ["op_meta", "op_requests"]) conferir(await como("A", `select 1 from public.${t}`), { erro: "GRANT" }, t);
});

for (const quem of ["A", "B", "C"]) {
  test(`RPC admin | ${quem}: op_snapshot() e negada pela propria funcao (42501)`, async () => {
    conferir(await chamar(quem, "public.op_snapshot()"), { erro: "FUNCAO" }, `op_snapshot ${quem}`);
  });
  test(`RPC admin | ${quem}: op_apply() e negada pela propria funcao (42501)`, async () => {
    conferir(await chamar(quem, "public.op_apply(0,'sec03','sec03','{}'::jsonb,'{}'::jsonb,'[]'::jsonb)"), { erro: "FUNCAO" }, `op_apply ${quem}`);
  });
}
test("RPC admin | anon: op_snapshot() e op_apply() sem EXECUTE (GRANT)", async () => {
  conferir(await chamar("anon", "public.op_snapshot()"), { erro: "GRANT" }, "op_snapshot anon");
  conferir(await chamar("anon", "public.op_apply(0,'sec03','sec03','{}'::jsonb,'{}'::jsonb,'[]'::jsonb)"), { erro: "GRANT" }, "op_apply anon");
});
test("RPC admin | cliente: limpeza de mensagens das salas e negada", async () => {
  conferir(await chamar("A", "public.purge_expired_appointment_room_messages()"), { erro: "FUNCAO" }, "purge A");
  conferir(await chamar("anon", "public.purge_expired_appointment_room_messages()"), { erro: "GRANT" }, "purge anon");
});
test("RPC admin | cliente e profissional: listagens administrativas sao negadas", async () => {
  for (const quem of ["A", "C"]) {
    for (const fn of ["public.admin_list_accounts()", "public.admin_list_professional_profiles()"]) {
      const r = await chamar(quem, fn);
      assert.equal(r.ok, false, `${fn} como ${quem} devia ser negada`);
      assert.ok(["FUNCAO", "GRANT"].includes(r.tipo), `${fn} como ${quem}: ${r.tipo} ${r.message}`);
    }
  }
});
test("RPC admin | is_portal_admin(): false para cliente, profissional e anonimo; true so para o Owner", async () => {
  assert.equal((await chamar("OWNER", "public.is_portal_admin()")).rows[0].v, true, "controle positivo");
  for (const quem of ["A", "B", "C"]) assert.equal((await chamar(quem, "public.is_portal_admin()")).rows[0].v, false, quem);
  /* anon: hoje a funcao executa e devolve false (EXECUTE de anon e um achado de endurecimento, nao um acesso).
     Se um dia o EXECUTE for revogado, o resultado passa a ser GRANT; os dois estados sao seguros. */
  const anon = await chamar("anon", "public.is_portal_admin()");
  assert.ok(anon.ok ? anon.rows[0].v === false : anon.tipo === "GRANT", `anon: ${anon.ok ? JSON.stringify(anon.rows) : anon.message}`);
});

/* ------------------------------------------------------------------ */
/* Atendimentos: cliente, profissional vinculado e Owner                */
/* ------------------------------------------------------------------ */
const PED = "select 1 from public.appointment_requests";
test("ATENDIMENTO | cada cliente le somente os proprios pedidos", async () => {
  conferir(await como("A", PED), { n: 2 }, "A");
  conferir(await como("B", PED), { n: 1 }, "B");
  conferir(await como("A", `${PED} where requester_user_id = '${U.B}'`), { n: 0 }, "A le de B");
  conferir(await como("B", `${PED} where requester_user_id = '${U.A}'`), { n: 0 }, "B le de A");
});
test("ATENDIMENTO | profissional vinculado ve so os pedidos do proprio perfil", async () => {
  conferir(await como("C", PED), { n: 1 }, "C ve so p1");
  conferir(await como("C", `${PED} where professional_profile_id is distinct from 'sec03-p1'`), { n: 0 }, "C nao ve outros");
});
test("ATENDIMENTO | Owner ve todos os pedidos; anonimo nenhum", async () => {
  conferir(await como("OWNER", PED), { n: 3 }, "Owner");
  conferir(await como("anon", PED), { erro: "GRANT" }, "anon");
});
test("ATENDIMENTO | cliente e profissional nao inserem, nao apagam e nao mudam status", async () => {
  for (const quem of ["A", "C"]) {
    conferir(await como(quem, "update public.appointment_requests set status = 'em_contato'"), { n: 0 }, `${quem} status`);
    conferir(await como(quem, "delete from public.appointment_requests"), { erro: "GRANT" }, `${quem} delete`);
    conferir(await como(quem, "insert into public.appointment_requests(idempotency_key,service,modality,requester_name,contact_type,contact,preferred_date,preferred_period) values (gen_random_uuid(),'Consulta sintetica','presencial','Cliente Sintetico','email','x@sec03.test',current_date,'manha')"), { erro: "GRANT" }, `${quem} insert`);
  }
});
test("ATENDIMENTO | vinculo de profissional: so quem tem vinculo ativo e reconhecido", async () => {
  const e = (quem, p) => chamar(quem, `case when public.is_appointment_professional('${p}') then 1 else 0 end`);
  assert.equal((await e("C", "sec03-p1")).rows[0].v, 1, "C e profissional de p1");
  assert.equal((await e("C", "sec03-p2")).rows[0].v, 0, "C nao e profissional de p2");
  assert.equal((await e("A", "sec03-p1")).rows[0].v, 0, "A nao tem vinculo");
});
test("ATENDIMENTO | o Owner pode alterar o status de um pedido (controle positivo da politica administrativa)", async () => {
  conferir(await como("OWNER", "update public.appointment_requests set status = 'em_contato' where requester_user_id = '" + U.A + "' and professional_profile_id is null"), { n: 1 }, "Owner status");
});

/* ------------------------------------------------------------------ */
/* Catalogo: RLS ligada, politicas e privilegios (nao dependem de dados) */
/* ------------------------------------------------------------------ */
const ESPERADO = {
  profiles: { policies: 3, auth: { SELECT: 1, INSERT: 1, UPDATE: 1, DELETE: 0 } },
  saved_items: { policies: 4, auth: { SELECT: 1, INSERT: 1, UPDATE: 1, DELETE: 1 } },
  history_items: { policies: 4, auth: { SELECT: 1, INSERT: 1, UPDATE: 1, DELETE: 1 } },
  followed_items: { policies: 4, auth: { SELECT: 1, INSERT: 1, UPDATE: 1, DELETE: 1 } },
  notification_preferences: { policies: 4, auth: { SELECT: 1, INSERT: 1, UPDATE: 1, DELETE: 1 } },
  schedule_items: { policies: 4, auth: { SELECT: 1, INSERT: 1, UPDATE: 1, DELETE: 1 } },
  enrollments: { policies: 1, auth: { SELECT: 1, INSERT: 0, UPDATE: 0, DELETE: 0 } },
  course_progress: { policies: 1, auth: { SELECT: 1, INSERT: 0, UPDATE: 0, DELETE: 0 } },
  notifications: { policies: 2, auth: { SELECT: 1, INSERT: 0, UPDATE: 0, DELETE: 0 } }, // UPDATE so em read_at (coluna)
};
for (const [t, esp] of Object.entries(ESPERADO)) {
  test(`CATALOGO | ${t}: RLS ligada, ${esp.policies} politica(s) so para authenticated, sem restritivas, nenhuma para anon`, async () => {
    const rls = (await db.query("select relrowsecurity r from pg_class where oid = $1::regclass", [`public.${t}`])).rows[0].r;
    assert.equal(rls, true, "RLS ligada");
    const pol = (await db.query("select policyname, permissive, roles::text r, coalesce(qual,'') q, coalesce(with_check,'') c, cmd from pg_policies where schemaname='public' and tablename=$1", [t])).rows;
    assert.equal(pol.length, esp.policies, `numero de politicas de ${t}: ${pol.map((p) => p.policyname).join("; ")}`);
    for (const p of pol) {
      assert.equal(p.permissive, "PERMISSIVE", p.policyname);
      assert.equal(p.r, "{authenticated}", `${p.policyname}: papeis ${p.r}`);
      assert.match(p.q + p.c, /auth\.uid\(\)/, `${p.policyname}: sem auth.uid()`);
      if (["UPDATE", "INSERT"].includes(p.cmd) && t !== "course_progress") assert.ok(p.c.length > 0 || p.cmd === "UPDATE" && p.q.length > 0, `${p.policyname}: sem WITH CHECK/USING`);
      if (p.cmd === "UPDATE") assert.ok(p.c.length > 0, `${p.policyname}: UPDATE sem WITH CHECK (permitiria trocar o dono)`);
    }
  });
  test(`CATALOGO | ${t}: privilegios de authenticated conforme o desenho; anon e PUBLIC sem nenhum`, async () => {
    for (const [priv, esperado] of Object.entries(esp.auth)) {
      const tem = (await db.query("select has_table_privilege('authenticated', $1, $2) v", [`public.${t}`, priv])).rows[0].v;
      assert.equal(tem, Boolean(esperado), `${t} ${priv} para authenticated`);
    }
    for (const priv of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
      assert.equal((await db.query("select has_table_privilege('anon', $1, $2) v", [`public.${t}`, priv])).rows[0].v, false, `${t} ${priv} para anon`);
    }
    const publico = (await db.query("select count(*)::int n from pg_class c cross join lateral aclexplode(c.relacl) a where c.oid = $1::regclass and a.grantee = 0", [`public.${t}`])).rows[0].n;
    assert.equal(publico, 0, `${t}: privilegio concedido a PUBLIC`);
    for (const priv of ["TRUNCATE", "REFERENCES", "TRIGGER"]) assert.equal((await db.query("select has_table_privilege('authenticated', $1, $2) v", [`public.${t}`, priv])).rows[0].v, false, `${t} ${priv} para authenticated`);
  });
}
test("CATALOGO | notifications: UPDATE de authenticated limitado a read_at; appointment_requests: UPDATE so em status", async () => {
  const col = async (t, c) => (await db.query("select has_column_privilege('authenticated', $1, $2, 'UPDATE') v", [`public.${t}`, c])).rows[0].v;
  assert.equal(await col("notifications", "read_at"), true);
  for (const c of ["user_id", "title", "body", "kind", "href", "created_at"]) assert.equal(await col("notifications", c), false, `notifications.${c}`);
  assert.equal(await col("appointment_requests", "status"), true);
  for (const c of ["requester_user_id", "professional_profile_id", "contact", "requester_name"]) assert.equal(await col("appointment_requests", c), false, `appointment_requests.${c}`);
});
test("CATALOGO | tabelas operacionais e de atendimento: RLS ligada e sem nenhum privilegio para anon", async () => {
  for (const t of ["op_records", "op_meta", "op_requests", "appointment_requests", "appointment_request_events", "appointment_slots", "appointment_profile_accounts", "appointment_room_sessions", "appointment_room_messages", "appointment_room_access_log"]) {
    assert.equal((await db.query("select relrowsecurity r from pg_class where oid = $1::regclass", [`public.${t}`])).rows[0].r, true, `${t}: RLS`);
    for (const priv of ["SELECT", "INSERT", "UPDATE", "DELETE"]) assert.equal((await db.query("select has_table_privilege('anon', $1, $2) v", [`public.${t}`, priv])).rows[0].v, false, `${t} ${priv} para anon`);
  }
  for (const t of ["op_records", "op_meta", "op_requests"]) {
    for (const priv of ["SELECT", "INSERT", "UPDATE", "DELETE"]) assert.equal((await db.query("select has_table_privilege('authenticated', $1, $2) v", [`public.${t}`, priv])).rows[0].v, false, `${t} ${priv} para authenticated`);
    assert.equal((await db.query("select count(*)::int n from pg_policies where schemaname='public' and tablename=$1", [t])).rows[0].n, 0, `${t}: nao deve ter politica (acesso so por RPC)`);
  }
});
test("CATALOGO | funcoes SECURITY DEFINER de op_* e das RPCs de identidade fixam search_path e nao sao executaveis por PUBLIC", async () => {
  const fns = (await db.query(`select p.proname, p.prosecdef, coalesce(p.proconfig, '{}') cfg,
      exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x where x.grantee = 0 and x.privilege_type = 'EXECUTE') exec_public
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('op_snapshot','op_apply','is_portal_admin','is_appointment_professional','my_appointment_professional_profiles','list_my_appointment_requests','my_course_enrollments','handle_new_visitor')`)).rows;
  assert.equal(fns.length, 8);
  for (const f of fns) {
    assert.equal(f.prosecdef, true, `${f.proname}: SECURITY DEFINER esperado`);
    assert.ok(f.cfg.some((c) => /^search_path=("")?$/.test(c) || c === 'search_path=""'), `${f.proname}: search_path nao fixado (${f.cfg})`);
    assert.equal(f.exec_public, false, `${f.proname}: EXECUTE para PUBLIC`);
  }
});

/*
 * LIMITES do PGlite (nao declare aprovado o que esta aqui):
 *  - A identidade e simulada por SET ROLE + um parametro de sessao lido por um auth.uid() de teste. Isso exercita
 *    RLS e GRANT de verdade, mas NAO passa por GoTrue, JWT, PostgREST nem pelas "schemas expostas" da API.
 *  - auth, storage e os privilegios padrao do Supabase sao simulados (os privilegios padrao copiam o que foi
 *    conferido em producao). Politicas de storage.objects nao sao exercitadas.
 *  - E um unico banco em memoria, sem concorrencia real; nao prova nada sobre desempenho de RLS.
 *  - Nao ha Realtime, Edge Functions nem webhooks.
 *  - O estado de PRODUCAO nao e lido aqui: o teste prova o que as migrations do repositorio produzem. A
 *    paridade com o banco oficial foi conferida a parte (SEC-01) e deve ser repetida apos cada migration.
 */
