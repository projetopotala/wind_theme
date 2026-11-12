import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

import { createOperationsClient } from "../../outputs/js/admin/operations/client.js";
import { ESTADO_INICIAL, executarPlano, idsPorColecao, montarPlanoCurso, simularPlano } from "../../outputs/js/admin/organizar-curso.js";

/*
 * P1C contra o BANCO REAL (PGlite com as migrations de verdade): op_snapshot/op_apply, a guarda
 * validate_op_record e my_course_enrollments (Meu Potala), dirigidos pelo cliente de operação e
 * pelo plano do "Organizar um curso". Só auth.users/auth.uid() são simulados. Dados sintéticos.
 */
const mig = (n) => readFileSync(new URL(`../../supabase/migrations/${n}`, import.meta.url), "utf8");
const U = {
  owner: "00000000-0000-0000-0000-0000000000a1", comum: "00000000-0000-0000-0000-0000000000a3",
  joao: "00000000-0000-0000-0000-0000000000c1", lia: "00000000-0000-0000-0000-0000000000c2",
};

async function montar() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key, email text, created_at timestamptz default now(), email_confirmed_at timestamptz default now(), last_sign_in_at timestamptz, banned_until timestamptz, deleted_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table public.users(id uuid primary key, role text not null, active boolean not null default true, name text, email text);
    create table public.appointment_profile_accounts(user_id uuid primary key references auth.users(id), profile_id text not null unique, active boolean not null default true, updated_at timestamptz);
    create function public.is_portal_admin() returns boolean language sql stable security definer set search_path = '' as $$
      select (select auth.uid()) is not null and exists (select 1 from public.users where id = (select auth.uid()) and role in ('owner','admin') and active = true) $$;
  `);
  for (const [k, papel, email] of [["owner", "owner", "owner@potala.test"], ["comum", "user", "comum@potala.test"], ["joao", "user", "joao.teste@potala.test"], ["lia", "user", "lia.teste@potala.test"]]) {
    await db.query("insert into auth.users(id, email) values ($1,$2)", [U[k], email]);
    await db.query("insert into public.users(id, role, name, email) values ($1,$2,$3,$4)", [U[k], papel, k, email]);
  }
  await db.exec(mig("202609170001_operacao_do_instituto.sql"));
  await db.exec(mig("202610230001_restore_operational_guard.sql"));
  await db.exec(mig("202611110001_my_course_enrollments.sql"));
  await db.exec(mig("202611110002_my_course_enrollments_online_link.sql"));
  await db.exec("grant usage on schema public, auth to authenticated; grant execute on function auth.uid() to authenticated");
  const como = async (uid, sql, params) => { await db.exec(`set test.uid = '${uid || ""}'; set role authenticated`); try { return await db.query(sql, params); } finally { await db.exec("reset role"); } };
  const doc = (col, id, d) => db.query("insert into public.op_records(collection, id, document) values ($1,$2,$3::jsonb)", [col, id, JSON.stringify({ id, ...d })]);
  await doc("rooms", "sala1", { code: "S01", name: "Sala 1", status: "available", capacity: 6, opens_at: "07:00", closes_at: "22:00" });
  await doc("profiles", "prof-ana", { display_name: "TESTE INTERNO Ana Professora", email: "ana.prof@potala.test", roles: ["professional"], active: true, published: false });
  await doc("profiles", "al-joao", { display_name: "TESTE INTERNO João Aluno", email: "joao.teste@potala.test", roles: ["student"], active: true });
  await doc("profiles", "al-lia", { display_name: "TESTE INTERNO Lia Aluna", email: "lia.teste@potala.test", roles: ["client"], active: true });
  await doc("profiles", "al-rui", { display_name: "TESTE INTERNO Rui Aluno", email: "rui.teste@potala.test", roles: ["client"], active: true });
  return { db, como };
}

function cliente(como, uid, rede = {}) {
  return {
    async rpc(nome, args = {}) {
      const chaves = Object.keys(args);
      if (rede.antes?.(nome, args)) return { data: null, error: { message: "Failed to fetch" } };
      const sql = `select public.${nome}(${chaves.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`;
      const valores = chaves.map((k) => (args[k] !== null && typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k]));
      let r;
      try { r = (await como(uid, sql, valores)).rows[0].r; } catch (e) { return { data: null, error: { code: e.code, message: e.message } }; }
      if (rede.depois?.(nome, args)) return { data: null, error: { message: "Failed to fetch" } };
      return { data: r, error: null };
    },
  };
}
const registros = async (db, col) => (await db.query("select document from public.op_records where collection=$1 order by ordem", [col])).rows.map((r) => r.document);

function planoOnline(extra = {}) {
  const e = ESTADO_INICIAL();
  e.curso = { modo: "novo", titulo: "TESTE INTERNO Respiração consciente" };
  e.turma = { modo: "nova", titulo: "Turma online · noite", modalidade: "online", capacidade: "2" };
  e.professor = { id: "prof-ana", semProfessor: false };
  e.aulas = [{ chave: "a1", data: "2027-03-02", inicio: "19:00", fim: "20:30", modo: "online", salaId: "", link: "https://reuniao.exemplo/turma-noite", repetirAte: "" }];
  e.inscricoes = [{ perfilId: "al-joao", status: "active" }];
  return Object.assign(e, extra);
}

test("fluxo completo no banco real: curso, turma, aula e inscrição gravados uma vez; o aluno vê o curso no Meu Potala", async () => {
  const { db, como } = await montar();
  const op = createOperationsClient({ client: cliente(como, U.owner) });
  await op.refresh();
  const e = planoOnline();
  const passos = montarPlanoCurso(e, op.snapshot);
  assert.equal(simularPlano(op.snapshot, passos).ok, true);
  const r = await executarPlano({ operations: op, passos, idsAntes: idsPorColecao(op.snapshot) });
  assert.equal(r.ok, true, r.falha?.motivo);
  assert.equal((await registros(db, "activity_definitions")).length, 1);
  const [turma] = await registros(db, "activity_offerings");
  assert.equal(turma.professional_id, "prof-ana");
  assert.equal(turma.mode, "online");
  const aulas = await registros(db, "schedule_items");
  assert.equal(aulas.length, 1);
  assert.equal(aulas[0].room_id, null);
  assert.equal(aulas[0].offering_id, turma.id);
  assert.equal((await registros(db, "enrollments")).length, 1);
  const auditoria = (await db.query("select count(*)::int n from public.op_records where collection = 'audit_events'")).rows[0].n;
  assert.equal(auditoria, 4, "uma gravação auditada por item");

  const meus = (await como(U.joao, "select public.my_course_enrollments() as r")).rows[0].r;
  assert.equal(meus.length, 1);
  assert.equal(meus[0].course_title, "Turma online · noite");
  assert.equal(meus[0].teacher_name, "TESTE INTERNO Ana Professora");
  assert.equal(meus[0].modality, "Online");
  assert.equal(meus[0].join_url, "https://reuniao.exemplo/turma-noite");
  const lia = (await como(U.lia, "select public.my_course_enrollments() as r")).rows[0].r;
  assert.deepEqual(lia, [], "quem não foi inscrito não vê nada");
  await db.close();
});

test("aula online sem link: gravada; no Meu Potala o aluno vê a próxima aula, sem botão de entrar", async () => {
  const { db, como } = await montar();
  const op = createOperationsClient({ client: cliente(como, U.owner) });
  await op.refresh();
  const e = planoOnline();
  e.aulas[0].link = "";
  assert.equal((await executarPlano({ operations: op, passos: montarPlanoCurso(e, op.snapshot), idsAntes: idsPorColecao(op.snapshot) })).ok, true);
  const [meu] = (await como(U.joao, "select public.my_course_enrollments() as r")).rows[0].r;
  assert.equal(meu.status, "proximo_encontro");
  assert.equal(meu.join_url, null);
  await db.close();
});

test("conta sem administração: o banco recusa (42501) e nada é gravado", async () => {
  const { db, como } = await montar();
  const op = createOperationsClient({ client: cliente(como, U.owner) });
  await op.refresh();
  const estado = op.snapshot;
  /* A mesma tela aberta, mas a sessão é de uma conta comum: o banco é quem decide. */
  const intruso = createOperationsClient({ client: { rpc: (n, a) => (n === "op_snapshot" ? Promise.resolve({ data: estado, error: null }) : cliente(como, U.comum).rpc(n, a)) } });
  await intruso.refresh();
  const r = await executarPlano({ operations: intruso, passos: montarPlanoCurso(planoOnline(), estado), idsAntes: idsPorColecao(estado) });
  assert.equal(r.ok, false);
  assert.match(r.falha.motivo, /Seu acesso não permite/);
  for (const col of ["activity_definitions", "activity_offerings", "schedule_items", "enrollments"]) assert.equal((await registros(db, col)).length, 0, col);
  await db.close();
});

test("resposta perdida na inscrição: o fluxo confere no banco e uma repetição não cria segunda inscrição", async () => {
  const { db, como } = await montar();
  let perder = true;
  const op = createOperationsClient({ client: cliente(como, U.owner, { depois: (n, a) => n === "op_apply" && a.p_action === "enrollment.save" && perder && !(perder = false) }) });
  await op.refresh();
  const idsAntes = idsPorColecao(op.snapshot);
  const passos = montarPlanoCurso(planoOnline(), op.snapshot);
  const r = await executarPlano({ operations: op, passos, idsAntes });
  assert.equal(r.ok, true, "a inscrição gravada foi reconhecida");
  assert.equal((await registros(db, "enrollments")).length, 1);
  /* Mesmo pedido de novo (por exemplo, clique duplo): o motor recusa a inscrição repetida antes de chegar ao banco. */
  const repetida = await executarPlano({ operations: op, passos: passos.slice(-1), refs: r.refs, idsAntes });
  assert.equal(repetida.ok, true, "conferido: a inscrição já existe; nada é gravado de novo");
  assert.equal((await registros(db, "enrollments")).length, 1);
  await db.close();
});

test("duas janelas disputam a última vaga: uma grava; a outra é recusada (PT409 e depois vaga esgotada)", async () => {
  const { db, como } = await montar();
  const janela1 = createOperationsClient({ client: cliente(como, U.owner) });
  await janela1.refresh();
  const e = planoOnline();
  e.turma.capacidade = "1";
  e.inscricoes = [];
  const r = await executarPlano({ operations: janela1, passos: montarPlanoCurso(e, janela1.snapshot), idsAntes: idsPorColecao(janela1.snapshot) });
  assert.equal(r.ok, true);
  const janela2 = createOperationsClient({ client: cliente(como, U.owner) });
  await janela2.refresh();
  const existente = { ...e, curso: { modo: "existente", id: r.refs.curso }, turma: { ...e.turma, modo: "existente", id: r.refs.turma }, aulas: [] };
  const p1 = montarPlanoCurso({ ...existente, inscricoes: [{ perfilId: "al-lia", status: "active" }] }, janela1.snapshot);
  const p2 = montarPlanoCurso({ ...existente, inscricoes: [{ perfilId: "al-rui", status: "active" }] }, janela2.snapshot);
  const [a, b] = await Promise.all([
    executarPlano({ operations: janela1, passos: p1, refs: r.refs, idsAntes: idsPorColecao(janela1.snapshot) }),
    executarPlano({ operations: janela2, passos: p2, refs: r.refs, idsAntes: idsPorColecao(janela2.snapshot) }),
  ]);
  assert.equal([a, b].filter((x) => x.ok).length, 1, "só uma janela grava");
  assert.match([a, b].find((x) => !x.ok).falha.motivo, /Capacidade da oferta esgotada/);
  const ativas = (await registros(db, "enrollments")).filter((x) => x.status === "active");
  assert.equal(ativas.length, 1, "a capacidade não é ultrapassada");
  await db.close();
});

test("o banco também barra aula inválida montada à mão (online com sala): a guarda não depende da tela", async () => {
  const { db, como } = await montar();
  const sb = cliente(como, U.owner);
  const rev = (await sb.rpc("op_snapshot")).data.revision;
  const doc = { id: "aula-x", title: "TESTE INTERNO", kind: "course", mode: "online", room_id: "sala1", status: "booked", starts_at: "2027-03-02T22:00:00.000Z", ends_at: "2027-03-02T23:00:00.000Z", participants: 1 };
  const { error } = await sb.rpc("op_apply", { p_revision: rev, p_idempotency_key: "teste-guarda", p_action: "schedule.save", p_payload: {}, p_result: null, p_changes: [{ table: "schedule_items", id: "aula-x", after: doc }] });
  assert.equal(error?.code, "22023");
  assert.equal((await registros(db, "schedule_items")).length, 0);
  await db.close();
});
