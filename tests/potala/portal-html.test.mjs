import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const chegada = await readFile("outputs/transcender.html", "utf8");
const home = await readFile("outputs/transcendido.html", "utf8");
const homeJs = await readFile("outputs/secoes.js", "utf8");

test("respiração é opt-in e o fallback visual existe", () => {
  assert.match(chegada, /id="breath-launcher"/);
  assert.match(chegada, /id="breathing-guide"[^>]*hidden/);
  assert.match(chegada, /chegada-v2-master\.webp/);
  assert.match(chegada, /chegada-landscape-mobile\.webp/);
  assert.doesNotMatch(chegada, /<audio[^>]*autoplay/i);
});

test("a Chegada preserva o canvas sem expor um controle de drag", () => {
  assert.match(chegada, /id="arrival-scene"[^>]*aria-hidden="true"/);
  assert.doesNotMatch(chegada, /role="slider"|aria-valuemin|aria-valuemax/);
  assert.doesNotMatch(chegada, /arrival-transition-road/);
});

test("o indicador vertical de progresso ficou só na Chegada", () => {
  /*
   * As duas etapas o compartilhavam. Na Home ele saiu: ali a barra lateral já
   * conta a mesma coisa, e com mais precisão — a roleta diz em qual bloco se
   * está, e o contador diz o número. Um fio vertical dizendo "você está mais ou
   * menos aqui" ao lado disso era a terceira resposta para a mesma pergunta, e
   * atravessava a paisagem para dá-la.
   *
   * Na Chegada ele fica: lá não há barra lateral nem contador, e ele é o único
   * sinal de que a página continua abaixo.
   */
  assert.match(chegada, /class="journey-scroll-cue"/);
  assert.doesNotMatch(home, /class="journey-scroll-cue"/);
});

test("home mantém fallback e não intercepta wheel", () => {
  assert.match(home, /<noscript>/);
  assert.match(home, /id="journey-road"[^>]*aria-hidden="true"/);
  assert.match(home, /id="journey-entry-veil"[^>]*aria-hidden="true"/);
  assert.doesNotMatch(home, /journey-entry-road/);
  assert.doesNotMatch(homeJs, /addEventListener\(["']wheel["']/);
  assert.doesNotMatch(homeJs, /handleStoryWheel|wheelTailFrame|wheelTailTimer/);
});
