import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const chegada = await readFile("outputs/transcender.html", "utf8");
const home = await readFile("outputs/transcendido.html", "utf8");
const homeJs = await readFile("outputs/secoes.js", "utf8");

test("respiração é opt-in e o fallback visual existe", () => {
  assert.match(chegada, /id="breath-launcher"/);
  assert.match(chegada, /id="breathing-guide"[^>]*hidden/);
  assert.match(chegada, /chegada-landscape\.webp/);
  assert.doesNotMatch(chegada, /<audio[^>]*autoplay/i);
});

test("drag e canvas têm semântica correta", () => {
  assert.match(chegada, /aria-valuemin="0"/);
  assert.match(chegada, /aria-valuemax="100"/);
  assert.match(chegada, /id="arrival-scene"[^>]*aria-hidden="true"/);
});

test("home mantém fallback e não intercepta wheel", () => {
  assert.match(home, /<noscript>/);
  assert.match(home, /id="journey-road"[^>]*aria-hidden="true"/);
  assert.doesNotMatch(homeJs, /addEventListener\(["']wheel["']/);
  assert.doesNotMatch(homeJs, /handleStoryWheel|wheelTailFrame|wheelTailTimer/);
});
