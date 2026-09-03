import assert from "node:assert/strict";
import test from "node:test";

import { countEntries, filterEntries } from "../../outputs/js/admin/admin-filters.js";

const entrada = (id, state, extra = {}) => ({
  id,
  state,
  hasDraft: state !== "publicado",
  block: { id, title: id, category: "", summary: "", ...extra },
});

const amostra = [
  entrada("quem-somos", "publicado", { title: "Quem somos", category: "A entrada" }),
  entrada("recepcao", "publicado", { title: "Recepção", category: "O primeiro contato" }),
  entrada("cursos", "rascunho", { title: "Cursos", category: "O conhecimento" }),
];

test("contadores separam publicados de rascunhos", () => {
  assert.deepEqual(countEntries(amostra), { total: 3, publicados: 2, rascunhos: 1 });
});

/* Pendente está no ar com alterações por publicar: o visitante vê a versão
   antiga, mas vê. Contar como rascunho diria que o bloco não existe no site. */
test("pendente conta como publicado, porque está no ar", () => {
  const comPendente = [...amostra, entrada("atendimentos", "pendente", { title: "Atendimentos" })];
  assert.deepEqual(countEntries(comPendente), { total: 4, publicados: 3, rascunhos: 1 });
});

test("aba filtra por estado", () => {
  assert.deepEqual(
    filterEntries(amostra, { tab: "rascunhos" }).map((item) => item.id),
    ["cursos"],
  );
  assert.deepEqual(
    filterEntries(amostra, { tab: "publicados" }).map((item) => item.id),
    ["quem-somos", "recepcao"],
  );
  assert.equal(filterEntries(amostra, { tab: "todos" }).length, 3);
});

test("busca olha título, categoria e resumo", () => {
  assert.deepEqual(
    filterEntries(amostra, { query: "contato" }).map((item) => item.id),
    ["recepcao"],
  );
  assert.deepEqual(
    filterEntries(amostra, { query: "Cursos" }).map((item) => item.id),
    ["cursos"],
  );
});

/* Quem digita "recepcao" tem de achar "Recepção". Buscar sem dobrar acento
   deixaria o resultado depender do teclado de quem procura. */
test("busca ignora acento e caixa", () => {
  assert.deepEqual(
    filterEntries(amostra, { query: "recepcao" }).map((item) => item.id),
    ["recepcao"],
  );
  assert.deepEqual(
    filterEntries(amostra, { query: "RECEPÇÃO" }).map((item) => item.id),
    ["recepcao"],
  );
});

test("busca e aba se somam", () => {
  assert.deepEqual(filterEntries(amostra, { tab: "publicados", query: "cursos" }), []);
});

test("busca vazia não filtra nada", () => {
  assert.equal(filterEntries(amostra, { query: "   " }).length, 3);
});

test("sem argumentos, devolve tudo", () => {
  assert.equal(filterEntries(amostra).length, 3);
  assert.deepEqual(countEntries(), { total: 0, publicados: 0, rascunhos: 0 });
});
