import assert from "node:assert/strict";
import test from "node:test";

import { JOURNEY_REGIONS } from "../../outputs/js/home/journey-data.js";
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

  /*
   * O laço percorre TODAS as transições, e não um número escrito à mão: com
   * oito fixos, acrescentar uma região deixava os últimos trechos sem medida —
   * o guarda continuava verde sobre um pedaço da jornada que ninguém olhava.
   */
  for (let index = 0; index < JOURNEY_REGIONS.length - 1; index += 1) {
    const current = journeyRhythmForIndex(index);
    const next = journeyRhythmForIndex(index + 1);
    const centerDistance = current.regionHeight / 2 + current.silenceHeight + next.regionHeight / 2;
    assert.ok(centerDistance >= 225, `trecho ${index} ficou rápido demais`);
    assert.ok(centerDistance <= 260, `trecho ${index} ficou longo demais`);
  }
});

test("bloco fechado controla detalhes expansíveis e não possui imagem própria", () => {
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

  assert.match(markup, /<button[^>]+class="region-summary"[^>]+aria-expanded="false"/);
  assert.match(markup, /aria-controls="quem-somos-details"/);
  assert.match(markup, /id="quem-somos-details"[^>]+aria-hidden="true"/);
  assert.match(markup, /data-side="left"/);
  assert.doesNotMatch(markup, /<figure|<img/);
});

test("imagem opcional aparece somente nos detalhes e carrega sob demanda", () => {
  const markup = homeScenes.renderRegion({
    id: "cursos",
    title: "Cursos",
    category: "Conhecimento",
    summary: "Aprender também é cuidar.",
    body: "Formações e vivências.",
    image: "media/journey-cultura.webp",
    icon: "C",
    href: "cursos.html",
    tags: ["formação"],
    side: "right",
  }, 2, null, new Map());

  const summary = markup.match(/<button class="region-summary"[\s\S]*?<\/button>/)?.[0] ?? "";
  const details = markup.match(/<div class="region-details"[\s\S]*?<\/div>/)?.[0] ?? "";
  assert.doesNotMatch(summary, /<img|region-icon/);
  assert.match(details, /<figure class="region-media">/);
  assert.match(details, /<img src="media\/journey-cultura\.webp" alt="" loading="lazy" decoding="async">/);
  assert.match(details, /<span class="region-icon" aria-hidden="true">C<\/span>/);
});

test("fonte de imagem insegura é descartada sem deixar espaço vazio", () => {
  const markup = homeScenes.renderRegion({
    id: "seguro",
    title: "Seguro",
    category: "Entrada",
    summary: "Resumo",
    body: "Texto",
    image: "javascript:alert(1)",
    href: "quem-somos.html",
    tags: [],
    side: "left",
  }, 0, null, new Map());

  assert.doesNotMatch(markup, /region-media|<img/);
});

test("escapa conteúdo editorial antes de inserir no HTML", () => {
  const markup = homeScenes.renderRegion({
    id: "seguro",
    title: "<script>alert(1)</script>",
    category: "Entrada & cuidado",
    summary: "<img src=x onerror=alert(1)>",
    body: "Texto <strong>sem markup</strong>",
    href: "quem-somos.html",
    tags: ["presença & escuta"],
    side: "right",
  }, 0, null, new Map());

  assert.doesNotMatch(markup, /<script>|<img/);
  assert.match(markup, /&lt;script&gt;/);
  assert.match(markup, /Entrada &amp; cuidado/);
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

/*
 * O texto do bloco passa pelo Markdown restrito, e a prova de que isso é
 * seguro é a mesma de sempre: HTML colado continua escapado.
 */
test("o texto do bloco vira Markdown restrito, nunca HTML cru", async () => {
  const { renderRegion } = homeScenes;
  const html = renderRegion(
    { id: "a", title: "Atendimentos", summary: "r", body: "**forte**\n\n<script>alert(1)</script>", side: "left" },
    0,
  );

  assert.match(html, /<strong>forte<\/strong>/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

/* A descrição acessível só entra quando existe: um aria-description vazio
   faz o leitor de tela anunciar um silêncio no lugar de nada. */
test("a descrição acessível só aparece quando preenchida", async () => {
  const { renderRegion } = homeScenes;
  const com = renderRegion(
    { id: "a", title: "A", summary: "r", side: "left", metaDescription: "Leva à página de atendimentos" },
    0,
  );
  const sem = renderRegion({ id: "a", title: "A", summary: "r", side: "left" }, 0);

  assert.match(com, /aria-description="Leva à página de atendimentos"/);
  assert.doesNotMatch(sem, /aria-description/);
});
