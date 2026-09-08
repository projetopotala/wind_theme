import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const outputs = new URL("../../outputs/", import.meta.url);

test("a busca da Biblioteca encontra título, tema e formato sem diferenciar acentos", async () => {
  const module = await import("../../outputs/js/culture/library-catalog.js").catch(() => null);
  assert.ok(module, "falta a experiência local da Biblioteca Potala");

  const catalog = [
    { title: "Saúde e presença", themes: ["saúde integral"], format: "Livro físico" },
    { title: "Poéticas do cuidado", themes: ["arte"], format: "Publicação digital" },
  ];

  assert.deepEqual(module.filterLibraryCatalog(catalog, "saude"), [catalog[0]]);
  assert.deepEqual(module.filterLibraryCatalog(catalog, "digital"), [catalog[1]]);
  assert.deepEqual(module.filterLibraryCatalog(catalog, "   "), catalog);
});

test("a Revista filtra pautas por tema e por busca textual", async () => {
  const module = await import("../../outputs/js/revista/magazine-filter.js").catch(() => null);
  assert.ok(module, "falta o filtro editorial da Revista");

  const articles = [
    { title: "Quando a ansiedade cresce", excerpt: "Saúde emocional", category: "saude" },
    { title: "A música e o vínculo", excerpt: "Arte e convivência", category: "cultura" },
  ];

  assert.deepEqual(module.filterMagazineArticles(articles, { category: "saude", query: "" }), [articles[0]]);
  assert.deepEqual(module.filterMagazineArticles(articles, { category: "todos", query: "musica" }), [articles[1]]);
  assert.deepEqual(module.filterMagazineArticles(articles, { category: "todos", query: "" }), articles);
});

test("a Revista é uma seção permanente editável da Home", async () => {
  const { DEFAULT_HOME_BLOCKS, JOURNEY_DISCOVERIES, JOURNEY_REGIONS } = await import("../../outputs/js/home/journey-data.js");
  const region = JOURNEY_REGIONS.find((item) => item.id === "revista");
  const block = DEFAULT_HOME_BLOCKS.find((item) => item.id === "revista");

  assert.equal(region?.href, "revista.html");
  assert.equal(block?.href, "revista.html");
  assert.equal(block?.published, true);
  assert.equal(JOURNEY_DISCOVERIES.some((item) => item.id === "revista"), false);

  const home = await readFile(new URL("transcendido.html", outputs), "utf8");
  assert.match(home, /href="revista\.html"[^>]*>Revista</);
});

test("o front acrescenta a Revista ausente sem apagar a edição remota", async () => {
  const module = await import("../../outputs/js/home/default-section-bridge.js").catch(() => null);
  assert.ok(module, "falta a ponte local da nova seção");

  const defaults = [
    { id: "inspiracao", title: "Inspiração" },
    { id: "revista", title: "Revista" },
    { id: "blog", title: "Blog" },
  ];
  const missing = module.mergeRequiredDefaultSections(
    [{ id: "inspiracao", title: "Inspiração" }, { id: "blog", title: "Blog" }],
    defaults,
    ["revista"],
  );
  assert.deepEqual(missing.map((item) => item.id), ["inspiracao", "revista", "blog"]);

  const edited = module.mergeRequiredDefaultSections(
    [{ id: "revista", title: "Revista editada" }, { id: "blog", title: "Blog" }],
    defaults,
    ["revista"],
  );
  assert.equal(edited.find((item) => item.id === "revista")?.title, "Revista editada");
  assert.equal(edited.filter((item) => item.id === "revista").length, 1);
});

test("cada encontro cultural abre conteúdo próprio na mesma página editorial", async () => {
  const module = await import("../../outputs/js/culture/cultural-experiences.js").catch(() => null);
  assert.ok(module, "falta o catálogo das experiências culturais");

  const expected = {
    "cine-potala": "Cine Potala",
    exposicoes: "Exposições e apresentações",
    "cafe-filosofico": "Café filosófico",
    saraus: "Saraus e lançamentos",
    festivais: "Festivais e mostras",
    "rodas-de-conversa": "Rodas de conversa",
  };
  for (const [slug, title] of Object.entries(expected)) {
    const experience = module.culturalExperienceFor(slug);
    assert.equal(experience?.title, title);
    assert.ok(experience?.sections?.length >= 3, `${title} não explica a experiência completa`);
  }

  const page = await readFile(new URL("experiencias-culturais.html", outputs), "utf8").catch(() => "");
  assert.match(page, /data-cultural-experience/);
  assert.match(page, /data-cultural-navigation/);
  assert.match(page, /programacao\.html/);
});

test("a respiração 3-3-3 percorre inspirar, segurar e expirar", async () => {
  const module = await import("../../outputs/js/inspiration/practice-studio.js").catch(() => null);
  assert.ok(module, "falta o estúdio funcional de inspiração");

  assert.deepEqual(module.breathingStateAt(0), { phase: "Inspirar", phaseSecond: 0, cycleSecond: 0 });
  assert.deepEqual(module.breathingStateAt(3), { phase: "Segurar", phaseSecond: 0, cycleSecond: 3 });
  assert.deepEqual(module.breathingStateAt(6), { phase: "Expirar", phaseSecond: 0, cycleSecond: 6 });
  assert.deepEqual(module.breathingStateAt(9), { phase: "Inspirar", phaseSecond: 0, cycleSecond: 0 });
});

test("meditação e escuta terminam e a reflexão pronta permanece disponível", async () => {
  const module = await import("../../outputs/js/inspiration/practice-studio.js").catch(() => null);
  assert.ok(module, "falta o estúdio funcional de inspiração");

  assert.equal(module.timedPracticeState("meditar", 0).remaining, 60);
  assert.equal(module.timedPracticeState("meditar", 60).complete, true);
  assert.equal(module.timedPracticeState("escutar", 30).complete, true);
  assert.match(module.reflectionAt(0), /\?/);
});

test("uma prática pode ser pausada e continuada sem perder o ponto", async () => {
  const module = await import("../../outputs/js/inspiration/practice-studio.js");
  let state = module.transitionPracticeControl(undefined, "start", 1_000);

  assert.equal(state.status, "running");
  state = module.transitionPracticeControl(state, "pause", 5_500);
  assert.equal(state.status, "paused");
  assert.equal(module.practiceElapsedSeconds(state, 9_000), 4);

  state = module.transitionPracticeControl(state, "resume", 9_000);
  assert.equal(state.status, "running");
  assert.equal(module.practiceElapsedSeconds(state, 11_500), 7);

  state = module.transitionPracticeControl(state, "reset", 12_000);
  assert.deepEqual(state, { status: "idle", elapsedMs: 0, startedAt: 0 });
});

test("as práticas complementares de Inspiração abrem orientações utilizáveis", async () => {
  const html = await readFile(new URL("inspiracao.html", outputs), "utf8");
  const module = await import("../../outputs/js/inspiration/practice-studio.js");

  for (const resource of ["meditacao", "mantra", "receita", "gentileza", "bem-estar"]) {
    assert.match(html, new RegExp("data-inspiration-resource=\"" + resource + "\""), resource);
    const content = module.inspirationResourceFor(resource);
    assert.ok(content.title);
    assert.ok(content.steps.length >= 2);
  }
  assert.match(html, /data-inspiration-resource-panel/);
});
