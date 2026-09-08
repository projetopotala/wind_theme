import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizePost,
  normalizePosts,
  placeBlogPosts,
} from "../../outputs/js/blog/blog-model.js";
import { createBlogRepository } from "../../outputs/js/blog/blog-repository.js";

const post = (overrides = {}) => ({
  id: "silencio",
  slug: "silencio-como-territorio",
  title: "Silêncio como território",
  subtitle: "Uma pausa também pode ensinar.",
  excerpt: "Um convite para reencontrar o essencial.",
  category: "reflexao",
  author: "Instituto Potala",
  publishedAt: "2026-09-07",
  readingMinutes: 6,
  cover: "media/home-travessia.webp",
  coverAlt: "Montanhas atravessadas pela luz da manhã",
  featured: true,
  status: "published",
  content: [
    { id: "b1", type: "paragraph", text: "Há momentos em que o silêncio acolhe." },
    { id: "b2", type: "heading", text: "Escutar antes de responder" },
    { id: "b3", type: "image", src: "media/journey-inspiracao.webp", alt: "Luz entre montanhas", caption: "Uma pausa." },
    { id: "b4", type: "quote", text: "O caminho também acontece quando paramos." },
    { id: "b5", type: "list", items: ["Respirar", "Observar"] },
    { id: "b6", type: "divider" },
  ],
  relatedPostIds: [],
  updatedAt: "2026-09-07T12:00:00.000Z",
  ...overrides,
});

test("normaliza os seis blocos permitidos e descarta tipos arbitrários", () => {
  const normalized = normalizePost(post({
    content: [...post().content, { id: "x", type: "html", text: "<script>" }],
  }));

  assert.deepEqual(normalized.content.map((block) => block.type), [
    "paragraph", "heading", "image", "quote", "list", "divider",
  ]);
  assert.equal(normalized.slug, "silencio-como-territorio");
});

test("normaliza identificadores repetidos sem devolver dois posts com o mesmo id", () => {
  const normalized = normalizePosts([
    post(),
    post({ title: "Versão mais recente" }),
  ]);

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].title, "Versão mais recente");
});

test("o layout usa um destaque e ordena os demais publicados pela data", () => {
  const placement = placeBlogPosts([
    post({ id: "antigo", slug: "antigo", publishedAt: "2026-07-01", featured: true }),
    post({ id: "novo", slug: "novo", publishedAt: "2026-09-06", featured: true }),
    post({ id: "meio", slug: "meio", publishedAt: "2026-08-02", featured: false }),
    post({ id: "rascunho", slug: "rascunho", status: "draft", publishedAt: "2026-09-07" }),
  ]);

  assert.equal(placement.featured.id, "novo");
  assert.deepEqual(placement.grid.map(({ id }) => id), ["meio", "antigo"]);
  assert.deepEqual(placement.recent.map(({ id }) => id), ["novo", "meio", "antigo"]);
  assert.equal(placement.categories.reflexao, 3);
});

test("repositório local salva, exclui e restaura sem alterar os padrões", () => {
  const values = new Map();
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
  const defaults = [post()];
  const repository = createBlogRepository({ storage, defaults, key: "test.blog" });

  repository.save(post({ id: "novo", slug: "novo", title: "Novo texto", featured: false }));
  assert.deepEqual(repository.list().map(({ id }) => id), ["silencio", "novo"]);

  repository.remove("silencio");
  assert.deepEqual(repository.list().map(({ id }) => id), ["novo"]);

  repository.reset();
  assert.deepEqual(repository.list().map(({ id }) => id), ["silencio"]);
  assert.equal(defaults[0].title, "Silêncio como território");
});
