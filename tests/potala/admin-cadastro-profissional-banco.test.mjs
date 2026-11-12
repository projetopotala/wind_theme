import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

import { createOperationsClient } from "../../outputs/js/admin/operations/client.js";
import {
  analisarConta, confirmarGravacao, montarPlano, nadaMuda, verificarDuplicidade,
} from "../../outputs/js/admin/cadastro-profissional.js";

/*
 * P1B contra o BANCO REAL (PGlite com as migrations de verdade): op_snapshot/op_apply,
 * admin_list_accounts, admin_list_professional_profiles e admin_link_professional,
 * dirigidos pelo cliente de operação e pelas regras do cadastro guiado.
 * Só os objetos do Supabase Auth são simulados (auth.users e auth.uid()).
 */
const mig = (n) => readFileSync(new URL(`../../supabase/migrations/${n}`, import.meta.url), "utf8");
const U = {
  owner: "00000000-0000-0000-0000-0000000000a1", editor: "00000000-0000-0000-0000-0000000000a2", comum: "00000000-0000-0000-0000-0000000000a3",
  carla: "00000000-0000-0000-0000-0000000000b1", ana: "00000000-0000-0000-0000-0000000000b2", bruno: "00000000-0000-0000-0000-0000000000b3",
};

async function montar() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key, email text, created_at timestamptz default now(), email_confirmed_at timestamptz default now(), last_sign_in_at timestamptz, banned_until timestamptz, deleted_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table public.users(id uuid primary key, role text not null, active boolean not null default true, name text, email text);
    create table public.profiles(id uuid primary key, display_name text);
    create table public.portal_module_permissions(user_id uuid, module text, can_read boolean, can_edit boolean, can_publish boolean, active boolean default true);
    create table public.appointment_profile_accounts(user_id uuid primary key references auth.users(id), profile_id text not null unique, active boolean not null default true, updated_at timestamptz);
    create table public.appointment_requests(id uuid primary key, professional_profile_id text, status text);
    create table public.appointment_room_sessions(id uuid primary key, request_id uuid, closed_at timestamptz, closed_by uuid, revoked_at timestamptz);
    create function public.is_portal_admin() returns boolean language sql stable security definer set search_path = '' as $$
      select (select auth.uid()) is not null and exists (select 1 from public.users where id = (select auth.uid()) and role in ('owner','admin') and active = true) $$;
  `);
  const contas = [["owner", "owner", "owner@potala.test"], ["editor", "blog_editor", "editor@potala.test"], ["comum", "user", "comum@potala.test"],
    ["carla", "user", "carla.teste@potala.test"], ["ana", "user", "Ana.Teste@Potala.test"], ["bruno", "user", "bruno.teste@potala.test"]];
  for (const [k, papel, email] of contas) {
    await db.query("insert into auth.users(id, email) values ($1,$2)", [U[k], email]);
    await db.query("insert into public.users(id, role, name, email) values ($1,$2,$3,$4)", [U[k], papel, k, email]);
  }
  await db.exec(mig("202609170001_operacao_do_instituto.sql"));
  await db.exec(mig("202611060002_admin_list_accounts.sql"));
  await db.exec(mig("202611060003_admin_professional_links.sql"));
  await db.exec("grant usage on schema public, auth to authenticated; grant execute on function auth.uid() to authenticated");
  const como = async (uid, sql, params) => { await db.exec(`set test.uid = '${uid || ""}'; set role authenticated`); try { return await db.query(sql, params); } finally { await db.exec("reset role"); } };
  /* Cadastros que já existem: Ana (cliente) ligada à sua conta; Bruno profissional com outro cadastro já vinculado à conta dele. */
  const doc = (id, d) => db.query("insert into public.op_records(collection, id, document) values ('profiles',$1,$2::jsonb)", [id, JSON.stringify({ id, active: true, published: false, phone: "", ...d })]);
  await doc("p-ana", { display_name: "TESTE INTERNO Ana Souza", email: "ana.teste@potala.test", roles: ["client"] });
  await doc("p-bruno-velho", { display_name: "TESTE INTERNO Bruno (antigo)", email: "", roles: ["professional"] });
  await db.query("insert into public.appointment_profile_accounts(user_id, profile_id) values ($1,'p-ana'), ($2,'p-bruno-velho')", [U.ana, U.bruno]);
  return { db, como };
}

/* Adaptador no formato do supabase-js: { data, error }. `rede` simula falhas antes/depois do banco. */
function cliente(como, uid, rede = {}) {
  return {
    async rpc(nome, args = {}) {
      const chaves = Object.keys(args);
      if (rede.antes?.(nome)) return { data: null, error: { message: "Failed to fetch" } };
      const sql = `select public.${nome}(${chaves.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`;
      const valores = chaves.map((k) => (args[k] !== null && typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k]));
      let r;
      try { r = (await como(uid, sql, valores)).rows[0].r; } catch (e) { return { data: null, error: { code: e.code, message: e.message } }; }
      if (rede.depois?.(nome)) return { data: null, error: { message: "Failed to fetch" } };
      return { data: r, error: null };
    },
  };
}
const perfis = async (db) => (await db.query("select document from public.op_records where collection='profiles' order by ordem")).rows.map((r) => r.document);
const contar = async (db, email) => (await perfis(db)).filter((p) => (p.email || "") === email).length;

async function contasDoBanco(sb) {
  const [c, p] = await Promise.all([sb.rpc("admin_list_accounts"), sb.rpc("admin_list_professional_profiles")]);
  return { contas: c.data, perfisProf: p.data, erro: c.error?.message || "" };
}

test("novo profissional: grava só o papel Profissional, não publica e vincula a conta livre de mesmo e-mail", async () => {
  const { db, como } = await montar();
  const sb = cliente(como, U.owner);
  const op = createOperationsClient({ client: sb });
  await op.refresh();
  const papeisAntes = (await db.query("select id, role, active from public.users order by id")).rows;
  const dup = verificarDuplicidade(op.snapshot.profiles, { nome: "TESTE INTERNO Carla Dias", email: "Carla.Teste@potala.test" });
  assert.deepEqual(dup, { porEmail: null, porNome: [] });
  const fonte = await contasDoBanco(sb);
  const a = analisarConta(fonte, { email: "Carla.Teste@potala.test" });
  assert.equal(a.situacao, "livre", "a conta é achada pelo e-mail, sem diferença de maiúsculas");
  const plano = montarPlano({ nome: "TESTE INTERNO Carla Dias", email: "Carla.Teste@potala.test", telefone: "", ativo: true, publicar: false, vincular: true, contaId: a.conta.id });
  const salvo = await op.command("person.save", plano.perfil);
  assert.deepEqual(salvo.roles, ["professional"]);
  assert.equal(salvo.published, false);
  assert.equal(salvo.email, "carla.teste@potala.test");
  const v = (await sb.rpc("admin_link_professional", { p_user_id: plano.contaId, p_profile_id: salvo.id })).data;
  assert.deepEqual(v, { linked: true, changed: true });
  assert.deepEqual((await db.query("select id, role, active from public.users order by id")).rows, papeisAntes, "nenhum papel de portal mudou");
  assert.equal((await db.query("select count(*)::int n from public.portal_module_permissions")).rows[0].n, 0, "nenhuma permissão de Blog criada");
  await db.close();
});

test("resposta perdida depois de gravar: conferir no banco acha o cadastro e repetir não duplica", async () => {
  const { db, como } = await montar();
  let perder = true;
  const sb = cliente(como, U.owner, { depois: (n) => n === "op_apply" && perder && !(perder = false) });
  const op = createOperationsClient({ client: sb });
  await op.refresh();
  const idsAntes = new Set(op.snapshot.profiles.map((p) => p.id));
  const plano = montarPlano({ nome: "TESTE INTERNO Davi Rocha", email: "davi.teste@potala.test", ativo: true });
  await assert.rejects(op.command("person.save", plano.perfil));
  assert.equal(await contar(db, "davi.teste@potala.test"), 1, "o banco gravou, mesmo sem resposta");
  // (a) sem conseguir reler o banco, a repetição reenvia com a MESMA chave: o banco devolve o resultado anterior
  const repetido = await op.command("person.save", plano.perfil);
  assert.equal(repetido.email, "davi.teste@potala.test");
  assert.equal(await contar(db, "davi.teste@potala.test"), 1, "repetição idempotente: nenhum segundo cadastro");
  // (b) relendo o banco, o fluxo confirma a gravação antes de afirmar qualquer coisa
  await op.refresh();
  assert.ok(confirmarGravacao(op.snapshot.profiles, { plano, idsAntes }), "gravação conferida");
  // (c) com o estado relido, um novo envio é recusado como e-mail repetido, sem tocar no banco
  await assert.rejects(op.command("person.save", plano.perfil), /E-mail já cadastrado/);
  assert.equal(await contar(db, "davi.teste@potala.test"), 1);
  await db.close();
});

test("falha antes de chegar ao banco: conferido como não gravado; a nova tentativa grava uma vez só", async () => {
  const { db, como } = await montar();
  let falhar = true;
  const sb = cliente(como, U.owner, { antes: (n) => n === "op_apply" && falhar && !(falhar = false) });
  const op = createOperationsClient({ client: sb });
  await op.refresh();
  const idsAntes = new Set(op.snapshot.profiles.map((p) => p.id));
  const plano = montarPlano({ nome: "TESTE INTERNO Eva Melo", email: "eva.teste@potala.test", ativo: true });
  await assert.rejects(op.command("person.save", plano.perfil));
  await op.refresh();
  assert.equal(confirmarGravacao(op.snapshot.profiles, { plano, idsAntes }), null, "conferido: não gravou");
  await op.command("person.save", plano.perfil);
  await op.command("person.save", plano.perfil).catch(() => {});
  assert.equal(await contar(db, "eva.teste@potala.test"), 1);
  await db.close();
});

test("cadastro salvo e vínculo pendente: ao voltar, o fluxo acha o cadastro pelo e-mail e conclui o vínculo sem criar outro", async () => {
  const { db, como } = await montar();
  let falharVinculo = true;
  const sb = cliente(como, U.owner, { antes: (n) => n === "admin_link_professional" && falharVinculo && !(falharVinculo = false) });
  const op = createOperationsClient({ client: sb });
  await op.refresh();
  const a = analisarConta(await contasDoBanco(sb), { email: "carla.teste@potala.test" });
  const plano = montarPlano({ nome: "TESTE INTERNO Carla Dias", email: "carla.teste@potala.test", ativo: true, vincular: true, contaId: a.conta.id });
  const salvo = await op.command("person.save", plano.perfil);
  assert.equal((await sb.rpc("admin_link_professional", { p_user_id: plano.contaId, p_profile_id: salvo.id })).error?.message, "Failed to fetch");
  assert.equal((await db.query("select count(*)::int n from public.appointment_profile_accounts where user_id=$1", [U.carla])).rows[0].n, 0, "vínculo pendente");
  // depois: novo início do fluxo com o mesmo e-mail
  await op.refresh();
  const dup = verificarDuplicidade(op.snapshot.profiles, { nome: "Carla Dias", email: "CARLA.teste@potala.test" });
  assert.equal(dup.porEmail?.id, salvo.id, "o cadastro salvo é reconhecido");
  const existente = dup.porEmail;
  const plano2 = montarPlano({ ativo: true, publicar: false, vincular: true, contaId: a.conta.id }, existente);
  assert.equal(nadaMuda(existente, plano2.perfil), true, "nada a regravar no perfil");
  const b = analisarConta(await contasDoBanco(sb), { email: existente.email, perfilId: existente.id });
  assert.equal(b.situacao, "livre");
  assert.equal((await sb.rpc("admin_link_professional", { p_user_id: b.conta.id, p_profile_id: existente.id })).data.changed, true);
  assert.equal(await contar(db, "carla.teste@potala.test"), 1, "um único cadastro");
  assert.equal((await sb.rpc("admin_link_professional", { p_user_id: b.conta.id, p_profile_id: existente.id })).data.changed, false, "repetir o vínculo é idempotente");
  await db.close();
});

test("conta já ligada a outro cadastro: não vincula outro; o caminho é acrescentar Profissional ao cadastro dela", async () => {
  const { db, como } = await montar();
  const sb = cliente(como, U.owner);
  const op = createOperationsClient({ client: sb });
  await op.refresh();
  const fonte = await contasDoBanco(sb);
  // perfil novo para o Bruno: a conta dele já tem cadastro -> bloqueado no banco também
  const salvo = await op.command("person.save", montarPlano({ nome: "TESTE INTERNO Bruno Lima", email: "outro.bruno@potala.test", ativo: true }).perfil);
  const r = await sb.rpc("admin_link_professional", { p_user_id: U.bruno, p_profile_id: salvo.id });
  assert.equal(r.error?.code, "23505", "o banco recusa segunda ligação para a mesma conta");
  assert.equal(analisarConta(fonte, { email: "bruno.teste@potala.test", perfilId: salvo.id }).situacao, "vinculada-a-outro");
  // Ana: conta ligada ao cadastro de cliente -> usar esse cadastro e acrescentar Profissional
  const ana = analisarConta(fonte, { email: "ana.teste@potala.test" });
  assert.equal(ana.situacao, "vinculada-a-outro");
  assert.equal(ana.outro.profile_id, "p-ana");
  const existente = op.snapshot.profiles.find((p) => p.id === "p-ana");
  const plano = montarPlano({ ativo: true, publicar: false }, existente);
  const atualizado = await op.command("person.save", plano.perfil);
  assert.deepEqual(atualizado.roles, ["client", "professional"]);
  assert.equal(analisarConta(await contasDoBanco(sb), { email: "ana.teste@potala.test", perfilId: "p-ana" }).situacao, "ja-vinculada");
  assert.equal((await db.query("select count(*)::int n from public.appointment_profile_accounts")).rows[0].n, 2, "nenhum vínculo novo ou duplicado");
  await db.close();
});

test("duplicidade e permissões: e-mail repetido é recusado; contas sem administração não leem nem gravam", async () => {
  const { db, como } = await montar();
  const op = createOperationsClient({ client: cliente(como, U.owner) });
  await op.refresh();
  await assert.rejects(op.command("person.save", montarPlano({ nome: "Outra Ana", email: "ANA.TESTE@potala.test", ativo: true }).perfil), /E-mail já cadastrado/);
  assert.equal(await contar(db, "ana.teste@potala.test"), 1);
  for (const quem of ["editor", "comum", ""]) {
    const sb = cliente(como, U[quem] || "");
    for (const nome of ["op_snapshot", "admin_list_accounts", "admin_list_professional_profiles"]) {
      assert.equal((await sb.rpc(nome)).error?.code, "42501", `${quem || "anônimo"} em ${nome}`);
    }
    assert.equal((await sb.rpc("admin_link_professional", { p_user_id: U.carla, p_profile_id: "p-ana" })).error?.code, "42501");
    const apply = await sb.rpc("op_apply", { p_revision: 0, p_idempotency_key: "teste-x", p_action: "person.save", p_payload: {}, p_result: null, p_changes: [] });
    assert.equal(apply.error?.code, "42501");
  }
  await db.close();
});
