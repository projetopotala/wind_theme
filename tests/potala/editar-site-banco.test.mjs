import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

/*
 * Editar site, no banco: rascunho, publicacao, historico, restauracao e auditoria.
 * Todas as migrations reais (auth/storage simulados); so dados ficticios.
 * Regra do Instituto: somente a conta Owner ativa edita; admin, cliente, anonimo e Owner inativo nao.
 */
const DIR = new URL("../../supabase/migrations/", import.meta.url);
const U = {
  owner: "00000000-0000-0000-0000-0000000000a1",
  admin: "00000000-0000-0000-0000-0000000000a2",
  cliente: "00000000-0000-0000-0000-0000000000c1",
  inativo: "00000000-0000-0000-0000-0000000000a3",
};

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
  await db.exec("grant usage on schema public, auth, storage to anon, authenticated; grant execute on function auth.uid() to anon, authenticated; grant select, insert on storage.objects to authenticated");
  for (const [k, email] of [["owner", "owner@potala.test"], ["admin", "admin@potala.test"], ["cliente", "cliente@potala.test"], ["inativo", "inativo@potala.test"]]) {
    await db.query("insert into auth.users(id, email) values ($1,$2)", [U[k], email]);
  }
  await db.query("insert into public.users(id, role, name, email, active) values ($1,'owner','owner','owner@potala.test', true) on conflict (id) do update set role='owner', active=true", [U.owner]);
  await db.query("insert into public.users(id, role, name, email, active) values ($1,'admin','admin','admin@potala.test', true) on conflict (id) do update set role='admin', active=true", [U.admin]);
  await db.query("insert into public.users(id, role, name, email, active) values ($1,'owner','inativo','inativo@potala.test', false) on conflict (id) do update set role='owner', active=false", [U.inativo]);

  const como = async (quem, fn) => {
    await db.exec("reset role");
    await db.query("select set_config('test.uid', $1, false)", [quem === "anon" ? "" : U[quem]]);
    await db.exec(`set role ${quem === "anon" ? "anon" : "authenticated"}`);
    try { return await fn(); } finally { await db.exec("reset role"); }
  };
  const rpc = (quem, nome, ...args) => como(quem, () => db.query(`select public.${nome}(${args.map((_, i) => `$${i + 1}`).join(", ")}) as r`, args).then((r) => r.rows[0].r));
  return { db, como, rpc };
}

const C1 = { "titulo-principal": { text: "Um novo título" }, "botao-inicio": { text: "Conhecer", href: "travessia.html" } };
const PAGE = "quem-somos";
const codigo = async (promessa) => { try { await promessa; return null; } catch (e) { return e.code || e.message; } };

test("so a conta Owner ativa abre, salva, publica e restaura", async () => {
  const { rpc } = await montar();
  for (const quem of ["admin", "cliente", "inativo", "anon"]) {
    assert.match(String(await codigo(rpc(quem, "site_editor_load", PAGE))), /42501|permission|Owner/, `${quem} nao deveria carregar`);
    assert.match(String(await codigo(rpc(quem, "site_save_draft", PAGE, JSON.stringify(C1), 0))), /42501|permission|Owner/, `${quem} nao deveria salvar`);
    assert.match(String(await codigo(rpc(quem, "site_publish", PAGE, 0, 1))), /42501|permission|Owner/, `${quem} nao deveria publicar`);
    assert.match(String(await codigo(rpc(quem, "site_restore", PAGE, 1, 0, false))), /42501|permission|Owner/, `${quem} nao deveria restaurar`);
  }
  const carga = await rpc("owner", "site_editor_load", PAGE);
  assert.equal(carga.published.version, 0);
  assert.equal(carga.draft, null);
});

test("nenhuma tabela aceita escrita direta nem leitura de rascunho/historico/auditoria pelo navegador", async () => {
  const { db, como, rpc } = await montar();
  await rpc("owner", "site_save_draft", PAGE, JSON.stringify(C1), 0);
  for (const quem of ["owner", "admin", "anon"]) {
    for (const t of ["site_page_drafts", "site_page_revisions", "site_edit_events"]) {
      assert.match(String(await codigo(como(quem, () => db.query(`select * from public.${t}`)))), /42501|permission denied/i, `${quem} leu ${t}`);
    }
    assert.match(String(await codigo(como(quem, () => db.query(`insert into public.site_pages_published(page_slug, version, content) values ('x', 1, '{}')`)))), /42501|permission denied/i, `${quem} escreveu em publicado`);
    assert.match(String(await codigo(como(quem, () => db.query(`update public.site_pages_published set content='{}'`)))), /42501|permission denied/i);
    assert.match(String(await codigo(como(quem, () => db.query(`delete from public.site_pages_published`)))), /42501|permission denied/i);
  }
});

test("o publico le somente o publicado, nunca o rascunho", async () => {
  const { db, como, rpc } = await montar();
  const r1 = await rpc("owner", "site_save_draft", PAGE, JSON.stringify(C1), 0);
  assert.deepEqual(r1, { revision: 1, base_version: 0 });
  assert.equal((await como("anon", () => db.query("select * from public.site_pages_published"))).rows.length, 0);
  await rpc("owner", "site_publish", PAGE, 0, 1);
  const lido = (await como("anon", () => db.query("select page_slug, version, content from public.site_pages_published"))).rows;
  assert.equal(lido.length, 1);
  assert.equal(lido[0].version, 1);
  assert.equal(lido[0].content["titulo-principal"].text, "Um novo título");
  await rpc("owner", "site_save_draft", PAGE, JSON.stringify({ "titulo-principal": { text: "Rascunho secreto" } }), 0);
  const depois = (await como("anon", () => db.query("select content from public.site_pages_published"))).rows;
  assert.equal(depois[0].content["titulo-principal"].text, "Um novo título", "o rascunho nao vaza para o publico");
});

test("publicar e atomico: cria versao, historico, auditoria e apaga o rascunho", async () => {
  const { db, rpc } = await montar();
  await rpc("owner", "site_save_draft", PAGE, JSON.stringify(C1), 0);
  const pub = await rpc("owner", "site_publish", PAGE, 0, 1);
  assert.deepEqual(pub, { version: 1 });
  const carga = await rpc("owner", "site_editor_load", PAGE);
  assert.equal(carga.draft, null);
  assert.equal(carga.published.version, 1);
  assert.equal(carga.history.length, 1);
  assert.equal(carga.history[0].action, "publish");
  const ev = (await db.query("select action, version_from, version_to, elements, actor from public.site_edit_events order by id")).rows;
  assert.deepEqual(ev.map((e) => e.action), ["draft_save", "publish"]);
  assert.equal(ev[1].version_from, 0);
  assert.equal(ev[1].version_to, 1);
  assert.deepEqual([...ev[1].elements].sort(), ["botao-inicio", "titulo-principal"]);
  assert.equal(ev[1].actor, U.owner);
  assert.match(String(await codigo(rpc("owner", "site_publish", PAGE, 1, 1))), /PT404/, "sem rascunho nao publica");
});

test("duas abas: revisao e versao desatualizadas sao recusadas sem perder dados", async () => {
  const { rpc } = await montar();
  await rpc("owner", "site_save_draft", PAGE, JSON.stringify(C1), 0);
  assert.match(String(await codigo(rpc("owner", "site_save_draft", PAGE, JSON.stringify(C1), 0))), /PT409/, "segunda aba criando de novo");
  const r2 = await rpc("owner", "site_save_draft", PAGE, JSON.stringify({ "titulo-principal": { text: "B" } }), 1);
  assert.equal(r2.revision, 2);
  assert.match(String(await codigo(rpc("owner", "site_save_draft", PAGE, JSON.stringify(C1), 1))), /PT409/, "revisao antiga");
  assert.match(String(await codigo(rpc("owner", "site_publish", PAGE, 0, 1))), /PT409/, "publicar com revisao antiga");
  assert.match(String(await codigo(rpc("owner", "site_publish", PAGE, 5, 2))), /PT409/, "publicar com versao errada");
  assert.equal((await rpc("owner", "site_editor_load", PAGE)).draft.content["titulo-principal"].text, "B");
});

test("restaurar cria nova versao, preserva o historico e exige decidir sobre o rascunho", async () => {
  const { rpc } = await montar();
  await rpc("owner", "site_save_draft", PAGE, JSON.stringify({ a: { text: "v1" } }), 0);
  await rpc("owner", "site_publish", PAGE, 0, 1);
  await rpc("owner", "site_save_draft", PAGE, JSON.stringify({ a: { text: "v2" } }), 0);
  await rpc("owner", "site_publish", PAGE, 1, 1);
  const antigo = await rpc("owner", "site_revision_content", PAGE, 1);
  assert.equal(antigo.a.text, "v1");
  await rpc("owner", "site_save_draft", PAGE, JSON.stringify({ a: { text: "rascunho" } }), 0);
  assert.match(String(await codigo(rpc("owner", "site_restore", PAGE, 1, 2, false))), /PT409/, "rascunho aberto bloqueia");
  assert.match(String(await codigo(rpc("owner", "site_restore", PAGE, 1, 1, true))), /PT409/, "versao esperada errada");
  const r = await rpc("owner", "site_restore", PAGE, 1, 2, true);
  assert.deepEqual(r, { version: 3 });
  const carga = await rpc("owner", "site_editor_load", PAGE);
  assert.equal(carga.published.version, 3);
  assert.equal(carga.published.content.a.text, "v1");
  assert.equal(carga.draft, null);
  assert.deepEqual(carga.history.map((h) => [h.version, h.action, h.restored_from]), [[3, "restore", 1], [2, "publish", null], [1, "publish", null]]);
  assert.match(String(await codigo(rpc("owner", "site_restore", PAGE, 99, 3, true))), /PT404/);
});

test("descartar rascunho confere a revisao e registra auditoria", async () => {
  const { db, rpc } = await montar();
  await rpc("owner", "site_save_draft", PAGE, JSON.stringify(C1), 0);
  assert.match(String(await codigo(rpc("owner", "site_discard_draft", PAGE, 7))), /PT409/);
  await rpc("owner", "site_discard_draft", PAGE, 1);
  assert.equal((await rpc("owner", "site_editor_load", PAGE)).draft, null);
  const ev = (await db.query("select action from public.site_edit_events order by id")).rows.map((e) => e.action);
  assert.deepEqual(ev, ["draft_save", "draft_discard"]);
});

test("conteudo perigoso ou fora do formato e recusado na gravacao", async () => {
  const { rpc } = await montar();
  const ruins = [
    { k: { href: "javascript:alert(1)" } },
    { k: { href: "data:text/html;base64,AAAA" } },
    { k: { href: "//evil.example/x" } },
    { k: { href: "http://inseguro.example" } },
    { k: { src: "javascript:alert(1)" } },
    { k: { src: "media/../../segredo.png" } },
    { k: { src: "media/arquivo.svg" } },
    { k: { onclick: "x" } },
    { k: { html: "<script>1</script>" } },
    { k: { text: "" } },
    { k: { text: "x".repeat(2001) } },
    { k: { text: "linha\u0000nula" } },
    { k: { alt: "a".repeat(301) } },
    { k: { pos: "50 50" } },
    { "Chave Invalida": { text: "x" } },
    { k: "texto solto" },
    [],
  ];
  for (const c of ruins) assert.match(String(await codigo(rpc("owner", "site_save_draft", PAGE, JSON.stringify(c), 0))), /22023|22P05/, JSON.stringify(c).slice(0, 60));
  assert.match(String(await codigo(rpc("owner", "site_save_draft", "Pagina Ruim!", JSON.stringify(C1), 0))), /22023/);
  // HTML dentro do texto e aceito como TEXTO: o site aplica com textContent, nunca como marcacao.
  await rpc("owner", "site_save_draft", PAGE, JSON.stringify({ k: { text: "<b>negrito</b> & mais" } }), 0);
  const bons = { a: { text: "ok", href: "https://exemplo.com/x?y=1#z" }, b: { href: "travessia.html#topo" }, c: { href: "#historia" }, d: { src: "media/foto-nova.webp", alt: "Descrição", pos: "40% 60%" } };
  assert.equal((await rpc("owner", "site_save_draft", PAGE, JSON.stringify(bons), 1)).revision, 2);
});

test("so o Owner envia imagens ao bucket do editor; o bucket e restrito a imagens de ate 5 MB", async () => {
  const { db, como } = await montar();
  const b = (await db.query("select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'site-editor-media'")).rows[0];
  assert.equal(b.public, true);
  assert.equal(Number(b.file_size_limit), 5 * 1024 * 1024);
  assert.deepEqual([...b.allowed_mime_types].sort(), ["image/avif", "image/jpeg", "image/png", "image/webp"]);
  const enviar = (quem) => como(quem, () => db.query("insert into storage.objects(bucket_id, name) values ('site-editor-media', 'quem-somos/a.webp')"));
  await enviar("owner");
  for (const quem of ["admin", "cliente", "anon"]) assert.match(String(await codigo(enviar(quem))), /42501|row-level security|permission denied/i, quem);
});
