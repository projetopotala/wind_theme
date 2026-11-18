import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const cenas = readFileSync(new URL("../../outputs/js/home/home-scenes.js", import.meta.url), "utf8");
const painel = readFileSync(new URL("../../outputs/js/home/section-panel.js", import.meta.url), "utf8");
const recursos = readFileSync(new URL("../../outputs/js/home/section-resources.js", import.meta.url), "utf8");
const estilo = readFileSync(new URL("../../outputs/css/home-journey.css", import.meta.url), "utf8");
const assistente = readFileSync(new URL("../../outputs/js/assistente/assistente-ui.js", import.meta.url), "utf8");

test("a Travessia oferece orientação contextual somente na região de atendimentos", () => {
  assert.match(cenas, /renderSectionPanel\(\{ id, region, config/);
  assert.match(painel, /id === "atendimentos"/);
  assert.match(painel, /Conheça os atendimentos do Potala/);
  assert.match(recursos, /primary: \["Conhecer atendimentos", "atendimentos\.html#orientacao"\]/);
  assert.match(cenas, /region--\$\{layoutVariant\}\$\{region\.id === "atendimentos" \? " region--care"/);
});

test("a orientação contextual preserva foco, toque e movimento reduzido", () => {
  assert.match(estilo, /\.region-context-orientation a[\s\S]*min-height: 44px/);
  assert.match(estilo, /\.region-context-orientation a:focus-visible/);
  assert.match(estilo, /prefers-reduced-motion: reduce/);
  assert.match(estilo, /region--care:not\(\.is-expanded\)/);
});

test("a primeira tela explica o Potala, oferece uma ação e identifica a ajuda", () => {
  assert.match(cenas, /Bem-vindo ao Potala\./);
  assert.match(cenas, /Um espaço de cuidado, conhecimento, cultura e encontros\./);
  assert.match(cenas, /journey-home-link--primary[^>]*href="#journey-path"[^>]*>Começar a Travessia/);
  assert.match(cenas, /journey-progress-hint.*12 etapas para explorar/);
  assert.match(assistente, /Assistente Potala/);
  assert.match(assistente, /Precisa de ajuda\?/);
});

test("a navegação da Travessia oferece anterior, próxima etapa e visão geral", () => {
  assert.match(cenas, /data-journey-prev/);
  assert.match(cenas, /data-journey-next/);
  assert.match(cenas, /class="journey-progress-map"/);
  assert.match(cenas, /Ver etapas/);
  assert.match(cenas, /data-progress-target="\$\{id\}"/);
  const controller = readFileSync(new URL("../../outputs/js/home/home-controller.js", import.meta.url), "utf8");
  assert.match(controller, /data-journey-prev/);
  assert.match(controller, /data-journey-next/);
});
