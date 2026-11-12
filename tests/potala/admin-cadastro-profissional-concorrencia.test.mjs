import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

import { createOperationsClient } from "../../outputs/js/admin/operations/client.js";
import { montarPlano } from "../../outputs/js/admin/cadastro-profissional.js";

/*
 * Concorrência real no banco (PGlite + migration de op_apply): dois administradores
 * leem a mesma revisão e tentam cadastrar o MESMO e-mail. Registra também, de forma
 * honesta, o que o banco NÃO impõe hoje (não há índice único de e-mail em perfis).
 */
const mig = (n) => readFileSync(new URL(`../../supabase/migrations/${n}`, import.meta.url), "utf8");
const OWNER = "00000000-0000-0000-0000-0000000000c1";
const ADMIN = "00000000-0000-0000-0000-0000000000c2";

async function montar() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table public.users(id uuid primary key, role text not null, active boolean not null default true, name text, email text);
    create function public.is_portal_admin() returns boolean language sql stable security definer set search_path = '' as $$
      select (select auth.uid()) is not null and exists (select 1 from public.users where id = (select auth.uid()) and role in ('owner','admin') and active = true) $$;
  `);
  await db.query("insert into public.users(id, role, name) values ($1,'owner','Owner'), ($2,'admin','Admin')", [OWNER, ADMIN]);
  await db.exec(mig("202609170001_operacao_do_instituto.sql"));
  await db.exec("grant usage on schema public, auth to authenticated; grant execute on function auth.uid() to authenticated");
  const como = async (uid, sql, params) => { await db.exec(`set test.uid = '${uid}'; set role authenticated`); try { return await db.query(sql, params); } finally { await db.exec("reset role"); } };
  const cliente = (uid) => ({
    async rpc(nome, args = {}) {
      const k = Object.keys(args);
      try {
        const r = await como(uid, `select public.${nome}(${k.map((c, i) => `${c} => $${i + 1}`).join(", ")}) as r`, k.map((c) => (args[c] !== null && typeof args[c] === "object" ? JSON.stringify(args[c]) : args[c])));
        return { data: r.rows[0].r, error: null };
      } catch (e) { return { data: null, error: { code: e.code, message: e.message } }; }
    },
  });
  return { db, cliente };
}
const comEmail = async (db, email) => (await db.query("select count(*)::int n from public.op_records where collection='profiles' and lower(btrim(document->>'email'))=$1", [email])).rows[0].n;

test("dois administradores, mesma revisão, mesmo e-mail, chaves diferentes: um grava, o outro recebe conflito (PT409) e, relendo, é recusado", async () => {
  const { db, cliente } = await montar();
  const a = createOperationsClient({ client: cliente(OWNER) });
  const b = createOperationsClient({ client: cliente(ADMIN) });
  await a.refresh(); await b.refresh();
  assert.equal(a.snapshot.revision, b.snapshot.revision, "os dois partem da mesma revisão");
  const plano = (nome) => montarPlano({ nome, email: "Mesma.Pessoa@potala.test", ativo: true }).perfil;
  const [ra, rb] = await Promise.allSettled([a.command("person.save", plano("TESTE INTERNO Pessoa A")), b.command("person.save", plano("TESTE INTERNO Pessoa B"))]);
  const ok = [ra, rb].filter((r) => r.status === "fulfilled");
  const falhou = [ra, rb].filter((r) => r.status === "rejected");
  assert.equal(ok.length, 1, "exatamente uma gravação");
  assert.equal(falhou.length, 1);
  assert.match(falhou[0].reason.message, /atualizados em outra janela/, "o banco recusa a revisão velha");
  assert.equal(await comEmail(db, "mesma.pessoa@potala.test"), 1);
  // o perdedor tenta de novo depois do conflito (o cliente já releu): recusado pelo e-mail repetido
  const perdedor = ra.status === "rejected" ? a : b;
  await assert.rejects(perdedor.command("person.save", plano("TESTE INTERNO Pessoa C")), /E-mail já cadastrado/);
  assert.equal(await comEmail(db, "mesma.pessoa@potala.test"), 1, "continua um único cadastro");
  await db.close();
});

test("repetição com o MESMO identificador devolve o resultado anterior; identificador novo com dados velhos é recusado pela revisão", async () => {
  const { db, cliente } = await montar();
  const sb = cliente(OWNER);
  const op = createOperationsClient({ client: sb });
  await op.refresh();
  await op.command("person.save", montarPlano({ nome: "TESTE INTERNO X", email: "x@potala.test", ativo: true }).perfil);
  const pedido = (await db.query("select id from public.op_requests limit 1")).rows[0].id;
  const rev = (await db.query("select revision from public.op_meta")).rows[0].revision;
  const antes = (await db.query("select count(*)::int n from public.op_records where collection='profiles'")).rows[0].n;
  const digest = (await db.query("select result from public.op_requests where id=$1", [pedido])).rows[0].result;
  // mesmo identificador + mesmo comando: resposta anterior, nada novo
  const evento = (await db.query("select document from public.op_records where collection='audit_events' limit 1")).rows[0].document;
  const repetido = await sb.rpc("op_apply", { p_revision: 0, p_idempotency_key: pedido, p_action: evento.action, p_payload: { display_name: "TESTE INTERNO X", email: "x@potala.test", phone: "", roles: ["professional"], active: true, published: false }, p_result: null, p_changes: [] });
  assert.equal(repetido.error, null);
  assert.deepEqual(repetido.data, digest);
  assert.equal((await db.query("select count(*)::int n from public.op_records where collection='profiles'")).rows[0].n, antes);
  // identificador novo com revisão velha: conflito
  const velho = await sb.rpc("op_apply", { p_revision: Number(rev) - 1, p_idempotency_key: "nova-chave-123", p_action: "person.save", p_payload: {}, p_result: null, p_changes: [] });
  assert.equal(velho.error?.code, "PT409");
  await db.close();
});

test("limite atual, registrado: o banco não impõe e-mail único — um op_apply montado à mão, na revisão atual, grava duplicado", async () => {
  const { db, cliente } = await montar();
  const sb = cliente(OWNER);
  const op = createOperationsClient({ client: sb });
  await op.refresh();
  await op.command("person.save", montarPlano({ nome: "TESTE INTERNO Y", email: "y@potala.test", ativo: true }).perfil);
  const rev = Number((await db.query("select revision from public.op_meta")).rows[0].revision);
  const doc = { id: "manual-dup", display_name: "TESTE INTERNO Y2", email: "y@potala.test", roles: ["professional"], active: true, published: false };
  const r = await sb.rpc("op_apply", { p_revision: rev, p_idempotency_key: "manual-dup-1", p_action: "person.save", p_payload: doc, p_result: null, p_changes: [{ table: "profiles", id: "manual-dup", before: null, after: doc }] });
  assert.equal(r.error, null, "sem índice único, o banco aceita (só Owner/Admin conseguem chamar)");
  assert.equal(await comEmail(db, "y@potala.test"), 2, "por isso a proposta de índice único fica registrada para autorização separada");
  await db.close();
});
