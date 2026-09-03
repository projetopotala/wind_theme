import assert from "node:assert/strict";
import test from "node:test";

import { renderRestrictedMarkdown, safeLinkHref } from "../../outputs/js/shared/markdown.js";

test("parágrafos saem de linhas em branco", () => {
  assert.equal(
    renderRestrictedMarkdown("Primeiro.\n\nSegundo."),
    "<p>Primeiro.</p><p>Segundo.</p>",
  );
});

test("negrito, itálico e link viram tags", () => {
  assert.equal(
    renderRestrictedMarkdown("**forte** e *leve* e [Potala](https://institutopotala.com/)"),
    '<p><strong>forte</strong> e <em>leve</em> e <a href="https://institutopotala.com/">Potala</a></p>',
  );
});

test("listas e citação", () => {
  assert.equal(
    renderRestrictedMarkdown("- um\n- dois"),
    "<ul><li>um</li><li>dois</li></ul>",
  );
  assert.equal(
    renderRestrictedMarkdown("1. um\n2. dois"),
    "<ol><li>um</li><li>dois</li></ol>",
  );
  assert.equal(renderRestrictedMarkdown("> silêncio"), "<blockquote>silêncio</blockquote>");
});

/*
 * O valor deste módulo é não deixar HTML passar. É isso que os testes hostis
 * precisam provar — não que ele formata bonito.
 */
test("HTML colado no texto é escapado, não executado", () => {
  assert.equal(
    renderRestrictedMarkdown("<script>alert(1)</script>"),
    "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
  );
  assert.equal(
    renderRestrictedMarkdown('<img src=x onerror="alert(1)">'),
    "<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>",
  );
});

test("esquema de link fora da lista vira #", () => {
  assert.equal(safeLinkHref("javascript:alert(1)"), "#");
  assert.equal(safeLinkHref("data:text/html,<script>"), "#");
  assert.equal(safeLinkHref("  JavaScript:alert(1)  "), "#");
  assert.equal(safeLinkHref("https://institutopotala.com/"), "https://institutopotala.com/");
  assert.equal(safeLinkHref("quem-somos.html"), "quem-somos.html");
  assert.equal(safeLinkHref("/media/foto.webp"), "/media/foto.webp");
});

test("link com esquema proibido continua sendo link, mas inerte", () => {
  assert.equal(
    renderRestrictedMarkdown("[clique](javascript:alert(1))"),
    '<p><a href="#">clique</a></p>',
  );
});

test("marca não fechada fica como texto", () => {
  assert.equal(renderRestrictedMarkdown("**quase"), "<p>**quase</p>");
  assert.equal(renderRestrictedMarkdown("[sem fim](http"), "<p>[sem fim](http</p>");
});

test("aspas e e-comercial dentro do texto do link são escapados", () => {
  assert.equal(
    renderRestrictedMarkdown('[a & "b"](https://x.test/?q=1&r=2)'),
    '<p><a href="https://x.test/?q=1&amp;r=2">a &amp; &quot;b&quot;</a></p>',
  );
});

/*
 * O link é substituído ANTES do itálico. Um asterisco dentro do endereço —
 * comum em parâmetros de busca — viraria <em> no meio da URL se a ordem fosse
 * a contrária, e o link chegaria quebrado à tela.
 */
test("asterisco dentro do endereço não vira itálico", () => {
  assert.equal(
    renderRestrictedMarkdown("[busca](https://x.test/?q=*a*b)"),
    '<p><a href="https://x.test/?q=*a*b">busca</a></p>',
  );
});

test("texto vazio não produz parágrafo vazio", () => {
  assert.equal(renderRestrictedMarkdown(""), "");
  assert.equal(renderRestrictedMarkdown("   \n\n  "), "");
});
