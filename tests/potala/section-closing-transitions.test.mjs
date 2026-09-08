import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const cases = [
  {
    page: "atendimentos.html",
    phrase: "Cuidar também é aprender. Muitas vezes um atendimento acolhe uma necessidade do presente; um curso transforma a maneira como enxergamos o futuro. É por isso que o Potala também é um espaço de aprendizagem.",
    image: "profissionais-encontro.webp",
  },
  {
    page: "cursos.html",
    phrase: "Existem conhecimentos que só florescem quando saem dos livros e passam a fazer parte da rotina. Algumas experiências precisam ser vividas com o corpo, com a sensibilidade e com a convivência.",
    image: "atividades-pratica.webp",
  },
  {
    page: "atividades.html",
    phrase: "Nem toda dúvida desaparece na primeira conversa. Às vezes precisamos apenas de alguém que nos ajude a encontrar o melhor caminho.",
    image: "recepcao-acolhimento.webp",
  },
];

for (const scenario of cases) {
  test(`${scenario.page} termina com silêncio, frase e fotografia`, async () => {
    const html = await readFile(new URL(`../../outputs/${scenario.page}`, import.meta.url), "utf8");
    const image = new URL(`../../outputs/media/${scenario.image}`, import.meta.url);

    assert.match(html, /href="css\/section-transition\.css"/);
    assert.match(html, /class="section-transition-pause"/);
    assert.match(html, /data-section-closing-veil[^>]*hidden/);
    assert.match(html, /data-section-closing-canvas[^>]*aria-hidden="true"/);
    assert.match(html, /data-section-closing-trigger/);
    assert.match(html, new RegExp(scenario.phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(html, new RegExp(`src="media/${scenario.image.replace(".", "\\.")}"`));
    assert.ok((await stat(image)).size > 0);

    const pause = html.indexOf('class="section-transition-pause"');
    const veil = html.indexOf('class="section-transition-veil"');
    const stage = html.indexOf('class="section-transition-stage"');
    const footer = html.indexOf("<footer");
    assert.ok(pause < veil && veil < stage && stage < footer);
  });
}

test("encerramentos compartilhados preservam clique imediato e scroll após 4,5 segundos", async () => {
  const [entrypoint, controller, css] = await Promise.all([
    readFile(new URL("../../outputs/js/secoes.js", import.meta.url), "utf8"),
    readFile(new URL("../../outputs/js/shared/closing-transition-controller.js", import.meta.url), "utf8"),
    readFile(new URL("../../outputs/css/section-transition.css", import.meta.url), "utf8"),
  ]);

  assert.match(entrypoint, /mountClosingTransition/);
  assert.match(controller, /\},\s*4500\);/);
  assert.match(controller, /addEventListener\("click", leave\)/);
  assert.match(controller, /addEventListener\("wheel", onScrollIntent/);
  assert.match(css, /\.section-transition-veil\s*\{[^}]*position:\s*fixed[^}]*background:\s*#fff/s);
  assert.match(css, /\.section-transition-photo\s*\{[^}]*border-radius:\s*clamp\(/s);
});

/* ------------------------------------------------------------------
 * A frase espera a imagem chegar ao centro
 * ------------------------------------------------------------------ */

test("o desvio do centro mede em fracao da altura da tela", async () => {
  /*
   * O gatilho era `threshold: 0.08` — bastavam 8% da imagem assomando na borda
   * de baixo para o veu cobrir a tela e o texto comecar. Quem ainda estava
   * lendo a secao era interrompido por uma frase sobre uma imagem que mal tinha
   * visto.
   */
  const { desvioDoCentro, FOLGA_DE_CENTRO } =
    await import("../../outputs/js/shared/closing-transition-controller.js");

  const tela = 800;
  const retangulo = (top, height) => ({ top, height });

  /* Centro do elemento no centro da tela: desvio zero. */
  assert.equal(desvioDoCentro(retangulo(200, 400), tela), 0);
  /* Assomando na borda de baixo — o caso que disparava antes da hora. */
  assert.ok(desvioDoCentro(retangulo(760, 400), tela) > FOLGA_DE_CENTRO);
  /* Ja saindo por cima. */
  assert.ok(desvioDoCentro(retangulo(-560, 400), tela) > FOLGA_DE_CENTRO);
  /* Quase centrado ainda conta: a rolagem por roda anda de cem em cem pixels e
     exigir o pixel exato faria a frase nunca aparecer. */
  assert.ok(desvioDoCentro(retangulo(240, 400), tela) <= FOLGA_DE_CENTRO);
});

test("sem altura de tela, o desvio nao trava a frase", async () => {
  /*
   * O valor devolvido aqui e "longe", mas quem chama trata a ausencia de
   * medida tocando assim mesmo: reter a frase por nao conseguir medir
   * transformaria uma limitacao do ambiente em conteudo que nunca aparece.
   */
  const { mountClosingTransition } =
    await import("../../outputs/js/shared/closing-transition-controller.js");
  assert.equal(typeof mountClosingTransition, "function");

  const fonte = await readFile(
    new URL("../../outputs/js/shared/closing-transition-controller.js", import.meta.url),
    "utf8",
  );
  assert.match(fonte, /if \(!retangulo \|\| !altura\) return true;/);
  /*
   * E o observador nao decide sozinho: ele so avisa que o assunto esta por
   * perto. `IntersectionObserver` chama de volta quando um limiar e CRUZADO, e
   * uma imagem alta entra na faixa central ainda longe de centrada — a
   * conferencia recusava e nunca mais havia cruzamento para avisar que agora
   * sim. Quem espera o centro e um ouvinte de rolagem.
   */
  assert.match(fonte, /addEventListener\?\.\("scroll", aguardando/);
  assert.match(fonte, /removeEventListener\?\.\("scroll", aguardando\)/);
  /* E a faixa de observacao encolheu para o meio da tela: sem isso, o elemento
     "intersecta" assim que encosta na borda de baixo. */
  assert.match(fonte, /rootMargin: "-40% 0px -40% 0px"/);
});
