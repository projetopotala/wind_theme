import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const raiz = new URL("../../outputs/", import.meta.url);
const ler = (nome) => readFileSync(new URL(nome, raiz), "utf8");
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const css = semComentarios(ler("css/secoes-imagem.css"));
const js = semComentarios(ler("js/home/secoes-imagem.js"));
const home = ler("transcendido.html");

test("a Home carrega o CSS e o JS das seções com imagem, e só ela", () => {
  assert.match(home, /<link rel="stylesheet" href="css\/secoes-imagem\.css">/);
  assert.match(home, /<script type="module" src="js\/home\/secoes-imagem\.js"><\/script>/);
  for (const pagina of ["transcender.html", "travessia.html", "blog.html", "meu-potala.html"]) {
    assert.doesNotMatch(ler(pagina), /secoes-imagem/, pagina);
  }
});

test("as regras valem só na Home (.cine-home) e só em blocos com imagem", () => {
  const seletores = [...css.matchAll(/(^|\})\s*([^{}@][^{}]*)\{/g)].map((m) => m[2]).join(",");
  for (const parte of seletores.split(",").map((s) => s.trim()).filter((s) => s && !s.startsWith("@") && !/^\d|^(from|to)\b/.test(s))) {
    assert.match(parte, /^\.cine-home\b|^(from|to)$/, parte);
  }
});

test("a imagem fica maior: colunas mais largas e a foto da Sala Virtual preenche a janela", () => {
  assert.match(css, /\.cine-home \.materia \{[^}]*grid-template-columns: minmax\(0, \.9fr\) minmax\(0, 1\.1fr\)/);
  assert.match(css, /\.cine-home \.virtual-wrap \{[^}]*grid-template-columns: minmax\(0, \.8fr\) minmax\(0, 1\.2fr\)/);
  assert.match(css, /\.cine-home \.portal-window \{[^}]*padding: 0/);
  assert.match(css, /max-height: max\(300px, calc\(100svh - 330px\)\)/);
});

test("movimento automático: só com no-preference, em transform, sem botão e sem depender de clique", () => {
  const bloco = css.slice(css.indexOf("@media (prefers-reduced-motion: no-preference)"));
  assert.match(bloco, /animation: secao-deriva/);
  assert.match(css, /@keyframes secao-deriva \{[^@]*transform: scale\(/);
  // fora do bloco no-preference não há nenhuma animation (reduzido fica parado em silêncio)
  const antes = css.slice(0, css.indexOf("@media (prefers-reduced-motion: no-preference)"));
  assert.doesNotMatch(antes, /animation:/);
  assert.doesNotMatch(css + js, /arrival-motion|chegada-movimento|ATIVAR MOVIMENTO|PAUSAR MOVIMENTO/);
  assert.doesNotMatch(home.slice(home.indexOf('<body')), /arrival-motion|ATIVAR MOVIMENTO/);
});

test("o JS só pausa o que está fora da tela: sem scroll, sem botão, sem reduzido", () => {
  assert.match(js, /prefers-reduced-motion: reduce/);
  assert.match(js, /IntersectionObserver/);
  assert.doesNotMatch(js, /addEventListener\(\s*["']scroll|createElement|localStorage/);
  assert.match(css, /\.fora-de-vista img \{[^}]*animation-play-state: paused/);
});

test("slides inativos esperam parados e a profundidade por rolagem convive com a deriva", () => {
  assert.match(css, /\.cine-home \.materia-slide:not\(\.is-ativo\) img/);
  assert.match(css, /animation-timeline: --cine-moldura, auto/);
  assert.match(css, /@keyframes secao-profundidade \{[^}]*translate[^}]*scale/s);
});
