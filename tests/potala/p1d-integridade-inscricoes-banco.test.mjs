import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

import { createOperationsClient } from "../../outputs/js/admin/operations/client.js";
import { ESTADO_INICIAL, executarPlano, idsPorColecao, montarPlanoCurso } from "../../outputs/js/admin/organizar-curso.js";

/*
 * P1D | Integridade das inscrições NO BANCO (migration 202611120001), com as migrations reais:
 * operação, guarda, Meu Potala (my_course_enrollments) e a P1D. As chamadas vão direto a op_apply,
 * sem o motor do navegador, salvo onde o teste diz que usa o cliente oficial (compatibilidade).
 * Só auth.users/auth.uid() e public.users são simulados. Dados sintéticos "TESTE INTERNO".
 */
const mig = (n) => readFileSync(new URL(`../../supabase/migrations/${n}`, import.meta.url), "utf8");
const P1D = "202611120001_integridade_inscricoes.sql";
const ROLLBACK = readFileSync(new URL("../../supabase/rollbacks/202611120001_rollback_integridade_inscricoes.sql", import.meta.url), "utf8");
const U = {
  owner: "00000000-0000-0000-0000-0000000000a1", editor: "00000000-0000-0000-0000-0000000000a2", comum: "00000000-0000-0000-0000-0000000000a3",
  aluno: "00000000-0000-0000-0000-0000000000c1",
};

async function montar({ comP1D = true, antes } = {}) {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz default now(), deleted_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table public.users(id uuid primary key, role text not null, active boolean not null default true, name text, email text);
    create table public.appointment_profile_accounts(user_id uuid primary key, profile_id text not null unique, active boolean not null default true, updated_at timestamptz);
    create function public.is_portal_admin() returns boolean language sql stable security definer set search_path = '' as $$
      select (select auth.uid()) is not null and exists (select 1 from public.users where id = (select auth.uid()) and role in ('owner','admin') and active = true) $$;
  `);
  for (const [k, papel, email] of [["owner", "owner", "owner@potala.test"], ["editor", "blog_editor", "editor@potala.test"], ["comum", "user", "comum@potala.test"], ["aluno", "user", "aluno1@potala.test"]]) {
    await db.query("insert into auth.users(id, email) values ($1,$2)", [U[k], email]);
    await db.query("insert into public.users(id, role, name, email) values ($1,$2,$3,$4)", [U[k], papel, k, email]);
  }
  await db.exec(mig("202609170001_operacao_do_instituto.sql"));
  await db.exec(mig("202610230001_restore_operational_guard.sql"));
  await db.exec(mig("202611110001_my_course_enrollments.sql"));
  await db.exec(mig("202611110002_my_course_enrollments_online_link.sql"));
  await db.exec("grant usage on schema public, auth to authenticated; grant execute on function auth.uid() to authenticated");
  const doc = (col, id, d) => db.query("insert into public.op_records(collection, id, document) values ($1,$2,$3::jsonb)", [col, id, JSON.stringify({ id, ...d })]);
  for (const n of [1, 2, 3, 4]) await doc("profiles", `al-${n}`, { display_name: `TESTE INTERNO Aluno ${n}`, email: `aluno${n}@potala.test`, roles: ["student"], active: true });
  await doc("profiles", "prof", { display_name: "TESTE INTERNO Professora", email: "prof@potala.test", roles: ["professional"], active: true });
  await doc("activity_definitions", "def", { title: "TESTE INTERNO Curso", kind: "course" });
  await doc("activity_offerings", "turma", { title: "Turma de 2 vagas", definition_id: "def", professional_id: "prof", mode: "online", capacity: 2 });
  await doc("activity_offerings", "livre", { title: "Turma sem limite", definition_id: "def", mode: "online", capacity: null });
  if (antes) await antes(db, doc);
  if (comP1D) await db.exec(mig(P1D));
  const como = async (uid, sql, params) => { await db.exec(`set test.uid = '${uid || ""}'; set role authenticated`); try { return await db.query(sql, params); } finally { await db.exec("reset role"); } };
  const rev = async () => Number((await db.query("select revision from public.op_meta where id = 1")).rows[0].revision);
  let n = 0;
  /* op_apply cru, como qualquer cliente poderia chamar. Revisão atual por padrão. */
  const aplicar = async ({ uid = U.owner, revision, key = `chave-${++n}`, action = "enrollment.save", changes }) => {
    try {
      const r = await como(uid, "select public.op_apply($1,$2,$3,'{}'::jsonb,null,$4::jsonb) as r", [revision ?? await rev(), key, action, JSON.stringify(changes)]);
      return { ok: true, data: r.rows[0].r };
    } catch (e) { return { ok: false, code: e.code, message: e.message }; }
  };
  const inscricoes = async () => (await db.query("select document from public.op_records where collection='enrollments' order by ordem")).rows.map((r) => r.document);
  const sb = (uid) => ({ async rpc(nome, args = {}) {
    const k = Object.keys(args);
    try {
      const r = await como(uid, `select public.${nome}(${k.map((x, i) => `${x} => $${i + 1}`).join(", ")}) as r`, k.map((x) => (args[x] !== null && typeof args[x] === "object" ? JSON.stringify(args[x]) : args[x])));
      return { data: r.rows[0].r, error: null };
    } catch (e) { return { data: null, error: { code: e.code, message: e.message } }; }
  } });
  return { db, doc, como, aplicar, rev, inscricoes, sb };
}
const insc = (id, profile, status = "active", offering = "turma") => ({ table: "enrollments", id, after: { id, profile_id: profile, offering_id: offering, status } });
const ocupadas = (lista, turma = "turma") => lista.filter((x) => x.offering_id === turma && ["active", "completed"].includes(x.status)).length;

test("1. inscrição válida é gravada; turma sem limite aceita quantas forem", async () => {
  const t = await montar();
  assert.equal((await t.aplicar({ changes: [insc("e1", "al-1")] })).ok, true);
  for (const k of [1, 2, 3, 4]) assert.equal((await t.aplicar({ changes: [insc(`l${k}`, `al-${k}`, "active", "livre")] })).ok, true);
  assert.equal(ocupadas(await t.inscricoes(), "livre"), 4);
  await t.db.close();
});

test("2. inscrição duplicada (pessoa + turma) é recusada em qualquer situação; reinscrição é a edição da mesma inscrição", async () => {
  const t = await montar();
  assert.equal((await t.aplicar({ changes: [insc("e1", "al-1")] })).ok, true);
  for (const s of ["active", "waitlist", "cancelled"]) {
    const r = await t.aplicar({ changes: [insc(`dup-${s}`, "al-1", s)] });
    assert.equal(r.code, "23505", `duplicata (${s}) recusada pelo índice`);
  }
  /* Cancelar e reinscrever: a mesma linha muda de situação (como o motor faz). */
  assert.equal((await t.aplicar({ changes: [insc("e1", "al-1", "cancelled")] })).ok, true);
  assert.equal((await t.aplicar({ changes: [insc("e1", "al-1", "active")] })).ok, true, "reinscrição pela edição é permitida");
  assert.equal((await t.inscricoes()).length, 1);
  await t.db.close();
});

test("3. turma lotada: inscrição ativa ou concluída é recusada; cancelamento libera a vaga", async () => {
  const t = await montar();
  assert.equal((await t.aplicar({ changes: [insc("e1", "al-1"), insc("e2", "al-2")] })).ok, true);
  const lotada = await t.aplicar({ changes: [insc("e3", "al-3")] });
  assert.equal(lotada.code, "23514");
  assert.match(lotada.message, /Capacidade da turma esgotada/);
  assert.equal((await t.aplicar({ changes: [insc("e3", "al-3", "completed")] })).code, "23514", "concluída também ocupa vaga");
  /* Lote com 3 de uma vez, numa turma de 2: a operação inteira é desfeita. */
  const t2 = await montar();
  assert.equal((await t2.aplicar({ changes: [insc("a", "al-1"), insc("b", "al-2"), insc("c", "al-3")] })).code, "23514");
  assert.equal((await t2.inscricoes()).length, 0, "nada gravado: op_apply é atômico");
  await t2.db.close();
  /* Cancelamento libera; a vaga pode ser ocupada por outra pessoa. */
  assert.equal((await t.aplicar({ changes: [insc("e1", "al-1", "cancelled")] })).ok, true);
  assert.equal((await t.aplicar({ changes: [insc("e3", "al-3")] })).ok, true);
  /* Reativar a cancelada agora excederia: recusado. */
  assert.equal((await t.aplicar({ changes: [insc("e1", "al-1", "active")] })).code, "23514");
  assert.equal(ocupadas(await t.inscricoes()), 2);
  await t.db.close();
});

test("4. última vaga com revisão atualizada a cada pedido (sem PT409): só a primeira grava", async () => {
  const t = await montar();
  assert.equal((await t.aplicar({ changes: [insc("e1", "al-1")] })).ok, true);
  /* Cada pedido usa a revisão em dia: a revisão NÃO barra; quem barra é a regra de capacidade. */
  const a = await t.aplicar({ changes: [insc("e2", "al-2")] });
  const b = await t.aplicar({ changes: [insc("e3", "al-3")] });
  assert.equal(a.ok, true);
  assert.equal(b.code, "23514");
  assert.equal(ocupadas(await t.inscricoes()), 2);
  await t.db.close();
});

test("5 e 6. lista de espera aceita com a turma cheia; promoção só com vaga", async () => {
  const t = await montar();
  assert.equal((await t.aplicar({ changes: [insc("e1", "al-1"), insc("e2", "al-2")] })).ok, true);
  assert.equal((await t.aplicar({ changes: [insc("w3", "al-3", "waitlist"), insc("w4", "al-4", "waitlist")] })).ok, true, "espera não ocupa vaga");
  assert.equal((await t.aplicar({ changes: [insc("w3", "al-3", "active")] })).code, "23514", "promoção sem vaga");
  assert.equal((await t.aplicar({ changes: [insc("e2", "al-2", "cancelled")] })).ok, true);
  assert.equal((await t.aplicar({ changes: [insc("w3", "al-3", "active")] })).ok, true, "promoção com vaga");
  assert.equal((await t.aplicar({ changes: [insc("w4", "al-4", "active")] })).code, "23514", "segunda promoção: vaga já tomada");
  await t.db.close();
});

test("6b. troca de turma e redução de capacidade respeitam as vagas", async () => {
  const t = await montar();
  assert.equal((await t.aplicar({ changes: [insc("e1", "al-1"), insc("e2", "al-2")] })).ok, true);
  assert.equal((await t.aplicar({ changes: [insc("x", "al-3", "active", "livre")] })).ok, true);
  assert.equal((await t.aplicar({ changes: [insc("x", "al-3", "active", "turma")] })).code, "23514", "mudar para turma cheia");
  const turma = (cap) => ({ table: "activity_offerings", id: "turma", after: { id: "turma", title: "Turma de 2 vagas", definition_id: "def", professional_id: "prof", mode: "online", capacity: cap } });
  const reduz = await t.aplicar({ action: "offering.save", changes: [turma(1)] });
  assert.equal(reduz.code, "23514", "capacidade abaixo das vagas ocupadas");
  assert.match(reduz.message, /Capacidade inferior/);
  assert.equal((await t.aplicar({ action: "offering.save", changes: [turma(3)] })).ok, true, "aumentar é permitido");
  assert.equal((await t.aplicar({ action: "offering.save", changes: [turma(null)] })).ok, true, "sem limite é permitido");
  assert.equal((await t.aplicar({ action: "offering.save", changes: [turma(0)] })).code, "22023", "capacidade 0 é inválida");
  assert.equal((await t.aplicar({ action: "offering.save", changes: [turma("5")] })).code, "22023", "capacidade em texto é inválida");
  await t.db.close();
});

test("7. referência inexistente ou identificador inválido é recusado", async () => {
  const t = await montar();
  assert.equal((await t.aplicar({ changes: [insc("e1", "pessoa-fantasma")] })).code, "23503");
  assert.equal((await t.aplicar({ changes: [insc("e1", "al-1", "active", "turma-fantasma")] })).code, "23503");
  assert.equal((await t.aplicar({ changes: [insc("e1", "", "active")] })).code, "22023");
  assert.equal((await t.aplicar({ changes: [insc("e1", " al-1", "active")] })).code, "22023", "espaços no identificador");
  assert.equal((await t.aplicar({ changes: [{ table: "enrollments", id: "e1", after: { id: "e1", profile_id: 7, offering_id: "turma", status: "active" } }] })).code, "22023", "id numérico");
  assert.equal((await t.aplicar({ changes: [{ table: "enrollments", id: "e1", after: { id: "e1", offering_id: "turma", status: "active" } }] })).code, "22023", "sem pessoa");
  /* Remoções que deixariam inscrição órfã. */
  assert.equal((await t.aplicar({ changes: [insc("e1", "al-1")] })).ok, true);
  assert.equal((await t.aplicar({ action: "person.save", changes: [{ table: "profiles", id: "al-1", after: null }] })).code, "23503");
  assert.equal((await t.aplicar({ action: "offering.save", changes: [{ table: "activity_offerings", id: "turma", after: null }] })).code, "23503");
  assert.equal((await t.inscricoes()).length, 1);
  await t.db.close();
});

test("8. situação inválida é recusada; as quatro situações do sistema e suas transições são aceitas", async () => {
  const t = await montar();
  for (const s of ["pendente", "ACTIVE", "", null]) {
    assert.equal((await t.aplicar({ changes: [insc("e1", "al-1", s)] })).code, "22023", `situação ${JSON.stringify(s)}`);
  }
  assert.equal((await t.aplicar({ changes: [{ table: "enrollments", id: "e1", after: { id: "e1", profile_id: "al-1", offering_id: "turma" } }] })).code, "22023", "sem situação");
  for (const s of ["waitlist", "active", "completed", "cancelled", "active", "waitlist"]) {
    assert.equal((await t.aplicar({ changes: [insc("e1", "al-1", s)] })).ok, true, `transição para ${s}`);
  }
  await t.db.close();
});

test("9 e 10. revisão antiga (PT409) e operação repetida (idempotência) continuam como antes", async () => {
  const t = await montar();
  const r0 = await t.rev();
  assert.equal((await t.aplicar({ key: "mesma-chave", changes: [insc("e1", "al-1")] })).ok, true);
  const repetida = await t.aplicar({ key: "mesma-chave", revision: r0, changes: [insc("e1", "al-1")] });
  assert.equal(repetida.ok, true, "repetição devolve o resultado anterior");
  assert.equal((await t.inscricoes()).length, 1);
  assert.equal((await t.aplicar({ revision: r0, changes: [insc("e2", "al-2")] })).code, "PT409");
  assert.equal((await t.aplicar({ key: "mesma-chave", action: "enrollment.save", changes: [insc("e9", "al-3")] })).ok, true, "mesma chave e mesmo comando: resultado anterior, nada novo");
  assert.equal((await t.inscricoes()).length, 1);
  await t.db.close();
});

test("11. operação fora do escopo declarado é recusada e desfeita por inteiro", async () => {
  const t = await montar();
  const outraAcao = await t.aplicar({ action: "person.save", changes: [insc("e1", "al-1")] });
  assert.equal(outraAcao.code, "22023");
  assert.match(outraAcao.message, /fora do escopo/);
  const desvio = await t.aplicar({ action: "enrollment.save", changes: [insc("e1", "al-1"), { table: "profiles", id: "al-2", after: { id: "al-2", display_name: "x", roles: ["professional"], active: true } }] });
  assert.equal(desvio.code, "22023");
  assert.equal((await t.inscricoes()).length, 0, "a inscrição do mesmo pedido também foi desfeita");
  const perfil = (await t.db.query("select document from public.op_records where collection='profiles' and id='al-2'")).rows[0].document;
  assert.deepEqual(perfil.roles, ["student"], "o papel não mudou");
  assert.equal((await t.aplicar({ action: "schedule.save", changes: [{ table: "activity_offerings", id: "turma", after: { id: "turma", title: "x", definition_id: "def", capacity: 9 } }] })).code, "22023");
  assert.equal((await t.aplicar({ action: "offering.save", changes: [{ table: "activity_offerings", id: "nova", after: { id: "nova", title: "Nova", definition_id: "def", capacity: 5 } }, { table: "rooms", id: "s", after: { id: "s", code: "S", name: "S", status: "unconfirmed" } }] })).code, "22023");
  /* Ações legítimas que não tocam inscrições/turmas seguem iguais. */
  assert.equal((await t.aplicar({ action: "person.save", changes: [{ table: "profiles", id: "al-9", after: { id: "al-9", display_name: "TESTE INTERNO Nova", email: "", roles: ["client"], active: true } }] })).ok, true);
  assert.equal((await t.aplicar({ action: "definition.save", changes: [{ table: "activity_definitions", id: "def2", after: { id: "def2", title: "TESTE INTERNO Oficina", kind: "workshop" } }] })).ok, true);
  await t.db.close();
});

test("12, 13 e 14. conta comum e Writer/Editor do Blog não gravam; o Owner continua gravando; nenhum papel muda", async () => {
  const t = await montar();
  const papeis = (await t.db.query("select id, role, active from public.users order by id")).rows;
  assert.equal((await t.aplicar({ uid: U.comum, changes: [insc("e1", "al-1")] })).code, "42501");
  assert.equal((await t.aplicar({ uid: U.editor, changes: [insc("e1", "al-1")] })).code, "42501");
  assert.equal((await t.aplicar({ uid: null, changes: [insc("e1", "al-1")] })).code, "42501", "sem sessão");
  assert.equal((await t.aplicar({ uid: U.owner, changes: [insc("e1", "al-1")] })).ok, true);
  for (const quem of [U.comum, U.editor]) {
    await assert.rejects(t.como(quem, "select count(*) from public.op_records"), /permission denied/, "tabela continua sem leitura direta");
    await assert.rejects(t.como(quem, "select public.op_turma_capacidade('{}'::jsonb)"), /permission denied/, "funções da P1D não são chamáveis");
  }
  assert.deepEqual((await t.db.query("select id, role, active from public.users order by id")).rows, papeis);
  await t.db.close();
});

test("15. P1C: o assistente grava curso, turma, aula e inscrições com a P1D instalada; lotação e repetição viram recusas do banco", async () => {
  const t = await montar();
  const op = createOperationsClient({ client: t.sb(U.owner) });
  await op.refresh();
  const e = ESTADO_INICIAL();
  e.curso = { modo: "novo", titulo: "TESTE INTERNO Respiração" };
  e.turma = { modo: "nova", titulo: "Turma P1D", modalidade: "online", capacidade: "2" };
  e.professor = { id: "prof", semProfessor: false };
  e.aulas = [{ chave: "a1", data: "2027-03-02", inicio: "19:00", fim: "20:30", modo: "online", salaId: "", link: "https://reuniao.exemplo/p1d", repetirAte: "" }];
  e.inscricoes = [{ perfilId: "al-1", status: "active" }, { perfilId: "al-2", status: "active" }, { perfilId: "al-3", status: "waitlist" }];
  const r = await executarPlano({ operations: op, passos: montarPlanoCurso(e, op.snapshot), idsAntes: idsPorColecao(op.snapshot) });
  assert.equal(r.ok, true, r.falha?.motivo);
  const daTurma = (await t.inscricoes()).filter((x) => x.offering_id === r.refs.turma);
  assert.deepEqual(daTurma.map((x) => x.status).sort(), ["active", "active", "waitlist"]);
  /* O cliente oficial com estado antigo (outra janela inscreveu antes): o motor ainda não sabe, o banco recusa. */
  const antigo = createOperationsClient({ client: t.sb(U.owner) });
  await antigo.refresh();
  await t.aplicar({ changes: [insc("w", "al-3", "waitlist", r.refs.turma)] }).then((x) => assert.equal(x.code, "23505", "a pessoa já está na espera: duplicata recusada"));
  await t.db.close();
});

test("16. Meu Potala: my_course_enrollments continua igual (curso, professor, próxima aula e link)", async () => {
  const t = await montar();
  assert.equal((await t.aplicar({ changes: [insc("e1", "al-1")] })).ok, true);
  assert.equal((await t.aplicar({ action: "schedule.save", changes: [{ table: "schedule_items", id: "aula", after: { id: "aula", title: "Aula", kind: "course", offering_id: "turma", mode: "online", room_id: null, status: "booked", starts_at: "2027-03-02T22:00:00.000Z", ends_at: "2027-03-02T23:30:00.000Z", participants: 2, online_url: "https://reuniao.exemplo/turma" } }] })).ok, true);
  const [meu] = (await t.como(U.aluno, "select public.my_course_enrollments() as r")).rows[0].r;
  assert.equal(meu.course_title, "Turma de 2 vagas");
  assert.equal(meu.teacher_name, "TESTE INTERNO Professora");
  assert.equal(meu.join_url, "https://reuniao.exemplo/turma");
  assert.equal((await t.como(U.comum, "select public.my_course_enrollments() as r")).rows[0].r.length, 0, "isolamento entre contas");
  await t.db.close();
});

test("migration: recusa dados incompatíveis sem alterar nada; reaplicar é seguro; o rollback remove só o que criou", async () => {
  /* Duplicata preexistente: a P1D não aplica e nada é criado. */
  const ruim = await montar({ comP1D: false, antes: async (db, doc) => {
    await doc("enrollments", "d1", { profile_id: "al-1", offering_id: "turma", status: "active" });
    await doc("enrollments", "d2", { profile_id: "al-1", offering_id: "turma", status: "waitlist" });
    await doc("enrollments", "d3", { profile_id: "al-2", offering_id: "turma", status: "pendente" });
  } });
  await assert.rejects(ruim.db.exec(mig(P1D)), /P1D recusada: dados incompatíveis \(inscrições repetidas=1, situação inválida=1/);
  await ruim.db.exec("rollback");
  assert.equal((await ruim.db.query("select count(*)::int n from pg_trigger where tgname like 'op_records_%enrollment%' or tgname = 'op_records_validate_scope'")).rows[0].n, 0);
  assert.equal((await ruim.db.query("select to_regclass('public.op_records_enrollment_pessoa_turma') is null as ok")).rows[0].ok, true);
  assert.equal((await ruim.db.query("select count(*)::int n from public.op_records where collection='enrollments'")).rows[0].n, 3, "nenhum registro alterado");
  await ruim.db.close();
  /* Identificadores e situação: as pré-condições usam exatamente as regras do gatilho, e o preflight acusa o mesmo. */
  for (const [nome, documento, contador] of [
    ["espaço nas pontas", { profile_id: " al-1", offering_id: "turma", status: "active" }, "identificadores inválidos=1"],
    ["identificador longo", { profile_id: "al-1", offering_id: "t".repeat(161), status: "active" }, "identificadores inválidos=1"],
    ["situação não textual", { profile_id: "al-1", offering_id: "turma", status: ["active"] }, "situação inválida=1"],
  ]) {
    const caso = await montar({ comP1D: false, antes: async (db, doc) => { await doc("enrollments", "q1", documento); } });
    await assert.rejects(caso.db.exec(mig(P1D)), (erro) => erro.message.includes(contador), nome);
    await caso.db.exec("rollback");
    const pre = (await caso.db.query(readFileSync(new URL("../../supabase/ops/p1d-preflight-inscricoes.sql", import.meta.url), "utf8"))).rows[0].p1d.bloqueia_aplicacao;
    assert.equal(nome === "situação não textual" ? Number(pre.situacao_invalida) : Number(pre.identificador_invalido), 1, `o preflight acusa: ${nome}`);
    await caso.db.close();
  }
  /* Turma acima da capacidade também bloqueia. */
  const lotada = await montar({ comP1D: false, antes: async (db, doc) => {
    for (const k of [1, 2, 3]) await doc("enrollments", `x${k}`, { profile_id: `al-${k}`, offering_id: "turma", status: "active" });
  } });
  await assert.rejects(lotada.db.exec(mig(P1D)), /turmas acima da capacidade=1/);
  await lotada.db.exec("rollback");
  await lotada.db.close();
  /* Aplicação normal, reaplicação e reversão. */
  const t = await montar();
  assert.equal((await t.aplicar({ changes: [insc("e1", "al-1")] })).ok, true);
  await t.db.exec(mig(P1D));
  assert.equal((await t.aplicar({ changes: [insc("dup", "al-1")] })).code, "23505", "continua protegido após reaplicar");
  const antes = (await t.db.query("select collection, id, document from public.op_records order by collection, id")).rows;
  await t.db.exec(ROLLBACK);
  assert.deepEqual((await t.db.query("select collection, id, document from public.op_records order by collection, id")).rows, antes, "rollback não toca em dados");
  assert.equal((await t.db.query("select count(*)::int n from pg_proc where proname in ('validate_op_enrollment','validate_op_scope','op_turma_capacidade')")).rows[0].n, 0);
  assert.equal((await t.aplicar({ changes: [insc("dup", "al-1")] })).ok, true, "sem a P1D, a duplicata volta a passar (estado anterior)");
  await t.db.exec(`delete from public.op_records where collection = 'enrollments' and id = 'dup'`);
  await t.db.exec(mig(P1D));
  assert.equal((await t.aplicar({ changes: [insc("dup", "al-1")] })).code, "23505", "reaplicada depois do rollback");
  await t.db.close();
});

test("mensagens: a duplicata recusada pelo índice aparece em português no painel", async () => {
  const { traduzirErro } = await import("../../outputs/js/admin/operations/client.js");
  const t = await montar();
  assert.equal((await t.aplicar({ changes: [insc("e1", "al-1")] })).ok, true);
  const r = await t.aplicar({ changes: [insc("e2", "al-1", "waitlist")] });
  assert.equal(traduzirErro({ code: r.code, message: r.message }).message, "Esta pessoa já tem inscrição nesta turma; edite a inscrição existente.");
  const lotada = await t.aplicar({ changes: [insc("e3", "al-2"), insc("e4", "al-3")] });
  assert.equal(traduzirErro({ code: lotada.code, message: lotada.message }).message, "Capacidade da turma esgotada.");
  await t.db.close();
});
