import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const chegada = await readFile("outputs/transcender.html", "utf8");
const home = await readFile("outputs/transcendido.html", "utf8");
const homeJs = await readFile("outputs/secoes.js", "utf8");

test("respiração é opt-in e a placa da Chegada é a imagem principal", () => {
  assert.match(chegada, /id="breath-launcher"/);
  assert.match(chegada, /id="breathing-guide"[^>]*hidden/);
  // A cena WebGL em camadas deu lugar a uma composição única com chegada.png;
  // o que este teste ainda guarda é o que NÃO podia se perder junto com ela:
  // a respiração continua opt-in e o som nunca começa sozinho.
  assert.match(chegada, /<img[^>]+src="media\/chegada\.png"/);
  assert.doesNotMatch(chegada, /<audio[^>]*autoplay/i);
});

test("a Chegada não expõe um controle de drag nem sobras da cena antiga", () => {
  assert.doesNotMatch(chegada, /role="slider"|aria-valuemin|aria-valuemax/);
  assert.doesNotMatch(chegada, /arrival-transition-road/);
  /*
   * Os canvases, o mundo de atores e o poema saíram com a cena antiga. Deixar
   * qualquer um deles para trás não daria erro nenhum: o elemento ficaria no
   * DOM, sem script que o alimente, invisível e ainda assim tabulável.
   */
  assert.doesNotMatch(chegada, /id="arrival-scene"|id="arrival-nature"|id="arrival-world"|id="world-poem"/);
});

test("as duas etapas compartilham o indicador vertical de progresso", () => {
  assert.match(chegada, /class="journey-scroll-cue"/);
  assert.match(home, /class="journey-scroll-cue"/);
});

test("home mantém fallback e não intercepta wheel", () => {
  assert.match(home, /<noscript>/);
  assert.match(home, /id="journey-road"[^>]*aria-hidden="true"/);
  assert.match(home, /id="journey-entry-veil"[^>]*aria-hidden="true"/);
  assert.doesNotMatch(home, /journey-entry-road/);
  assert.doesNotMatch(homeJs, /addEventListener\(["']wheel["']/);
  assert.doesNotMatch(homeJs, /handleStoryWheel|wheelTailFrame|wheelTailTimer/);
});
