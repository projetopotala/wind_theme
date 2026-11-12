import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

import { createOperationsClient } from "../../outputs/js/admin/operations/client.js";

/*
 * GARANTIAS DO BANCO PARA INSCRIÇÕES **SEM A MIGRATION P1D** (estado de Production antes de
 * 202611120001). Não aplica a P1D de propósito: registra a linha de base. Com a P1D, os mesmos
 * casos são recusados — ver p1d-integridade-inscricoes-banco.test.mjs.
 *
 * Este arquivo DOCUMENTA o comportamento atual, inclusive o que o banco ACEITA:
 *   - motor (navegador): inscrição repetida, capacidade, lista de espera → recusa antes de enviar;
 *   - revisão (PT409): duas gravações sobre o mesmo estado → a segunda é recusada;
 *   - idempotência: a mesma chave devolve o resultado anterior, sem gravar de novo;
 *   - regra de negócio no banco para inscrições: NÃO EXISTE hoje. op_apply grava as
 *     alterações recebidas (só confere permissão, revisão, chave, coleção e id).
 * Os testes marcados "LACUNA" passam porque o banco aceita; se uma futura migration fechar a
 * lacuna, eles devem ser invertidos de propósito.
 */
const mig = (n) => readFileSync(new URL(`../../supabase/migrations/${n}`, import.meta.url), "utf8");
const OWNER = "00000000-0000-0000-0000-0000000000a1";
const COMUM = "00000000-0000-0000-0000-0000000000a3";

async function montar() {
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
  await db.query("insert into public.users(id, role, name) values ($1,'owner','owner'), ($2,'user','comum')", [OWNER, COMUM]);
  await db.exec(mig("202609170001_operacao_do_instituto.sql"));
  await db.exec(mig("202610230001_restore_operational_guard.sql"));
  await db.exec("grant usage on schema public, auth to authenticated; grant execute on function auth.uid() to authenticated");
  const doc = (col, id, d) => db.query("insert into public.op_records(collection, id, document) values ($1,$2,$3::jsonb)", [col, id, JSON.stringify({ id, ...d })]);
  await doc("profiles", "al-1", { display_name: "TESTE INTERNO Aluno 1", email: "a1@potala.test", roles: ["student"], active: true });
  await doc("profiles", "al-2", { display_name: "TESTE INTERNO Aluno 2", email: "a2@potala.test", roles: ["student"], active: true });
  await doc("profiles", "al-3", { display_name: "TESTE INTERNO Aluno 3", email: "a3@potala.test", roles: ["student"], active: true });
  await doc("activity_definitions", "def", { title: "TESTE INTERNO Curso", kind: "course" });
  await doc("activity_offerings", "turma", { title: "Turma de 1 vaga", definition_id: "def", mode: "online", capacity: 1 });
  const como = async (uid, sql, params) => { await db.exec(`set test.uid = '${uid || ""}'; set role authenticated`); try { return await db.query(sql, params); } finally { await db.exec("reset role"); } };
  /* op_apply cru: exatamente o que um cliente qualquer pode enviar. */
  const aplicar = async (uid, { revision, key, action = "enrollment.save", payload = {}, changes }) => {
    try {
      const r = await como(uid, "select public.op_apply($1,$2,$3,$4::jsonb,null,$5::jsonb) as r", [revision, key, action, JSON.stringify(payload), JSON.stringify(changes)]);
      return { ok: true, data: r.rows[0].r };
    } catch (e) { return { ok: false, code: e.code, message: e.message }; }
  };
  const revisao = async () => (await db.query("select revision from public.op_meta where id = 1")).rows[0].revision;
  const inscricoes = async () => (await db.query("select document from public.op_records where collection='enrollments' order by ordem")).rows.map((r) => r.document);
  const sb = (uid) => ({ async rpc(nome, args = {}) {
    const k = Object.keys(args);
    try {
      const r = await como(uid, `select public.${nome}(${k.map((x, i) => `${x} => $${i + 1}`).join(", ")}) as r`, k.map((x) => (args[x] !== null && typeof args[x] === "object" ? JSON.stringify(args[x]) : args[x])));
      return { data: r.rows[0].r, error: null };
    } catch (e) { return { data: null, error: { code: e.code, message: e.message } }; }
  } });
  return { db, aplicar, revisao, inscricoes, sb };
}
const insc = (id, profile, status = "active", offering = "turma") => ({ table: "enrollments", id, after: { id, profile_id: profile, offering_id: offering, status } });

test("1. turma com vaga: a inscrição é gravada (motor + op_apply)", async () => {
  const t = await montar();
  const op = createOperationsClient({ client: t.sb(OWNER) });
  await op.refresh();
  await op.command("enrollment.save", { profile_id: "al-1", offering_id: "turma", status: "active" });
  assert.equal((await t.inscricoes()).length, 1);
  await t.db.close();
});

test("2. mesmo aluno duas vezes: idempotência (mesma chave), motor (nova chave) e LACUNA no banco (alteração montada à mão)", async () => {
  const t = await montar();
  const rev = Number(await t.revisao());
  const primeira = await t.aplicar(OWNER, { revision: rev, key: "chave-1", changes: [insc("e1", "al-1")] });
  assert.equal(primeira.ok, true);
  /* Idempotência: mesma chave e mesmo comando → devolve o resultado anterior, nada novo. */
  const repetida = await t.aplicar(OWNER, { revision: rev, key: "chave-1", changes: [insc("e1-bis", "al-1")] });
  assert.equal(repetida.ok, true);
  assert.equal((await t.inscricoes()).length, 1, "a chave repetida não grava as novas alterações");
  /* Motor: o cliente oficial recusa antes de enviar. */
  const op = createOperationsClient({ client: t.sb(OWNER) });
  await op.refresh();
  await assert.rejects(op.command("enrollment.save", { profile_id: "al-1", offering_id: "turma", status: "waitlist" }), /já possui inscrição/);
  /* LACUNA: nova chave, revisão atual, alteração montada à mão → o banco grava a duplicata. */
  const manual = await t.aplicar(OWNER, { revision: Number(await t.revisao()), key: "chave-2", changes: [insc("e2", "al-1")] });
  assert.equal(manual.ok, true, "LACUNA: o banco não impede inscrição repetida");
  assert.equal((await t.inscricoes()).filter((x) => x.profile_id === "al-1").length, 2);
  await t.db.close();
});

test("3. turma lotada: o motor recusa; LACUNA: alteração montada à mão com revisão atual excede a capacidade", async () => {
  const t = await montar();
  const op = createOperationsClient({ client: t.sb(OWNER) });
  await op.refresh();
  await op.command("enrollment.save", { profile_id: "al-1", offering_id: "turma", status: "active" });
  await assert.rejects(op.command("enrollment.save", { profile_id: "al-2", offering_id: "turma", status: "active" }), /Capacidade da oferta esgotada/);
  assert.equal((await t.inscricoes()).length, 1, "pelo cliente oficial, nada foi enviado");
  const manual = await t.aplicar(OWNER, { revision: Number(await t.revisao()), key: "exceder", changes: [insc("e2", "al-2")] });
  assert.equal(manual.ok, true, "LACUNA: o banco não confere capacidade");
  assert.equal((await t.inscricoes()).filter((x) => x.status === "active").length, 2, "turma de 1 vaga com 2 ativas");
  await t.db.close();
});

test("4. duas operações concorrentes pela última vaga: a revisão (PT409) barra a segunda; ao refazer, o motor recusa por capacidade", async () => {
  const t = await montar();
  const rev = Number(await t.revisao());
  /* Duas gravações montadas sobre o MESMO estado (revisão igual): a trava de op_meta põe em fila e a segunda vê revisão nova. */
  const [a, b] = await Promise.all([
    t.aplicar(OWNER, { revision: rev, key: "janela-a", changes: [insc("ea", "al-1")] }),
    t.aplicar(OWNER, { revision: rev, key: "janela-b", changes: [insc("eb", "al-2")] }),
  ]);
  assert.deepEqual([a.ok, b.ok].sort(), [false, true]);
  assert.equal([a, b].find((x) => !x.ok).code, "PT409", "recusa por REVISÃO, não por capacidade");
  assert.equal((await t.inscricoes()).length, 1);
  /* O cliente oficial, depois do PT409, relê e recalcula: agora é o motor que recusa pela capacidade. */
  const op = createOperationsClient({ client: t.sb(OWNER) });
  await op.refresh();
  await assert.rejects(op.command("enrollment.save", { profile_id: "al-2", offering_id: "turma", status: "active" }), /Capacidade da oferta esgotada/);
  await t.db.close();
});

test("5. revisão atualizada tentando exceder a capacidade: o banco aceita (a revisão protege a ordem, não a capacidade)", async () => {
  const t = await montar();
  assert.equal((await t.aplicar(OWNER, { revision: Number(await t.revisao()), key: "chave-k1", changes: [insc("e1", "al-1")] })).ok, true);
  const segunda = await t.aplicar(OWNER, { revision: Number(await t.revisao()), key: "chave-k2", changes: [insc("e2", "al-2"), insc("e3", "al-3")] });
  assert.equal(segunda.ok, true, "LACUNA: revisão em dia basta para gravar acima da capacidade");
  assert.equal((await t.inscricoes()).length, 3);
  await t.db.close();
});

test("6. lista de espera: aceita mesmo com a turma cheia (motor e banco), sem ocupar vaga", async () => {
  const t = await montar();
  const op = createOperationsClient({ client: t.sb(OWNER) });
  await op.refresh();
  await op.command("enrollment.save", { profile_id: "al-1", offering_id: "turma", status: "active" });
  const espera = await op.command("enrollment.save", { profile_id: "al-2", offering_id: "turma", status: "waitlist" });
  assert.equal(espera.status, "waitlist");
  assert.equal((await t.inscricoes()).filter((x) => x.status === "active").length, 1);
  await t.db.close();
});

test("7. lista de espera → ativa sem vaga: o motor recusa; LACUNA: alteração manual converte", async () => {
  const t = await montar();
  const op = createOperationsClient({ client: t.sb(OWNER) });
  await op.refresh();
  await op.command("enrollment.save", { profile_id: "al-1", offering_id: "turma", status: "active" });
  const espera = await op.command("enrollment.save", { profile_id: "al-2", offering_id: "turma", status: "waitlist" });
  await assert.rejects(op.command("enrollment.save", { id: espera.id, profile_id: "al-2", offering_id: "turma", status: "active" }), /Capacidade da oferta esgotada/);
  const manual = await t.aplicar(OWNER, { revision: Number(await t.revisao()), key: "promover", changes: [insc(espera.id, "al-2", "active")] });
  assert.equal(manual.ok, true, "LACUNA: o banco não confere a vaga ao promover");
  await t.db.close();
});

test("8. alterações manipuladas: o banco confere permissão, coleção, id e revisão — não o conteúdo nem a coerência com a ação", async () => {
  const t = await montar();
  const rev = () => t.revisao().then(Number);
  /* Barreiras que EXISTEM no banco: */
  assert.equal((await t.aplicar(COMUM, { revision: await rev(), key: "intruso", changes: [insc("x", "al-1")] })).code, "42501", "conta sem administração");
  assert.equal((await t.aplicar(OWNER, { revision: await rev(), key: "auditoria", changes: [{ table: "audit_events", id: "a", after: { id: "a" } }] })).code, "22023", "auditoria não é gravável");
  assert.equal((await t.aplicar(OWNER, { revision: await rev(), key: "id-trocado", changes: [{ table: "enrollments", id: "e1", after: { id: "outro" } }] })).code, "22023", "id do documento diferente da chave");
  assert.equal((await t.aplicar(OWNER, { revision: await rev() - 1, key: "velha", changes: [insc("x", "al-1")] })).code, "PT409", "revisão antiga");
  assert.equal((await t.aplicar(OWNER, { revision: await rev(), key: "chave-c1", payload: {}, changes: [insc("ok", "al-1")] })).ok, true);
  assert.equal((await t.aplicar(OWNER, { revision: await rev(), key: "chave-c1", payload: { outro: true }, changes: [] })).code, "22023", "mesma chave para outro comando");
  /* LACUNAS: o conteúdo é aceito como veio. */
  const fantasma = await t.aplicar(OWNER, { revision: await rev(), key: "fantasma", changes: [insc("f1", "pessoa-inexistente", "active", "turma-inexistente")] });
  assert.equal(fantasma.ok, true, "LACUNA: pessoa e turma inexistentes");
  const status = await t.aplicar(OWNER, { revision: await rev(), key: "status", changes: [insc("f2", "al-3", "qualquer-coisa")] });
  assert.equal(status.ok, true, "LACUNA: situação fora da lista");
  const desvio = await t.aplicar(OWNER, { revision: await rev(), key: "desvio", action: "enrollment.save", changes: [{ table: "profiles", id: "al-3", after: { id: "al-3", display_name: "x", roles: ["professional"], active: true } }] });
  assert.equal(desvio.ok, true, "LACUNA: a ação declarada não limita as coleções alteradas (papéis operacionais apenas; papéis de portal ficam em public.users, fora daqui)");
  assert.equal((await t.db.query("select role from public.users where id = $1", [COMUM])).rows[0].role, "user", "nenhum papel de portal muda por op_apply");
  await t.db.close();
});
