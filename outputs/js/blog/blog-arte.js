/*
 * AS CAPAS DOS ARTIGOS, DESENHADAS EM VEZ DE FOTOGRAFADAS.
 *
 * Um blog de terapias, oráculos e práticas é o terreno mais fértil que existe
 * para a foto de banco de imagens: a mão segurando o cristal, o olhar sereno
 * contra a janela, a pessoa de costas na montanha. São imagens que já
 * pertencem a mil outros sites e não dizem nada sobre ESTE Instituto.
 *
 * Aqui a capa é geometria, e o vocabulário sai do que o Potala faz: a pétala do
 * lótus da marca, o aro da xícara da cafeomancia, a fumaça do incenso, a face
 * do cristal, a crista da serra que abre a Travessia. Abstrato de propósito —
 * ninguém precisa se reconhecer, ou não se reconhecer, na capa de um texto
 * sobre ansiedade.
 *
 * SVG em vez de arquivo: nove capas somam alguns quilobytes, acompanham a
 * paleta por `currentColor` e continuam nítidas em qualquer densidade de tela.
 */

const LARGURA = 640;
const ALTURA = 360;

/*
 * O TRAÇO PRECISA SER VISTO — e a primeira versão errou para o lado da timidez.
 *
 * A ideia era que a capa emoldurasse o título sem disputar com ele, então o
 * traço saiu fino e translúcido. Na tela o desenho sumiu: na manchete restava
 * um risco dourado solto, que lê como falha de renderização e não como
 * composição.
 *
 * Discrição não se faz com um desenho quase invisível; faz-se com um desenho
 * nítido e SEM COR PRÓPRIA. É por isso que tudo aqui é `currentColor` sobre o
 * gradiente escuro: o contraste é suficiente para a forma se ler, e baixo o
 * bastante para o título continuar sendo a primeira coisa que o olho pega.
 */
const TRACO = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';

/*
 * TODO MOTIVO É CENTRADO NO QUADRO, e isso não é estética: é sobrevivência ao
 * recorte.
 *
 * A mesma capa é servida em 16:9 na grade e em 16:8 na manchete, com
 * `preserveAspectRatio=slice` — que corta topo e base. Os primeiros desenhos
 * apoiavam o lótus e a serra na base do quadro, como um horizonte, e ali eles
 * ficavam inteiros na grade e decapitados na manchete.
 *
 * Daí a faixa segura: nada de essencial fora de y 60..300, com o peso visual em
 * torno de y 180. O que sai no corte passa a ser margem, e não assunto.
 */

/*
 * Pétalas do lótus da marca, abertas em leque a partir de um ponto.
 *
 * GRANDE, ocupando quase todo o quadro. A primeira versão era discreta — um
 * lótus pequeno no meio de muito gradiente — e na manchete, onde a caixa do
 * título cobre a esquerda, sobrava dele a ponta de uma pétala espiando por
 * cima. Um desenho que só aparece inteiro quando nada o cobre não serve de capa.
 *
 * A largura para em torno de x 140..500 porque o celular recorta os LADOS: o
 * cartão vira 4:3 e come 80px de cada ponta.
 */
function lotus() {
  const petalas = [-76, -38, 0, 38, 76].map((graus, i) => {
    const altura = 196 - Math.abs(i - 2) * 30;
    const meia = altura * 0.34;
    return `<path ${TRACO} stroke-width="3.42" opacity="${0.95 - Math.abs(i - 2) * 0.1}"
      transform="rotate(${graus} 320 292)"
      d="M320 292 C ${320 - meia} ${292 - altura * 0.6}, ${320 - meia * 0.72} ${292 - altura}, 320 ${292 - altura - 16}
         C ${320 + meia * 0.72} ${292 - altura}, ${320 + meia} ${292 - altura * 0.6}, 320 292 Z"/>`;
  }).join("");
  return `${petalas}<circle ${TRACO} stroke-width="2.85" opacity="0.78" cx="320" cy="292" r="32"/>`;
}

/** O aro da xícara e o sedimento: círculos concêntricos com uma falha. */
function oraculo() {
  const aneis = [38, 68, 98, 128].map((raio, i) => `<circle ${TRACO} stroke-width="2.85"
    opacity="${0.92 - i * 0.1}" cx="320" cy="180" r="${raio}"
    stroke-dasharray="${i === 1 ? "180 46" : i === 3 ? "300 90" : "0"}"/>`).join("");
  const marcas = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    /* 140 e 152, e nao 150 e 162: o raio maior punha as marcas em y=342, e o
       recorte 16:8 da manchete come tudo abaixo de y=340. */
    const [x1, y1] = [320 + Math.cos(a) * 140, 180 + Math.sin(a) * 140];
    const [x2, y2] = [320 + Math.cos(a) * 152, 180 + Math.sin(a) * 152];
    return `<line ${TRACO} stroke-width="2.28" opacity="0.72" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
  }).join("");
  return aneis + marcas;
}

/** A borra vista de cima: aros deslocados e uma meia-lua de sedimento. */
function circulo() {
  return `
    <circle ${TRACO} stroke-width="3.04" opacity="0.9" cx="320" cy="180" r="128"/>
    <circle ${TRACO} stroke-width="2.47" opacity="0.78" cx="336" cy="168" r="96"/>
    <path ${TRACO} stroke-width="2.66" opacity="0.85"
      d="M212 214 A 128 128 0 0 0 428 214"/>
    <path ${TRACO} stroke-width="2.28" opacity="0.7"
      d="M244 236 A 96 96 0 0 0 396 236"/>`;
}

/** Fumaça de incenso: curvas que sobem e se afastam. */
function fumaca() {
  return [0, 1, 2].map((i) => {
    const x = 260 + i * 60;
    const amp = 26 + i * 10;
    return `<path ${TRACO} stroke-width="${3 - i * 0.4}" opacity="${0.92 - i * 0.12}"
      d="M${x} 306 C ${x - amp} 258, ${x + amp} 222, ${x} 176
         C ${x - amp * 0.8} 132, ${x + amp * 1.2} 100, ${x - i * 8} 52"/>`;
  }).join("") + `<line ${TRACO} stroke-width="2.66" opacity="0.78" x1="228" y1="306" x2="412" y2="306"/>`;
}

/** Face de cristal: um poliedro aberto em arestas. */
function cristal() {
  return `
    <path ${TRACO} stroke-width="3.23" opacity="0.93" d="M320 46 L432 148 L392 300 L248 300 L208 148 Z"/>
    <path ${TRACO} stroke-width="2.47" opacity="0.8" d="M320 46 L320 300 M208 148 L432 148 M320 46 L248 300 M320 46 L392 300"/>
    <path ${TRACO} stroke-width="2.09" opacity="0.69" d="M208 148 L392 300 M432 148 L248 300"/>`;
}

/** Cristas de serra em camadas — a paisagem da Travessia, reduzida à linha. */
function montanha() {
  const cristas = [
    { o: 0.85, d: "M60 286 L170 178 L242 238 L340 130 L432 220 L520 158 L580 286" },
    { o: 0.55, d: "M60 286 L140 222 L226 266 L318 196 L404 258 L500 208 L580 286" },
    { o: 0.32, d: "M60 286 L128 252 L214 282 L306 238 L398 282 L492 246 L580 286" },
  ].map(({ o, d }) => `<path ${TRACO} stroke-width="3.04" opacity="${o}" d="${d}"/>`).join("");
  return `<circle ${TRACO} stroke-width="2.66" opacity="0.8" cx="428" cy="96" r="34"/>${cristas}`;
}

/** Semente da vida: sete círculos que se cruzam. */
function semente() {
  const raio = 62;
  const centros = [[320, 180], ...Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2;
    return [320 + Math.cos(a) * raio, 180 + Math.sin(a) * raio];
  })];
  return centros.map(([cx, cy], i) => `<circle ${TRACO} stroke-width="2.85"
    opacity="${i === 0 ? 0.95 : 0.66}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${raio}"/>`).join("");
}

/** Bandas de onda: o mesmo movimento em fases diferentes. */
function onda() {
  return [0, 1, 2, 3, 4].map((i) => {
    const y = 100 + i * 40;
    const amp = 22 - i * 3;
    return `<path ${TRACO} stroke-width="2.85" opacity="${0.92 - i * 0.09}"
      d="M40 ${y} C 140 ${y - amp}, 220 ${y + amp}, 320 ${y}
         C 420 ${y - amp}, 500 ${y + amp}, 600 ${y}"/>`;
  }).join("");
}

/** Um arco e o seu reflexo: a travessia entre duas margens. */
function ponte() {
  return `
    <path ${TRACO} stroke-width="3.42" opacity="0.93" d="M70 172 C 180 78, 460 78, 570 172"/>
    <path ${TRACO} stroke-width="2.47" opacity="0.7" d="M70 202 C 180 296, 460 296, 570 202"/>
    <line ${TRACO} stroke-width="2.66" opacity="0.78" x1="40" y1="187" x2="600" y2="187"/>
    ${[150, 230, 320, 410, 490].map((x, i) => {
    const alturas = [124, 102, 94, 102, 124];
    return `<line ${TRACO} stroke-width="2.28" opacity="0.75" x1="${x}" y1="${alturas[i]}" x2="${x}" y2="187"/>`;
  }).join("")}`;
}

const MOTIVOS = { lotus, oraculo, circulo, fumaca, cristal, montanha, semente, onda, ponte };

/** Os nomes aceitos por `arteDaCapa`, para os testes e para quem escreve um post. */
export const MOTIVOS_DISPONIVEIS = Object.keys(MOTIVOS);

/**
 * O SVG de uma capa.
 *
 * Devolve sempre um desenho: um `motivo` desconhecido cai no lótus da marca em
 * vez de deixar um retângulo vazio. Um post com o campo escrito errado é um
 * erro de digitação, e um buraco na grade seria uma punição desproporcional.
 *
 * @param {string} motivo
 * @returns {string} markup SVG, sem `<img>` em volta
 */
export function arteDaCapa(motivo) {
  const desenhar = MOTIVOS[motivo] || MOTIVOS.lotus;
  return `<svg class="post-arte" viewBox="0 0 ${LARGURA} ${ALTURA}"
    xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"
    preserveAspectRatio="xMidYMid slice">${desenhar()}</svg>`;
}
