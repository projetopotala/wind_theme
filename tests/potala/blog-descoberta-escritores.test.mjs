import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  escritoresDoCaderno, escritoresEmDestaque, filtrarEscritores, perfisPorSlug, resumoDaBio, temasDoEscritor,
} from "../../outputs/js/blog/escritores.js";
import { cartaoDoEscritor, cartoesDosEscritores } from "../../outputs/js/blog/escritores-ui.js";
import { diretorioDeEscritores, filtrarTextos, renderizarPagina } from "../../outputs/js/blog/escritor-controller.js";
import { menuDasCategorias } from "../../outputs/js/blog/blog-controller.js";

const ler = (rel) => readFileSync(new URL(`../../outputs/${rel}`, import.meta.url), "utf8");
const post = (id, author, publishedAt, extra = {}) => ({ id, slug: id, title: `Título ${id}`, excerpt: `Resumo ${id}`, author, publishedAt, category: "artigos", status: "published", content: [{ type: "paragraph", text: "x" }], ...extra });

/* Dados SINTÉTICOS de teste. Nenhum deles é conteúdo do Blog oficial. */
const publicados = [
  post("a1", "Marina Alves", "2026-10-01", { category: "oraculos" }),
  post("a2", "Marina Alves", "2026-11-05", { category: "oraculos" }),
  post("a3", "Marina Alves", "2026-11-06", { category: "terapias" }),
  post("b1", "Équipe de Acolhimento", "2026-09-10", { category: "terapias" }),
  post("c1", "Lin Watanabe", "2026-08-01"),
  post("c2", "Lin Watanabe", "2026-08-02"),
  post("c3", "Lin Watanabe", "2026-08-03"),
  post("c4", "Lin Watanabe", "2026-08-04"),
  post("c5", "Lin Watanabe", "2026-08-05"),
  post("c6", "Lin Watanabe", "2026-08-06", { category: "cultura" }),
  post("r1", "Rascunho Secreto", "2026-11-10", { status: "draft" }),
  post("h1", "Escritor Oculto", "2026-11-11", { status: "hidden" }),
];

test("só aparece quem tem texto publicado, sem duplicar a mesma assinatura, com a contagem real", () => {
  const lista = escritoresDoCaderno(publicados);
  assert.deepEqual(lista.map((i) => [i.nome, i.total]).sort(), [["Lin Watanabe", 6], ["Marina Alves", 3], ["Équipe de Acolhimento", 1]].sort());
  assert.ok(!lista.some((i) => /Secreto|Oculto/.test(i.nome)), "rascunho e oculto nunca entram");
  assert.equal(new Set(lista.map((i) => i.slug)).size, lista.length);
});

test("temas do escritor: categorias reais, da mais frequente para a menos", () => {
  const marina = escritoresDoCaderno(publicados).find((i) => i.slug === "marina-alves");
  assert.deepEqual(marina.temas, [{ id: "oraculos", total: 2 }, { id: "terapias", total: 1 }]);
  assert.deepEqual(temasDoEscritor([]), []);
});

test("busca por nome: sem acento, qualquer parte, e também pelo nome do perfil", () => {
  const todos = escritoresDoCaderno(publicados);
  assert.deepEqual(filtrarEscritores(todos, "equipe").map((i) => i.slug), ["equipe-de-acolhimento"]);
  assert.deepEqual(filtrarEscritores(todos, " ALVES marina ").map((i) => i.slug), ["marina-alves"]);
  assert.equal(filtrarEscritores(todos, "").length, todos.length);
  assert.equal(filtrarEscritores(todos, "ninguem").length, 0);
  const perfis = perfisPorSlug([{ slug: "lin-watanabe", name: "Lin Watanabe-Souza", visible: true }]);
  assert.deepEqual(filtrarEscritores(todos, "souza", perfis).map((i) => i.slug), ["lin-watanabe"]);
});

test("destaque da página inicial: quem mais publicou primeiro, no máximo o limite", () => {
  const todos = escritoresDoCaderno(publicados);
  assert.deepEqual(escritoresEmDestaque(todos, 2).map((i) => i.slug), ["lin-watanabe", "marina-alves"]);
  assert.equal(escritoresEmDestaque(todos, 6).length, 3);
});

test("cartão: iniciais sem foto, sem biografia inventada, botão claro e texto escapado", () => {
  const html = cartaoDoEscritor({ slug: "marina-alves", nome: "Marina <b>Alves</b>", total: 1 });
  assert.match(html, /escritor-cartao__foto--iniciais/);
  assert.match(html, /1 texto publicado/);
  assert.match(html, /aria-label="Ver publicações de Marina &lt;b&gt;Alves&lt;\/b&gt;"/);
  assert.doesNotMatch(html, /escritor-cartao__bio/);
  assert.doesNotMatch(html, /<b>/);
  assert.doesNotMatch(html, /@|created_by|email/i);
});

test("cartão com perfil: foto segura e resumo; foto insegura é ignorada", () => {
  const perfis = perfisPorSlug([{ slug: "marina-alves", name: "Marina A.", bio: "Escreve sobre oráculos.\n\nSegundo parágrafo.", image: "media/marina.webp", image_alt: "Retrato", visible: true }]);
  const item = { slug: "marina-alves", nome: "Marina Alves", total: 3 };
  const html = cartaoDoEscritor(item, perfis.get("marina-alves"));
  assert.match(html, /<img class="escritor-cartao__foto" src="media\/marina\.webp" alt="Retrato"/);
  assert.match(html, /Escreve sobre oráculos\. Segundo parágrafo\./);
  assert.match(html, /<h3 class="escritor-cartao__nome">Marina A\.<\/h3>/);
  const ruim = cartaoDoEscritor(item, { nome: "X", imagem: "javascript:alert(1)", bio: "" });
  assert.doesNotMatch(ruim, /<img/);
  assert.match(ruim, /escritor-cartao__foto--iniciais/);
  assert.match(cartoesDosEscritores([item], new Map()), /^<li class="escritor-cartao">/);
});

test("resumo da biografia corta em palavra inteira e não inventa nada", () => {
  assert.equal(resumoDaBio(""), "");
  assert.equal(resumoDaBio("Curta."), "Curta.");
  const longo = resumoDaBio(`${"palavra ".repeat(60)}fim`, 40);
  assert.ok(longo.length <= 40 && longo.endsWith("…") && !/\s…$/.test(longo));
});

test("diretório: busca, contagem total e estado vazio da busca", () => {
  const todos = escritoresDoCaderno(publicados);
  const cheio = diretorioDeEscritores(todos, new Map());
  assert.match(cheio, /3 escritores · 10 textos publicados/);
  assert.equal((cheio.match(/class="escritor-cartao"/g) || []).length, 3);
  assert.match(cheio, /data-escritores-busca/);
  const nenhum = diretorioDeEscritores(todos, new Map(), "zzz");
  assert.match(nenhum, /0 escritores encontrados/);
  assert.match(nenhum, /data-escritores-vazio>Nenhum escritor encontrado/);
  assert.match(diretorioDeEscritores(todos, new Map(), "marina"), /1 escritor encontrado/);
});

test("perfil: temas com links para a categoria, navegação e busca só com conteúdo suficiente", () => {
  const categorias = [{ id: "oraculos", rotulo: "oráculos" }, { id: "terapias", rotulo: "terapias" }];
  const marina = renderizarPagina({ estado: "escritor", slug: "marina-alves", publicados, categorias });
  assert.match(marina, /<a class="escritor-tema" href="blog\.html\?categoria=oraculos">Oráculos <small>2<\/small><\/a>/);
  assert.match(marina, /<a href="escritor\.html">Todos os escritores<\/a>/);
  assert.match(marina, /<a href="blog\.html">← Voltar ao Caderno<\/a>/);
  assert.match(marina, /3 textos publicados/);
  assert.doesNotMatch(marina, /data-escritor-busca/, "com 3 textos a busca não aparece");
  const lin = renderizarPagina({ estado: "escritor", slug: "lin-watanabe", publicados, categorias });
  assert.match(lin, /data-escritor-busca/);
  assert.equal((lin.match(/<article class="post/g) || []).length, 6);
});

test("filtrar textos do escritor: título, resumo e tema, sem acento", () => {
  const textos = escritoresDoCaderno(publicados) && publicados.filter((p) => p.author === "Marina Alves");
  assert.equal(filtrarTextos(textos, "").length, 3);
  assert.equal(filtrarTextos(textos, "oraculo", [{ id: "oraculos", rotulo: "oráculos" }]).length, 2);
  assert.equal(filtrarTextos(textos, "titulo a3").length, 1);
  assert.equal(filtrarTextos(textos, "inexistente").length, 0);
});

test("perfil sem biografia nem foto continua elegante, sem dados privados", () => {
  const html = renderizarPagina({ estado: "escritor", slug: "equipe-de-acolhimento", publicados });
  assert.match(html, /escritor-retrato--iniciais/);
  assert.match(html, /1 texto publicado/);
  assert.doesNotMatch(html, /@|created_by|Rascunho Secreto/);
});

test("páginas: seção de escritores na página inicial antes dos artigos, e entrada 'Escritores' no menu", () => {
  const blog = ler("blog.html");
  const secao = blog.indexOf("data-blog-escritores-secao");
  assert.ok(secao > 0 && secao < blog.indexOf('class="blog-artigos"'), "a seção vem antes da listagem de artigos");
  assert.match(blog, /Conheça nossos escritores/);
  assert.match(blog, /<a class="escritores-ver-todos" href="escritor\.html">Ver todos os escritores<\/a>/);
  assert.match(blog, /data-escritores-busca/);
  assert.match(blog, /<section class="blog-escritores-secao"[^>]* hidden>/, "oculta até haver escritores publicados");
  assert.match(blog, /<li><a href="escritor\.html" data-escritores-link>Escritores<\/a><\/li>/);
  assert.match(ler("artigo.html"), /data-escritores-link>Escritores<\/a>/);
  assert.match(menuDasCategorias([{ id: "artigos", rotulo: "artigos" }]), /<li><a href="escritor\.html" data-escritores-link>Escritores<\/a><\/li>$/);
});

test("rotas e links existentes continuam: escritor.html?nome=…", () => {
  assert.match(cartaoDoEscritor({ slug: "nucleo-de-oraculos", nome: "Núcleo de Oráculos", total: 2 }), /href="escritor\.html\?nome=nucleo-de-oraculos"/);
  assert.match(ler("escritor.html"), /data-escritor-root/);
});
