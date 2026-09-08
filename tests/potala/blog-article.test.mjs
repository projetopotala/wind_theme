import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { findPostBySlug, renderArticle, renderArticleBlock } from "../../outputs/js/blog/article-renderer.js";
import { DEFAULT_BLOG_POSTS } from "../../outputs/js/blog/blog-data.js";

const html = readFileSync(new URL("../../outputs/artigo.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../../outputs/css/artigo.css", import.meta.url), "utf8");

test("a página possui destino para artigo, relacionados e conversa", () => {
  assert.match(html, /data-article-root/);
  assert.match(html, /data-article-related/);
  assert.match(html, /data-article-comments/);
});

test("os seis blocos editoriais têm representação sem HTML arbitrário", () => {
  const blocks = [
    { type: "paragraph", text: "Texto <script>ruim</script>" },
    { type: "heading", text: "Um título" },
    { type: "image", src: "media/a.webp", alt: "Descrição", caption: "Legenda" },
    { type: "quote", text: "Uma pausa" },
    { type: "list", items: ["Um", "Dois"] },
    { type: "divider" },
  ];
  const markup = blocks.map(renderArticleBlock).join("");
  for (const tag of ["<p", "<h2", "<figure", "<blockquote", "<ul", "<hr"]) assert.match(markup, new RegExp(tag));
  assert.ok(!markup.includes("<script>"));
  assert.match(markup, /&lt;script&gt;/);
});

test("só encontra texto publicado fora da prévia", () => {
  const hidden = { ...DEFAULT_BLOG_POSTS[0], slug: "oculto", status: "hidden" };
  assert.equal(findPostBySlug([hidden], "oculto"), null);
  assert.equal(findPostBySlug([hidden], "oculto", { preview: true }).slug, "oculto");
  assert.equal(findPostBySlug(DEFAULT_BLOG_POSTS, "inexistente"), null);
});

test("o artigo completo inclui cabeçalho, capa e conteúdo", () => {
  const markup = renderArticle(DEFAULT_BLOG_POSTS[0]);
  assert.match(markup, new RegExp(DEFAULT_BLOG_POSTS[0].title));
  assert.match(markup, /article-hero/);
  assert.match(markup, /article-content/);
});

test("o layout de leitura responde a telas estreitas", () => {
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /prefers-reduced-motion/);
});
