import assert from "node:assert/strict";
import test from "node:test";
import { access } from "node:fs/promises";

import { DEFAULT_BLOG_POSTS } from "../../outputs/js/blog/blog-data.js";

/*
 * A capa de um texto é uma fotografia que existe.
 *
 * Em outputs/media convivem fotos e peças técnicas da cena de chegada
 * (máscaras em preto e branco, mapas de profundidade). Pelo nome elas parecem
 * paisagens; na grade do Caderno aparecem como manchas.
 */
test("toda capa do acervo existe e não é peça técnica da cena", async () => {
  for (const post of DEFAULT_BLOG_POSTS) {
    await access(new URL(`../../outputs/${post.cover}`, import.meta.url));
    assert.doesNotMatch(post.cover, /-(mask|depth|water|canopy|overlay)\b|-mask\.|depth\.webp|water\.webp|canopy\.webp/, `${post.id}: ${post.cover}`);
  }
});

test("os textos da segunda leva não repetem capa entre si", () => {
  const capas = DEFAULT_BLOG_POSTS.slice(8).map((post) => post.cover);
  assert.equal(new Set(capas).size, capas.length);
});
