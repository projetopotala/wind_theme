import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { cartaoDoPost, marcacaoDasCategorias } from "../../outputs/js/blog/blog-controller.js";
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
  assert.match(css, /\.blog-panorama/);
  assert.match(css, /\.blog-shell/);
  assert.match(css, /\.blog-lateral/);
  assert.ok(!html.includes("data-layout-position"));
});

test("a prévia do editor tem um canal explícito e restrito", () => {
  const controller = readFileSync(new URL("../../outputs/js/blog/blog-controller.js", import.meta.url), "utf8");
  assert.match(controller, /potala:blog-preview/);
  assert.match(controller, /evento\.origin !== window\.location\.origin/);
});
