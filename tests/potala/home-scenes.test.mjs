import assert from "node:assert/strict";
import test from "node:test";
import * as homeScenes from "../../outputs/js/home/home-scenes.js";

const {
  journeyRhythmForIndex,
  presenceForDistance,
  presenceForRegionBounds,
} = homeScenes;

test("mantém um platô estável ao redor do centro", () => {
  assert.equal(presenceForDistance(0, 900), 1);
  assert.equal(presenceForDistance(450, 900), 1);
  assert.equal(presenceForDistance(630, 900), 1);
});

test("desaparece lentamente depois do platô", () => {
  const late = presenceForDistance(1152, 900);
  assert.ok(late > .35 && late < .55);
  assert.equal(presenceForDistance(1485, 900), 0);
});

test("o fade começa somente quando a informação entra na área visível", () => {
  assert.equal(typeof presenceForRegionBounds, "function");
  assert.equal(presenceForRegionBounds({ top: 720, bottom: 2400, viewportHeight: 720 }), 0);

  const entering = presenceForRegionBounds({ top: 360, bottom: 2040, viewportHeight: 720 });
  assert.ok(entering > .2 && entering < .75);
  assert.equal(presenceForRegionBounds({ top: 36, bottom: 1716, viewportHeight: 720 }), 1);

  const leaving = presenceForRegionBounds({ top: -1320, bottom: 360, viewportHeight: 720 });
  assert.ok(leaving > .2 && leaving < .75);
  assert.equal(presenceForRegionBounds({ top: -1580, bottom: 100, viewportHeight: 720 }), 0);
});

test("o percurso entre informações desacelera a narrativa sem voltar a ficar longo", () => {
  assert.equal(typeof journeyRhythmForIndex, "function");
  for (let index = 0; index < 8; index += 1) {
    const current = journeyRhythmForIndex(index);
    const next = journeyRhythmForIndex(index + 1);
    const centerDistance = current.regionHeight / 2 + current.silenceHeight + next.regionHeight / 2;
    assert.ok(centerDistance >= 225, `trecho ${index} ficou rápido demais`);
    assert.ok(centerDistance <= 260, `trecho ${index} ficou longo demais`);
  }
});

test("região renderizada é um destino clicável e não possui imagem própria", () => {
  assert.equal(typeof homeScenes.renderRegion, "function");
  const markup = homeScenes.renderRegion({
    id: "quem-somos",
    title: "Quem somos",
    category: "A entrada",
    description: "Conheça o Potala.",
    href: "quem-somos.html",
    tags: ["história"],
    layoutVariant: "landscape-manifesto",
    roadPlacement: "right",
  }, 0, null, new Map());

  assert.match(markup, /<a class="region-content" href="quem-somos\.html"/);
  assert.doesNotMatch(markup, /<figure|<img/);
});

test("região pode declarar conteúdo centralizado sem alterar o lado do caminho", () => {
  const markup = homeScenes.renderRegion({
    id: "profissionais",
    title: "Profissionais",
    category: "As pessoas",
    description: "Conheça as trajetórias.",
    href: "profissionais.html",
    tags: ["presença"],
    layoutVariant: "portrait-editorial",
    roadPlacement: "left",
    contentPlacement: "center",
  }, 4, null, new Map());

  assert.match(markup, /data-content-placement="center"/);
  assert.match(markup, /data-road-side="left"/);
});

test("títulos longos recebem escala que cabe na área editorial", () => {
  const markup = homeScenes.renderRegion({
    id: "atendimentos",
    title: "Atendimentos",
    category: "O cuidado",
    description: "Conheça o cuidado.",
    href: "atendimentos.html",
    tags: ["acolhimento"],
    layoutVariant: "editorial-right",
    roadPlacement: "left",
  }, 1, null, new Map());

  assert.match(markup, /data-title-scale="compact"/);
});

test("regiões laterais não exibem a instrução Explore os arredores", () => {
  const markup = homeScenes.renderRegion({
    id: "atendimentos",
    title: "Atendimentos",
    category: "O cuidado",
    description: "Conheça o cuidado.",
    href: "atendimentos.html",
    tags: ["acolhimento"],
    layoutVariant: "editorial-right",
    roadPlacement: "left",
    lateral: { left: [], right: [] },
  }, 1, null, new Map());

  assert.doesNotMatch(markup, /Explore os arredores|Explore caminhos relacionados|lateral-hint/i);
});
