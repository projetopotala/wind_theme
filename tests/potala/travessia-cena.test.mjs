import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* Espaços e quebras viram um espaço só: os seletores multilinha do arquivo
   podem então ser procurados como texto simples. */
const css = (await readFile(
  new URL("../../outputs/css/home-journey.css", import.meta.url),
  "utf8",
)).replace(/\s+/g, " ");

/* Todos os corpos de um mesmo seletor. `.journey-landscape` aparece duas vezes
   — a base com a geometria e a da travessia com a transição — e olhar só a
   primeira faria o teste procurar a transição no lugar errado. */
function corpos(seletor) {
  const alvo = `${seletor} {`;
  const achados = [];
  for (let i = css.indexOf(alvo); i !== -1; i = css.indexOf(alvo, i + 1)) {
    const abre = i + alvo.length;
    achados.push(css.slice(abre, css.indexOf("}", abre)));
  }
  assert.ok(achados.length, `regra ausente: ${alvo}`);
  return achados;
}

function regra(seletor) {
  return corpos(seletor).join(" ");
}

/*
 * A paisagem não pode esperar para começar a andar.
 *
 * A batida de confirmação existia para o clique ter resposta antes de a cena se
 * mover, mas o halo já dá essa resposta no mesmo instante. O atraso na paisagem
 * só era sentido como o site demorando a reagir — ao abrir e ao fechar.
 */
test("a paisagem se move sem atraso, nos dois sentidos", () => {
  const corpo = regra(".journey-landscape");
  const transicao = corpo.match(/transition:([^;]+);/);
  assert.ok(transicao, "a paisagem precisa declarar a transição");
  assert.doesNotMatch(
    transicao[1],
    /var\(--travessia-total\)\s*\*\s*\.08/,
    "o atraso de confirmação não pode voltar para a paisagem",
  );
});

test("os cards também saem sem esperar", () => {
  const corpo = regra(
    '.journey-pair:has(.journey-region[data-travessia="transitioning"]) .journey-region:not([data-travessia]) .region-content, '
    + '.journey-pair:has(.journey-region[data-travessia="revealed"]) .journey-region:not([data-travessia]) .region-content',
  );
  assert.doesNotMatch(corpo, /var\(--travessia-total\)\s*\*\s*\.08/);
});

/*
 * O trajeto luminoso é desenhado por uma câmera própria, no centro da tela.
 * Com a paisagem deslocada e o bloco tomando o quadro, ele deixa de ter relação
 * com o que está sendo mostrado: vira um risco vertical atravessando o
 * conteúdo, que o olho lê como artefato e não como o caminho da jornada.
 */
test("o trajeto some enquanto a paisagem está estendida", () => {
  const corpo = regra(
    'body[data-travessia-ativa="true"] .journey-path, body[data-travessia-ativa="true"] .journey-scroll-cue',
  );
  assert.match(corpo, /opacity:\s*0/);
  assert.match(corpo, /pointer-events:\s*none/);
});

/* Some e volta JUNTO com o movimento, não depois dele: uma linha que reaparece
   com a paisagem já parada lê como um segundo evento. */
test("o trajeto volta no mesmo tempo do movimento", () => {
  const corpo = regra(".journey-path, .journey-scroll-cue");
  assert.match(corpo, /transition:\s*opacity\s+calc\(var\(--travessia-total\)/);
});

test("com movimento reduzido, o trajeto some sem transição", () => {
  const reduzido = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduzido, /\.journey-path,\s*\.journey-scroll-cue\s*\{\s*transition:\s*none;?\s*\}/);
});

/*
 * A barra de rolagem horizontal é do elemento RAIZ.
 *
 * Cortar só no body deixa o html rolando do mesmo jeito. Medido durante a
 * travessia: o bloco irmão sai para 1915px numa janela de 1425, e a página
 * inteira ganhava rolagem lateral — o critério que a direção listou como
 * inegociável.
 */
test("o corte horizontal está na raiz, não só no corpo", () => {
  assert.match(regra("html"), /overflow-x:\s*clip/);
});
