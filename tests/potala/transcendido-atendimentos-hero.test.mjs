import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

const raiz = new URL("../../outputs/", import.meta.url);
const ler = (nome) => readFileSync(new URL(nome, raiz), "utf8");
const pagina = ler("transcendido.html");
const css = ler("css/transcendido-atendimentos-hero.css");

test("a abertura de Atendimentos na Home usa a cena viva publicada", () => {
  assert.match(pagina, /<h1 class="display">Atendimentos<\/h1>/);
  assert.match(pagina, /<aside class="hero-card hero-card--cena-viva">/);
  assert.match(pagina, /class="hero-card__cena cena-viva"/);
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

test("a Home usa o vídeo real sem sobrepor as antigas cópias mascaradas", () => {
  const video = new URL("media/atendimentos-sala-viva.mp4", raiz);
  assert.ok(existsSync(video), "o vídeo precisa estar no pacote publicado");
  assert.ok(statSync(video).size < 2 * 1024 * 1024, "o loop precisa continuar leve");
  const inicio = pagina.indexOf('<section class="hero hero--cena-viva"');
  const hero = pagina.slice(inicio, pagina.indexOf("</section>", inicio));
  assert.match(hero, /<video class="cena-viva__video" data-src="media\/atendimentos-sala-viva\.mp4" poster="media\/atendimentos-sala-viva\.webp" autoplay muted loop playsinline preload="none"/);
  assert.doesNotMatch(hero, /cena-viva__(sombras|ramos|bambu|bambu-alto|halo|chama)/);
  assert.doesNotMatch(hero, /ATIVAR MOVIMENTO|PAUSAR MOVIMENTO|<button/);
});

test("a composição responde sem esconder overflow global", () => {
  assert.match(css, /@media \(max-width: 980px\)/);
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*?\.hero-card__cena \.cena-viva__video[\s\S]*?display: none/);
  assert.doesNotMatch(css, /html\s*,?\s*body[^}]*overflow-x\s*:\s*hidden|body[^}]*overflow-x\s*:\s*hidden/);
});
