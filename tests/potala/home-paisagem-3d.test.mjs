import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ABERTURA_DO_CEU,
  LINHA_DAS_MONTANHAS,
  PISO_DA_NEVOA,
  atmosferaDoVale,
  pontoDoCaminho,
  valeAPena,
} from "../../outputs/js/home/landscape-scene.js";

/* ------------------------------------------------------------------
 * Onde a câmera fica, dado o quanto se rolou
 * ------------------------------------------------------------------ */

/*
 * O modelo é um talhão de 2671×172×4183: a trilha corre no eixo mais longo. A
 * rolagem da jornada — 0 a 1 — vira uma posição ao longo dele.
 */
const CAMINHO = { comprimento: 4183, folgaInicial: 200, folgaFinal: 400 };

test("o começo da rolagem não põe a câmera na borda do modelo", () => {
  /*
   * O talhão termina em corte reto. Nascer em cima da borda mostraria o
   * recorte no primeiro quadro, antes de a névoa ter distância para escondê-lo.
   */
  const inicio = pontoDoCaminho(0, CAMINHO);
  assert.ok(inicio > 0, "a câmera precisa começar dentro do modelo");
  assert.equal(inicio, CAMINHO.folgaInicial);
});

test("o fim da rolagem para antes da borda oposta", () => {
  const fim = pontoDoCaminho(1, CAMINHO);
  assert.ok(fim < CAMINHO.comprimento, "a câmera não pode sair pela outra ponta");
  assert.equal(fim, CAMINHO.comprimento - CAMINHO.folgaFinal);
});

test("o avanço é proporcional à rolagem", () => {
  const meio = pontoDoCaminho(0.5, CAMINHO);
  const inicio = pontoDoCaminho(0, CAMINHO);
  const fim = pontoDoCaminho(1, CAMINHO);
  assert.equal(meio, (inicio + fim) / 2);
});

test("rolagem fora da faixa é aparada", () => {
  /* A rolagem elástica do iOS devolve valores negativos e maiores que 1. Sem
     aparar, a câmera sairia do talhão pelos dois lados. */
  assert.equal(pontoDoCaminho(-0.5, CAMINHO), pontoDoCaminho(0, CAMINHO));
  assert.equal(pontoDoCaminho(1.7, CAMINHO), pontoDoCaminho(1, CAMINHO));
});

/* ------------------------------------------------------------------
 * A névoa, que aqui não é enfeite
 * ------------------------------------------------------------------ */

test("a névoa fecha antes da borda do modelo", () => {
  /*
   * O modelo não tem céu nem horizonte, e acaba num retângulo. É a névoa que
   * engole essa borda — se ela abrir demais, aparece o corte; se fechar demais,
   * a trilha some a dois passos e o avanço deixa de ser legível.
   *
   * O piso existe para ninguém "melhorar" a visibilidade e descobrir o recorte
   * meses depois.
   */
  assert.ok(PISO_DA_NEVOA > 0, "sem névoa a borda do talhão fica à vista");

  const vale = atmosferaDoVale({ comprimento: 4183 });
  assert.ok(
    vale.nevoa.densidade >= PISO_DA_NEVOA,
    `densidade ${vale.nevoa.densidade} deixaria a borda aparecer`,
  );
});

test("a névoa e o céu compartilham a cor", () => {
  /*
   * São a mesma coisa vista de dois jeitos: onde a névoa satura, ela TEM de
   * virar o céu, senão existe uma linha onde uma acaba e o outro começa — e é
   * exatamente ali que estaria a borda do talhão.
   */
  const vale = atmosferaDoVale({ comprimento: 4183 });
  assert.equal(vale.nevoa.cor, vale.ceu.cor, "uma emenda visível denunciaria o corte");
});

test("a cena herda a hora dourada da paisagem que ela substitui", () => {
  /*
   * O fundo de hoje é um vale enevoado ao amanhecer, e a home inteira foi
   * construída em cima dessa temperatura — o ouro dos cards, o trajeto. Uma
   * cena neutra brigaria com tudo isso.
   */
  const vale = atmosferaDoVale({ comprimento: 4183 });
  const [r, , b] = vale.ceu.cor;
  assert.ok(r > b, "a luz precisa puxar para o quente, e não para o azul");
});

/* ------------------------------------------------------------------
 * O que a página precisa ter
 * ------------------------------------------------------------------ */

const html = await readFile(new URL("../../outputs/transcendido.html", import.meta.url), "utf8");
const css = await readFile(new URL("../../outputs/css/home-journey.css", import.meta.url), "utf8");

test("a paisagem passa a ser um canvas, e a imagem fica por trás", () => {
  const paisagem = html.match(/<div class="journey-landscape"[\s\S]*?<\/div>/);
  assert.ok(paisagem, "falta a paisagem");
  assert.match(paisagem[0], /<canvas/, "a cena precisa de um canvas dentro da paisagem");
  assert.doesNotMatch(paisagem[0], /<video/, "o vídeo foi substituído pelo modelo");

  /* A webp continua sendo o que se vê antes de a cena montar, e o que fica
     quando ela não monta. Não existe estado em que o fundo seja um vazio. */
  const regra = css.match(/\.journey-landscape\s*\{([^}]*)\}/);
  assert.match(regra[1], /url\("\.\.\/media\/home-travessia\.webp"\)/);
});

test("o modelo é pedido pelo JS, e não pelo HTML", async () => {
  /*
   * São 9,4 MB. No HTML eles disputariam banda com o que a pessoa precisa ver
   * primeiro; carregados pelo módulo, partem depois de a home estar de pé e só
   * onde vale a pena.
   */
  assert.doesNotMatch(html, /home-travessia\.glb/, "o modelo não pode ser pedido pela marcação");

  const modulo = await readFile(new URL("../../outputs/js/home/landscape-scene.js", import.meta.url), "utf8");
  assert.match(modulo, /home-travessia\.glb/);
});

test("com um bloco aberto a cena para de desenhar", async () => {
  /*
   * O véu cobre a paisagem a 80%, e é justo o instante em que o painel amplia
   * de zero à tela inteira — a animação mais pesada da página. Continuar
   * desenhando o campo por trás dela disputa o mesmo quadro, e quem perde é a
   * animação, que está em primeiro plano.
   */
  const modulo = await readFile(new URL("../../outputs/js/home/landscape-scene.js", import.meta.url), "utf8");
  assert.match(modulo, /is-expanded/, "a cena precisa saber quando um bloco está aberto");
});

/* ------------------------------------------------------------------
 * Quando a cena NÃO entra
 * ------------------------------------------------------------------ */

/*
 * As mesmas regras que valiam para o vídeo, pelos mesmos motivos — com uma a
 * mais: sem WebGL não há cena nenhuma. Em todos os casos o que fica é a webp de
 * 206 KB, então a página nunca fica pior do que está.
 */

const AMPLA = { largura: 1440, movimentoReduzido: false, conexao: null, temWebGL: true };

test("em tela ampla, sem restrição, a cena entra", () => {
  assert.equal(valeAPena(AMPLA), true);
});

test("sem WebGL não há o que montar", () => {
  assert.equal(valeAPena({ ...AMPLA, temWebGL: false }), false);
});

test("movimento reduzido dispensa a cena", () => {
  /* Um fundo que se move a cada rolagem é o que quem pediu menos movimento
     está evitando. */
  assert.equal(valeAPena({ ...AMPLA, movimentoReduzido: true }), false);
});

test("no telefone fica a imagem", () => {
  /*
   * Desenhar em tempo real é o oposto de barato num telefone, e o fundo de lá é
   * uma webp RETRATO, enquadrada para a tela em pé.
   */
  assert.equal(valeAPena({ ...AMPLA, largura: 420 }), false);
  assert.equal(valeAPena({ ...AMPLA, largura: 900 }), true);
});

test("economia de dados e conexão lenta dispensam a cena", () => {
  assert.equal(valeAPena({ ...AMPLA, conexao: { saveData: true } }), false);
  assert.equal(valeAPena({ ...AMPLA, conexao: { effectiveType: "2g" } }), false);
  assert.equal(valeAPena({ ...AMPLA, conexao: { effectiveType: "4g" } }), true);
});

test("navegador sem `connection` não é tratado como lento", () => {
  /* Safari não expõe `navigator.connection`; recusar por isso tiraria a cena do
     desktop onde ela roda bem. */
  assert.equal(valeAPena({ ...AMPLA, conexao: undefined }), true);
});

/* ------------------------------------------------------------------
 * O céu atrás do campo
 * ------------------------------------------------------------------ */

test("a serra fica acima do horizonte, e não atrás do chão", () => {
  /*
   * A imagem do céu é quase toda céu, com as montanhas embaixo. Centrada na
   * altura do olho, essa faixa cai ABAIXO do horizonte — e o terreno, que se
   * estende até longe, passa na frente dela. O sintoma é um céu chapado, sem
   * erro nenhum no console, e foi exatamente o que aconteceu na primeira
   * tentativa.
   *
   * A fração diz onde a linha das montanhas está dentro da imagem; o plano sobe
   * até ela encostar no horizonte.
   */
  assert.ok(LINHA_DAS_MONTANHAS > 0.5, "a serra está na metade de baixo da imagem");
  assert.ok(LINHA_DAS_MONTANHAS < 1, "e não coladinha na borda de baixo");
});

test("o céu cobre o campo de visão inteiro, e por isso é medido em ângulo", () => {
  /*
   * Dimensionar o plano pela ALTURA escondia justamente as montanhas: a arte tem
   * o sol ao centro e as serras nas laterais, e um plano alto o bastante para
   * preencher a tela fica largo demais — as pontas caem fora do quadro e sobra
   * só o céu vazio do meio.
   *
   * Medido em ângulo, a imagem inteira entra. Precisa cobrir mais que o campo
   * horizontal das janelas largas, que passa de 100°.
   */
  assert.ok(ABERTURA_DO_CEU > 100, `${ABERTURA_DO_CEU}° deixaria as bordas da tela sem céu`);
});

test("o céu não é enevoado, e é isso que o faz aparecer", async () => {
  /*
   * Ele fica a mais de um comprimento de talhão de distância. Enevoado como o
   * resto, estaria saturado — só cor, sem montanha nenhuma. Sem névoa ele fica
   * nítido, e é o campo que se dissolve nele; a emenda não aparece porque a
   * névoa tem a cor do céu.
   */
  const modulo = await readFile(new URL("../../outputs/js/home/landscape-scene.js", import.meta.url), "utf8");
  assert.match(modulo, /fog:\s*false/, "com névoa, a serra some");
  assert.match(modulo, /DoubleSide/, "o plano é visto pelas costas: sem isto ele não desenha");
});
