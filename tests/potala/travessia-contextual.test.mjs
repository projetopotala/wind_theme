import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const cenas = readFileSync(new URL("../../outputs/js/home/home-scenes.js", import.meta.url), "utf8");
const estilo = readFileSync(new URL("../../outputs/css/home-journey.css", import.meta.url), "utf8");

test("a Travessia oferece orientação contextual somente na região de atendimentos", () => {
  assert.match(cenas, /region\.id === "atendimentos"/);
  assert.match(cenas, /Conheça os atendimentos do Potala/);
  assert.match(cenas, /href="atendimentos\.html"/);
  assert.match(cenas, /region-context-orientation/);
  assert.equal((cenas.match(/region-context-orientation/g) || []).length, 2);
});

test("a orientação contextual preserva foco, toque e movimento reduzido", () => {
  assert.match(estilo, /\.region-context-orientation a[\s\S]*min-height: 44px/);
  assert.match(estilo, /\.region-context-orientation a:focus-visible/);
  assert.match(estilo, /prefers-reduced-motion: reduce/);
});
