import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { comprimentoDoTraco, espessuraDoTraco, tempos } from "../../outputs/js/home/titulo-traco.js";

const ler = (caminho) => readFileSync(new URL(`../../outputs/${caminho}`, import.meta.url), "utf8");

test("a tinta vem logo: traço de 1 s por letra, 40 ms entre letras e a tinta já aos 0,8 s, em 0,5 s", () => {
  const t = tempos(12);
  assert.equal(t.atrasoDaLetra(0), 0);
  assert.equal(t.atrasoDaLetra(5), 200);
  /* A tinta começa antes de o traço acabar: o título não fica esperando vazio. */
  assert.equal(t.inicioDaTinta, 800);
  assert.equal(t.duracaoDaTinta, 500);
  /* O fim é o que acabar por último: a última letra ou a tinta. */
  assert.equal(t.fim, 1000 + 40 * 11);
  assert.equal(tempos(4).fim, 1300);
});

test("o traço acompanha o corpo da letra", () => {
  assert.equal(comprimentoDoTraco(128), 896);
  assert.equal(comprimentoDoTraco(20), 200, "nunca curto demais para cobrir o contorno");
  assert.equal(espessuraDoTraco(128), 1.4);
  assert.equal(espessuraDoTraco(40), 0.9, "fino, mas visível nos títulos menores");
});

test("os títulos das cenas se desenham com a rolagem, numa camada à parte do h2", () => {
  const html = ler("atendimentos-conceito.html");
  const js = ler("js/home/titulo-traco.js");
  const css = ler("css/home-editorial-essay.css");
  assert.match(html, /<script type="module" src="js\/home\/titulo-traco\.js"><\/script>/);
  assert.match(js, /querySelectorAll\("\.home-scene__copy h2"\)/);
  /* O h2 guarda o texto de verdade (editor, busca, leitores de tela): o
     desenho é uma camada SVG irmã, escondida da leitura. */
  assert.match(js, /setAttribute\("aria-hidden", "true"\)/);
  assert.doesNotMatch(js, /titulo\.(append|prepend|replaceChildren|innerHTML|textContent\s*=)/);
  assert.match(js, /copia\.append\(camada\)/);
  /* Contorno dourado letra a letra, depois a tinta varre da esquerda. */
  assert.match(js, /strokeDashoffset/);
  assert.match(js, /inset\(-25% 100% -25% -2%\)/);
  assert.match(js, /IntersectionObserver/);
  /* Com movimento reduzido, o título aparece pronto. */
  assert.match(js, /prefers-reduced-motion: reduce/);
  /* A camada não recebe cliques. */
  assert.match(css, /\.titulo-traco \{[^}]*position: absolute;[^}]*pointer-events: none;/);
});

test("o texto abaixo do título é digitado uma vez, logo depois dele, e fica", async () => {
  const { letrasDigitadas } = await import("../../outputs/js/texto-digitado.js");
  const ritmo = { typingSpeed: 20, initialDelay: 800 };
  assert.equal(letrasDigitadas(0, 150, ritmo), 0, "espera o título");
  assert.equal(letrasDigitadas(820, 150, ritmo), 1);
  assert.equal(letrasDigitadas(1800, 150, ritmo), 50);
  assert.equal(letrasDigitadas(60000, 150, ritmo), 150, "para no fim: não apaga nem recomeça");

  const traco = ler("js/home/titulo-traco.js");
  const digitado = ler("js/texto-digitado.js");
  const css = ler("css/atendimentos-conceito.css");
  /* Começa quando a tinta do título entra. */
  assert.match(traco, /querySelector\(":scope > p:not\(\.home-scene__eyebrow\)"\)/);
  assert.match(traco, /digitarParagrafo\(titulo, t\.inicioDaTinta\)/);
  assert.match(traco, /digitarUmaVez\(paragrafo, \{ initialDelay: atraso, typingSpeed: VELOCIDADE_DO_PARAGRAFO \}\)/);
  /* O parágrafo guarda o próprio texto (o editor da página lê textContent):
     nada de molde duplicado nem de trocar o conteúdo. */
  const uma = digitado.slice(digitado.indexOf("export function digitarUmaVez"));
  const corpo = uma.slice(0, uma.indexOf("\n}\n"));
  assert.doesNotMatch(corpo, /replaceChildren|textContent\s*=|innerHTML|text-type__molde/);
  assert.match(corpo, /elemento\.normalize\(\)/, "no fim volta a ser texto simples");
  /* As letras ainda não digitadas só ficam transparentes: o espaço fica
     reservado e o texto não pula de linha. O cursor é do CSS, fora do texto. */
  assert.match(css, /\.digitado__letra--oculta\{color:transparent\}/);
  assert.match(css, /\.digitado__letra--cursor::after\{content:"\|";position:absolute;[^}]*animation:text-type-piscar/);
});

test("título e texto da cena ficam escondidos desde o primeiro quadro, e não parados antes do efeito", () => {
  const html = ler("atendimentos-conceito.html");
  const css = ler("css/home-editorial-essay.css");
  const traco = ler("js/home/titulo-traco.js");
  /* A classe vem do <head>, antes de qualquer módulo — e só com movimento. */
  const cabeca = html.slice(0, html.indexOf("</head>"));
  assert.match(cabeca, /if \(!matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches\) \{\s*document\.documentElement\.classList\.add\("cenas-escritas"\);/);
  /* Se o módulo não carregar, os textos voltam a aparecer. */
  assert.match(cabeca, /if \(!document\.documentElement\.classList\.contains\("cenas-escritas-prontas"\)\) document\.documentElement\.classList\.remove\("cenas-escritas"\);/);
  assert.match(traco, /classList\.add\("cenas-escritas-prontas"\)/);
  /* Escondidos até o módulo marcá-los como escritos; a regra do parágrafo
     vence a cor da cena (.home-scene__copy > p:not(...)). */
  assert.match(css, /html\.cenas-escritas \.home-scene__copy h2:not\(\[data-escrito\]\) \{ -webkit-text-fill-color: transparent; \}/);
  assert.match(css, /html\.cenas-escritas \.home-scene__copy > p:not\(\.home-scene__eyebrow\):not\(\[data-escrito\]\) \{ color: transparent; \}/);
  assert.match(traco, /setAttribute\("data-escrito", ""\)/);
  assert.doesNotMatch(traco, /titulo-traco-espera|digitado-espera/, "sem a classe posta tarde, depois do primeiro quadro");
  /* O módulo começa na hora; só a medida do título espera as fontes. */
  assert.doesNotMatch(traco, /fonts\?\.ready \?\? Promise\.resolve\(\)\)\.then\(iniciar/);
});
