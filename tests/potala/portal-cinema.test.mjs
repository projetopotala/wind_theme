import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const raiz = new URL("../../outputs/", import.meta.url);
const ler = (nome) => readFileSync(new URL(nome, raiz), "utf8");
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const css = ler("css/portal-cinema.css");
const js = ler("js/shared/portal-cinema.js");

test("as quatro entradas carregam a camada cinematográfica e mantêm o menu Explorar", () => {
  for (const pagina of ["transcender.html", "travessia.html", "transcendido.html", "atendimentos-conceito.html"]) {
    const html = ler(pagina);
    assert.match(html, /href="css\/portal-cinema\.css"/, pagina);
    assert.match(html, /src="js\/shared\/portal-cinema\.js"/, pagina);
    assert.match(html, /src="js\/shared\/portal-menu-boot\.js"/, `${pagina} perdeu o menu Explorar`);
    assert.match(html, /href="css\/portal-menu\.css"/, pagina);
  }
});

test("todo movimento fica sob prefers-reduced-motion: no-preference (exceto o estado estático)", () => {
  const sem = semComentarios(css);
  // Nenhum `animation:` declarado fora de um bloco @media (prefers-reduced-motion: no-preference) ou @supports.
  const fora = sem
    .replace(/@media \(prefers-reduced-motion: no-preference\) \{(?:[^{}]|\{[^{}]*\})*\}/g, "")
    .replace(/@media \(hover: hover\) and \(prefers-reduced-motion: no-preference\) \{(?:[^{}]|\{[^{}]*\})*\}/g, "")
    .replace(/@supports[^{]*\{\s*@media \(prefers-reduced-motion: no-preference\) \{(?:[^{}]|\{[^{}]*\})*\}\s*\}/g, "");
  assert.doesNotMatch(fora, /\banimation\s*:/, "há animação fora do bloco de movimento permitido");
  assert.doesNotMatch(fora.replace(/@supports \(animation-timeline: (?:scroll|view)\(\)\)/g, ""), /animation-timeline\s*:/);
});

test("a camada não redefine o transform da paisagem nem prende a rolagem", () => {
  const sem = semComentarios(css);
  assert.doesNotMatch(sem, /\.journey-landscape[^{]*\{[^}]*transform\s*:/);
  assert.doesNotMatch(sem, /(html|body)[^{]*\{[^}]*overflow(-y)?\s*:\s*hidden/);
  assert.doesNotMatch(sem, /scroll-snap|position:\s*sticky/);
  assert.doesNotMatch(semComentarios(js), /addEventListener\(\s*["']scroll["']/, "nenhum listener de rolagem");
  assert.doesNotMatch(semComentarios(js), /preventDefault|\{\s*passive:\s*false/);
});

test("sem bibliotecas, sem rede e sem Supabase na camada cinematográfica", () => {
  const codigo = semComentarios(js);
  assert.doesNotMatch(codigo, /import\s|fetch\(|XMLHttpRequest|supabase|gsap|three/i);
  assert.doesNotMatch(semComentarios(css), /url\(\s*["']?https?:/i);
});

test("a paralaxe só liga com ponteiro fino e sem movimento reduzido", () => {
  assert.match(js, /prefers-reduced-motion: reduce/);
  assert.match(js, /hover: hover\) and \(pointer: fine/);
  assert.match(js, /requestAnimationFrame/);
});

test("o título da Chegada é real (h1), não captura cliques e não cobre Respirar/Som", () => {
  const html = ler("transcender.html");
  assert.match(html, /<h1 class="cine-title__heading">Um espaço de chegada<\/h1>/);
  assert.match(css, /\.cine-title\s*\{[^}]*pointer-events:\s*none/);
  assert.match(html, /id="breath-launcher"/);
  assert.match(html, /id="ambient-sound"/);
});

test("as regras do hero/cartões valem só na Home; a Atendimentos-conceito preserva o título em partículas", () => {
  assert.match(ler("transcendido.html"), /<html[^>]*class="[^"]*cine-home/);
  assert.doesNotMatch(ler("atendimentos-conceito.html"), /<html[^>]*cine-home/);
  const sem = semComentarios(css);
  assert.doesNotMatch(sem, /(^|\n)\s*\.hero\s/, "regra de hero sem o escopo .cine-home");
  assert.doesNotMatch(sem, /(^|\n)\s*\.(therapy-card|oracle-card|special-card|person|feature|side-feature)[^{]*\{/, "regra de cartão sem escopo");
});
test("profundidade da Home: linha do tempo nomeada, so com movimento permitido e suporte, sem JS de scroll", () => {
  const sem = semComentarios(css);
  const bloco = sem.slice(sem.indexOf("--cine-moldura block") - 400);
  assert.match(sem, /view-timeline:\s*--cine-moldura block/);
  assert.match(sem, /animation-timeline:\s*--cine-moldura/);
  const inicio = sem.indexOf("@supports (animation-timeline: view())");
  assert.ok(inicio >= 0, "falta @supports (animation-timeline: view())");
  assert.match(sem.slice(inicio, inicio + 120), /prefers-reduced-motion: no-preference/);
  assert.match(sem, /\.cine-home \.people-scene img/);
  assert.match(sem, /@keyframes cine-profundidade[^}]*translate[^}]*scale/s);
  assert.doesNotMatch(semComentarios(js), /addEventListener\(\s*["']scroll/);
  assert.ok(bloco.length > 0);
});
