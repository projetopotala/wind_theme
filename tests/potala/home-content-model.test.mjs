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

