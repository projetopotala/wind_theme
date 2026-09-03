import assert from "node:assert/strict";
import test from "node:test";

import { createBlocksList, renderEntryRow } from "../../outputs/js/admin/admin-blocks-list.js";

const entrada = (extra = {}) => ({
  id: "atendimentos",
  state: "publicado",
  hasDraft: false,
  block: { id: "atendimentos", title: "Atendimentos", category: "O cuidado", image: "" },
  ...extra,
});

test("a linha traz número, título, categoria e badge", () => {
  const html = renderEntryRow(entrada(), 2, 5);
  assert.match(html, /admin-row-index">03</);
  assert.match(html, /Atendimentos/);
  assert.match(html, /O cuidado/);
  assert.match(html, /data-state="publicado">Publicado/);
});

/*
 * Arrastar nunca pode ser o único caminho: quem usa teclado ou leitor de tela
 * depende dos dois botões para mudar a ordem.
 */
test("mover acima e abaixo estão sempre na linha", () => {
  const html = renderEntryRow(entrada(), 1, 3);
  assert.match(html, /data-action="up"/);
  assert.match(html, /data-action="down"/);
});

test("a primeira linha não sobe e a última não desce", () => {
  assert.match(renderEntryRow(entrada(), 0, 3), /data-action="up"[^>]*disabled/);
  assert.doesNotMatch(renderEntryRow(entrada(), 0, 3), /data-action="down"[^>]*disabled/);
  assert.match(renderEntryRow(entrada(), 2, 3), /data-action="down"[^>]*disabled/);
});

/* Descartar rascunho num bloco que não tem rascunho é uma ação sem efeito, e
   oferecê-la faz o editor duvidar do que está vendo. */
test("descartar rascunho só aparece quando existe rascunho", () => {
  assert.doesNotMatch(renderEntryRow(entrada({ hasDraft: false }), 0, 1), /data-action="discard"/);
  assert.match(renderEntryRow(entrada({ hasDraft: true }), 0, 1), /data-action="discard"/);
});

test("um bloco com alterações pendentes diz isso na linha", () => {
  const html = renderEntryRow(entrada({ state: "pendente", hasDraft: true }), 0, 1);
  assert.match(html, /alterações por publicar/);
});

test("a linha ativa é marcada", () => {
  assert.match(renderEntryRow({ ...entrada(), active: true }, 0, 1), /aria-current="true"/);
  assert.doesNotMatch(renderEntryRow(entrada(), 0, 1), /aria-current/);
});

/* Título vindo do banco é texto de quem edita, e o painel o injeta como HTML.
   Sem escapar, um título com uma tag quebraria a lista — ou pior. */
test("o título é escapado antes de virar markup", () => {
  const html = renderEntryRow(
    entrada({ block: { title: '<img src=x onerror="alert(1)">', category: "" } }),
    0,
    1,
  );
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
});

test("sem imagem, a linha usa um espaço reservado", () => {
  assert.match(renderEntryRow(entrada(), 0, 1), /admin-row-thumb/);
  const comImagem = renderEntryRow(
    entrada({ block: { title: "A", category: "", image: "media/a.webp" } }),
    0,
    1,
  );
  assert.match(comImagem, /<img src="media\/a\.webp" alt="" loading="lazy">/);
});

function montarRaiz() {
  const ouvintes = new Map();
  const lista = {
    innerHTML: "",
    addEventListener(tipo, fn) { ouvintes.set(tipo, fn); },
    removeEventListener(tipo) { ouvintes.delete(tipo); },
    disparar(tipo, evento) { ouvintes.get(tipo)?.(evento); },
    ouvintes,
  };
  const contadores = { textContent: "" };
  return {
    lista,
    contadores,
    root: {
      querySelector: (seletor) =>
        (seletor === "[data-admin-list]" ? lista : seletor === "[data-admin-counts]" ? contadores : null),
    },
  };
}

test("os contadores leem o que a lista recebeu", () => {
  const { root, contadores } = montarRaiz();
  createBlocksList({ root }).render([entrada()], {
    counts: { total: 12, publicados: 10, rascunhos: 2 },
  });
  assert.equal(contadores.textContent, "12 blocos · 10 publicados · 2 rascunhos");
});

test("clique numa ação avisa quem pediu, com a ação e o bloco", () => {
  const { root, lista } = montarRaiz();
  const chamadas = [];
  createBlocksList({ root, onAction: (acao, id) => chamadas.push([acao, id]) });

  lista.disparar("click", {
    target: { closest: () => ({ dataset: { action: "duplicate", id: "atendimentos" } }) },
  });

  assert.deepEqual(chamadas, [["duplicate", "atendimentos"]]);
});

/* A alça é para arrastar, não para selecionar. Um clique nela que chegasse ao
   onAction abriria o bloco toda vez que alguém errasse o alvo do arrasto. */
test("a alça de arrastar não dispara ação", () => {
  const { root, lista } = montarRaiz();
  const chamadas = [];
  createBlocksList({ root, onAction: (acao) => chamadas.push(acao) });

  lista.disparar("click", {
    target: { closest: () => ({ dataset: { action: "grip", id: "atendimentos" } }) },
  });

  assert.deepEqual(chamadas, []);
});

/*
 * As ações empilhadas na linha engoliam o bloco: miniatura, título e badge
 * sumiam atrás de cinco botões. Guardar TUDO no menu resolveria o tamanho, mas
 * esconderia atrás de mais um clique o único caminho de reordenar sem mouse.
 */
test("subir e descer ficam fora do menu; o resto vai para dentro", () => {
  const html = renderEntryRow(entrada({ hasDraft: true }), 1, 3);
  const menu = html.slice(html.indexOf("<details"));
  const fora = html.slice(0, html.indexOf("<details"));

  assert.match(fora, /data-action="up"/);
  assert.match(fora, /data-action="down"/);
  assert.match(menu, /data-action="duplicate"/);
  assert.match(menu, /data-action="delete"/);
  assert.match(menu, /data-action="discard"/);
});

/* Um botão cujo rótulo visível é só uma seta precisa dizer o que faz para quem
   lê a tela — "↑" sozinho não é nome de nada. */
test("as setas de reordenar têm nome acessível", () => {
  const html = renderEntryRow(entrada(), 1, 3);
  assert.match(html, /<span class="admin-sr">Mover acima<\/span>/);
  assert.match(html, /<span class="admin-sr">Mover abaixo<\/span>/);
});
