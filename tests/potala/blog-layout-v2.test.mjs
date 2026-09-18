import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { cartaoDoPost, destaqueEmMoldura, gradeEditorial, marcacaoDasCategorias } from "../../outputs/js/blog/blog-controller.js";
import { DEFAULT_BLOG_POSTS } from "../../outputs/js/blog/blog-data.js";

const html = readFileSync(new URL("../../outputs/blog.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../../outputs/css/blog.css", import.meta.url), "utf8");

test("a capa publica apresenta o Caderno de Travessia e seus lugares fixos", () => {
  assert.match(html, /Caderno de Travessia/);
  for (const hook of [
    "data-blog-destaque",
    "data-blog-grade",
    "data-blog-search",
    "data-blog-categorias",
    "data-blog-recentes",
  ]) assert.match(html, new RegExp(hook), `faltou ${hook}`);
});

test("os cards novos abrem uma pagina completa pelo slug e usam fotografia", () => {
  const post = DEFAULT_BLOG_POSTS[0];
  const card = cartaoDoPost(post);
  assert.match(card, new RegExp(`artigo\\.html\\?post=${post.slug}`));
  assert.match(card, /<img[^>]+loading="lazy"/);
  assert.match(card, new RegExp(post.cover.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("as categorias podem ser formadas a partir do novo modelo", () => {
  const markup = marcacaoDasCategorias(DEFAULT_BLOG_POSTS, "todos");
  assert.match(markup, /data-categoria="todos"/);
  assert.match(markup, /data-categoria="artigos"/);
});

test("a composição fixa não vira um construtor de layout", () => {
  /* Hero dividido, medalhões de categoria e grade editorial: a composição aprovada no Superdesign. */
  assert.match(css, /\.blog-hero \{/);
  assert.match(css, /\.blog-hero__painel/);
  assert.match(css, /\.blog-medalhao/);
  assert.match(css, /\.blog-grade__topo/);
  assert.ok(!html.includes("data-layout-position"));
});

test("a grade editorial põe um grande, dois médios e três pequenos, e o resto em linhas de três", () => {
  const posts = DEFAULT_BLOG_POSTS.slice(1);
  const grade = gradeEditorial(posts);
  const ordem = [...grade.matchAll(/artigo\.html\?post=([a-z0-9-]+)" tabindex/g)].map((m) => m[1]);
  assert.deepEqual(ordem, posts.map((post) => post.slug), "a ordem de leitura é a da lista");
  const bloco = (classe) => (grade.split(`class="${classe}"`)[1] || "").split(/class="blog-grade__(?:par|trio|resto|lado)"/)[0];
  assert.equal((bloco("blog-grade__grande").match(/<article/g) || []).length, 1);
  assert.equal((bloco("blog-grade__par").match(/<article/g) || []).length, 2);
  assert.equal((bloco("blog-grade__trio").match(/<article/g) || []).length, 3);
  assert.equal((bloco("blog-grade__resto").match(/<article/g) || []).length, posts.length - 6);
  assert.equal(gradeEditorial([]), "");
});

test("o destaque emoldurado leva ao artigo e escapa o texto", () => {
  const moldura = destaqueEmMoldura({ ...DEFAULT_BLOG_POSTS[0], title: '<b>Título</b>' });
  assert.ok(moldura.includes(`href="artigo.html?post=${DEFAULT_BLOG_POSTS[0].slug}"`));
  assert.match(moldura, /class="cad-polaroid"/);
  assert.match(moldura, /&lt;b&gt;/);
  assert.equal(destaqueEmMoldura(null), "");
});

test("cada categoria ganha um medalhão com foto decorativa", () => {
  const markup = marcacaoDasCategorias(DEFAULT_BLOG_POSTS, "oraculos");
  assert.match(markup, /data-categoria="oraculos"\s+aria-pressed="true"/);
  for (const [, alt] of markup.matchAll(/<img [^>]*alt="([^"]*)"/g)) assert.equal(alt, "", "o nome já está escrito ao lado");
  assert.equal((markup.match(/class="blog-medalhao"/g) || []).length, (markup.match(/<li>/g) || []).length);
});

test("a prévia do editor tem um canal explícito e restrito", () => {
  const controller = readFileSync(new URL("../../outputs/js/blog/blog-controller.js", import.meta.url), "utf8");
  assert.match(controller, /potala:blog-preview/);
  assert.match(controller, /evento\.origin !== window\.location\.origin/);
});
