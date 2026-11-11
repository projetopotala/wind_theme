import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ler = (rel) => readFileSync(new URL(`../../outputs/${rel}`, import.meta.url), "utf8");

/*
 * A Home do Instituto mostra, em cada cena, só a imagem grande principal: a imagem menor sobreposta
 * no canto inferior direito (home-scene__detail-image) foi retirada.
 */
test("nenhuma cena da Home tem imagem secundária sobreposta; cada uma mantém a principal", () => {
  const html = ler("atendimentos-conceito.html");
  assert.doesNotMatch(html, /home-scene__detail-image/);
  const cenas = html.match(/<section class="home-scene\b/g) || [];
  assert.ok(cenas.length >= 12, "as cenas da Home continuam presentes");
  assert.equal((html.match(/class="home-scene__main-image"/g) || []).length, cenas.length, "uma imagem principal por cena");
  assert.equal((html.match(/class="home-scene__photo"/g) || []).length, cenas.length);
});

test("o estilo não reserva nem posiciona mais a imagem secundária", () => {
  for (const css of ["css/home-editorial-essay.css", "css/atendimentos-column-layout.css", "css/home-page-editor.css"]) {
    assert.doesNotMatch(ler(css), /detail-image/, css);
  }
  assert.doesNotMatch(ler("js/home/page-editor.js"), /detail-media|detail-image/);
});

test("textos, títulos e links das cenas seguem na Home", () => {
  const html = ler("atendimentos-conceito.html");
  for (const trecho of ["Quem somos", "Conhecer o Instituto", 'href="quem-somos.html"', 'href="cursos.html"', 'href="blog.html"', 'href="marketplace.html"']) {
    assert.ok(html.includes(trecho), `faltou: ${trecho}`);
  }
});
