import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { shouldTransitionNavigation } from "../../outputs/js/ux02-navigation-transition.js";

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
  assert.match(html, /chapters-refined-landscape/);
  assert.match(css, /home-travessia-ux02\.webp/);
  assert.match(css, /home-travessia-ux02-mobile\.webp/);
});

test("a transição visual preserva navegação normal quando necessário", () => {
  const event = { defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
  const local = new URL("https://potala.test/atendimentos-conceito.html");
  const external = new URL("https://example.com/");
  assert.equal(shouldTransitionNavigation(event, local, { origin: local.origin }), true);
  assert.equal(shouldTransitionNavigation({ ...event, ctrlKey: true }, local, { origin: local.origin }), false);
  assert.equal(shouldTransitionNavigation(event, external, { origin: local.origin }), false);
  assert.equal(shouldTransitionNavigation(event, local, { origin: local.origin, reducedMotion: true }), false);
  assert.match(html, /chapters-page-transition/);
  assert.match(js, /location\.assign\(destination\.href\)/);
});

test("os capítulos alternam os lados e os cards crescem sem truncar o conteúdo", () => {
  assert.match(css, /chapter:nth-child\(odd\) \.chapter-card \{ grid-column: 1/);
  assert.match(css, /chapter:nth-child\(even\) \.chapter-card \{ grid-column: 2/);
  assert.match(css, /\.chapter-copy[\s\S]*overflow: visible/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /chapters-timeline::before/);
});

test("a estrada usa enquadramentos próprios sem ampliar ou substituir a arte", () => {
  assert.match(html, /class="chapters-road-light"/);
  assert.match(css, /home-travessia\.webp/);
  assert.match(css, /home-travessia-mobile\.webp/);
  assert.match(css, /object-position: center bottom/);
  assert.match(css, /body\.chapters-started \.chapters-road-light/);
  assert.doesNotMatch(css, /chapters-landscape[^}]*scale\(1\.04\)/);
  assert.match(js, /progress \* -18/);
});

test("os cards ampliados mantêm conteúdo integral e viram uma coluna até tablet", () => {
  assert.match(css, /width: min\(1380px, calc\(100% - 32px\)\)/);
  assert.match(css, /min-height: 410px/);
  assert.match(css, /max-width: 42ch/);
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /aspect-ratio: 16 \/ 10/);
  assert.match(css, /min-height: 50px/);
  assert.doesNotMatch(css, /line-clamp|text-overflow:\s*ellipsis/);
});
