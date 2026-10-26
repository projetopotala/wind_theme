/*
 * P0 — A PÁGINA DO MARKETPLACE LEVA À LOJA INDEPENDENTE.
 *
 * O portal apresenta a curadoria; a compra acontece no Marketplace, que é outro
 * projeto (projetopotala/marketing-place-potala-frontend), publicado no endereço
 * registrado no próprio repositório. Antes, nenhum link da página chegava lá.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const LOJA = "https://marketing-place-potala.vercel.app/";
const pagina = await readFile(new URL("../../outputs/marketplace.html", import.meta.url), "utf8");
const links = [...pagina.matchAll(/<a\b[^>]*data-marketplace-loja[^>]*>([^<]*)<\/a>/g)];

test("a loja aparece na abertura, no bloco 'Antes de escolher' e no fechamento", () => {
  assert.equal(links.length, 3);
  const abertura = pagina.indexOf('id="market-title"');
  const primeira = pagina.indexOf("data-marketplace-loja");
  const colecao = pagina.indexOf('id="colecao"');
  assert.ok(primeira > abertura && primeira < colecao, "a primeira chamada precisa estar na abertura, antes da coleção");
});

test("todas as chamadas apontam para o endereço oficial, em https, sem passar dados", () => {
  for (const [tag, texto] of links) {
    assert.match(tag, new RegExp(`href="${LOJA.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}"`));
    assert.match(tag, /rel="noopener"/);
    assert.doesNotMatch(tag, /[?#]/, "o link não leva parâmetros nem dados do visitante");
    assert.match(texto, /loja do Marketplace/);
  }
});

test("a loja continua fora do portal: nenhum script do Marketplace é carregado aqui", () => {
  assert.doesNotMatch(pagina, /<script[^>]+marketing-place/);
  assert.doesNotMatch(pagina, /<iframe/);
});
