import assert from "node:assert/strict";
import test from "node:test";

import { normalizePost } from "../../outputs/js/blog/blog-model.js";
import { enderecoDoVideo, renderArticle, renderArticleBlock } from "../../outputs/js/blog/article-renderer.js";
import { aplicarCampo, blocoNovo, formatarSelecao } from "../../outputs/js/blog-admin/mesa-blocos.js";
import { lerRota } from "../../outputs/js/blog-admin/mesa-app.js";
import { fotosDoSite } from "../../outputs/js/blog-admin/mesa-midia.js";
import {
  contarPorStatus, enderecoLivre, filtrarPosts, fraseDoAgendamento, fraseDoStatus, instanteDe, linhaDoTempo, partesDoInstante,
  pendenciasParaPublicar, resumoDaMesa, resumoDasMudancas, tempoRelativo, textoAtual,
} from "../../outputs/js/blog-admin/mesa-modelo.js";
import { itensDoMenu } from "../../outputs/js/blog-admin/mesa-visoes.js";

const registro = (id, campos = {}, extra = {}) => ({
  id,
  post: normalizePost({ id, title: `Texto ${id}`, excerpt: "Resumo", cover: "media/a.webp", category: "artigos", ...campos }),
  pendente: null,
  status: "published",
  publicarEm: null,
  atualizadoEm: "2026-09-10T12:00:00Z",
  ...extra,
});

const AGORA = Date.parse("2026-09-18T15:00:00Z");

test("a busca procura no título, no texto, na categoria, no autor e nas etiquetas, sem acento", () => {
  const registros = [
    registro("a", { title: "Oráculo da Ponte" }),
    registro("b", { content: [{ type: "paragraph", text: "sobre a respiração" }] }),
    registro("c", { author: "Marina Alves" }),
    registro("d", { tags: ["silêncio"] }),
    registro("e", { category: "terapias" }),
  ];
  const rotulo = (id) => ({ terapias: "terapias", artigos: "artigos" }[id] || id);
  const achar = (busca) => filtrarPosts(registros, { busca, rotuloDaCategoria: rotulo }).map(({ id }) => id).sort();
  assert.deepEqual(achar("oraculo"), ["a"]);
  assert.deepEqual(achar("RESPIRACAO"), ["b"]);
  assert.deepEqual(achar("marina"), ["c"]);
  assert.deepEqual(achar("silencio"), ["d"]);
  assert.deepEqual(achar("terapias"), ["e"]);
});

test("filtros de status, categoria, autor e período se somam, e a ordenação respeita o pedido", () => {
  const registros = [
    registro("velho", { title: "Beta", publishedAt: "2026-01-02" }, { atualizadoEm: "2026-01-02T12:00:00Z" }),
    registro("novo", { title: "Alfa", publishedAt: "2026-09-15" }, { atualizadoEm: "2026-09-15T12:00:00Z" }),
    registro("rascunho", { title: "Gama" }, { status: "draft", atualizadoEm: "2026-09-17T12:00:00Z" }),
  ];
  assert.deepEqual(filtrarPosts(registros, { status: "draft" }).map(({ id }) => id), ["rascunho"]);
  assert.deepEqual(filtrarPosts(registros, { periodo: "7", agora: AGORA }).map(({ id }) => id).sort(), ["novo", "rascunho"]);
  assert.deepEqual(filtrarPosts(registros, { ordem: "titulo" }).map(({ id }) => id), ["novo", "velho", "rascunho"]);
  assert.deepEqual(filtrarPosts(registros, { ordem: "antigos" }).map(({ id }) => id)[0], "velho");
  assert.deepEqual(filtrarPosts(registros, { ordem: "atualizados" }).map(({ id }) => id)[0], "rascunho");
  assert.deepEqual(contarPorStatus(registros), { todos: 3, draft: 1, review: 0, scheduled: 0, published: 2, archived: 0 });
});

test("a mesa edita as alterações pendentes, e o leitor continua vendo o texto no ar", () => {
  const noAr = registro("a", { title: "No ar" }, { pendente: normalizePost({ id: "a", title: "Mexendo" }) });
  assert.equal(textoAtual(noAr).title, "Mexendo");
  assert.equal(noAr.post.title, "No ar");
  assert.equal(linhaDoTempo({ ...noAr, pendenteEm: "2026-09-18T14:30:00Z" }, AGORA).startsWith("publicado"), true);
});

test("a visão geral aponta o que precisa de atenção", () => {
  const registros = [
    registro("sem-capa", { cover: "" }),
    registro("fora-do-menu", { category: "inventada" }),
    registro("pendente", {}, { pendente: normalizePost({ id: "pendente", cover: "media/b.webp", category: "artigos" }) }),
    registro("arquivado", { cover: "" }, { status: "archived" }),
    registro("rascunho", {}, { status: "draft", atualizadoEm: "2026-09-18T10:00:00Z" }),
    registro("agendado", {}, { status: "scheduled", publicarEm: "2026-09-22T13:00:00Z" }),
  ];
  const resumo = resumoDaMesa(registros, { categorias: [{ id: "artigos" }], comentarios: [{ status: "pending" }, { status: "approved" }], agora: AGORA });
  assert.deepEqual(resumo.atencao.semCapa.map(({ id }) => id), ["sem-capa"], "o arquivado não conta: ninguém o vê");
  assert.deepEqual(resumo.atencao.semCategoria.map(({ id }) => id), ["fora-do-menu"]);
  assert.deepEqual(resumo.atencao.pendentes.map(({ id }) => id), ["pendente"]);
  assert.equal(resumo.atencao.comentarios, 1);
  assert.deepEqual(resumo.continuar.map(({ id }) => id), ["rascunho"]);
  assert.deepEqual(resumo.agendados.map(({ id }) => id), ["agendado"]);
  assert.equal(resumo.numeros.agendados, 1);
});

test("o agendamento fala a frase combinada, no horário de Brasília", () => {
  const quando = instanteDe("2026-09-22", "10:00");
  assert.equal(quando.toISOString(), "2026-09-22T13:00:00.000Z");
  assert.equal(fraseDoAgendamento(quando), "Este post será publicado em 22/09/2026 às 10:00.");
  assert.deepEqual(partesDoInstante(quando), { dia: "2026-09-22", hora: "10:00" });
  assert.equal(instanteDe("22/09/2026", "10h"), null);
  assert.equal(fraseDoAgendamento(null), "Escolha a data e o horário da publicação.");
  assert.equal(fraseDoStatus(registro("a", {}, { status: "scheduled", publicarEm: quando.toISOString() }), { agora: AGORA }), "Este post será publicado em 22/09/2026 às 10:00.");
  assert.equal(fraseDoStatus(null), "Texto novo, ainda não salvo.");
});

test("o tempo relativo e a linha do tempo falam português", () => {
  assert.equal(tempoRelativo("2026-09-18T14:59:30Z", AGORA), "agora há pouco");
  assert.equal(tempoRelativo("2026-09-18T14:40:00Z", AGORA), "há 20 min");
  assert.equal(tempoRelativo("2026-09-18T11:45:00Z", AGORA), "hoje às 08:45");
  assert.equal(tempoRelativo("2026-09-17T19:40:00Z", AGORA), "ontem às 16:40");
  assert.equal(tempoRelativo("2026-09-14T12:00:00Z", AGORA), "há 4 dias");
  assert.equal(linhaDoTempo(registro("a", {}, { status: "scheduled", publicarEm: "2026-09-22T13:00:00Z" }), AGORA), "estreia em 22 de set, 10:00");
});

test("o endereço de um texto nunca repete o de outro", () => {
  const registros = [registro("a", { title: "A Ponte" }), registro("b", { title: "A Ponte 2", slug: "a-ponte-2" })];
  assert.equal(enderecoLivre("A Ponte", registros, "novo"), "a-ponte-3");
  assert.equal(enderecoLivre("A Ponte", registros, "a"), "a-ponte", "o próprio endereço continua livre para ele");
  assert.equal(enderecoLivre("Outro título", registros), "outro-titulo");
});

test("publicar exige título, capa, resumo e texto, e aponta onde está a falta", () => {
  const vazio = pendenciasParaPublicar({ title: "", content: [] });
  assert.deepEqual(vazio.map(({ campo }) => campo), ["title", "cover", "excerpt", "content"]);
  assert.equal(vazio.find(({ campo }) => campo === "excerpt").aba, "detalhes");
  const semFoto = pendenciasParaPublicar({ title: "Ok", cover: "a.webp", excerpt: "r", content: [{ id: "x", type: "paragraph", text: "t" }, { id: "img", type: "image", src: "" }] });
  assert.deepEqual(semFoto.map(({ bloco }) => bloco), ["img"]);
  assert.deepEqual(pendenciasParaPublicar({ title: "Ok", cover: "a.webp", excerpt: "r", content: [{ type: "list", items: ["um"] }] }), []);
});

test("o histórico descreve a mudança em palavras", () => {
  const antes = { id: "a", slug: "um", title: "Um", content: [{ type: "paragraph", text: "x" }] };
  assert.equal(resumoDasMudancas(null, antes), "Primeira versão");
  assert.equal(resumoDasMudancas(antes, { ...antes, title: "Dois", content: [...antes.content, { type: "divider" }] }), "Mudou título, conteúdo (+1 bloco)");
  assert.equal(resumoDasMudancas(antes, antes), "Sem mudanças no texto");
  assert.equal(resumoDasMudancas(antes, { ...antes, slug: "outro", seo: { title: "Busca" } }), "Mudou endereço, SEO");
});

test("o menu \"⋯\" só oferece o que o status permite", () => {
  const ids = (status) => itensDoMenu({ status }).filter((item) => item !== "separador").map(({ id }) => id);
  assert.deepEqual(ids("published"), ["editar", "visualizar", "duplicar", "despublicar", "arquivar", "excluir"]);
  assert.deepEqual(ids("draft"), ["editar", "visualizar", "duplicar", "agendar", "arquivar", "excluir"]);
  assert.ok(ids("scheduled").includes("despublicar"));
  assert.deepEqual(ids("archived"), ["editar", "visualizar", "duplicar", "restaurar", "excluir"]);
  assert.equal(itensDoMenu({ status: "draft" }).at(-1).perigo, true, "excluir por último, marcado como perigoso");
});

test("as rotas da mesa vivem no endereço", () => {
  assert.deepEqual(lerRota(""), { tela: "visao", parametros: {} });
  assert.deepEqual(lerRota("#/posts?status=draft"), { tela: "posts", parametros: { status: "draft" } });
  assert.deepEqual(lerRota("#/editar/post%201?agendar=1"), { tela: "editor", id: "post 1", parametros: { agendar: "1" } });
  assert.deepEqual(lerRota("#/novo"), { tela: "editor", id: "", parametros: {} });
  assert.equal(lerRota("#/inexistente").tela, "visao");
});

test("os blocos novos nascem vazios e aceitam as opções de cada tipo", () => {
  assert.deepEqual(Object.keys(blocoNovo("gallery")).sort(), ["caption", "id", "images", "type"]);
  assert.equal(blocoNovo("callout").tone, "nota");
  assert.equal(aplicarCampo(blocoNovo("heading"), "level", "3").level, 3);
  assert.deepEqual(aplicarCampo(blocoNovo("list"), "items", "um\ndois").items, ["um", "dois"]);
  assert.equal(aplicarCampo(blocoNovo("list"), "ordered", "").ordered, false);
  assert.equal(aplicarCampo(blocoNovo("paragraph"), "size", "normal").size, undefined);
});

test("negrito, itálico e link usam as marcas que o Caderno entende", () => {
  assert.deepEqual(formatarSelecao("um dois", 3, 7, "negrito"), { texto: "um **dois**", inicio: 5, fim: 9 });
  assert.deepEqual(formatarSelecao("um dois", 3, 7, "italico"), { texto: "um *dois*", inicio: 4, fim: 8 });
  const link = formatarSelecao("veja aqui", 5, 9, "link");
  assert.equal(link.texto, "veja [aqui](https://)");
  assert.equal(link.texto.slice(link.inicio, link.fim), "https://");
});

test("o artigo desenha os blocos novos e pula os vazios", () => {
  assert.equal(renderArticleBlock({ type: "paragraph", text: "  " }), "");
  assert.equal(renderArticleBlock({ type: "image", src: "" }), "");
  assert.equal(renderArticleBlock({ type: "list", items: [] }), "");
  assert.match(renderArticleBlock({ type: "callout", tone: "aviso", text: "cuidado" }), /article-destaque--aviso/);
  assert.match(renderArticleBlock({ type: "paragraph", text: "um **forte**" }), /<strong>forte<\/strong>/);
  assert.match(renderArticleBlock({ type: "gallery", images: [{ src: "a.webp", alt: "" }, { src: "b.webp", alt: "" }] }), /article-galeria/);
  assert.match(renderArticleBlock({ type: "video", url: "https://youtu.be/dQw4w9WgXcQ" }), /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
  assert.doesNotMatch(renderArticleBlock({ type: "video", url: "https://exemplo.com/video" }), /iframe/, "endereço desconhecido não vira iframe");
  assert.equal(enderecoDoVideo("https://vimeo.com/123456789").src, "https://player.vimeo.com/video/123456789");
});

test("\"Também no Portal\" só leva a páginas do próprio site", () => {
  const html = renderArticle({ id: "a", title: "T", cover: "a.webp", relatedPortal: [
    { titulo: "Atendimentos", href: "atendimentos.html" },
    { titulo: "Fora", href: "https://golpe.example/x.html" },
    { titulo: "Script", href: "javascript:alert(1)" },
  ] });
  assert.match(html, /Também no Portal/);
  assert.match(html, /href="atendimentos\.html"/);
  assert.doesNotMatch(html, /golpe|javascript:/);
});

test("a biblioteca oferece fotos do site, não máscaras nem versões repetidas", () => {
  const fotos = fotosDoSite({ imagens: [
    { arquivo: "home-travessia.webp" }, { arquivo: "home-travessia-mobile.webp" }, { arquivo: "chegada-v2-sky-mask.webp" },
    { arquivo: "chegada.webp" }, { arquivo: "chegada.png" }, { arquivo: "potala-mark-transparent.png" }, { arquivo: "leia.txt" },
  ] });
  assert.deepEqual(fotos.map(({ nome }) => nome), ["home-travessia.webp", "chegada.webp"]);
  assert.equal(fotos[0].url, "media/home-travessia.webp");
});
