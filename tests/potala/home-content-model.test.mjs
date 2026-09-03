import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeHomeBlock,
  normalizeHomeBlocks,
} from "../../outputs/js/home/content-model.js";

test("normaliza a ordem e alterna lados inválidos", () => {
  const blocks = normalizeHomeBlocks([
    { id: "a", title: "A", summary: "Resumo", side: "center", position: 9 },
    { id: "b", title: "B", summary: "Resumo", side: "left", position: 2 },
  ]);

  assert.deepEqual(blocks.map(({ id, side, position }) => ({ id, side, position })), [
    { id: "b", side: "left", position: 0 },
    { id: "a", side: "right", position: 1 },
  ]);
});

test("descarta itens sem título e converte tags em uma lista segura", () => {
  const blocks = normalizeHomeBlocks([
    { id: "ok", title: " Presença ", summary: " Texto ", tags: "cuidado, escuta" },
    { id: "sem-titulo", title: "", summary: "Texto" },
  ]);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].title, "Presença");
  assert.equal(blocks[0].summary, "Texto");
  assert.deepEqual(blocks[0].tags, ["cuidado", "escuta"]);
});

test("gera slug estável e mantém o bloco publicado por padrão", () => {
  const block = normalizeHomeBlock({
    title: " Saúde Integrativa ",
    summary: "Cuidado por inteiro.",
  }, 0);

  assert.equal(block.id, "saude-integrativa");
  assert.equal(block.slug, "saude-integrativa");
  assert.equal(block.published, true);
  assert.equal(block.side, "left");
});


test("os campos novos do editor têm padrão seguro", () => {
  const bloco = normalizeHomeBlock({ title: "Atendimentos" }, 0);
  assert.equal(bloco.titleScale, "normal");
  assert.equal(bloco.allowPanel, true);
  assert.equal(bloco.metaDescription, "");

  const compacto = normalizeHomeBlock(
    { title: "A", titleScale: "compact", allowPanel: false, metaDescription: " Um texto " },
    0,
  );
  assert.equal(compacto.titleScale, "compact");
  assert.equal(compacto.allowPanel, false);
  assert.equal(compacto.metaDescription, "Um texto");
});

/*
 * Um valor inventado no banco não pode virar um data-attribute que o CSS não
 * conhece — o título simplesmente perderia escala, e ninguém liga o defeito à
 * linha errada no banco.
 */
test("escala de título fora da lista volta ao padrão", () => {
  assert.equal(normalizeHomeBlock({ title: "A", titleScale: "gigante" }, 0).titleScale, "normal");
  assert.equal(normalizeHomeBlock({ title: "A", titleScale: null }, 0).titleScale, "normal");
});
