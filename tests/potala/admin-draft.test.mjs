import assert from "node:assert/strict";
import test from "node:test";

import {
  blockState,
  mergeBlocks,
  pendingCount,
  publishPayload,
} from "../../outputs/js/admin/admin-draft.js";

const bloco = (id, extra = {}) => ({ id, title: id, published: true, position: 0, ...extra });

test("um bloco só em rascunho é rascunho", () => {
  assert.equal(blockState({ published: null, draft: bloco("a") }), "rascunho");
});

test("um bloco só publicado é publicado", () => {
  assert.equal(blockState({ published: bloco("a"), draft: null }), "publicado");
});

test("um bloco nos dois lugares está pendente", () => {
  assert.equal(blockState({ published: bloco("a"), draft: bloco("a") }), "pendente");
});

/*
 * Publicado com "Exibir na jornada" desligado conta como rascunho, porque é
 * isso que ele é para quem visita: invisível. Sem esta regra o painel chamaria
 * de publicado um bloco que ninguém consegue ver.
 */
test("publicado e escondido conta como rascunho", () => {
  assert.equal(
    blockState({ published: bloco("a", { published: false }), draft: null }),
    "rascunho",
  );
});

test("mergeBlocks entrega o rascunho quando ele existe", () => {
  const entradas = mergeBlocks({
    published: [bloco("a", { title: "Velho" })],
    drafts: [bloco("a", { title: "Novo" })],
  });
  assert.equal(entradas.length, 1);
  assert.equal(entradas[0].block.title, "Novo");
  assert.equal(entradas[0].state, "pendente");
  assert.equal(entradas[0].hasDraft, true);
});

test("mergeBlocks inclui bloco que só existe como rascunho", () => {
  const entradas = mergeBlocks({ published: [], drafts: [bloco("novo")] });
  assert.deepEqual(entradas.map((entrada) => entrada.id), ["novo"]);
  assert.equal(entradas[0].state, "rascunho");
});

test("mergeBlocks ordena por posição", () => {
  const entradas = mergeBlocks({
    published: [bloco("b", { position: 1 }), bloco("a", { position: 0 })],
    drafts: [],
  });
  assert.deepEqual(entradas.map((entrada) => entrada.id), ["a", "b"]);
});

/*
 * Duas posições iguais acontecem: o painel escreve a posição ao reordenar, e um
 * rascunho gravado antes da reordenação carrega a posição antiga. Sem desempate,
 * a ordem da lista mudaria entre dois carregamentos sem nada ter mudado.
 */
test("posições iguais desempatam pelo identificador", () => {
  const entradas = mergeBlocks({
    published: [bloco("zebra", { position: 2 }), bloco("abelha", { position: 2 })],
    drafts: [],
  });
  assert.deepEqual(entradas.map((entrada) => entrada.id), ["abelha", "zebra"]);
});

test("pendingCount conta só quem tem rascunho", () => {
  const entradas = mergeBlocks({
    published: [bloco("a"), bloco("b")],
    drafts: [bloco("a"), bloco("c")],
  });
  assert.equal(pendingCount(entradas), 2);
});

test("publishPayload leva todo rascunho, inclusive o que nunca foi ao ar", () => {
  const entradas = mergeBlocks({
    published: [bloco("a", { title: "Velho" })],
    drafts: [bloco("a", { title: "Novo" }), bloco("c")],
  });
  assert.deepEqual(publishPayload(entradas).map((item) => item.id).sort(), ["a", "c"]);
  assert.equal(publishPayload(entradas).find((item) => item.id === "a").title, "Novo");
});

test("publishPayload não leva bloco sem rascunho", () => {
  const entradas = mergeBlocks({ published: [bloco("a")], drafts: [] });
  assert.deepEqual(publishPayload(entradas), []);
});
