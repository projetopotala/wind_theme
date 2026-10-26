import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import * as blogRemoto from "../../outputs/js/blog/blog-remoto.js";
import { comArtigosConfirmados, lerArtigosPublicados, slugDoArtigo, soArtigosConfirmados } from "../../outputs/js/blog/artigos-publicados.js";
import { confirmarIndicacoes } from "../../outputs/js/blog/indicacoes-do-blog.js";
import { TEXTOS_DE_DEMONSTRACAO } from "../../outputs/js/blog-admin/demonstracao.js";
import { catalogoDoPortal } from "../../outputs/js/conta/catalogo.js";
import { sementeDeDemonstracao } from "../../outputs/js/conta/dados-demonstracao.js";
import { DEFAULT_HOME_BLOCKS } from "../../outputs/js/home/journey-data.js";
import { DEFAULT_BLOG_POSTS, POSTS } from "../../scripts/dados/blog-acervo-inicial.mjs";

/*
 * A FONTE EDITORIAL DO BLOG É O BANCO.
 *
 * Nada publicado em outputs/ pode mostrar — ou carregar — um texto do Blog
 * sem o banco confirmar que ele está no ar agora.
 */

const outputs = new URL("../../outputs/", import.meta.url);
async function arquivosPublicados(pasta = outputs) {
  const lista = [];
  for (const item of await readdir(pasta, { withFileTypes: true })) {
    if (item.name === "vendor" || item.name === "media") continue;
    const caminho = new URL(`${item.name}${item.isDirectory() ? "/" : ""}`, pasta);
    if (item.isDirectory()) lista.push(...await arquivosPublicados(caminho));
    else if (/\.(js|mjs|html|json|css|txt)$/.test(item.name)) lista.push(caminho);
  }
  return lista;
}

test("nenhum arquivo publicado carrega o texto integral do acervo do Blog", async () => {
  const trechos = POSTS.flatMap((post) => (post.conteudo || []).filter((bloco) => bloco.type === "paragraph").map((bloco) => bloco.text.slice(0, 70)));
  assert.ok(trechos.length > 10, "o acervo de referência tem textos integrais");
  const achados = [];
  for (const arquivo of await arquivosPublicados()) {
    const conteudo = await readFile(arquivo, "utf8");
    for (const trecho of trechos) if (conteudo.includes(trecho)) achados.push(`${arquivo.pathname.split("/outputs/")[1]}: "${trecho.slice(0, 40)}…"`);
  }
  assert.deepEqual(achados, []);
});

test("?acervo=local não existe mais: nenhum parâmetro público troca o banco por textos do código", async () => {
  assert.equal(blogRemoto.querAcervoLocal, undefined);
  assert.equal(blogRemoto.criarRestSemBanco, undefined);
  for (const arquivo of ["js/blog/blog-controller.js", "js/blog/article-controller.js", "js/blog/blog-remoto.js"]) {
    const fonte = await readFile(new URL(arquivo, outputs), "utf8");
    assert.doesNotMatch(fonte, /querAcervoLocal|criarRestSemBanco|DEFAULT_BLOG_POSTS|reserva:/, arquivo);
  }
  /* Mesmo com o parâmetro na URL, quem lista é o banco: se ele disser que não há nada, não há nada. */
  const blog = blogRemoto.criarBlogPublico({ rest: { ler: async () => [] } });
  assert.deepEqual(await blog.listarPublicados(), []);
});

test("o acesso de teste da mesa usa só textos de demonstração", async () => {
  const entrada = await readFile(new URL("js/blog-admin/blog-admin-entry.js", outputs), "utf8");
  assert.doesNotMatch(entrada, /blog-data|DEFAULT_BLOG_POSTS/);
  const reais = new Set(DEFAULT_BLOG_POSTS.map((post) => post.slug));
  assert.ok(TEXTOS_DE_DEMONSTRACAO.length >= 1);
  for (const post of TEXTOS_DE_DEMONSTRACAO) {
    assert.match(post.slug, /^demonstracao-/);
    assert.ok(!reais.has(post.slug));
    assert.match(post.title, /demonstração/i);
  }
});

test("o endereço do artigo é reconhecido em todas as formas usadas no site", () => {
  assert.equal(slugDoArtigo("artigo.html?post=ansiedade-corpo"), "ansiedade-corpo");
  assert.equal(slugDoArtigo("/artigo.html?post=a%20b"), "a b");
  assert.equal(slugDoArtigo("https://wind-theme.vercel.app/artigo.html?x=1&post=borra-de-cafe"), "borra-de-cafe");
  assert.equal(slugDoArtigo("blog.html"), "");
  assert.equal(slugDoArtigo("/cursos.html"), "");
  assert.equal(slugDoArtigo(undefined), "");
});

test("Home: novidade de texto retirado do ar some; sem confirmação, nenhuma aparece; seções ficam", async () => {
  const novidades = DEFAULT_HOME_BLOCKS.filter((bloco) => slugDoArtigo(bloco.href));
  assert.ok(novidades.length >= 1, "a Home tem cartões de artigo");
  const secoes = DEFAULT_HOME_BLOCKS.length - novidades.length;
  const noAr = [{ slug: slugDoArtigo(novidades[0].href) }];

  const repo = { list: async () => DEFAULT_HOME_BLOCKS, replaceAll: () => {}, reset: () => {} };
  const comUm = await comArtigosConfirmados(repo, async () => noAr).list({ publishedOnly: true });
  assert.equal(comUm.length, secoes + 1);
  assert.ok(comUm.some((bloco) => bloco.id === novidades[0].id));
  for (const retirado of novidades.slice(1)) assert.ok(!comUm.some((bloco) => bloco.id === retirado.id), `${retirado.id} reapareceu`);

  const semBanco = await comArtigosConfirmados(repo, async () => null).list({ publishedOnly: true });
  assert.equal(semBanco.length, secoes, "banco fora do ar: nenhuma novidade de artigo");
  assert.ok(semBanco.every((bloco) => !slugDoArtigo(bloco.href)));
  assert.equal(typeof comArtigosConfirmados(repo).replaceAll, "function", "o resto do repositório continua igual");
});

test("Meu Potala: 'Para você' só recomenda texto confirmado; sem banco, nenhum texto do Blog", () => {
  const semBanco = catalogoDoPortal();
  assert.equal(semBanco.filter((item) => item.tipo === "blog").length, 0);
  assert.ok(semBanco.length > 0, "as páginas de seção continuam");
  const confirmado = catalogoDoPortal({ textos: [DEFAULT_BLOG_POSTS[0]] }).filter((item) => item.tipo === "blog");
  assert.deepEqual(confirmado.map((item) => item.ref), [DEFAULT_BLOG_POSTS[0].id]);
  const naoPublicado = catalogoDoPortal({ textos: [{ ...DEFAULT_BLOG_POSTS[1], status: "draft" }] }).filter((item) => item.tipo === "blog");
  assert.equal(naoPublicado.length, 0);
});

test("Meu Potala de demonstração não usa textos do Blog real", () => {
  const semente = sementeDeDemonstracao({ usuarioId: "u1", agora: new Date(2026, 9, 26, 10) });
  const reais = new Set(DEFAULT_BLOG_POSTS.flatMap((post) => [post.id, post.slug, post.title]));
  for (const item of [...semente.salvos, ...semente.historico]) {
    assert.ok(!reais.has(item.ref) && !reais.has(item.titulo), `${item.titulo} é texto real`);
    assert.equal(slugDoArtigo(item.href), "", `${item.titulo} aponta para um artigo`);
  }
});

test("a confirmação não espera para sempre e não inventa lista quando o banco falha", async () => {
  assert.equal(await lerArtigosPublicados({ blog: { listarPublicados: async () => { throw new Error("offline"); } } }), null);
  assert.equal(await lerArtigosPublicados({ blog: { listarPublicados: () => new Promise(() => {}) }, espera: 20 }), null);
  const lista = [{ slug: "x" }];
  assert.equal(await lerArtigosPublicados({ blog: { listarPublicados: async () => lista } }), lista);
  assert.deepEqual(soArtigosConfirmados([{ href: "artigo.html?post=x" }, { href: "artigo.html?post=y" }, { href: "blog.html" }], lista).map((i) => i.href), ["artigo.html?post=x", "blog.html"]);
});

function documentoFalso(listas) {
  const elementos = listas.map((hrefs) => {
    const links = hrefs.map((href) => ({ dataset: {}, getAttribute: () => href }));
    return { dataset: {}, links, querySelectorAll: () => links };
  });
  return { elementos, querySelectorAll: () => elementos };
}

test("indicações 'No Blog' das seções: só as confirmadas aparecem; sem banco, nenhuma", async () => {
  const doc = documentoFalso([["artigo.html?post=a", "artigo.html?post=b"], ["artigo.html?post=c"]]);
  assert.equal(await confirmarIndicacoes(doc, async () => [{ slug: "b" }]), 1);
  assert.equal("artigoConfirmado" in doc.elementos[0].links[0].dataset, false);
  assert.equal("artigoConfirmado" in doc.elementos[0].links[1].dataset, true);
  assert.equal("blogConfirmado" in doc.elementos[0].dataset, true);
  assert.equal("blogConfirmado" in doc.elementos[1].dataset, false);

  const semBanco = documentoFalso([["artigo.html?post=a"]]);
  assert.equal(await confirmarIndicacoes(semBanco, async () => null), 0);
  assert.equal("blogConfirmado" in semBanco.elementos[0].dataset, false);

  const css = await readFile(new URL("css/atendimentos-conceito.css", outputs), "utf8");
  assert.match(css, /\.conexao__artigo:not\(\[data-artigo-confirmado\]\)/, "o link nasce escondido");
  const html = await readFile(new URL("transcendido.html", outputs), "utf8");
  assert.match(html, /<script type="module" src="js\/blog\/indicacoes-do-blog\.js"><\/script>/);
});
