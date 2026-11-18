import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync(new URL("../../outputs/ux02-chapters.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../../outputs/js/ux02-chapters.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../../outputs/css/ux02-chapters.css", import.meta.url), "utf8");

test("a demonstração Chapters Timeline usa os capítulos reais e é isolada", () => {
  assert.match(html, /id="chapters-root"/);
  assert.match(js, /JOURNEY_REGIONS/);
  assert.match(js, /slice\(0, 12\)/);
  assert.match(js, /data-jump/);
  assert.match(css, /chapters-timeline/);
  assert.match(css, /prefers-reduced-motion/);
});

test("a demonstração preserva a abertura e aprimora a paisagem sem alterar a Travessia oficial", () => {
  assert.match(html, /class="journey-prologue"/);
  assert.match(html, /Bem-vindo ao Potala\./);
  assert.match(html, /journey-home-link--primary/);
  assert.match(html, /home-travessia\.mp4/);
  assert.match(js, /createLandscapeVideo/);
  assert.match(css, /chapters-mist-drift/);
});
