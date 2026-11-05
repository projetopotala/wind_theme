import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const raiz = new URL("../../outputs/", import.meta.url);
const ler = (nome) => readFileSync(new URL(nome, raiz), "utf8");
const pagina = ler("transcendido.html");
const css = ler("css/transcendido-atendimentos-hero.css");

test("a abertura de Atendimentos na Home usa a cena viva publicada", () => {
  assert.match(pagina, /<h1 class="display">Atendimentos<\/h1>/);
  assert.match(pagina, /<figure class="hero-card__cena cena-viva">/);
  assert.match(pagina, /<aside class="hero-card__conteudo" aria-label="Caminhos de Atendimentos">/);
  assert.doesNotMatch(pagina, /hero-card--cena-viva/);
  assert.match(pagina, /src="media\/atendimentos-sala-viva\.webp"/);
  const inicio = pagina.indexOf('<section class="hero hero--cena-viva"');
  const hero = pagina.slice(inicio, pagina.indexOf("</section>", inicio));
  assert.doesNotMatch(hero, /src="media\/atendimentos-acolhimento\.webp"/);
});

test("a Home reaproveita os recursos da cena sem duplicar sua animação", () => {
  assert.match(pagina, /<link rel="preload" href="media\/atendimentos-sala-viva\.webp"/);
  assert.match(pagina, /<link rel="stylesheet" href="css\/atendimentos-hero-vivo\.css">/);
  assert.match(pagina, /<link rel="stylesheet" href="css\/transcendido-atendimentos-hero\.css">/);
  assert.match(pagina, /<script type="module" src="js\/atendimentos\/atendimentos-hero-vivo\.js"><\/script>/);
  assert.doesNotMatch(css, /@keyframes|cena-chama|cena-bambu/);
});

test("a cena mantém todas as camadas automáticas e não cria controle de movimento", () => {
  for (const camada of ["sombras", "ramos", "bambu", "bambu-alto", "halo", "chama"]) {
    assert.match(pagina, new RegExp(`cena-viva__${camada}`), camada);
  }
  const inicio = pagina.indexOf('<section class="hero hero--cena-viva"');
  const hero = pagina.slice(inicio, pagina.indexOf("</section>", inicio));
  assert.doesNotMatch(hero, /ATIVAR MOVIMENTO|PAUSAR MOVIMENTO|<button/);
});

test("a composição responde sem esconder overflow global", () => {
  assert.match(css, /grid-template-areas:[\s\S]*?"copy scene"[\s\S]*?"copy links"/);
  assert.match(css, /width: min\(1520px, calc\(100% - 64px\)\)/);
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css, /html\s*,?\s*body[^}]*overflow-x\s*:\s*hidden|body[^}]*overflow-x\s*:\s*hidden/);
});
