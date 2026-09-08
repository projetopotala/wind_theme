import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { MOTIVOS_DISPONIVEIS, seloDoEspecialista } from "../../outputs/js/comunidade/comunidade-arte.js";

const outputs = new URL("../../outputs/", import.meta.url);
const ler = (arquivo) => readFile(new URL(arquivo, outputs), "utf8");

const PAGINAS = [
  ["especialistas.html", "especialistas"],
  ["workshops.html", "workshops"],
  ["grupos-de-estudo.html", "grupos-de-estudo"],
  ["mentorias.html", "mentorias"],
  ["eventos.html", "eventos"],
];

/* ------------------------------------------------------------------
 * A barra
 * ------------------------------------------------------------------ */

test("a barra do topo oferece os cinco destinos e o caminho de volta", async () => {
  const secoes = await ler("secoes.js");

  for (const [arquivo] of PAGINAS) {
    assert.match(secoes, new RegExp(`href: "${arquivo}"`), `a barra perdeu ${arquivo}`);
  }
  /* A marca é a única saída da página de seção para o índice. Sem ela a barra
     oferece cinco portas novas e nenhuma de volta. */
  assert.match(secoes, /site-nav-marca[\s\S]*?href="transcendido\.html"/);
  assert.match(secoes, /potala-mark-transparent\.png/);
});

test("o menu das treze secoes nao voltou para a barra", async () => {
  /*
   * A barra JÁ FOI o índice das seções, e voltar a sê-lo é o erro fácil: basta
   * alguém achar que falta "um link para Cursos aqui" e ir acrescentando.
   *
   * O índice das seções é a jornada da Home, e duplicá-lo numa faixa de dez
   * pixels com rolagem horizontal foi exatamente o que se desfez.
   */
  const secoes = await ler("secoes.js");
  for (const secao of ["cursos.html", "atividades.html", "cultura.html", "marketplace.html"]) {
    assert.doesNotMatch(secoes, new RegExp(`href: "${secao}"`), `${secao} voltou para a barra`);
  }
});

test("a barra nao aparece nas paginas de secao", async () => {
  /*
   * Nas seções a faixa era um menu de outro site: quem está lendo a Programação
   * não está a caminho de uma mentoria. Ela vale só nas cinco páginas da área.
   */
  const secoes = await ler("secoes.js");
  assert.match(secoes, /const temBarra = \(secao\) => barLinks\.some/);
  assert.match(secoes, /if \(temBarra\(current\)\) \{/);
});

test("toda pagina de secao mantem um caminho de volta", async () => {
  /*
   * ESTE TESTE NASCEU DE UM BECO SEM SAÍDA.
   *
   * `quem-somos.html` era a única seção sem nenhum link interno — a navegação
   * dela era o menu do topo, e mais nada. No dia em que esse menu deixou de
   * aparecer nas seções, a página passou a não ter saída, e isso não quebrou
   * teste nenhum: ela continuava carregando, bonita e sem porta.
   */
  const secoes = [
    "quem-somos", "recepcao", "atendimentos", "cursos", "cultura", "programacao",
    "inspiracao", "atividades", "profissionais", "saude-integrativa", "marketplace", "blog",
  ];
  for (const secao of secoes) {
    const html = await ler(`${secao}.html`);
    assert.match(html, /href="transcendido\.html"/, `${secao}.html ficou sem caminho de volta`);
  }
});

test("Profissionais leva a Especialistas por um botao cheio, e nao so por um link", async () => {
  /*
   * Especialistas é a continuação natural desta página: as famílias de atuação
   * estão aqui, as pessoas com nome e formação estão lá. Sem a ação principal
   * no alto, a única porta era a barra do topo — que esta página nem tem mais.
   */
  const html = await ler("profissionais.html");
  assert.match(html, /<a class="photo-cta" href="especialistas\.html">/);

  const css = await ler("css/section-photographic.css");
  assert.match(css, /\.photo-cta \{[\s\S]*?background: var\(--photo-ink\)/, "o botão principal não é cheio");

  /* Uma por página. Repetido, o cheio deixa de significar "principal". */
  assert.equal((html.match(/class="photo-cta"/g) || []).length, 1);
});

test("a Home alcanca as cinco portas, com e sem script", async () => {
  /*
   * A Home não tem a barra — ela tem a roleta. Sem estes dois caminhos, chegar
   * a Especialistas a partir do começo exigiria entrar numa seção qualquer
   * antes, e quem está sem JavaScript não chegaria de jeito nenhum.
   */
  const home = await ler("transcendido.html");
  const cenas = await ler("js/home/home-scenes.js");

  for (const [arquivo] of PAGINAS) {
    assert.match(home, new RegExp(`href="${arquivo}"`), `o fallback sem script perdeu ${arquivo}`);
    assert.match(cenas, new RegExp(`href="${arquivo}"`), `o menu da barra lateral perdeu ${arquivo}`);
  }
});

/* ------------------------------------------------------------------
 * As páginas
 * ------------------------------------------------------------------ */

for (const [arquivo, secao] of PAGINAS) {
  test(`${arquivo} monta a página e avisa que o conteúdo é fictício`, async () => {
    const html = await ler(arquivo);

    assert.match(html, new RegExp(`<body data-section="${secao}"`));
    assert.match(html, /<link rel="stylesheet" href="css\/comunidade\.css">/);
    assert.match(html, /<script type="module" src="secoes\.js"><\/script>/);
    /* O revelar ao rolar mora no front-demo. Sem ele, `[data-reveal]` fica em
       opacity 0 para sempre e a página inteira nasce invisível. */
    assert.match(html, /front-demo\.js/);
    assert.match(html, /<main class="com-page" id="conteudo">/);
    assert.match(html, /<a class="skip-link" href="#conteudo">/);

    /*
     * O AVISO NÃO É OPCIONAL.
     *
     * São currículos com universidade, ano e titulação, e datas de eventos.
     * Lidos sem ressalva, passam por reais — alguém apareceria aqui procurando
     * a Marina, ou reservaria o sábado do torneio.
     */
    assert.match(html, /são fictícios, criados para o desenho do Portal/);
  });
}

test("cada especialista traz selo, area, formacao e trajetoria", async () => {
  const html = await ler("especialistas.html");
  const fichas = [...html.matchAll(/<article class="com-ficha"[\s\S]*?<\/article>/g)].map(([f]) => f);

  assert.equal(fichas.length, 16, `são ${fichas.length} fichas`);
  for (const ficha of fichas) {
    const nome = /<h2>([^<]*)<\/h2>/.exec(ficha)?.[1] || "?";
    assert.match(ficha, /<svg class="selo"/, `"${nome}" sem selo`);
    assert.match(ficha, /<p class="com-area">[^<]{4,}/, `"${nome}" sem área`);
    assert.match(ficha, /<p class="com-frase">[^<]{10,}/, `"${nome}" sem frase`);
    for (const campo of ["Formação", "Atuação", "No Potala"]) {
      assert.match(ficha, new RegExp(`<dt>${campo}</dt>`), `"${nome}" sem ${campo}`);
    }
    /* A ficha existe para levar a uma aula. Sem o link, quem decidiu aprender
       violino teria de voltar pela barra e procurar de novo. */
    assert.match(ficha, /<ul class="com-aulas">[\s\S]*?href="atividades\.html"/, `"${nome}" não leva a nenhuma aula`);
  }
});

test("nenhuma aula de Atividades fica sem quem a ensine", async () => {
  /*
   * ESTE É O TESTE QUE JUSTIFICA A PÁGINA EXISTIR.
   *
   * Uma aula sem professor listado não quebra nada: as duas páginas continuam
   * bonitas, e o buraco só aparece para a pessoa que procurou justamente
   * aquela. É o defeito silencioso clássico — nasce no dia em que alguém
   * acrescenta uma prática em Atividades e não volta aqui.
   */
  const atividades = await ler("atividades.html");
  const especialistas = await ler("especialistas.html");

  const aulas = [...atividades.matchAll(/<details class="photo-aula"[^>]*>\s*<summary>([^<]*)<\/summary>/g)]
    .map(([, nome]) => nome.trim());
  assert.ok(aulas.length >= 20, `só ${aulas.length} aulas em Atividades`);

  const semProfessor = aulas.filter((aula) => !especialistas.includes(`>${aula}</a>`));
  assert.deepEqual(semProfessor, [], `aulas sem especialista: ${semProfessor.join(", ")}`);
});

test("cada encontro diz quando, quanto dura, com quem e para quem", async () => {
  let total = 0;
  for (const [arquivo] of PAGINAS.slice(1)) {
    const html = await ler(arquivo);
    const fichas = [...html.matchAll(/<article class="com-ficha"[\s\S]*?<\/article>/g)].map(([f]) => f);
    assert.ok(fichas.length >= 4, `${arquivo} tem só ${fichas.length} encontros`);
    total += fichas.length;

    for (const ficha of fichas) {
      const nome = /<h2>([^<]*)<\/h2>/.exec(ficha)?.[1] || "?";
      assert.match(ficha, /<svg class="selo"/, `"${nome}" sem selo`);
      for (const campo of ["Quando", "Duração", "Com quem", "Para quem", "Vagas"]) {
        assert.match(ficha, new RegExp(`<dt>${campo}</dt>`), `"${nome}" sem ${campo}`);
      }
      for (const [, valor] of ficha.matchAll(/<dd>([^<]*)<\/dd>/g)) {
        assert.ok(valor.trim().length > 0, `"${nome}" tem um campo em branco`);
      }
    }
  }
  assert.ok(total >= 20, `só ${total} encontros nas quatro páginas`);
});

test("todo link interno das cinco paginas aponta para um arquivo que existe", async () => {
  /*
   * Cinco páginas novas cheias de referências cruzadas entre si, Atividades,
   * Programação e Recepção. Um `href` com um traço a mais dá 404 numa página
   * que ninguém revisita, e o defeito sobrevive a qualquer revisão de texto.
   */
  for (const [arquivo] of PAGINAS) {
    const html = await ler(arquivo);
    const alvos = new Set([...html.matchAll(/href="([^"#:]+\.html)[^"]*"/g)].map(([, alvo]) => alvo));
    for (const alvo of alvos) {
      await assert.doesNotReject(
        () => readFile(new URL(alvo, outputs), "utf8"),
        `${arquivo} aponta para ${alvo}, que não existe`,
      );
    }
  }
});

/* ------------------------------------------------------------------
 * Os selos
 * ------------------------------------------------------------------ */

test("todo motivo usado nas paginas existe no modulo de arte", async () => {
  /*
   * Os selos são assados no HTML por um gerador que rodou uma vez. Se alguém
   * apagar um motivo do módulo achando que ninguém usa, o HTML continua servindo
   * o desenho antigo e o módulo passa a mentir sobre o próprio catálogo.
   */
  assert.equal(MOTIVOS_DISPONIVEIS.length, 16);
  assert.equal(new Set(MOTIVOS_DISPONIVEIS).size, 16, "há motivo repetido");

  const marcações = new Set();
  for (const motivo of MOTIVOS_DISPONIVEIS) marcações.add(seloDoEspecialista(motivo));

  const html = await ler("especialistas.html");
  const selos = [...html.matchAll(/<svg class="selo"[\s\S]*?<\/svg>/g)].map(([s]) => s);
  assert.equal(selos.length, 16, "um especialista ficou sem selo próprio");
  assert.equal(new Set(selos).size, 16, "dois especialistas dividem o mesmo desenho");
});

test("o selo herda a cor de quem o contem", () => {
  /* Todo traço é currentColor, e é isso que deixa a mesma marcação servir o
     cartão claro e um cabeçalho escuro sem uma segunda versão do arquivo. */
  const svg = seloDoEspecialista("espiral", "LN");
  assert.ok(!/#[0-9a-f]{3,6}/i.test(svg), "há cor fixa no selo");
  assert.match(svg, /currentColor/);
  assert.match(svg, /aria-hidden="true"/);
  assert.match(svg, />LN</);
});

test("um motivo que nao existe falha alto, e nao em silencio", () => {
  /* Devolver um SVG vazio deixaria a ficha sem imagem e o build verde. */
  assert.throws(() => seloDoEspecialista("inexistente"), /motivo desconhecido/);
});
