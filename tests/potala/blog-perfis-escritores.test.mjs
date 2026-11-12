import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

import { comoPerfil, iniciaisDoEscritor, imagemDePerfilSegura, paragrafosDaBio, perfisPorSlug, slugDoEscritor } from "../../outputs/js/blog/escritores.js";
import { metadados, montarEscritor, renderizarPagina } from "../../outputs/js/blog/escritor-controller.js";
import { criarBlogAdministrativo, criarBlogPublico } from "../../outputs/js/blog/blog-remoto.js";
import { escritoresDaMesa, htmlDosPerfis } from "../../outputs/js/blog-admin/mesa-perfis.js";

const raiz = (rel) => new URL(`../../${rel}`, import.meta.url);
const ler = (rel) => readFileSync(raiz(rel), "utf8");
const MIGRATION = "supabase/migrations/202611120002_blog_perfis_escritores.sql";
const BIBLIOTECA = "https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/blog-midia/0a1b2c-retrato.webp";

/* P2B | Perfis editoriais dos escritores — dados sintéticos "TESTE INTERNO". */
const post = (id, author, publishedAt, extra = {}) => ({ id, slug: id, title: `TESTE INTERNO ${id}`, excerpt: "Resumo", author, publishedAt, category: "artigos", status: "published", content: [{ type: "paragraph", text: "x" }], ...extra });
const publicados = [post("a1", "Núcleo de Oráculos", "2026-10-01"), post("a2", "Núcleo de Oráculos", "2026-11-01"), post("a3", "Lin Watanabe", "2026-09-01")];
const perfilNucleo = { slug: "nucleo-de-oraculos", name: "Núcleo de Oráculos do Instituto", bio: "Primeiro parágrafo.\n\nSegundo <b>parágrafo</b>.", image: BIBLIOTECA, image_alt: "Mesa com cartas", visible: true };

/* ---------------- modelo ---------------- */

test("perfil: normaliza, aceita só imagens do site ou da biblioteca e descarta ocultos", () => {
  assert.equal(imagemDePerfilSegura("media/retrato.webp"), "media/retrato.webp");
  assert.equal(imagemDePerfilSegura(BIBLIOTECA), BIBLIOTECA);
  for (const ruim of ["javascript:alert(1)", "https://exemplo.org/x.png", "media/../segredo", "//evil.test/a.png", "data:image/png;base64,AA"]) {
    assert.equal(imagemDePerfilSegura(ruim), "", ruim);
  }
  assert.equal(comoPerfil({ slug: "../x", name: "A" }), null);
  assert.equal(comoPerfil({ slug: "a", name: "  " }), null);
  const mapa = perfisPorSlug([perfilNucleo, { slug: "lin-watanabe", name: "Lin", visible: false }]);
  assert.deepEqual([...mapa.keys()], ["nucleo-de-oraculos"], "oculto não entra na página");
  assert.deepEqual(paragrafosDaBio("a\n\n  b  c \n\n\n"), ["a", "b c"]);
  assert.equal(iniciaisDoEscritor("Núcleo de Oráculos"), "NO");
  assert.equal(iniciaisDoEscritor("李明"), "李");
});

/* ---------------- página pública ---------------- */

test("perfil com biografia e imagem: nome público, parágrafos escapados, retrato com alt e contagem", () => {
  const html = renderizarPagina({ estado: "escritor", slug: "nucleo-de-oraculos", publicados, perfis: [perfilNucleo] });
  assert.match(html, /<h1 id="escritor-titulo">Núcleo de Oráculos do Instituto<\/h1>/);
  assert.match(html, /<p class="escritor-apresentacao">Primeiro parágrafo\.<\/p><p class="escritor-apresentacao">Segundo &lt;b&gt;parágrafo&lt;\/b&gt;\.<\/p>/);
  assert.match(html, /<figure class="escritor-retrato"><img src="https:\/\/abcdefghijklmnopqrst\.supabase\.co\/[^"]+" alt="Mesa com cartas"/);
  assert.match(html, /2 textos publicados no Caderno de Travessia\./);
  assert.equal((html.match(/<article class="post/g) || []).length, 2);
  assert.match(html, /← Voltar ao Caderno/);
});

test("perfil sem biografia e sem imagem: apresentação neutra da P2A e iniciais no lugar do retrato", () => {
  const html = renderizarPagina({ estado: "escritor", slug: "lin-watanabe", publicados, perfis: [{ slug: "lin-watanabe", name: "Lin Watanabe" }] });
  assert.match(html, /Textos assinados por Lin Watanabe no Caderno de Travessia · 1 texto publicado\./);
  assert.match(html, /<div class="escritor-retrato escritor-retrato--iniciais" aria-hidden="true">LW<\/div>/);
  assert.doesNotMatch(html, /<img src="(?!media\/|https)/);
  const semPerfil = renderizarPagina({ estado: "escritor", slug: "lin-watanabe", publicados, perfis: [] });
  assert.match(semPerfil, /<h1 id="escritor-titulo">Lin Watanabe<\/h1>/, "sem perfil, segue a P2A");
});

test("perfil oculto, imagem insegura vinda do banco e perfil sem textos", () => {
  const oculto = renderizarPagina({ estado: "escritor", slug: "nucleo-de-oraculos", publicados, perfis: [{ ...perfilNucleo, visible: false }] });
  assert.doesNotMatch(oculto, /Primeiro parágrafo|do Instituto<\/h1>/);
  const insegura = renderizarPagina({ estado: "escritor", slug: "nucleo-de-oraculos", publicados, perfis: [{ ...perfilNucleo, image: "javascript:alert(1)" }] });
  assert.doesNotMatch(insegura, /javascript:/);
  assert.match(insegura, /escritor-retrato--iniciais/);
  const semTextos = renderizarPagina({ estado: "escritor", slug: "nova-autora", publicados, perfis: [{ slug: "nova-autora", name: "Nova Autora", bio: "Chega em breve." }] });
  assert.match(semTextos, /<h1 id="escritor-titulo">Nova Autora<\/h1>[\s\S]*Chega em breve\.[\s\S]*Ainda não há textos publicados com esta assinatura\./);
  assert.equal(metadados({ estado: "escritor", slug: "nova-autora", publicados, perfis: [{ slug: "nova-autora", name: "Nova Autora" }], origem: "https://x.test" }).indexar, false);
});

test("índice e 'outros escritores' usam o nome público, mas o link continua o endereço da assinatura", () => {
  const indice = renderizarPagina({ estado: "indice", publicados, perfis: [perfilNucleo] });
  assert.match(indice, /<a href="escritor\.html\?nome=nucleo-de-oraculos"><span>Núcleo de Oráculos do Instituto<\/span>/);
  assert.match(indice, /<a href="escritor\.html\?nome=lin-watanabe"><span>Lin Watanabe<\/span>/);
});

test("SEO do perfil: descrição da apresentação, og:image absoluta e canônico inalterado", () => {
  const m = metadados({ estado: "escritor", slug: "nucleo-de-oraculos", publicados, perfis: [perfilNucleo], origem: "https://wind-theme.vercel.app" });
  assert.equal(m.titulo, "Núcleo de Oráculos do Instituto — Escritores do Caderno de Travessia — Instituto Potala");
  assert.equal(m.descricao, "Primeiro parágrafo. Segundo <b>parágrafo</b>.");
  assert.equal(m.canonico, "https://wind-theme.vercel.app/escritor.html?nome=nucleo-de-oraculos");
  assert.equal(m.imagem, BIBLIOTECA);
  assert.equal(metadados({ estado: "escritor", slug: "lin-watanabe", publicados, perfis: [{ slug: "lin-watanabe", name: "Lin", image: "media/lin.webp" }], origem: "https://x.test" }).imagem, "https://x.test/media/lin.webp");
  const longa = metadados({ estado: "escritor", slug: "lin-watanabe", publicados, perfis: [{ slug: "lin-watanabe", name: "Lin", bio: "palavra ".repeat(80) }], origem: "" });
  assert.ok(longa.descricao.length <= 160 && longa.descricao.endsWith("…"));
});

test("montagem: perfis são complemento — se a leitura deles falhar, a página abre como na P2A", async () => {
  const raizEl = { innerHTML: "", addEventListener() {} };
  const head = { itens: [], querySelector(s) { return this.itens.find((n) => n.sel === s) || null; }, appendChild(n) { n.sel = n.name ? `meta[name="${n.name}"]` : n.rel ? `link[rel="${n.rel}"]` : `meta[property="${n.attrs.property}"]`; this.itens.push(n); return n; } };
  const doc = { title: "", head, querySelector: (s) => (s === "[data-escritor-root]" ? raizEl : null), createElement: () => ({ attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }) };
  const rest = { async ler(tabela) { if (tabela === "blog_writer_profiles") throw Object.assign(new Error("relation does not exist"), { status: 404 }); return publicados.map((p) => ({ document: p, status: "published" })); } };
  const avisos = [];
  const blog = criarBlogPublico({ rest, aoFalhar: (_e, onde) => avisos.push(onde) });
  assert.deepEqual(await blog.listarPerfis(), []);
  const pagina = montarEscritor(doc, { blog, local: { search: "?nome=nucleo-de-oraculos", origin: "https://x.test" } });
  await pagina.pronto;
  assert.match(raizEl.innerHTML, /<h1 id="escritor-titulo">Núcleo de Oráculos<\/h1>/);
  assert.ok(avisos.includes("blog.perfis"));
  // Leitura pública pede só os visíveis e só as colunas públicas.
  const pedidos = [];
  await criarBlogPublico({ rest: { async ler(t, p) { pedidos.push([t, p]); return []; } } }).listarPerfis();
  assert.deepEqual(pedidos, [["blog_writer_profiles", { select: "slug,name,bio,image,image_alt", visible: "eq.true" }]]);
});

/* ---------------- Mesa ---------------- */

test("Mesa: assinaturas (inclusive especiais) e perfis viram um item por endereço; escritor não vê controles", () => {
  const registros = [
    { post: post("m1", "Ateliê Potala", "2026-01-01"), status: "published" },
    { post: post("m2", "ATELIÊ  potala", "2026-01-02"), status: "draft" },
    { post: post("m3", "李明", "2026-01-03"), status: "published" },
    { post: post("m4", "", "2026-01-04"), status: "published" },
  ];
  const itens = escritoresDaMesa(registros, [comoPerfil({ slug: "so-perfil", name: "Só Perfil" })]);
  assert.deepEqual(itens.map((x) => [x.slug, x.textos, x.publicados]), [
    ["atelie-potala", 2, 1], ["instituto-potala", 1, 1], ["so-perfil", 0, 0], [slugDoEscritor("李明"), 1, 1],
  ]);
  const escritor = htmlDosPerfis({ permissoes: { publicar: false }, estado: "pronto", itens });
  assert.match(escritor, /Só quem publica no Blog edita os perfis/);
  assert.doesNotMatch(escritor, /data-perfil-editar|data-perfil-form/);
  const editor = htmlDosPerfis({ permissoes: { publicar: true }, estado: "pronto", itens, aberto: "atelie-potala", rascunho: { nome: "Ateliê <Potala>", bio: "", imagem: "", visivel: true } });
  assert.match(editor, /data-perfil-form="atelie-potala"/);
  assert.match(editor, /value="Ateliê &lt;Potala&gt;"/);
  assert.match(editor, /\/escritor\.html\?nome=atelie-potala/);
  assert.match(htmlDosPerfis({ permissoes: { publicar: true }, estado: "pronto", itens, busca: "perfil" }), /Só Perfil/);
  assert.match(htmlDosPerfis({ permissoes: { publicar: true }, estado: "erro", erro: "x" }), /data-perfil-recarregar/);
});

test("repositório: cria com o endereço, altera sem trocar o endereço e traduz a recusa do banco", async () => {
  const chamadas = [];
  const resposta = (dados) => ({ select: async () => dados });
  const client = {
    rpc() {}, storage: { from: () => ({ getPublicUrl: () => ({ data: {} }) }) },
    from(tabela) {
      return {
        insert(linha) { chamadas.push(["insert", tabela, linha]); return resposta(linha.slug === "negado" ? { data: null, error: { code: "42501", message: "new row violates row-level security policy" } } : { data: [{ ...linha, updated_at: "agora" }], error: null }); },
        update(campos) { chamadas.push(["update", tabela, campos]); return { eq: (col, v) => { chamadas.push(["eq", col, v]); return resposta({ data: [{ slug: v, ...campos }], error: null }); } }; },
      };
    },
  };
  const repo = criarBlogAdministrativo({ client });
  const novo = await repo.salvarPerfil({ slug: "lin-watanabe", nome: "Lin", bio: "Oi", imagem: "https://exemplo.org/x.png" });
  assert.equal(novo.slug, "lin-watanabe");
  assert.deepEqual(chamadas[0], ["insert", "blog_writer_profiles", { slug: "lin-watanabe", name: "Lin", bio: "Oi", image: "", image_alt: "", visible: true }]);
  await repo.salvarPerfil({ slug: "lin-watanabe", nome: "Lin W." }, { existe: true });
  assert.ok(!("slug" in chamadas[1][2]), "o endereço nunca vai na alteração");
  assert.deepEqual(chamadas[2], ["eq", "slug", "lin-watanabe"]);
  await assert.rejects(repo.salvarPerfil({ slug: "negado", nome: "X" }), /Seu acesso não permite alterar o Blog/);
  await assert.rejects(repo.salvarPerfil({ slug: "../x", nome: "X" }), /nome público/);
});

/* ---------------- banco (migration em PGlite, com a função de permissão real) ---------------- */

const U = { owner: "00000000-0000-0000-0000-000000000001", editor: "00000000-0000-0000-0000-000000000002", escritor: "00000000-0000-0000-0000-000000000003", comum: "00000000-0000-0000-0000-000000000004" };

async function bancoComMigration() {
  const db = new PGlite();
  const permissao = ler("supabase/migrations/202610280001_portal_module_permissions.sql");
  const funcao = permissao.slice(permissao.indexOf("create or replace function public.has_portal_permission"));
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
    create table public.users (id uuid primary key, email text, name text, role text, active boolean);
    create table public.portal_module_permissions (user_id uuid, module text, can_read boolean, can_edit boolean, can_publish boolean, active boolean, primary key (user_id, module));
    create table public.blog_posts (id text primary key, document jsonb);
    insert into auth.users values ('${U.owner}'), ('${U.editor}'), ('${U.escritor}'), ('${U.comum}');
    insert into public.users values ('${U.owner}', 'o@teste', 'Owner', 'owner', true), ('${U.editor}', 'e@teste', 'Ed', 'blog_editor', true), ('${U.escritor}', 'w@teste', 'W', 'blog_editor', true);
    insert into public.portal_module_permissions values ('${U.editor}', 'blog', true, true, true, true), ('${U.escritor}', 'blog', true, true, false, true);
    insert into public.blog_posts values ('p1', '{"author":"Lin Watanabe"}');
    grant usage on schema public to anon, authenticated;
    ${funcao.slice(0, funcao.indexOf("$$;") + 3)}
    revoke all on function public.has_portal_permission(text, text) from public, anon;
    grant execute on function public.has_portal_permission(text, text) to authenticated;
  `);
  const sql = ler(MIGRATION);
  await db.exec(sql);
  await db.exec(sql); // reaplicar é seguro
  return db;
}
const como = async (db, papel, uid = "") => { await db.exec("reset role"); await db.query("select set_config('teste.uid', $1, false)", [uid]); await db.exec(`set role ${papel}`); };
const inserir = (db, slug, extra = {}) => db.query("insert into public.blog_writer_profiles (slug, name, bio, image, visible) values ($1, $2, $3, $4, $5) returning slug", [slug, extra.name || "Nome", extra.bio || "", extra.image || "", extra.visible ?? true]);

test("banco: só Editor/Owner alteram; Escritor, conta comum e visitante são recusados", async () => {
  const db = await bancoComMigration();
  await como(db, "authenticated", U.escritor);
  await assert.rejects(inserir(db, "lin-watanabe"), /row-level security/, "escritor não cria perfil, nem com a própria assinatura");
  await como(db, "authenticated", U.comum);
  await assert.rejects(inserir(db, "lin-watanabe"), /row-level security/);
  await como(db, "anon");
  await assert.rejects(inserir(db, "lin-watanabe"), /permission denied/);
  await como(db, "authenticated", U.editor);
  assert.equal((await inserir(db, "lin-watanabe", { name: " Lin Watanabe ", bio: "Pesquisa." })).rows[0].slug, "lin-watanabe");
  await como(db, "authenticated", U.escritor);
  assert.equal((await db.query("update public.blog_writer_profiles set bio = 'invadido' returning slug")).rows.length, 0, "escritor não altera");
  assert.equal((await db.query("delete from public.blog_writer_profiles returning slug")).rows.length, 0, "escritor não apaga");
  await como(db, "authenticated", U.owner);
  await db.query("update public.blog_writer_profiles set bio = 'Pesquisa e escreve.' where slug = 'lin-watanabe'");
  await db.exec("reset role");
  const linha = (await db.query("select name, bio, updated_by from public.blog_writer_profiles")).rows[0];
  assert.deepEqual(linha, { name: "Lin Watanabe", bio: "Pesquisa e escreve.", updated_by: U.owner }, "nome aparado; autor da alteração vem do banco");
  await db.close();
});

test("banco: endereço imutável, sem duplicata, imagem só da biblioteca e limites", async () => {
  const db = await bancoComMigration();
  await como(db, "authenticated", U.editor);
  await inserir(db, "lin-watanabe");
  await assert.rejects(db.query("update public.blog_writer_profiles set slug = 'outro'"), /permission denied/, "slug não é alterável");
  await assert.rejects(db.query("update public.blog_writer_profiles set updated_by = $1", [U.owner]), /permission denied/);
  await assert.rejects(inserir(db, "lin-watanabe"), /duplicate key/);
  await assert.rejects(inserir(db, "Lin Watanabe"), /check constraint/);
  await assert.rejects(inserir(db, "x", { image: "javascript:alert(1)" }), /check constraint/);
  await assert.rejects(inserir(db, "y", { image: "https://exemplo.org/a.png" }), /check constraint/);
  await assert.rejects(inserir(db, "z", { image: "media/../a.png" }), /check constraint/);
  await assert.rejects(inserir(db, "w", { bio: "x".repeat(1501) }), /check constraint/);
  await inserir(db, "com-imagem", { image: BIBLIOTECA });
  await inserir(db, "do-site", { image: "media/retrato-1.webp" });
  await db.close();
});

test("banco: visitante lê só perfis visíveis e só colunas públicas; quem publica vê os ocultos", async () => {
  const db = await bancoComMigration();
  await como(db, "authenticated", U.editor);
  await inserir(db, "visivel");
  await inserir(db, "oculto", { visible: false });
  assert.equal((await db.query("select slug from public.blog_writer_profiles")).rows.length, 2);
  await como(db, "anon");
  assert.deepEqual((await db.query("select slug, name, bio, image, image_alt from public.blog_writer_profiles")).rows.map((r) => r.slug), ["visivel"]);
  await assert.rejects(db.query("select updated_by from public.blog_writer_profiles"), /permission denied/);
  await assert.rejects(db.query("select * from public.blog_writer_profiles"), /permission denied/);
  await como(db, "authenticated", U.escritor);
  assert.deepEqual((await db.query("select slug from public.blog_writer_profiles")).rows.map((r) => r.slug), ["visivel"]);
  await db.exec("reset role");
  assert.deepEqual((await db.query("select document from public.blog_posts")).rows, [{ document: { author: "Lin Watanabe" } }], "textos intactos");
  await db.close();
});

test("migration e rollback: escopo isolado, sem tocar textos, contas ou permissões", () => {
  const codigo = ler(MIGRATION).replace(/--.*$/gm, "");
  assert.doesNotMatch(codigo, /blog_posts|portal_module_permissions|public\.users|admin_access|mesa_salvar_post|mesa_listar_posts/);
  assert.doesNotMatch(codigo, /drop table|truncate|delete from|insert into/i);
  const outrosGrantsAoVisitante = codigo.replace(/grant select \([^)]*\)\s+on table public\.blog_writer_profiles to anon, authenticated;/, "").match(/grant[^;]*\banon\b[^;]*;/gi);
  assert.equal(outrosGrantsAoVisitante, null, "o visitante só ganha leitura das colunas públicas");
  assert.match(codigo, /grant select \(slug, name, bio, image, image_alt, visible, updated_at\)\s+on table public\.blog_writer_profiles to anon, authenticated;/);
  assert.doesNotMatch(codigo, /grant (insert|update|delete)[^;]*anon/i);
  const rollback = ler("supabase/rollbacks/202611120002_rollback_blog_perfis_escritores.sql");
  assert.match(rollback, /drop table if exists public\.blog_writer_profiles;/);
  assert.doesNotMatch(rollback.replace(/--.*$/gm, ""), /blog_posts|users|portal_module_permissions/);
});
