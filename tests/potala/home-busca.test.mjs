import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { pontuarBloco, procurarBloco, termosDaBusca } from "../../outputs/js/home/home-busca.js";
import { extrairTextoDaPagina, recortar } from "../../outputs/js/home/busca-indice.js";
import { montarIndice } from "../../scripts/prepare-busca-indice.mjs";
import { DEFAULT_HOME_BLOCKS } from "../../outputs/js/home/journey-data.js";

const indice = JSON.parse(
  await readFile(new URL("../../outputs/js/home/busca-indice.json", import.meta.url), "utf8"),
);

/* ------------------------------------------------------------------
 * Os termos
 * ------------------------------------------------------------------ */

test("palavras de ligacao e palavras curtas nao entram na busca", () => {
  /*
   * "encontra tai chi" tem tres palavras e so duas dizem alguma coisa. Sem esta
   * limpeza, "encontra" casaria com quase todo bloco e o primeiro da lista
   * venceria sempre — a busca pareceria funcionar e daria sempre o mesmo lugar.
   */
  assert.deepEqual(termosDaBusca("encontra tai chi"), ["tai", "chi"]);
  assert.deepEqual(termosDaBusca("quero saber sobre ansiedade"), ["saber", "ansiedade"]);
  assert.deepEqual(termosDaBusca("   "), []);
});

test("acento e caixa nao mudam o resultado", () => {
  /* Ninguem digita "oraculo" com acento numa caixa de busca. */
  assert.deepEqual(termosDaBusca("ORÁCULO"), termosDaBusca("oraculo"));
});

/* ------------------------------------------------------------------
 * A pontuacao
 * ------------------------------------------------------------------ */

test("o titulo pesa mais que o corpo do texto", () => {
  /* Sem os pesos, um texto longo vencia qualquer titulo so por ter mais
     palavras — e a busca levava ao bloco que menciona de passagem. */
  const noTitulo = { title: "Cursos", body: "" };
  const noCorpo = { title: "Outra coisa", body: "aqui falamos de cursos de vez em quando" };
  const termos = termosDaBusca("cursos");
  assert.ok(pontuarBloco(noTitulo, termos) > pontuarBloco(noCorpo, termos));
});

test("a palavra inteira vale mais que o pedaco", () => {
  /* Sem isso, "arte" casaria com "quarteirao" tao bem quanto com "arte", e uma
     busca por palavra curta traria o bloco errado com confianca. */
  const termos = termosDaBusca("arte");
  assert.ok(pontuarBloco({ summary: "arte e cultura" }, termos)
    > pontuarBloco({ summary: "no quarteirao ao lado" }, termos));
});

test("nada responde devolve nulo, e nao o primeiro da lista", () => {
  /*
   * Mandar a pessoa para um bloco qualquer e pior do que dizer que nao achou:
   * ela conclui que o site entendeu e le o bloco errado procurando o que pediu.
   */
  assert.equal(procurarBloco(DEFAULT_HOME_BLOCKS, "xilofone quantico"), null);
  assert.equal(procurarBloco(DEFAULT_HOME_BLOCKS, ""), null);
  assert.equal(procurarBloco(null, "cursos"), null);
});

/* ------------------------------------------------------------------
 * O indice das secoes
 * ------------------------------------------------------------------ */

test("o texto da secao faz a busca achar o que o bloco nao diz", () => {
  /*
   * O caso que motivou tudo: o Instituto ensina desenho, a palavra vive dentro
   * de `atividades.html`, e nunca esteve no resumo do bloco. A busca dizia que
   * o Potala nao ensina desenho.
   */
  for (const palavra of ["desenho", "violino", "fotografia", "xadrez"]) {
    assert.equal(procurarBloco(DEFAULT_HOME_BLOCKS, palavra), null, `"${palavra}" nao devia estar nos blocos`);
    const comIndice = procurarBloco(DEFAULT_HOME_BLOCKS, palavra, indice);
    assert.equal(comIndice?.id, "atividades", `"${palavra}" devia levar a Atividades`);
  }
});

test("a pagina nao passa na frente de um titulo", () => {
  /*
   * Uma pagina inteira tem centenas de palavras. Com peso alto, qualquer bloco
   * venceria outro por mencionar o termo de passagem — o peso 1 deixa a pagina
   * desempatar quando mais nada responde, sem atropelar um titulo.
   */
  const termos = termosDaBusca("cursos");
  const titulo = pontuarBloco({ title: "Cursos", href: "cursos.html" }, termos);
  const soPagina = pontuarBloco({ title: "Outra", href: "cursos.html" }, termos, indice);
  assert.ok(titulo > soPagina, "a pagina venceu o titulo");
});

test("sem indice, a busca continua funcionando", () => {
  /* Se o arquivo falhar ao carregar, ela volta a enxergar so os blocos — uma
     busca que responde menos e melhor que uma que nao responde. */
  assert.equal(procurarBloco(DEFAULT_HOME_BLOCKS, "tai chi", null)?.id, "atividades");
  assert.equal(procurarBloco(DEFAULT_HOME_BLOCKS, "tai chi", undefined)?.id, "atividades");
});

/* ------------------------------------------------------------------
 * O indice esta atualizado?
 * ------------------------------------------------------------------ */

test("o indice versionado bate com as paginas de hoje", async () => {
  /*
   * ESTE E O TESTE QUE JUSTIFICA O ARQUIVO EXISTIR.
   *
   * Um indice gerado por script envelhece calado: alguem edita uma secao,
   * esquece de rodar o script, e a busca passa a responder sobre um texto que
   * nao esta mais no ar. Regenerando e comparando, "velho" vira falha da suite
   * em vez de surpresa de quem usa.
   */
  const atual = await montarIndice();
  assert.deepEqual(
    atual,
    indice,
    "o índice está velho — rode: node scripts/prepare-busca-indice.mjs",
  );
});

test("o indice nao carrega os comentarios do codigo", () => {
  /*
   * Este projeto explica as decisoes em comentarios longos dentro do HTML.
   * Indexados, uma busca por "fenda" ou "degrau" acharia a pagina em que eu
   * expliquei um problema de layout — conteudo que nao existe para o visitante.
   */
  const html = '<!-- explico aqui a fenda entre a barra e o painel --><p>Yoga e pilates</p>';
  const texto = extrairTextoDaPagina(html);
  assert.equal(texto, "Yoga e pilates");
  assert.ok(!/fenda/.test(JSON.stringify(indice)), "um comentário vazou para o índice");
});

test("o indice guarda o alt das imagens e descarta script e style", () => {
  /* O `alt` descreve o que se ve, e quem procura pelo que viu numa foto esta
     procurando conteudo da pagina. Ja `script` e `style` tem texto que nao e
     texto: codigo e seletores. */
  const html = '<img src="a.webp" alt="Roda de tambores no jardim">'
    + "<script>const oculto = 1;</script><style>.oculto{color:red}</style><p>Convivência</p>";
  const texto = extrairTextoDaPagina(html);
  assert.match(texto, /Roda de tambores no jardim/);
  assert.match(texto, /Convivência/);
  assert.ok(!/oculto/.test(texto));
});

test("cada pagina tem teto de tamanho", () => {
  /* Sem ele o indice cresce com o conteudo, e a Home baixa um arquivo cada vez
     maior para responder a uma palavra. */
  const gigante = "palavra ".repeat(4000);
  assert.ok(recortar(gigante).length < gigante.length);
  for (const [pagina, texto] of Object.entries(indice)) {
    assert.ok(texto.length <= 9000, `${pagina} passou do teto`);
  }
});
