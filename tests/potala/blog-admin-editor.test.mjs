import assert from "node:assert/strict";
import test from "node:test";

import {
  addContentBlock,
  createBlankPost,
  mergeDraftPosts,
  moveContentBlock,
  postPreview,
  removeContentBlock,
} from "../../outputs/js/blog-admin/blog-editor.js";

test("um novo post nasce como rascunho com endereço utilizável", () => {
  const post = createBlankPost("2026-09-07T12:00:00.000Z");
  assert.equal(post.status, "draft");
  assert.ok(post.id);
  assert.ok(post.slug);
  assert.deepEqual(post.content, []);
});

test("o editor admite exatamente os seis tipos de conteúdo", () => {
  let post = createBlankPost();
  for (const type of ["paragraph", "heading", "image", "quote", "list", "divider"]) post = addContentBlock(post, type);
  assert.deepEqual(post.content.map(({ type }) => type), ["paragraph", "heading", "image", "quote", "list", "divider"]);
  assert.equal(addContentBlock(post, "html"), post);
});

test("blocos podem subir, descer e ser removidos sem mutar o post", () => {
  const original = { ...createBlankPost(), content:[{ id:"a", type:"paragraph", text:"A" }, { id:"b", type:"heading", text:"B" }] };
  const moved = moveContentBlock(original, "b", -1);
  assert.deepEqual(moved.content.map(({ id }) => id), ["b", "a"]);
  assert.deepEqual(original.content.map(({ id }) => id), ["a", "b"]);
  assert.deepEqual(removeContentBlock(moved, "b").content.map(({ id }) => id), ["a"]);
});

test("a prévia recebe o rascunho selecionado sem gravá-lo", () => {
  const saved = [{ ...createBlankPost(), id:"saved", title:"Salvo" }];
  const draft = { ...saved[0], title:"Ainda digitando", featured:true };
  const merged = mergeDraftPosts(saved, draft);
  assert.equal(merged[0].title, "Ainda digitando");
  assert.equal(saved[0].title, "Salvo");
  const calls = [];
  postPreview({ postMessage:(...args) => calls.push(args) }, merged, draft.slug, "http://127.0.0.1:4173");
  assert.equal(calls[0][0].type, "potala:blog-preview");
  assert.equal(calls[0][1], "http://127.0.0.1:4173");
});
