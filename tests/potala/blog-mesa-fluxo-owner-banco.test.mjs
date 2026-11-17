/*
 * FLUXO EDITORIAL COM UM UNICO OWNER, executado no banco (Postgres isolado, PGlite).
 *
 * Inclui a 202611150001 (pedido de correcoes protegido no banco).
 * Contas: um Owner administrativo, duas escritoras comuns (nivel "writer") e uma leitora sem acesso.
 * Nao existe conta de editor. Reproduz a ordem real do LAB: tudo ate 202611050000, 202611120002,
 * 202611060003 e 202611060005. Nao toca em nenhum banco real.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const dir = new URL("../../supabase/migrations/", import.meta.url);
const todas = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const versao = (f) => f.slice(0, 12);
const arquivo = (v) => todas.find((f) => versao(f) === v) ?? assert.fail(`migration ${v} nao encontrada`);
const sql = (f) => readFileSync(new URL(f, dir), "utf8");

const OWNER = "00000000-0000-4000-8000-0000000000a1";
const ANA = "00000000-0000-4000-8000-0000000000b1";
const BIA = "00000000-0000-4000-8000-0000000000b2";
const EDITOR = "00000000-0000-4000-8000-0000000000c1";
const SEM_ACESSO = "00000000-0000-4000-8000-0000000000d1";

let db;
const como = async (uid) => {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid || ""]);
  await db.exec(uid ? "set role authenticated" : "set role anon");
};
const tenta = async (fn) => { try { await fn(); return null; } catch (e) { return e.code || e.message; } };
const documento = (extra = {}) => ({ id: "texto-do-fluxo", slug: "texto-do-fluxo", title: "Texto do fluxo", author: "Ana (sintetica)", category: "artigos", excerpt: "Resumo.", content: [{ id: "b1", type: "paragraph", text: "Corpo original." }], ...extra });
const salvar = async (doc, acao, resumo = "") => (await db.query("select public.mesa_salvar_post($1::jsonb, $2, null, true, $3) as r", [JSON.stringify(doc), acao, resumo])).rows[0].r;
const listar = async () => (await db.query("select public.mesa_listar_posts() as l")).rows[0].l;
/* Os textos ja publicados do Blog sao publicos e aparecem para todas as contas; o que isola e o que nao esta no ar. */
const reservados = async () => (await listar()).filter((r) => r.status !== "published");
const doc = (registro) => registro.document ?? registro.post ?? registro;

before(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth; create schema storage; create schema extensions;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, aud text, role text, deleted_at timestamptz, banned_until timestamptz, email_confirmed_at timestamptz, last_sign_in_at timestamptz, raw_user_meta_data jsonb default '{}', created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('teste.role', true), ''), 'anon') $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    grant usage on schema auth, storage, extensions to anon, authenticated, service_role;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, owner_id text, metadata jsonb);
    alter table storage.objects enable row level security;
    grant select, insert, update, delete on storage.objects to authenticated, service_role;
    grant select on storage.objects, storage.buckets to anon;
    create function storage.foldername(n text) returns text[] language sql as $$ select string_to_array(n,'/') $$;
  `);
  for (const f of todas.filter((nome) => versao(nome) < "202611060001")) await db.exec(sql(f));
  for (const v of ["202611120002", "202611060003", "202611060005", "202611150001", "202611171303"]) await db.exec(sql(arquivo(v)));
  await db.exec(`
    insert into auth.users (id, email, aud, role) values
      ('${OWNER}', 'owner-sintetico@example.invalid', 'authenticated', 'authenticated'),
      ('${ANA}', 'ana-sintetica@example.invalid', 'authenticated', 'authenticated'),
      ('${BIA}', 'bia-sintetica@example.invalid', 'authenticated', 'authenticated'),
      ('${EDITOR}', 'editor-sintetico@example.invalid', 'authenticated', 'authenticated'),
      ('${SEM_ACESSO}', 'sem-acesso@example.invalid', 'authenticated', 'authenticated');
    insert into public.users (id, email, name, role, active) values ('${OWNER}', 'owner-sintetico@example.invalid', 'Owner sintetico', 'owner', true);
  `);
  await como(OWNER);
  await db.query("select public.admin_set_blog_access($1, 'writer')", [ANA]);
  await db.query("select public.admin_set_blog_access($1, 'writer')", [BIA]);
  await db.query("select public.admin_set_blog_access($1, 'editor')", [EDITOR]);
});
after(async () => { await db?.close(); });

test("escritora cria rascunho, ve so o que e dela e a outra escritora nao ve rascunho alheio", async () => {
  await como(ANA);
  assert.equal((await salvar(documento(), "rascunho")).status, "draft");
  assert.equal((await reservados()).length, 1);
  await como(BIA);
  assert.equal((await reservados()).length, 0, "Bia nao ve o rascunho da Ana");
  assert.equal(await tenta(() => salvar(documento({ title: "Tentativa" }), "rascunho")), "42501", "Bia nao altera texto da Ana");
  await como(SEM_ACESSO);
  assert.equal(await tenta(() => listar()), "42501", "conta comum sem acesso nao abre a mesa");
  await como(null);
  assert.equal(await tenta(() => listar()), "42501", "anonimo nao abre a mesa");
});

test("escritora envia para revisao, mas nao publica, agenda, arquiva nem devolve estado publico", async () => {
  await como(ANA);
  assert.equal((await salvar(documento(), "revisao")).status, "review");
  for (const acao of ["publicar", "agendar", "despublicar", "arquivar"]) assert.equal(await tenta(() => salvar(documento(), acao)), "42501", acao);
  assert.equal(await tenta(() => salvar(documento({ featured: true }), "rascunho")), "42501", "nao destaca");
  /* autosave durante a revisao continua revisao (nao volta a rascunho nem publica) */
  assert.equal((await salvar(documento({ title: "Texto do fluxo (ajustado)" }), "rascunho")).status, "review");
});

test("Editor legado conserva escrita, mas nao aprova, publica nem altera texto alheio", async () => {
  await como(EDITOR);
  const proprio = documento({ id: "texto-do-editor", slug: "texto-do-editor", title: "Texto do editor" });
  assert.equal((await salvar(proprio, "rascunho")).status, "draft");
  assert.equal((await salvar(proprio, "revisao")).status, "review");
  for (const acao of ["publicar", "agendar", "despublicar", "arquivar"]) {
    assert.equal(await tenta(() => salvar(proprio, acao)), "42501", acao);
  }
  assert.equal(await tenta(() => salvar(documento({ title: "Tentativa do editor" }), "rascunho")), "42501");
  assert.equal((await reservados()).some((r) => r.id === "texto-do-fluxo"), false, "Editor nao recebe a fila do Owner");
});

test("Owner unico enxerga o texto em revisao e devolve com correcoes; a escritora le a nota no proprio texto", async () => {
  await como(OWNER);
  const fila = (await listar()).filter((r) => r.status === "review");
  assert.equal(fila.length, 2, "o Owner ve a fila de revisao de Writer e Editor legado");
  assert.ok(fila.some((r) => r.id === "texto-do-fluxo"));
  const nota = { texto: "Revisar o segundo paragrafo e citar a fonte.", por: "Owner sintetico", em: "2026-11-14T12:00:00Z" };
  const devolvido = await salvar(documento({ title: "Texto do fluxo (ajustado)", correcao: nota }), "despublicar", "Correcoes pedidas: revisar");
  assert.equal(devolvido.status, "draft");
  await como(ANA);
  const meu = (await listar()).find((r) => r.id === "texto-do-fluxo");
  assert.equal(meu.status, "draft");
  assert.deepEqual(doc(meu).correcao, nota, "a nota chega a escritora");
  /* o historico do Owner nao e legivel pela escritora; por isso a nota viaja no texto */
  const versoes = (await db.query("select autor_id, acao from public.blog_post_versions where post_id = 'texto-do-fluxo'")).rows;
  assert.ok(versoes.length > 0);
  assert.ok(versoes.every((v) => v.autor_id === ANA), "escritora so ve versoes que ela mesma gravou");
  await como(BIA);
  assert.equal((await reservados()).length, 0, "Bia continua sem ver nada");
});

test("escritora corrige e reenvia; o Owner publica; o texto vira publico sem o pedido de correcoes", async () => {
  await como(ANA);
  const limpo = documento({ title: "Texto do fluxo (ajustado)", content: [{ id: "b1", type: "paragraph", text: "Corpo corrigido, com fonte." }] });
  assert.equal((await salvar(limpo, "revisao")).status, "review");
  await como(OWNER);
  const publicado = await salvar(limpo, "publicar");
  assert.equal(publicado.status, "published");
  await como(null);
  const publico = (await db.query("select document from public.blog_posts where id = 'texto-do-fluxo' and status = 'published'")).rows;
  assert.equal(publico.length, 1, "o texto aparece para o publico");
  assert.equal(publico[0].document.correcao, undefined);
  assert.equal(publico[0].document.content[0].text, "Corpo corrigido, com fonte.");
  assert.equal(publico[0].document.status, "published");
});

test("depois de publicado: escritora so grava pendencia, nao altera o que esta no ar; nenhuma conta administrativa nova", async () => {
  await como(ANA);
  const pendente = await salvar(documento({ title: "Texto do fluxo (ajustado)", content: [{ id: "b1", type: "paragraph", text: "Edicao posterior." }] }), "pendente");
  assert.equal(pendente.status, "published");
  await como(null);
  assert.equal((await db.query("select document from public.blog_posts where id = 'texto-do-fluxo'")).rows[0].document.content[0].text, "Corpo corrigido, com fonte.");
  await db.exec("reset role");
  assert.equal((await db.query("select count(*)::int n from public.users where role in ('owner','admin')")).rows[0].n, 1, "so o Owner e administrativo");
  assert.equal((await db.query("select count(*)::int n from public.users where role = 'blog_editor'")).rows[0].n, 3, "as contas editoriais nao viram administradoras");
  assert.equal((await db.query("select count(*)::int n from public.portal_module_permissions where module = 'blog' and can_publish")).rows[0].n, 1, "o grant legado e preservado, mas nao autoriza publicacao");
});

test("revogar o acesso da escritora vale na proxima chamada e nao apaga o texto dela", async () => {
  await como(OWNER);
  await db.query("select public.admin_set_blog_access($1, 'none')", [ANA]);
  await como(ANA);
  assert.equal(await tenta(() => salvar(documento(), "rascunho")), "42501");
  assert.equal(await tenta(() => listar()), "42501");
  await como(OWNER);
  assert.ok((await listar()).some((r) => r.id === "texto-do-fluxo"), "o texto continua com o Owner");
});

/* ------------------------------------------------------------------
 * Notas de correcao: persistencia, isolamento e protecao no banco
 * ------------------------------------------------------------------ */
const NOTA = { texto: "Citar a fonte do segundo paragrafo.", por: "Owner sintetico", em: "2026-11-15T12:00:00Z" };
const ID2 = "texto-das-notas";
const base2 = (extra = {}) => documento({ id: ID2, slug: ID2, title: "Texto das notas", ...extra });
const doDoc = async (id) => (await db.query("select document, status from public.blog_posts where id = $1", [id])).rows[0];

test("notas: a escritora nao inventa pedido de correcao em texto proprio (criar, salvar, enviar)", async () => {
  await como(OWNER);
  await db.query("select public.admin_set_blog_access($1, 'writer')", [ANA]);
  await como(ANA);
  const criado = await salvar(base2({ correcao: { texto: "Forjado pela escritora" } }), "rascunho");
  assert.equal(doc(criado).correcao, undefined);
  await salvar(base2({ correcao: { texto: "Forjado de novo" } }), "rascunho");
  await db.exec("reset role");
  assert.equal((await doDoc(ID2)).document.correcao, undefined);
});

test("notas: persistem apos fechar e reabrir, mesmo com autosave de aba desatualizada da escritora", async () => {
  await salvar(base2(), "revisao").catch(() => null);
  await como(ANA);
  await salvar(base2(), "revisao");
  await como(OWNER);
  assert.equal((await salvar(base2({ correcao: NOTA }), "despublicar", "Correcoes pedidas")).status, "draft");
  /* aba antiga da escritora (sem a nota) salva sozinha: a nota continua */
  await como(ANA);
  const velho = await salvar(base2({ title: "Texto das notas (editado na aba antiga)" }), "rascunho");
  assert.deepEqual(doc(velho).correcao, NOTA, "a nota resiste ao autosave desatualizado");
  /* e tentar trocar a nota por outra tambem nao funciona */
  const troca = await salvar(base2({ correcao: { texto: "Outra nota" } }), "rascunho");
  assert.deepEqual(doc(troca).correcao, NOTA);
  const reaberto = (await listar()).find((r) => r.id === ID2);
  assert.deepEqual(doc(reaberto).correcao, NOTA, "ao reabrir a nota esta la");
});

test("notas: so a escritora autora e o Owner leem; outra escritora, conta comum e visitante nao (RPC e RLS)", async () => {
  await como(BIA);
  assert.ok(!(await listar()).some((r) => r.id === ID2), "Bia nao ve o texto");
  assert.equal((await db.query("select id from public.blog_posts where id = $1", [ID2])).rows.length, 0, "RLS: Bia nao le a tabela");
  assert.equal((await db.query("select id from public.blog_post_versions where post_id = $1", [ID2])).rows.length, 0, "RLS: Bia nao le versoes");
  assert.equal(await tenta(() => salvar(base2({ title: "Tentativa da Bia" }), "rascunho")), "42501");
  assert.equal(await tenta(() => salvar(base2(), "revisao")), "42501");
  await como(SEM_ACESSO);
  assert.equal(await tenta(() => listar()), "42501");
  assert.equal((await db.query("select id from public.blog_posts where id = $1", [ID2])).rows.length, 0);
  await como(null);
  assert.equal((await db.query("select id from public.blog_posts where id = $1", [ID2])).rows.length, 0, "visitante nao le rascunho");
  assert.equal(await tenta(() => listar()), "42501");
  await como(OWNER);
  assert.deepEqual(doc((await listar()).find((r) => r.id === ID2)).correcao, NOTA, "Owner le a nota");
});

test("notas: reenviar para revisao limpa a nota; o Owner publica e o texto publico nao carrega a nota", async () => {
  await como(ANA);
  const reenviado = await salvar(base2({ title: "Texto das notas (corrigido)" }), "revisao");
  assert.equal(reenviado.status, "review");
  assert.equal(doc(reenviado).correcao, undefined);
  await como(OWNER);
  /* mesmo que o cliente do Owner mande a nota por engano, o banco tira */
  const publicado = await salvar(base2({ title: "Texto das notas (corrigido)", correcao: NOTA }), "publicar");
  assert.equal(publicado.status, "published");
  await como(null);
  const publico = (await db.query("select document from public.blog_posts where id = $1 and status = 'published'", [ID2])).rows;
  assert.equal(publico.length, 1);
  assert.equal(publico[0].document.correcao, undefined);
  assert.equal(JSON.stringify(publico[0].document).includes("fonte do segundo"), false);
});

test("notas: edicao pendente de texto no ar nunca leva a nota; Owner agendando tambem a remove", async () => {
  await como(ANA);
  await salvar(base2({ title: "Pendente", correcao: { texto: "forjado" } }), "pendente");
  await db.exec("reset role");
  const linha = (await db.query("select pending_document from public.blog_posts where id = $1", [ID2])).rows[0];
  assert.equal(linha.pending_document.correcao, undefined);
  await como(OWNER);
  await salvar(base2({ title: "Texto das notas (corrigido)" }), "despublicar");
  const futuro = new Date(Date.now() + 86400000).toISOString();
  const agendado = (await db.query("select public.mesa_salvar_post($1::jsonb, 'agendar', $2::timestamptz, true, '') as r", [JSON.stringify(base2({ correcao: NOTA })), futuro])).rows[0].r;
  assert.equal(agendado.status, "scheduled");
  assert.equal((await doDoc(ID2)).document.correcao, undefined);
});
