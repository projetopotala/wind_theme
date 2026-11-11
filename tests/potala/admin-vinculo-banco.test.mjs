import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

/* Banco real (PGlite) das RPCs de vínculo profissional: quem pode, o que muda e o que não muda. */
const mig = readFileSync(new URL("../../supabase/migrations/202611060003_admin_professional_links.sql", import.meta.url), "utf8");
const U = { owner: "00000000-0000-0000-0000-000000000001", admin: "00000000-0000-0000-0000-000000000002", cli: "00000000-0000-0000-0000-000000000003", esc: "00000000-0000-0000-0000-000000000004", edi: "00000000-0000-0000-0000-000000000005", pro: "00000000-0000-0000-0000-000000000006", viceles: "00000000-0000-0000-0000-000000000007", outra: "00000000-0000-0000-0000-000000000008" };

async function montar() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key, deleted_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table public.users(id uuid primary key, role text not null, active boolean not null default true);
    create table public.portal_module_permissions(user_id uuid, module text, can_edit boolean, can_publish boolean, active boolean default true);
    create table public.op_records(collection text not null, id text not null, document jsonb not null, primary key(collection,id));
    create table public.appointment_profile_accounts(user_id uuid primary key references auth.users(id), profile_id text not null unique, active boolean not null default true, updated_at timestamptz);
    create table public.appointment_requests(id uuid primary key, professional_profile_id text, status text);
    create table public.appointment_room_sessions(id uuid primary key, request_id uuid, closed_at timestamptz, closed_by uuid, revoked_at timestamptz);
    create function public.is_portal_admin() returns boolean language sql stable security definer set search_path = '' as $$
      select (select auth.uid()) is not null and exists (select 1 from public.users where id = (select auth.uid()) and role in ('owner','admin') and active = true) $$;
  `);
  for (const [k, id] of Object.entries(U)) {
    await db.query("insert into auth.users(id) values ($1)", [id]);
    await db.query("insert into public.users(id, role) values ($1,$2)", [id, k === "owner" ? "owner" : k === "admin" ? "admin" : k === "esc" || k === "edi" ? "blog_editor" : "user"]);
  }
  await db.exec(mig);
  await db.exec("grant usage on schema public, auth to authenticated; grant execute on all functions in schema public to authenticated; grant execute on function auth.uid() to authenticated");
  const perfil = (id, nome, extra = {}) => db.query("insert into public.op_records values ('profiles',$1,$2::jsonb)", [id, JSON.stringify({ display_name: nome, roles: ["client", "professional"], active: true, published: false, ...extra })]);
  await perfil("prof-ana", "Dra. Ana");
  await perfil("prof-bia", "Dra. Bia", { roles: ["professional"] });
  await perfil("prof-off", "Inativa", { active: false });
  await perfil("cli-so", "Só cliente", { roles: ["client"] });
  await db.query("insert into public.appointment_profile_accounts(user_id, profile_id, active) values ($1,'prof-bia',true)", [U.pro]);
  return { db, como: async (uid, sql, params) => { await db.exec(`set test.uid = '${uid || ""}'; set role authenticated`); try { return await db.query(sql, params); } finally { await db.exec("reset role"); } } };
}

const vincular = (como, uid, user, perfil) => como(uid, "select public.admin_link_professional($1::uuid,$2) as r", [user, perfil]);

test("só Owner/Admin vincula: cliente, escritor, editor, profissional e anônimo são recusados (42501)", async () => {
  const { db, como } = await montar();
  for (const quem of ["cli", "esc", "edi", "pro", ""]) {
    await assert.rejects(vincular(como, U[quem] || "", U.viceles, "prof-ana"), (e) => e.code === "42501", quem || "anonimo");
  }
  const n = (await db.query("select count(*)::int n from public.appointment_profile_accounts")).rows[0].n;
  assert.equal(n, 1, "nada foi criado");
  await db.close();
});

test("Owner vincula conta comum a perfil elegível: vínculo ativo, auditoria, sem privilégio novo", async () => {
  const { db, como } = await montar();
  const antes = (await db.query("select id, role, active from public.users order by id")).rows;
  const permsAntes = (await db.query("select count(*)::int n from public.portal_module_permissions")).rows[0].n;
  const r = (await vincular(como, U.owner, U.viceles, "prof-ana")).rows[0].r;
  assert.equal(r.changed, true);
  const v = (await db.query("select * from public.appointment_profile_accounts where user_id=$1", [U.viceles])).rows[0];
  assert.equal(v.profile_id, "prof-ana"); assert.equal(v.active, true);
  assert.deepEqual((await db.query("select id, role, active from public.users order by id")).rows, antes, "papéis de conta intactos");
  assert.equal((await db.query("select count(*)::int n from public.portal_module_permissions")).rows[0].n, permsAntes, "permissões de Blog intactas");
  const pub = (await db.query("select document->>'published' p from public.op_records where id='prof-ana'")).rows[0].p;
  assert.equal(pub, "false", "vincular não publica");
  const ev = (await db.query("select action, actor_id, target_user_id, target_profile_id from public.admin_access_events")).rows;
  assert.deepEqual(ev, [{ action: "link_professional", actor_id: U.owner, target_user_id: U.viceles, target_profile_id: "prof-ana" }]);
  await db.close();
});

test("repetir o mesmo vínculo é idempotente; perfil de outra conta e conta já vinculada são recusados", async () => {
  const { db, como } = await montar();
  await vincular(como, U.owner, U.viceles, "prof-ana");
  assert.equal((await vincular(como, U.owner, U.viceles, "prof-ana")).rows[0].r.changed, false);
  await assert.rejects(vincular(como, U.owner, U.outra, "prof-ana"), (e) => e.code !== undefined, "perfil já vinculado a outra conta");
  await assert.rejects(vincular(como, U.owner, U.viceles, "prof-bia"), (e) => e.code !== undefined, "conta já tem outro vínculo");
  const linhas = (await db.query("select user_id, profile_id from public.appointment_profile_accounts order by user_id")).rows;
  assert.equal(linhas.length, 2, "vínculos existentes intactos, sem duplicar");
  assert.equal(linhas.find((l) => l.user_id === U.pro).profile_id, "prof-bia");
  await db.close();
});

test("perfil inativo, sem papel profissional ou inexistente não pode ser vinculado", async () => {
  const { db, como } = await montar();
  for (const p of ["prof-off", "cli-so", "nao-existe"]) {
    await assert.rejects(vincular(como, U.owner, U.viceles, p), (e) => e.code === "22023" || e.code === "P0002", p);
  }
  await db.close();
});

test("lista de perfis: só administração; Owner vê só perfis profissionais, com vínculo e estado", async () => {
  const { como, db } = await montar();
  for (const quem of ["cli", "esc", "edi", "pro", ""]) {
    await assert.rejects(como(U[quem] || "", "select public.admin_list_professional_profiles() as r"), (e) => e.code === "42501", quem || "anonimo");
  }
  const lista = (await como(U.owner, "select public.admin_list_professional_profiles() as r")).rows[0].r;
  assert.deepEqual(lista.map((p) => p.profile_id).sort(), ["prof-ana", "prof-bia", "prof-off"]);
  assert.equal(lista.find((p) => p.profile_id === "prof-bia").linked_user_id, U.pro);
  assert.equal(lista.find((p) => p.profile_id === "prof-off").active, false);
  await db.close();
});

test("desativar e reativar: só Owner; o vínculo vira inativo sem tocar permissões de Blog", async () => {
  const { db, como } = await montar();
  await assert.rejects(como(U.edi, "select public.admin_set_professional_link($1::uuid,'prof-bia',false)", [U.pro]), (e) => e.code === "42501");
  await como(U.owner, "select public.admin_set_professional_link($1::uuid,'prof-bia',false)", [U.pro]);
  assert.equal((await db.query("select active from public.appointment_profile_accounts where user_id=$1", [U.pro])).rows[0].active, false);
  await como(U.owner, "select public.admin_set_professional_link($1::uuid,'prof-bia',true)", [U.pro]);
  assert.equal((await db.query("select active from public.appointment_profile_accounts where user_id=$1", [U.pro])).rows[0].active, true);
  await db.close();
});

test("anon não executa nenhuma das RPCs de vínculo", async () => {
  const { db } = await montar();
  for (const f of ["admin_list_professional_profiles()", "admin_link_professional(uuid,text)", "admin_set_professional_link(uuid,text,boolean)"]) {
    const r = await db.query("select has_function_privilege('anon', $1, 'execute') as ok", [`public.${f}`]);
    assert.equal(r.rows[0].ok, false, f);
  }
  await db.close();
});
