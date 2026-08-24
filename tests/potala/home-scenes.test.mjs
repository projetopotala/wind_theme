import assert from "node:assert/strict";
import test from "node:test";
import * as homeScenes from "../../outputs/js/home/home-scenes.js";

const { presenceForDistance } = homeScenes;

test("mantém um platô estável ao redor do centro", () => {
  assert.equal(presenceForDistance(0, 900), 1);
  assert.equal(presenceForDistance(450, 900), 1);
});

test("desaparece lentamente depois do platô", () => {
  const late = presenceForDistance(900, 900);
  assert.ok(late > .25 && late < .4);
  assert.equal(presenceForDistance(1152, 900), 0);
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
