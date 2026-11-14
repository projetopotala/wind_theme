import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aceitaMarcas, converterBloco, formatarSelecao } from "../../outputs/js/blog-admin/mesa-blocos.js";
import { normalizePost } from "../../outputs/js/blog/blog-model.js";

const fonte = (caminho) => readFileSync(new URL(`../../outputs/${caminho}`, import.meta.url), "utf8");
const editor = fonte("js/blog-admin/blog-editor.js");
const paragrafo = { id: "b1", type: "paragraph", text: "Primeira linha\nSegunda linha" };

test("barra: paragrafo vira titulo, subtitulo, lista e citacao sem perder o texto nem o id", () => {
  const h2 = converterBloco(paragrafo, "h2");
  assert.deepEqual([h2.id, h2.type, h2.level, h2.text], ["b1", "heading", 2, "Primeira linha Segunda linha"]);
  assert.equal(converterBloco(paragrafo, "h3").level, 3);
  const lista = converterBloco(paragrafo, "lista");
  assert.deepEqual([lista.type, lista.ordered, lista.items], ["list", false, ["Primeira linha", "Segunda linha"]]);
  assert.equal(converterBloco(paragrafo, "numerada").ordered, true);
  const citacao = converterBloco(paragrafo, "citacao");
  assert.deepEqual([citacao.type, citacao.text], ["quote", "Primeira linha\nSegunda linha"]);
});

test("barra: aplicar o mesmo formato de novo desfaz, e ida e volta preserva o conteudo", () => {
  const lista = converterBloco(paragrafo, "lista");
  const volta = converterBloco(lista, "lista");
  assert.deepEqual([volta.type, volta.text], ["paragraph", "Primeira linha\nSegunda linha"]);
  const titulo = converterBloco({ id: "t", type: "heading", level: 2, text: "Uma parte" }, "h2");
  assert.deepEqual([titulo.type, titulo.text], ["paragraph", "Uma parte"]);
  /* de lista numerada para marcadores troca so a marcacao */
  assert.equal(converterBloco(converterBloco(paragrafo, "numerada"), "lista").ordered, false);
  /* marcadores digitados a mao nao viram texto duplicado */
  const digitada = converterBloco({ id: "d", type: "paragraph", text: "- um\n2. dois\n\n* tres" }, "lista");
  assert.deepEqual(digitada.items, ["um", "dois", "tres"]);
});

test("barra: imagem, video e galeria nao sao convertidos; so texto corrido aceita negrito e link", () => {
  for (const type of ["image", "gallery", "video", "divider", "callout"]) {
    const bloco = { id: "x", type };
    assert.equal(converterBloco(bloco, "h2"), bloco, type);
  }
  assert.equal(aceitaMarcas({ type: "paragraph" }), true);
  assert.equal(aceitaMarcas({ type: "heading" }), false);
  assert.equal(aceitaMarcas({ type: "image" }), false);
  const negrito = formatarSelecao("ola mundo", 4, 9, "negrito");
  assert.equal(negrito.texto, "ola **mundo**");
});

test("modelo: pedido de correcoes so existe quando ha texto; artigos antigos nao ganham campo novo", () => {
  const antigo = normalizePost({ id: "a", title: "Antigo", content: [{ id: "p", type: "paragraph", text: "Corpo." }] });
  assert.equal("correcao" in antigo, false);
  assert.equal("correcao" in normalizePost({ id: "a", title: "x", correcao: { texto: "  ", por: "Owner" } }), false);
  const com = normalizePost({ id: "a", title: "x", correcao: { texto: "Revisar o terceiro paragrafo", por: "Owner", em: "2026-11-14T10:00:00Z", extra: "ignorado" } });
  assert.deepEqual(com.correcao, { texto: "Revisar o terceiro paragrafo", por: "Owner", em: "2026-11-14T10:00:00Z" });
  assert.equal(normalizePost({ id: "a", title: "x", correcao: { texto: "y".repeat(900) } }).correcao.texto.length, 600);
});

test("editor: o modo foco so troca atributos, sem redesenhar a folha (nada se perde ao alternar)", () => {
  const corpo = editor.slice(editor.indexOf("function aplicarFoco"), editor.indexOf("function desenharCategoria"));
  assert.ok(corpo.length > 200);
  assert.doesNotMatch(corpo, /desenharFolha|desenharBlocos|\.innerHTML\s*=|carregar\(/);
  assert.match(editor, /key\.toLowerCase\(\) === "f"/);
  assert.match(editor, /evento\.key === "Escape" && foco/);
  /* ao abrir outro texto ou sair, o foco volta ao normal */
  assert.match(editor, /aplicarFoco\(false\);\s*\n\s*if \(!aba\)/);
});

test("editor: a barra mantem o cursor e a prévia, o foco e a edicao compartilham o mesmo texto em memoria", () => {
  assert.match(editor, /data-editor-barra[\s\S]{0,40}addEventListener\("mousedown"/);
  const previa = editor.slice(editor.indexOf("function dadosDaPrevia"), editor.indexOf("function enviarPrevia"));
  assert.match(previa, /paraGravar\(\)/);
  const abrir = editor.slice(editor.indexOf("function abrirPrevia"), editor.indexOf("function fecharPrevia"));
  assert.doesNotMatch(abrir, /post = |carregar\(/);
});

test("editor: painel de configuracoes comeca fechado e a capa, o resumo e a categoria moram nele", () => {
  assert.match(editor, /lerPreferencia\("mesa\.painel", "fechado"\) === "aberto"/);
  const detalhes = editor.slice(editor.indexOf("function detalhesHtml"), editor.indexOf("function googleHtml"));
  for (const parte of ["Imagem de capa", 'campoDoPainel("Resumo"', "Categoria"]) assert.ok(detalhes.includes(parte), parte);
  assert.match(editor, /if \(!aba\) aba = publica\(\) \? "publicacao" : "detalhes";/);
});

test("revisao: so quem publica devolve com correcoes; escritor enviando de novo limpa o pedido", () => {
  const devolver = editor.slice(editor.indexOf("async function pedirCorrecoes"), editor.indexOf("async function descartarAlteracoes"));
  assert.match(devolver, /!publica\(\) \|\| registro\?\.status !== "review"/);
  assert.match(devolver, /salvarRegistro\(documento, "despublicar"/);
  assert.match(devolver, /nota\.length < 5/);
  assert.match(editor, /\["revisao", "publicar", "agendar"\]\.includes\(acao\) && documento\.correcao/);
  /* o formulario de correcoes so e desenhado para quem publica */
  assert.match(editor, /status === "review" && publica\(\) \? `<div class="mesa-correcoes">/);
  assert.match(editor, /Enviar para revis/);
});

test("visao geral: o Owner ve quantos textos aguardam a revisao dele; o escritor nao", () => {
  const visoes = fonte("js/blog-admin/mesa-visoes.js");
  assert.match(visoes, /const aguardando = podePublicar\(ctx\.permissoes\) \? loja\.registros\.filter\(\(registro\) => registro\.status === "review"\)\.length : 0;/);
  assert.match(visoes, /#\/posts\?status=review/);
});

test("estilo: modo foco esconde so os menus e a barra fica fixa no topo da area de escrita", () => {
  const css = fonte("css/blog-admin.css");
  assert.match(css, /\.mesa-app\[data-tela="editor"\]\[data-foco="on"\] \.mesa-trilho/);
  assert.match(css, /\.mesa-barra-texto \{ position: sticky;/);
  assert.match(css, /\.mesa-folha \{ max-width: 860px; \}/);
});
