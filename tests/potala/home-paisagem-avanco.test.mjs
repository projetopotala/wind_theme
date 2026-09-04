import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { avancoDaPaisagem } from "../../outputs/js/core/math.js";

/*
 * A paisagem AVANÇA com a rolagem.
 *
 * Não é um vídeo nem uma cena: é a mesma imagem de sempre, aproximada em
 * direção ao ponto de fuga do caminho conforme se desce a página. O caminho
 * cresce na direção de quem olha, que é o gesto que a jornada descreve.
 *
 * A escolha é sobre o que se paga. Um vídeo tinha teto de resolução e pesava
 * 25 MB; uma cena 3D desenhava a cada quadro e trocava a identidade da home. A
 * imagem que já estava lá não tem nenhum desses custos — o que ela não faz é
 * paralaxe: tudo se aproxima junto, porque é uma chapa só.
 */

test("no topo da página a paisagem está em repouso", () => {
  /* Sem isto, a home abriria já ampliada, e o primeiro quadro seria um recorte
     do centro da arte em vez da composição inteira. */
  assert.equal(avancoDaPaisagem(0), 1);
});

test("descer aproxima", () => {
  assert.ok(avancoDaPaisagem(0.5) > avancoDaPaisagem(0));
  assert.ok(avancoDaPaisagem(1) > avancoDaPaisagem(0.5));
});

test("a aproximação é contínua e proporcional", () => {
  /* Um avanço que acelerasse no meio faria a paisagem parecer descolada da mão
     de quem rola — ela é movida pelo gesto, não por uma curva própria. */
  const meio = avancoDaPaisagem(0.5);
  assert.ok(Math.abs(meio - (avancoDaPaisagem(0) + avancoDaPaisagem(1)) / 2) < 1e-9);
});

test("o avanço para onde a imagem ainda tem pixels", () => {
  /*
   * O teto não é gosto: a chapa tem 3328px e o elemento pede cerca de 2750 numa
   * tela de 1920. O que sobra é a folga que a aproximação pode gastar antes de o
   * navegador começar a ampliar — e ampliar é exatamente o que amolece.
   */
  const fim = avancoDaPaisagem(1);
  assert.ok(fim > 1.1, `${fim} é aproximação de menos para se notar`);
  assert.ok(fim <= 1.2, `${fim} passa da folga de resolução da chapa`);
});

test("rolagem fora da faixa é aparada", () => {
  /* A rolagem elástica do iOS devolve valores negativos e maiores que 1. */
  assert.equal(avancoDaPaisagem(-0.4), avancoDaPaisagem(0));
  assert.equal(avancoDaPaisagem(1.6), avancoDaPaisagem(1));
});

/* ------------------------------------------------------------------
 * O que a página precisa ter
 * ------------------------------------------------------------------ */

const html = await readFile(new URL("../../outputs/transcendido.html", import.meta.url), "utf8");
const css = await readFile(new URL("../../outputs/css/home-journey.css", import.meta.url), "utf8");

test("o modelo 3D e o vídeo não deixaram rastro", () => {
  assert.doesNotMatch(html, /<canvas class="journey-landscape/, "a cena 3D saiu");
  assert.doesNotMatch(html, /<video/, "o vídeo saiu");
  assert.doesNotMatch(css, /journey-landscape-scene|journey-landscape-video/);
});

test("a chapa é um elemento à parte, e não a própria paisagem", () => {
  /*
   * A travessia já desloca `.journey-landscape` para o lado quando um bloco
   * abre. Pondo a aproximação no MESMO elemento, os dois transforms brigariam —
   * o último a ser escrito apagaria o outro, e a paisagem pararia de atravessar.
   * A chapa é um filho: o pai continua atravessando, o filho aproxima.
   */
  const paisagem = html.match(/<div class="journey-landscape"[\s\S]*?<\/div>/);
  assert.ok(paisagem, "falta a paisagem");
  assert.match(paisagem[0], /journey-landscape-plate/, "a chapa precisa ser um elemento próprio");

  const regra = css.match(/\.journey-landscape-plate\s*\{([^}]*)\}/);
  assert.ok(regra, "falta a regra da chapa");
  assert.match(regra[1], /home-travessia-chapa\.webp/);
  assert.match(regra[1], /scale\(var\(--paisagem-avanco/, "a aproximação vem de uma variável");
});

test("a aproximação parte do ponto de fuga do caminho", () => {
  /*
   * `transform-origin` centrado ampliaria em direção ao meio geométrico da
   * imagem, que aqui é céu. O caminho se perde perto de 62% da altura, e é para
   * lá que se está indo — aproximar em outra direção lê como zoom, e não como
   * avanço.
   */
  const regra = css.match(/\.journey-landscape-plate\s*\{([^}]*)\}/);
  assert.match(regra[1], /transform-origin:\s*\d+% \d+%/);
});
