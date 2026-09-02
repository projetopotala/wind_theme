import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  moveBlock,
  validateBlockDraft,
} from "../../outputs/js/admin/admin-controller.js";

const html = () => readFile(new URL("../../outputs/admin.html", import.meta.url), "utf8");

test("painel carrega autenticação real antes do controlador editorial", async () => {
  const markup = await html();
  assert.match(markup, /vendor\/supabase\.js/);
  assert.match(markup, /admin-entry\.js/);
  assert.doesNotMatch(markup, /Prévia local|não representa autenticação real/i);
});

test("o painel pede senha sem oferecer cadastro público", async () => {
  const markup = await html();
  assert.match(markup, /type="password"/i);
  assert.match(markup, /name="password"/i);
  assert.doesNotMatch(markup, /signUp|criar conta|cadastre-se/i);
});

test("painel permite definir imagem e ícone do bloco expandido", async () => {
  const markup = await html();
  assert.match(markup, /name="image"/);
  assert.match(markup, /name="icon"/);
});

test("moveBlock reordena sem perder os lados definidos", () => {
  const moved = moveBlock([
    { id: "a", side: "left", position: 0 },
    { id: "b", side: "right", position: 1 },
  ], "b", -1);

  assert.deepEqual(moved.map(({ id, side, position }) => ({ id, side, position })), [
    { id: "b", side: "right", position: 0 },
    { id: "a", side: "left", position: 1 },
  ]);
});

test("moveBlock para nas pontas em vez de dar a volta", () => {
  const lista = [{ id: "a", position: 0 }, { id: "b", position: 1 }];

  // Dar a volta faria o primeiro item saltar para o fim ao clicar "mover
  // acima" — um clique repetido por engano reembaralharia a jornada inteira.
  assert.deepEqual(moveBlock(lista, "a", -1).map((b) => b.id), ["a", "b"]);
  assert.deepEqual(moveBlock(lista, "b", 1).map((b) => b.id), ["a", "b"]);
  assert.deepEqual(moveBlock(lista, "inexistente", 1).map((b) => b.id), ["a", "b"]);
});

test("moveBlock não altera a lista recebida", () => {
  const original = [{ id: "a", position: 0 }, { id: "b", position: 1 }];
  const copia = JSON.parse(JSON.stringify(original));
  moveBlock(original, "b", -1);
  assert.deepEqual(original, copia, "reordenar não pode mexer no que o chamador ainda usa");
});

test("rascunho inválido não chega ao armazenamento", () => {
  const base = { title: "Quem somos", summary: "Uma apresentação.", side: "left", href: "quem-somos.html" };

  assert.deepEqual(validateBlockDraft(base), {});

  assert.ok(validateBlockDraft({ ...base, title: "  " }).title, "título vazio precisa acusar");
  assert.ok(validateBlockDraft({ ...base, summary: "" }).summary, "resumo vazio precisa acusar");
  assert.ok(validateBlockDraft({ ...base, side: "meio" }).side, "lado fora do par precisa acusar");
});

test("o destino aceita caminho do próprio portal e https, e recusa o resto", () => {
  const base = { title: "T", summary: "S", side: "left" };

  for (const href of ["quem-somos.html", "/cursos", "#depois", "https://institutopotala.com"]) {
    assert.equal(validateBlockDraft({ ...base, href }).href, undefined, `${href} devia passar`);
  }

  /*
   * `javascript:` é o motivo de esta validação existir: o campo é preenchido
   * por uma pessoa e o valor vai parar num `href` da Home. `http://` fica de
   * fora por outro motivo — a página é servida por https, e um link claro
   * levaria o visitante para fora do canal seguro sem aviso nenhum.
   */
  for (const href of ["javascript:alert(1)", "http://institutopotala.com", "data:text/html,<b>"]) {
    assert.ok(validateBlockDraft({ ...base, href }).href, `${href} devia ser recusado`);
  }
});

test("arrastar nunca é o único caminho para reordenar", async () => {
  const { renderBlockRow } = await import("../../outputs/js/admin/admin-controller.js");
  const meio = renderBlockRow({ id: "b", title: "Cursos", side: "right", published: true }, 1, 3);

  /*
   * Arrastar com o mouse exclui teclado, leitor de tela e boa parte de quem tem
   * limitação motora. Os dois botões são o caminho de verdade; o `draggable` é
   * o atalho para quem já usa o mouse.
   */
  assert.match(meio, /data-action="up"/);
  assert.match(meio, /data-action="down"/);
  assert.match(meio, /draggable="true"/);

  // Nas pontas o botão que não leva a lugar nenhum aparece desabilitado, em vez
  // de sumir: a lista não muda de forma conforme se navega por ela.
  assert.match(renderBlockRow({ id: "a", title: "A", side: "left", published: true }, 0, 3), /data-action="up"[^>]*disabled/);
  assert.match(renderBlockRow({ id: "c", title: "C", side: "left", published: true }, 2, 3), /data-action="down"[^>]*disabled/);
});

test("título de bloco não vira markup na lista do painel", async () => {
  const { renderBlockRow } = await import("../../outputs/js/admin/admin-controller.js");
  // O texto é digitado por uma pessoa e volta para a tela dela via innerHTML.
  const linha = renderBlockRow(
    { id: "x", title: '<img src=x onerror="alert(1)">', side: "left", published: true },
    0,
    1,
  );
  assert.doesNotMatch(linha, /<img/);
  assert.match(linha, /&lt;img/);
});

test("aplicar e remover mantêm a ordem sem buracos", async () => {
  const { applyDraft, removeBlock } = await import("../../outputs/js/admin/admin-controller.js");

  const base = [
    { id: "a", title: "A", summary: "a", side: "left", position: 0, published: true, tags: [], href: "#" },
    { id: "b", title: "B", summary: "b", side: "right", position: 1, published: true, tags: [], href: "#" },
  ];

  const comNovo = applyDraft(base, { title: "C", summary: "c", side: "left", href: "#" });
  assert.deepEqual(comNovo.map((item) => item.position), [0, 1, 2]);
  assert.equal(comNovo.at(-1).title, "C");
  assert.ok(comNovo.at(-1).updatedAt, "salvar precisa registrar quando foi");

  // Sem a reindexação, o bloco seguinte herdaria a posição do removido e a
  // ordenação por `position` passaria a depender do desempate do navegador.
  const semPrimeiro = removeBlock(comNovo, "a");
  assert.deepEqual(semPrimeiro.map((item) => item.position), [0, 1]);
  assert.deepEqual(semPrimeiro.map((item) => item.id), ["b", comNovo.at(-1).id]);
});
