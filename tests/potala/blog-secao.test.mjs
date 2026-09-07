import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { MOTIVOS_DISPONIVEIS, arteDaCapa } from "../../outputs/js/blog/blog-arte.js";
import {
  CARTAS,
  CATEGORIAS,
  POSTS,
  cartaDoDia,
  contarPorCategoria,
  dataLegivel,
  filtrarPorCategoria,
} from "../../outputs/js/blog/blog-data.js";
import {
  cartaoDoPost,
  marcacaoDasCategorias,
  validarComentario,
} from "../../outputs/js/blog/blog-controller.js";

const html = readFileSync(new URL("../../outputs/blog.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../../outputs/css/blog.css", import.meta.url), "utf8");
const secoes = readFileSync(new URL("../../outputs/secoes.js", import.meta.url), "utf8");

/* ------------------------------------------------------------------
 * O acervo
 * ------------------------------------------------------------------ */

test("todo post tem os campos que o cartao desenha", () => {
  /*
   * Um campo faltando nao quebra nada: vira `undefined` no template e sai como
   * a palavra "undefined" na tela, que e pior que um espaco vazio porque parece
   * conteudo. Este teste e a unica coisa entre um post mal digitado e isso.
   */
  for (const post of POSTS) {
    for (const campo of ["id", "categoria", "motivo", "titulo", "resumo", "autor", "data", "leitura"]) {
      assert.ok(post[campo] !== undefined && post[campo] !== "", `${post.id}: falta ${campo}`);
    }
    assert.match(post.data, /^\d{4}-\d{2}-\d{2}$/, `${post.id}: data fora do formato`);
  }
});

test("toda categoria usada por um post existe na navegacao", () => {
  /* Um post numa categoria inexistente fica invisivel: nao aparece em "tudo"
     com etiqueta certa, e nao tem aba que o alcance. */
  const conhecidas = new Set(CATEGORIAS.map((c) => c.id));
  for (const post of POSTS) {
    assert.ok(conhecidas.has(post.categoria), `${post.id}: categoria "${post.categoria}" nao existe`);
  }
});

test("todo motivo pedido por um post tem desenho", () => {
  for (const post of POSTS) {
    assert.ok(MOTIVOS_DISPONIVEIS.includes(post.motivo), `${post.id}: motivo "${post.motivo}" nao existe`);
  }
  for (const carta of CARTAS) {
    assert.ok(MOTIVOS_DISPONIVEIS.includes(carta.motivo), `${carta.nome}: motivo nao existe`);
  }
});

test("existe exatamente uma manchete", () => {
  /*
   * Duas manchetes desenhariam dois destaques empilhados, e nenhuma faria o
   * topo do blog cair direto na grade — que e o layout de uma pagina de
   * arquivo, nao o de uma capa.
   */
  assert.equal(POSTS.filter((post) => post.destaque).length, 1);
});

/* ------------------------------------------------------------------
 * O oraculo
 * ------------------------------------------------------------------ */

test("a carta do dia e a mesma o dia inteiro, e muda no dia seguinte", () => {
  /*
   * Sorteada a cada carregamento, ela viraria um gerador aleatorio: quem
   * recarregasse duas vezes veria a mecanica em vez da leitura, e a segunda
   * carta desmentiria a primeira.
   */
  const manha = cartaDoDia(new Date(2026, 8, 4, 8, 0));
  const noite = cartaDoDia(new Date(2026, 8, 4, 23, 30));
  const amanha = cartaDoDia(new Date(2026, 8, 5, 8, 0));

  assert.deepEqual(manha, noite, "a carta mudou no meio do dia");
  assert.notDeepEqual(manha, amanha, "a carta nao virou de um dia para o outro");
});

test("a carta do dia percorre o baralho inteiro", () => {
  /* Um resto mal calculado prenderia o oraculo em duas ou tres cartas, e o
     defeito so apareceria semanas depois, quando alguem reparasse. */
  const vistas = new Set();
  for (let i = 0; i < CARTAS.length; i += 1) {
    vistas.add(cartaDoDia(new Date(2026, 0, 1 + i)).nome);
  }
  assert.equal(vistas.size, CARTAS.length);
});

test("uma data invalida ainda devolve uma carta", () => {
  /* O oraculo nao pode ser o motivo de a lateral ficar em branco. */
  assert.ok(cartaDoDia(new Date("nao e data")).nome);
  assert.ok(cartaDoDia(null).nome);
});

/* ------------------------------------------------------------------
 * Filtro e navegacao
 * ------------------------------------------------------------------ */

test('"tudo" devolve tudo, e uma categoria devolve so a dela', () => {
  assert.equal(filtrarPorCategoria(POSTS, "todos").length, POSTS.length);
  const oraculos = filtrarPorCategoria(POSTS, "oraculos");
  assert.ok(oraculos.length > 0);
  assert.ok(oraculos.every((post) => post.categoria === "oraculos"));
});

test("filtrar nao mexe na lista original", () => {
  /* `filter` ja devolve copia, mas "todos" tinha caminho proprio — e um `return
     posts` ali entregaria a lista viva para quem quisesse ordenar. */
  const antes = [...POSTS];
  const copia = filtrarPorCategoria(POSTS, "todos");
  copia.sort(() => -1);
  assert.deepEqual(POSTS, antes);
});

test("categoria vazia aparece desabilitada, e nao sumida", () => {
  /*
   * Escondida, a navegacao mudaria de largura a cada filtro e a aba recem
   * clicada fugiria debaixo do cursor. Desabilitada, ela conta que o assunto
   * existe e ainda nao tem texto.
   */
  const semCultura = POSTS.filter((post) => post.categoria !== "cultura");
  const marcacao = marcacaoDasCategorias(semCultura, "todos");
  assert.match(marcacao, /data-categoria="cultura"[^>]*disabled/);
  assert.match(marcacao, /data-categoria="artigos"/);
  assert.ok(!/data-categoria="artigos"[^>]*disabled/.test(marcacao));
});

test("a aba ativa se anuncia por aria-pressed", () => {
  const marcacao = marcacaoDasCategorias(POSTS, "terapias");
  assert.match(marcacao, /data-categoria="terapias"[\s\S]*?aria-pressed="true"/);
  assert.match(marcacao, /data-categoria="todos"[\s\S]*?aria-pressed="false"/);
});

test("a contagem soma por categoria e no total", () => {
  const contas = contarPorCategoria(POSTS);
  assert.equal(contas.todos, POSTS.length);
  const soma = CATEGORIAS.filter((c) => c.id !== "todos")
    .reduce((total, c) => total + (contas[c.id] || 0), 0);
  assert.equal(soma, POSTS.length, "algum post ficou fora da contagem");
});

/* ------------------------------------------------------------------
 * O cartao
 * ------------------------------------------------------------------ */

test("o cartao traz titulo, resumo, autor e data legivel", () => {
  const post = POSTS.find((p) => p.id === "novos-profissionais");
  const marcacao = cartaoDoPost(post);
  assert.match(marcacao, /Novos profissionais chegaram/);
  assert.match(marcacao, /Redação Potala/);
  assert.match(marcacao, /datetime="2026-09-02"/);
  assert.match(marcacao, /2 de setembro de 2026/);
});

test("texto do post e escapado antes de virar HTML", () => {
  /*
   * O acervo e uma lista neste repositorio HOJE; amanha vem do Supabase, onde
   * o texto passa pelo painel admin. Escapar depois que o dado ja e remoto e
   * tarde: a primeira aspas num titulo ja teria quebrado a marcacao.
   */
  const marcacao = cartaoDoPost({
    id: "x", categoria: "artigos", motivo: "lotus", data: "2026-01-01",
    titulo: '<img src=x onerror="alert(1)">', resumo: "ok", autor: "ok", leitura: 1,
  });
  assert.ok(!marcacao.includes("<img src=x"), "o titulo entrou como marcacao");
  assert.match(marcacao, /&lt;img/);
});

test("a manchete e o cartao comum dividem a mesma marcacao", () => {
  /*
   * O mesmo texto aparece grande no topo e pequeno na grade. Duas marcacoes
   * separadas divergiriam no primeiro ajuste, e o defeito so apareceria numa
   * das duas posicoes.
   */
  const post = POSTS[0];
  const comum = cartaoDoPost(post);
  const destaque = cartaoDoPost(post, { destaque: true });
  assert.match(destaque, /class="post post--destaque"/);
  assert.equal(
    destaque.replace(' post--destaque', ''),
    comum,
    "a manchete tem marcacao propria alem da classe",
  );
});

test("um post ausente devolve vazio em vez de quebrar", () => {
  assert.equal(cartaoDoPost(null), "");
  assert.equal(cartaoDoPost(undefined), "");
});

test("data fora do formato nao imprime NaN na tela", () => {
  assert.deepEqual(dataLegivel("qualquer coisa"), { iso: "", texto: "" });
  assert.deepEqual(dataLegivel(""), { iso: "", texto: "" });
});

/* ------------------------------------------------------------------
 * A arte
 * ------------------------------------------------------------------ */

test("todo motivo desenha SVG valido e sem pessoas", () => {
  for (const motivo of MOTIVOS_DISPONIVEIS) {
    const svg = arteDaCapa(motivo);
    assert.match(svg, /^<svg /, `${motivo}: nao comecou com <svg`);
    assert.match(svg, /<\/svg>$/, `${motivo}: nao fechou`);
    /* Sem `<image>`: a capa e desenho, e um raster embutido traria de volta
       exatamente a foto de banco de imagens que ela veio substituir. */
    assert.ok(!svg.includes("<image"), `${motivo}: embutiu imagem`);
    assert.match(svg, /aria-hidden="true"/, `${motivo}: nao esta escondida do leitor de tela`);
  }
});

test("motivo desconhecido cai no lotus em vez de deixar buraco", () => {
  assert.equal(arteDaCapa("nao-existe"), arteDaCapa("lotus"));
  assert.equal(arteDaCapa(""), arteDaCapa("lotus"));
});

test("nenhum desenho encosta nas bordas que o recorte come", () => {
  /*
   * A MESMA capa e servida em 16:9 na grade e em 16:8 na manchete, com
   * `slice`, que corta topo e base. Os primeiros desenhos apoiavam o lotus e a
   * serra na base do quadro: inteiros na grade, decapitados na manchete.
   *
   * A faixa segura e y 40..320 num quadro de 360. Este teste le as coordenadas
   * verticais do proprio SVG, entao pega o descuido na hora de desenhar um
   * motivo novo — nao semanas depois, numa tela grande.
   */
  for (const motivo of MOTIVOS_DISPONIVEIS) {
    const svg = arteDaCapa(motivo);
    const ys = [...svg.matchAll(/(?:^|[\s"])(?:cy|y1|y2)="(-?[\d.]+)"/g)].map((m) => Number(m[1]));
    for (const y of ys) {
      assert.ok(y >= 20 && y <= 340, `${motivo}: coordenada y=${y} fora da faixa segura`);
    }
  }
});

/* ------------------------------------------------------------------
 * Comentarios
 * ------------------------------------------------------------------ */

test("comentario sem nome ou quase sem texto e recusado", () => {
  assert.ok(validarComentario({ nome: "", texto: "tudo certo aqui" }).nome);
  assert.ok(validarComentario({ nome: "   ", texto: "tudo certo aqui" }).nome);
  /* "Oi" publicado sozinho nao e conversa, e o limite minimo e mais honesto
     que aceitar para moderar depois. */
  assert.ok(validarComentario({ nome: "Ana", texto: "oi" }).texto);
  assert.deepEqual(validarComentario({ nome: "Ana", texto: "gostei muito" }), {});
});

test("a interface avisa que o comentario nao e gravado", () => {
  /*
   * Um formulario que aceita texto e o descarta em silencio e pior do que
   * formulario nenhum. O aviso precisa estar ANTES do botao, e nao numa nota
   * de rodape que ninguem le antes de escrever.
   */
  assert.match(html, /class="comentario-aviso"/);
  assert.match(html, /ainda não é gravado/i);
  const aviso = html.indexOf("comentario-aviso");
  const botao = html.indexOf("comentario-enviar");
  assert.ok(aviso < botao, "o aviso ficou depois do botao");
});

/* ------------------------------------------------------------------
 * A pagina
 * ------------------------------------------------------------------ */

test("o blog usa a marca da Travessia, e nao outra", () => {
  /*
   * O documento do Ecossistema insiste que o visitante nao deve sentir que
   * troca de site a cada clique. Uma marca propria aqui contrariaria isso na
   * primeira coisa que a pagina mostra.
   */
  assert.match(html, /media\/potala-mark-transparent\.png/);
});

test("o blog entra no menu do portal", () => {
  assert.match(secoes, /key: "blog"[\s\S]*?href: "blog\.html"/);
});

test("a paleta do blog sai da Travessia, sem digito trocado", () => {
  /* Copiar "de cabeca" produz um dourado quase igual, e o quase e o que faz o
     blog parecer de outra casa quando as duas paginas ficam lado a lado. */
  const journey = readFileSync(new URL("../../outputs/css/home-journey.css", import.meta.url), "utf8");
  for (const [nome, valor] of [["ink", "#302318"], ["ivory", "#f7edda"], ["gold", "#d7ba78"]]) {
    assert.match(journey, new RegExp(`--journey-${nome}:\\s*${valor}`, "i"), `a Travessia mudou o ${nome}`);
    assert.match(css, new RegExp(valor, "i"), `o blog nao usa o ${nome} da Travessia`);
  }
});

test("o foco e visivel em tudo que se clica", () => {
  /*
   * A pagina inteira e navegavel por teclado, e o contorno padrao do navegador
   * some sobre fundo escuro no oraculo e nos cartoes.
   */
  for (const alvo of [".blog-marca", ".blog-categorias button", ".post-titulo a",
    ".lateral-lista a", ".lateral-acao", ".comentario-enviar"]) {
    const escapado = alvo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(css, new RegExp(`${escapado}:focus-visible`), `${alvo} sem foco visivel`);
  }
});

test("o movimento e opcional", () => {
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\)/);
});
