import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

const raiz = new URL("../../outputs/", import.meta.url);
const ler = (nome) => readFileSync(new URL(nome, raiz), "utf8");
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const css = semComentarios(ler("css/atendimentos-hero-vivo.css"));
const js = semComentarios(ler("js/atendimentos/atendimentos-hero-vivo.js"));
const pagina = ler("atendimentos.html");

test("a abertura de Atendimentos usa a fotografia da sala e a carrega cedo", () => {
  const arquivo = new URL("media/atendimentos-sala-viva.webp", raiz);
  assert.ok(existsSync(arquivo), "a fotografia precisa estar no repositório");
  assert.ok(statSync(arquivo).size < 400 * 1024, "peso acima do aceitável para uma abertura");
  assert.match(pagina, /<link rel="preload" href="media\/atendimentos-sala-viva\.webp"/);
  assert.match(pagina, /class="care-hero-visual cena-viva"/);
  assert.match(pagina, /src="media\/atendimentos-sala-viva\.webp"[\s\S]{0,400}?alt="[^"]{40,}"/, "a foto precisa de alt descritivo");
  assert.match(pagina, /<link rel="stylesheet" href="css\/atendimentos-hero-vivo\.css">/);
  assert.match(pagina, /<script type="module" src="js\/atendimentos\/atendimentos-hero-vivo\.js"><\/script>/);
});

test("a cena viva vale só nas duas aberturas de Atendimentos", () => {
  for (const outra of ["transcender.html", "travessia.html", "atendimentos-conceito.html", "blog.html"]) {
    assert.doesNotMatch(ler(outra), /cena-viva|atendimentos-hero-vivo/, outra);
  }
});

test("as regras tocam só a abertura: cena viva e care-hero", () => {
  const seletores = [...css.matchAll(/(^|\})\s*([^{}@][^{}]*)\{/g)].map((m) => m[2]);
  for (const bloco of seletores) {
    for (const parte of bloco.split(",").map((s) => s.trim()).filter((s) => s && !s.startsWith("@") && !/^\d|^(from|to)\b/.test(s))) {
      assert.match(parte, /^\.cena-viva|^\.care-hero\b|^\.care-hero-/, parte);
    }
  }
});

test("o palco tem a proporção do arquivo, senão as máscaras saem do lugar", () => {
  assert.match(css, /width: max\(100cqw, 100cqh \* 1746 \/ 1090\)/);
  assert.match(css, /height: max\(100cqh, 100cqw \* 1090 \/ 1746\)/);
  assert.match(css, /\.cena-viva \{ container-type: size; \}/);
  // o arquivo precisa ter mesmo essa proporção
  const bytes = readFileSync(new URL("media/atendimentos-sala-viva.webp", raiz));
  const i = bytes.indexOf(Buffer.from("VP8", "ascii"));
  assert.ok(i > 0, "arquivo webp reconhecível");
});

test("os elementos da cena se movem, não a fotografia inteira", () => {
  for (const camada of ["sombras", "ramos", "bambu", "bambu-alto"]) {
    assert.match(css, new RegExp(`\\.cena-viva__${camada} \\{[^}]*mask-image: radial-gradient`), camada);
    assert.match(pagina, new RegExp(`cena-viva__camada cena-viva__${camada}`), camada);
  }
  // a foto de base não recebe animação nenhuma
  assert.doesNotMatch(css, /\.cena-viva__foto \{[^}]*animation/);
  for (const parte of ["cena-viva__halo", "cena-viva__chama"]) assert.match(pagina, new RegExp(parte));
  assert.match(css, /@keyframes cena-chama \{[\s\S]*?scale\([^)]*,[^)]*\)/);
  assert.match(css, /@keyframes cena-bambu \{[\s\S]*?rotate/);
  assert.match(css, /\.cena-viva__chama \{[\s\S]*?left: 30\.6%[\s\S]*?width: 2\.1%/);
  assert.match(css, /rotate\(-1\.12deg\)[\s\S]*?rotate\(1\.28deg\)/);
});

test("movimento automático, sem botão para ligar, e parado em movimento reduzido", () => {
  const abre = css.indexOf("@media (prefers-reduced-motion: no-preference)");
  assert.ok(abre > 0, "toda animação fica sob no-preference");
  const antes = css.slice(0, abre);
  assert.doesNotMatch(antes, /animation:/, "nada anima fora do bloco de movimento permitido");
  assert.doesNotMatch(css + js, /ATIVAR MOVIMENTO|PAUSAR MOVIMENTO|arrival-motion|localStorage/);
  const corpo = pagina.slice(pagina.indexOf("<body"));
  const hero = corpo.slice(corpo.indexOf('class="care-hero"'), corpo.indexOf("care-caminhos"));
  assert.doesNotMatch(hero, /<button/, "a abertura não ganha botão nenhum");
});

test("o JS é mínimo: sem ouvir rolagem, sem rede, sem tocar no DOM da página", () => {
  assert.match(js, /prefers-reduced-motion: reduce/);
  assert.match(js, /IntersectionObserver/);
  assert.doesNotMatch(js, /addEventListener\(\s*["']scroll|createElement|fetch\(|supabase/);
  assert.match(css, /animation-play-state: paused/);
});
