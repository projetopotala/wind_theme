import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ASSINATURA_INSTITUCIONAL, apresentacaoDoEscritor, escritoresDoCaderno, hrefDoEscritor, slugDoEscritor, slugValido, textosDoEscritor,
} from "../../outputs/js/blog/escritores.js";
import { metadados, montarEscritor, renderizarPagina } from "../../outputs/js/blog/escritor-controller.js";
import { renderArticle } from "../../outputs/js/blog/article-renderer.js";
import { cartaoDoPost } from "../../outputs/js/blog/blog-controller.js";

const ler = (rel) => readFileSync(new URL(`../../outputs/${rel}`, import.meta.url), "utf8");

/* P2A | Blog organizado por escritores — pela assinatura pública dos textos publicados. */
const post = (id, author, publishedAt, extra = {}) => ({ id, slug: id, title: `Título ${id}`, excerpt: `Resumo ${id}`, author, publishedAt, category: "artigos", status: "published", content: [{ type: "paragraph", text: "x" }], ...extra });
const publicados = [
  post("a1", "Marina Alves", "2026-10-01", { cover: "media/capa.webp", coverAlt: "Capa" }),
  post("a2", "Marina Alves", "2026-11-05"),
  post("a3", "Equipe de Acolhimento", "2026-09-10"),
  post("a4", "", "2026-08-01"),
  post("a5", "MARÍNA alves", "2026-07-01"),
  post("r1", "Marina Alves", "2026-11-10", { status: "draft" }),
  post("h1", "Escritor Oculto", "2026-11-11", { status: "hidden" }),
];

test("endereço do escritor: estável, sem acentos, sem dados internos; texto sem assinatura é do Instituto", () => {
  assert.equal(slugDoEscritor("Marina Alves"), "marina-alves");
  assert.equal(slugDoEscritor("  Núcleo de Oráculos "), "nucleo-de-oraculos");
  assert.equal(slugDoEscritor(""), "instituto-potala");
  assert.equal(hrefDoEscritor("Ateliê Potala"), "escritor.html?nome=atelie-potala");
  assert.equal(slugValido("marina-alves"), "marina-alves");
  for (const ruim of ["../x", "<script>", "a b", "", "x".repeat(141)]) assert.equal(slugValido(ruim), "", ruim);
});

test("identidade: grafias equivalentes agrupam; assinaturas distintas nunca colidem; edição move o vínculo", () => {
  for (const variante of ["Marina  Alves", "marina alves", "MARÍNA ALVES", " Marina Alves "]) assert.equal(slugDoEscritor(variante), "marina-alves", variante);
  // Assinaturas sem letras latinas não podem cair todas no "novo-texto" genérico.
  const [a, b] = [slugDoEscritor("李明"), slugDoEscritor("王芳")];
  assert.notEqual(a, b);
  assert.match(a, /^assinatura-[a-z0-9]+$/);
  assert.equal(slugValido(a), a, "o endereço gerado é aceito pela página");
  assert.equal(slugDoEscritor("李明"), a, "estável");
  assert.equal(slugDoEscritor("Novo Texto"), "novo-texto");
  assert.notEqual(slugDoEscritor("✦✦"), slugDoEscritor("Novo Texto"));
  // Assinatura muito longa: o link continua abrindo a página certa.
  const longa = "Coletivo ".repeat(30).trim();
  assert.ok(slugDoEscritor(longa).length <= 120);
  assert.equal(slugValido(slugDoEscritor(longa)), slugDoEscritor(longa));
  assert.equal(textosDoEscritor([post("l1", longa, "2026-01-01")], slugDoEscritor(longa)).textos.length, 1);
  // A assinatura é por texto: editar a de um texto muda só o vínculo dele.
  const antes = [post("e1", "Ana Lima", "2026-01-01"), post("e2", "Ana Lima", "2026-02-01")];
  const depois = [post("e1", "Ana Lima Prado", "2026-01-01"), antes[1]];
  assert.deepEqual(textosDoEscritor(depois, "ana-lima").textos.map((p) => p.id), ["e2"]);
  assert.deepEqual(textosDoEscritor(depois, "ana-lima-prado").textos.map((p) => p.id), ["e1"]);
});

test("escritores: só textos publicados, agrupados pela assinatura, contagem, grafia principal e ordem alfabética", () => {
  const lista = escritoresDoCaderno(publicados);
  assert.deepEqual(lista.map((x) => [x.slug, x.nome, x.total]), [
    ["equipe-de-acolhimento", "Equipe de Acolhimento", 1],
    ["instituto-potala", ASSINATURA_INSTITUCIONAL, 1],
    ["marina-alves", "Marina Alves", 3],
  ]);
  assert.ok(!lista.some((x) => x.nome === "Escritor Oculto"), "arquivado não aparece");
  const marina = textosDoEscritor(publicados, "marina-alves");
  assert.deepEqual(marina.textos.map((p) => p.id), ["a2", "a1", "a5"], "mais recente primeiro; rascunho r1 fora");
  assert.equal(marina.nome, "Marina Alves");
  assert.deepEqual(textosDoEscritor(publicados, "<script>"), { slug: "", nome: "", textos: [] });
  assert.match(apresentacaoDoEscritor(marina), /Textos assinados por Marina Alves no Caderno de Travessia · 3 textos publicados\./);
  assert.match(apresentacaoDoEscritor(textosDoEscritor(publicados, "instituto-potala")), /assinados pelo Instituto Potala/);
});

test("página do escritor: nome, apresentação, cartões com imagem, título, resumo e data, voltar e outros escritores", () => {
  const html = renderizarPagina({ estado: "escritor", slug: "marina-alves", publicados });
  assert.match(html, /<a href="blog\.html">← Voltar ao Caderno<\/a>/);
  assert.match(html, /<h1 id="escritor-titulo">Marina Alves<\/h1>/);
  assert.equal((html.match(/<article class="post/g) || []).length, 3);
  assert.match(html, /<img src="media\/capa\.webp" alt="Capa"/, "imagem do texto");
  assert.match(html, /Título a2[\s\S]*Resumo a2[\s\S]*<time datetime="2026-11-05">5 de novembro de 2026<\/time>/);
  assert.match(html, /href="artigo\.html\?post=a2"/);
  assert.doesNotMatch(html, /Título r1|Título h1/, "rascunho e arquivado nunca aparecem");
  assert.match(html, /Outros escritores[\s\S]*escritor\.html\?nome=equipe-de-acolhimento/);
  assert.doesNotMatch(html, /escritor\.html\?nome=marina-alves" aria-current/, "o próprio não se repete em 'outros'");
});

test("estados: índice, escritor sem textos, banco indisponível e carregando", () => {
  const indice = renderizarPagina({ estado: "indice", publicados });
  assert.match(indice, /<h1 id="escritor-titulo">Escritores<\/h1>/);
  assert.equal((indice.match(/<a class="escritor-cartao__acao" href="escritor\.html\?nome=/g) || []).length, 3);
  const vazio = renderizarPagina({ estado: "escritor", slug: "ninguem-aqui", publicados });
  assert.match(vazio, /Nenhum texto publicado/);
  assert.match(vazio, /Voltar ao Caderno/);
  assert.match(renderizarPagina({ estado: "indice", publicados: [] }), /Ainda não há textos publicados no Caderno/);
  const fora = renderizarPagina({ estado: "indisponivel", erro: "Sem conexão." });
  assert.match(fora, /role="alert"[\s\S]*Sem conexão\.[\s\S]*data-escritor-tentar/);
  assert.match(renderizarPagina({ estado: "carregando" }), /role="status"/);
});

test("segurança: nomes escapados; nada de e-mail, created_by ou campos internos na página", () => {
  const malicioso = [post("x1", '<img src=x onerror=alert(1)> "Ana"', "2026-01-01", { created_by: "00000000-dead-beef", email: "ana@exemplo.test" })];
  const slug = slugDoEscritor('<img src=x onerror=alert(1)> "Ana"');
  const html = renderizarPagina({ estado: "escritor", slug, publicados: malicioso });
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt; &quot;Ana&quot;/);
  assert.doesNotMatch(html, /00000000-dead-beef|ana@exemplo\.test/);
  for (const arq of ["js/blog/escritores.js", "js/blog/escritor-controller.js"]) {
    const js = ler(arq).replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(js, /created_by|email|\.rpc\(|service_role|rest\.ler\(/, arq);
  }
  assert.match(ler("js/blog/blog-remoto.js"), /rest\.ler\("blog_posts", \{ select: "document,status,publish_at" \}\)/, "leitura pública continua sem created_by");
});

test("SEO: título, descrição, canônico e robots coerentes", () => {
  const m = metadados({ estado: "escritor", slug: "marina-alves", publicados, origem: "https://wind-theme.vercel.app" });
  assert.equal(m.titulo, "Marina Alves — Escritores do Caderno de Travessia — Instituto Potala");
  assert.equal(m.canonico, "https://wind-theme.vercel.app/escritor.html?nome=marina-alves");
  assert.equal(m.indexar, true);
  assert.match(m.descricao, /3 textos publicados/);
  assert.equal(metadados({ estado: "vazio", origem: "" }).indexar, false, "página sem textos não é indexada");
  assert.equal(metadados({ estado: "indice", origem: "https://x.test" }).canonico, "https://x.test/escritor.html");
});

test("assinatura vira link para o escritor no artigo e nos cartões do Caderno", () => {
  const artigo = renderArticle(post("a2", "Marina Alves", "2026-11-05"));
  assert.match(artigo, /Por <a class="article-autor" href="escritor\.html\?nome=marina-alves">Marina Alves<\/a>/);
  const semAssinatura = renderArticle(post("a4", "", "2026-08-01"));
  assert.match(semAssinatura, /Por <a class="article-autor" href="escritor\.html\?nome=instituto-potala">Instituto Potala<\/a>/);
  const cartao = cartaoDoPost(post("a3", "Equipe de Acolhimento", "2026-09-10"));
  assert.match(cartao, /<p class="post-credito">\s*<a href="escritor\.html\?nome=equipe-de-acolhimento">Equipe de Acolhimento<\/a>/);
  assert.doesNotMatch(cartao, /<a\s[^>]*>[^<]*<a\s/, "sem link dentro de link");
});

test("montagem: lê só os publicados pela via pública, aplica metadados e tenta de novo após falha", async () => {
  const head = { itens: [], querySelector(sel) { return this.itens.find((n) => n.sel === sel) || null; }, appendChild(n) { this.itens.push(n); return n; } };
  const no = (sel) => ({ sel, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } });
  const raiz = { innerHTML: "", ouvintes: {}, addEventListener(t, f) { this.ouvintes[t] = f; } };
  const trilha = { textContent: "" };
  const doc = {
    title: "", head,
    querySelector: (sel) => (sel === "[data-escritor-root]" ? raiz : sel === "[data-escritor-trilha]" ? trilha : null),
    createElement: () => { const n = no(""); return n; },
  };
  head.appendChild = function (n) { n.sel = n.name ? `meta[name="${n.name}"]` : n.rel ? `link[rel="${n.rel}"]` : `meta[property="${n.attrs.property}"]`; this.itens.push(n); return n; };
  let falhar = true; let chamadas = 0;
  const blog = { async listarPublicados() { chamadas += 1; if (falhar) throw new Error("Sem conexão."); return publicados; } };
  const pagina = montarEscritor(doc, { blog, local: { search: "?nome=marina-alves", origin: "https://wind-theme.vercel.app" } });
  await pagina.pronto;
  assert.match(raiz.innerHTML, /Sem conexão\.[\s\S]*data-escritor-tentar/);
  assert.equal(head.querySelector('meta[name="robots"]'), null, "falha passageira não marca a página como noindex");
  assert.equal(doc.title, "", "nem troca o título");
  falhar = false;
  raiz.ouvintes.click({ target: { closest: (s) => (s === "[data-escritor-tentar]" ? {} : null) } });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(chamadas, 2);
  assert.match(raiz.innerHTML, /<h1 id="escritor-titulo">Marina Alves<\/h1>/);
  assert.equal(doc.title, "Marina Alves — Escritores do Caderno de Travessia — Instituto Potala");
  assert.equal(trilha.textContent, "Marina Alves");
  assert.equal(head.querySelector('link[rel="canonical"]').attrs.href, "https://wind-theme.vercel.app/escritor.html?nome=marina-alves");
});

test("páginas estáticas: escritor.html completa; Blog ganha 'Quem escreve' oculto até haver publicados", () => {
  const html = ler("escritor.html");
  assert.match(html, /<title>Escritores — Caderno de Travessia — Instituto Potala<\/title>/);
  assert.match(html, /<meta name="description" content="Quem assina os textos do Caderno de Travessia do Instituto Potala\.">/);
  assert.match(html, /class="skip-link" href="#conteudo"/);
  assert.match(html, /<main class="escritor-pagina" id="conteudo" data-escritor-root/);
  assert.match(html, /<a href="blog\.html">Voltar ao Caderno<\/a>/);
  assert.match(html, /src="js\/blog\/escritor-controller\.js"/);
  assert.match(html, /src="js\/shared\/portal-menu-boot\.js"/);
  const blog = ler("blog.html");
  assert.match(blog, /<section class="lateral-lista blog-recentes blog-escritores" aria-labelledby="escritores-titulo" hidden>/);
  assert.match(blog, /<ul data-blog-escritores><\/ul>/);
  assert.match(ler("js/blog/blog-controller.js"), /escritoresDoCaderno\(publicados\)/, "o índice usa só o que o banco confirmou");
  const css = ler("css/escritor.css");
  assert.match(css, /@media \(max-width: 639px\) \{ \.escritor-grade \{ grid-template-columns: 1fr; \} \}/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
