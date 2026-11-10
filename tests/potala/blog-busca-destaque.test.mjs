import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  filtrarPostsDoCaderno,
  semAcento,
  termosDaBusca,
  visaoDoCaderno,
} from "../../outputs/js/blog/blog-model.js";
import { destaqueEmMoldura } from "../../outputs/js/blog/blog-controller.js";

/*
 * BUSCA, FILTRO E DESTAQUE DO CADERNO.
 *
 * A busca ignora acento e caixa; o painel do alto nunca mostra um texto que o
 * filtro ou a busca excluíram; sem resultado, o painel some e a mensagem de
 * vazio aparece.
 */

const rotulos = { artigos: "artigos", oraculos: "oráculos", terapias: "terapias", praticas: "práticas" };
const rotulo = (id) => rotulos[id] || id;

const post = (id, title, category, publishedAt, extra = {}) => ({
  id, slug: id, title, category, publishedAt, status: "published", excerpt: "", author: "Redação Potala", ...extra,
});
const POSTS = [
  post("novos-profissionais", "Novos profissionais chegaram ao Instituto", "artigos", "2026-09-02", { featured: true }),
  post("oraculo-de-hoje", "Oráculo de hoje: a carta da Ponte", "oraculos", "2026-09-04", { author: "Núcleo de Oráculos" }),
  post("tres-cartas", "Três cartas na mesa: o que foi, o que é, o que se abre", "oraculos", "2026-08-20", { author: "Núcleo de Oráculos" }),
  post("ritual-da-manha", "Um ritual de manhã que não pede acordar mais cedo", "praticas", "2026-08-30", { author: "Grupo de Práticas" }),
  post("borra-de-cafe", "O que a borra de café ainda tem a dizer", "oraculos", "2026-08-28", { author: "Marina Alves", tags: ["cafeomancia"] }),
  post("ansiedade-corpo", "Onde a ansiedade se instala no corpo", "terapias", "2026-08-25", { excerpt: "Respiração e postura" }),
  { ...post("rascunho", "Oráculo em rascunho", "oraculos", "2026-10-30"), status: "draft" },
];

test("semAcento tira acento e caixa dos dois lados", () => {
  assert.equal(semAcento("ORÁCULO"), "oraculo");
  assert.equal(semAcento("Práticas"), "praticas");
  assert.equal(semAcento("café"), "cafe");
  assert.equal(semAcento(null), "");
  assert.deepEqual(termosDaBusca("  Três   CARTAS "), ["tres", "cartas"]);
});

test("busca sem acento encontra texto com acento, e o contrário", () => {
  const ids = (termo) => filtrarPostsDoCaderno(POSTS, { termo, rotuloDaCategoria: rotulo }).map((p) => p.id);
  assert.deepEqual(ids("oraculo").sort(), ["borra-de-cafe", "oraculo-de-hoje", "rascunho", "tres-cartas"].sort());
  assert.deepEqual(ids("ORÁCULO").sort(), ids("oraculo").sort());
  assert.deepEqual(ids("pratica"), ["ritual-da-manha"]);
  assert.deepEqual(ids("prática"), ["ritual-da-manha"]);
  assert.deepEqual(ids("cafe"), ["borra-de-cafe"]);
  assert.deepEqual(ids("café"), ["borra-de-cafe"]);
  assert.deepEqual(ids("TRES cartas"), ["tres-cartas"]);
});

test("a busca olha título, resumo, autor, categoria e etiquetas, em qualquer ordem", () => {
  const ids = (termo) => filtrarPostsDoCaderno(POSTS, { termo, rotuloDaCategoria: rotulo }).map((p) => p.id);
  assert.deepEqual(ids("marina"), ["borra-de-cafe"]);
  assert.deepEqual(ids("respiracao postura"), ["ansiedade-corpo"]);
  assert.deepEqual(ids("cafeomancia"), ["borra-de-cafe"]);
  assert.deepEqual(ids("terapias"), ["ansiedade-corpo"]);
  assert.deepEqual(ids("zzzz"), []);
});

test("o filtro de categoria combina com a busca", () => {
  const ids = (categoria, termo) => filtrarPostsDoCaderno(POSTS, { categoria, termo, rotuloDaCategoria: rotulo }).map((p) => p.id);
  assert.deepEqual(ids("oraculos", "cafe"), ["borra-de-cafe"]);
  assert.deepEqual(ids("praticas", "cafe"), []);
  assert.equal(ids("oraculos", "").length, 4);
});

test("sem filtro o painel mostra o destaque do banco e a grade traz o resto, sem rascunho", () => {
  const visao = visaoDoCaderno(POSTS, { rotuloDaCategoria: rotulo });
  assert.equal(visao.filtrando, false);
  assert.equal(visao.destaque.id, "novos-profissionais");
  assert.equal(visao.etiquetaDoDestaque, "Destaque");
  assert.equal(visao.total, 6);
  assert.ok(!visao.grade.some((p) => p.id === "novos-profissionais"), "o destaque não repete na grade");
  assert.ok(![visao.destaque, ...visao.grade].some((p) => p.id === "rascunho"), "rascunho nunca aparece");
});

test("filtrando por categoria, o painel mostra um texto DA categoria, nunca o destaque excluído", () => {
  const visao = visaoDoCaderno(POSTS, { categoria: "oraculos", rotuloDaCategoria: rotulo });
  assert.equal(visao.filtrando, true);
  assert.equal(visao.destaque.category, "oraculos");
  assert.equal(visao.destaque.id, "oraculo-de-hoje", "o mais recente da categoria");
  assert.equal(visao.total, 3);
  assert.ok([visao.destaque, ...visao.grade].every((p) => p.category === "oraculos"));
  assert.equal(visao.etiquetaDoDestaque, "Destaque");
});

test("buscando, o painel vira 'Melhor resultado' e só traz texto que casa com a busca", () => {
  const visao = visaoDoCaderno(POSTS, { termo: "oraculo", rotuloDaCategoria: rotulo });
  assert.equal(visao.buscando, true);
  assert.equal(visao.etiquetaDoDestaque, "Melhor resultado");
  assert.equal(visao.total, 3);
  assert.ok(![visao.destaque, ...visao.grade].some((p) => p.id === "novos-profissionais"));
  const html = destaqueEmMoldura(visao.destaque, { etiqueta: visao.etiquetaDoDestaque });
  assert.match(html, /Melhor resultado · /);
});

test("sem resultado o painel fica vazio e o total é zero", () => {
  const visao = visaoDoCaderno(POSTS, { termo: "zzzz", rotuloDaCategoria: rotulo });
  assert.equal(visao.destaque, null);
  assert.deepEqual(visao.grade, []);
  assert.equal(visao.total, 0);
  assert.equal(destaqueEmMoldura(null), "");
});

test("um único resultado fica no painel e a grade vazia não mostra 'nenhum texto'", () => {
  const visao = visaoDoCaderno(POSTS, { termo: "cafe", rotuloDaCategoria: rotulo });
  assert.equal(visao.destaque.id, "borra-de-cafe");
  assert.deepEqual(visao.grade, []);
  assert.equal(visao.total, 1);
});

test("a moldura do destaque usa 'Destaque' por padrão", () => {
  assert.match(destaqueEmMoldura(POSTS[0]), /Destaque · /);
});

const ler = (caminho) => readFile(new URL(`../../outputs/${caminho}`, import.meta.url), "utf8");

test("o controlador usa a visão do modelo: busca sem toLocaleLowerCase solta e vazio pelo total", async () => {
  const codigo = await ler("js/blog/blog-controller.js");
  assert.match(codigo, /visaoDoCaderno\(posts, \{ categoria: activeCategory, termo: term/);
  assert.match(codigo, /empty\.hidden = visao\.total > 0;/);
  assert.match(codigo, /featuredTarget\.hidden = !visao\.destaque;/);
  assert.doesNotMatch(codigo, /term = search\.value\.trim\(\)\.toLocaleLowerCase/);
  assert.doesNotMatch(codigo, /abertura\.featured/);
});

test("categorias no celular quebram em grade, sem rolagem lateral escondida", async () => {
  const css = await ler("css/blog.css");
  assert.match(css, /@media \(max-width: 640px\) \{\s*\.blog-categorias ul \{ display: grid; grid-template-columns: repeat\(auto-fit, minmax\(84px, 1fr\)\);/);
  assert.match(css, /overflow: visible;/);
});

test("títulos e links de leitura têm alvo de toque de 44px em tela de toque", async () => {
  const css = await ler("css/blog.css");
  assert.match(css, /@media \(pointer: coarse\) \{\s*\.post-titulo a \{ display: inline-block; padding-block: 14px; margin-block: -14px; \}/);
  assert.match(css, /\.post-link \{ display: inline-flex; align-items: center; min-height: 44px; \}/);
});

test("o acesso de teste da mesa nasce oculto e some em Production, sem parâmetro que o reative", async () => {
  const html = await ler("blog-admin.html");
  assert.match(html, /<button type="button" class="mesa-link" data-blog-teste hidden>Ver o acesso de teste<\/button>/);
  const entrada = await ler("js/blog-admin/blog-admin-entry.js");
  assert.match(entrada, /import \{ AMBIENTE_SUPABASE \} from "\.\.\/supabase\/config\.js";/);
  assert.match(entrada, /demonstracaoPermitida\(\{ ambiente: AMBIENTE_SUPABASE, origem: globalThis\.location\?\.origin \}\)/);
  assert.doesNotMatch(entrada, /acesso-de-teste|URLSearchParams|pediuTeste/, "nenhum parâmetro de URL reativa a demonstração");
  assert.match(entrada, /botaoDeTeste\.hidden = !demoPermitida;/);
  assert.match(entrada, /if \(demo && !demoPermitida\) return;/, "abrirMesa recusa a demonstração fora da lista de permissão");
  assert.doesNotMatch(entrada, /dataset\.blogDemo/, "a demonstração não depende de atributo do DOM");
  assert.match(entrada, /const atual = \(\) => \(emDemo \|\| !remoto \? demonstracao : remoto\);/);
  assert.match(entrada, /abrirMesa\(\{ demo: true \}\)/, "a demonstração continua existindo");
});

test("em Production nenhum parametro de URL muda a origem classificada; LAB e local seguem liberados", async () => {
  const { classificarOrigem } = await import("../../outputs/js/supabase/ambiente.js");
  assert.equal(classificarOrigem("https://wind-theme.vercel.app"), "producao");
  assert.equal(classificarOrigem("https://wind-theme.vercel.app/blog-admin.html?acesso-de-teste=1"), "producao");
  assert.equal(classificarOrigem("http://127.0.0.1:4173"), "local");
  assert.equal(classificarOrigem("https://wind-theme-m2-lab-preview.vercel.app"), "lab");
});

test("a demonstração só abre em LAB, local e Preview autorizada; nunca em endereço que sirva a Production", async () => {
  const { demonstracaoPermitida } = await import("../../outputs/js/blog-admin/demonstracao.js");
  const oficiais = [
    "https://wind-theme.vercel.app",
    "https://wind-theme.vercel.app/blog-admin.html?acesso-de-teste=1",
    "https://wind-theme-potala.vercel.app",
    "https://wind-theme-git-main-potala.vercel.app",
    "https://wind-theme-5k3n9x2ab-potala.vercel.app",
    "https://wind-theme.vercel.app:443",
    "https://wind-theme.vercel.app.exemplo.com",
    "https://usuario@wind-theme.vercel.app",
    "http://wind-theme.vercel.app",
    "null",
    "",
    undefined,
  ];
  for (const origem of oficiais) {
    // Sem a Preview autorizada (arquivo fora do repositório e do deploy), nenhum ambiente libera estes endereços.
    for (const ambiente of ["producao", "lab", "local", "", undefined, "qualquer"]) {
      assert.equal(demonstracaoPermitida({ ambiente, origem }), false, `${origem} / ${ambiente}`);
    }
  }
  // O ambiente "producao" nunca libera, e a origem oficial nunca libera, qualquer ambiente informado.
  for (const ambiente of ["producao", "lab", "local", "preview-e2e"]) {
    assert.equal(demonstracaoPermitida({ ambiente, origem: "https://wind-theme.vercel.app" }), false);
    assert.equal(demonstracaoPermitida({ ambiente, origem: "https://wind-theme.vercel.app/?acesso-de-teste=1" }), false);
  }
  assert.equal(demonstracaoPermitida({ ambiente: "producao", origem: "http://127.0.0.1:4173" }), false);
  assert.equal(demonstracaoPermitida({ ambiente: "local", origem: "http://127.0.0.1:4173" }), true);
  assert.equal(demonstracaoPermitida({ ambiente: "local", origem: "http://localhost:3000" }), true);
  assert.equal(demonstracaoPermitida({ ambiente: "lab", origem: "https://wind-theme-m2-lab-preview.vercel.app" }), true);
  assert.equal(demonstracaoPermitida({ ambiente: "lab", origem: "http://127.0.0.1:4173" }), false, "ambiente e origem precisam concordar");
  assert.equal(demonstracaoPermitida({ ambiente: "local", origem: "https://wind-theme-m2-lab-preview.vercel.app" }), false);
  assert.equal(demonstracaoPermitida({ ambiente: "preview-e2e", origem: "https://preview-autorizada.exemplo.com" }), true);
  assert.equal(demonstracaoPermitida(), false);
});

test("nenhum alias ou deployment fora do domínio oficial é tratado como LAB ou local", async () => {
  const { classificarOrigem } = await import("../../outputs/js/supabase/ambiente.js");
  for (const origem of [
    "https://wind-theme-potala.vercel.app",
    "https://wind-theme-git-main-potala.vercel.app",
    "https://wind-theme-5k3n9x2ab-potala.vercel.app",
  ]) {
    assert.equal(classificarOrigem(origem), "desconhecido", origem);
  }
});

test("a configuração só conecta a origem oficial a Production; aliases e deployments são bloqueados, sem banco", async () => {
  const { escolherAmbiente, PROJETO_PRODUCAO } = await import("../../outputs/js/supabase/ambiente.js");
  assert.equal(escolherAmbiente({ origem: "https://wind-theme.vercel.app" }).projectRef, PROJETO_PRODUCAO);
  for (const origem of [
    "https://wind-theme-potala.vercel.app",
    "https://wind-theme-git-main-potala.vercel.app",
    "https://wind-theme-7cgx4026s-potala.vercel.app",
  ]) {
    assert.throws(() => escolherAmbiente({ origem }), (erro) => erro.codigo === "origem-desconhecida", origem);
  }
});
