import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { composeEditorial, relatedFor } from "../../outputs/js/home/editorial-composition.js";
import { DEFAULT_HOME_BLOCKS } from "../../outputs/js/home/journey-data.js";
import { normalizeHomeBlock } from "../../outputs/js/home/content-model.js";
import { homeBlockToDatabase, homeBlockFromDatabase } from "../../outputs/js/home/supabase-content-repository.js";
import { comRelacoes } from "../../outputs/js/home/home-controller.js";
import { renderRegion, mountJourney } from "../../outputs/js/home/home-scenes.js";
import { plantState, waterPlant, plantStage, localDay, mergePlantStates, renderLivingFooter, mountLivingFooter } from "../../outputs/js/home/living-footer.js";
import { previewStructure } from "../../outputs/js/home/admin-preview.js";

test("a capa respeita a ordem editorial, filtra rascunhos e não reinsere novidades removidas", () => {
  const input = [{ id: "curso", position: 0 }, { id: "noticia", position: 2, tags: ["recente"] }, { id: "pessoa", position: 1 }, { id: "oculto", position: 3, published: false }];
  const before = structuredClone(input);
  assert.deepEqual(composeEditorial(input).map((b) => b.id), ["curso", "pessoa", "noticia"]);
  assert.deepEqual(composeEditorial(input.filter((b) => b.id !== "noticia")).map((b) => b.id), ["curso", "pessoa"]);
  assert.deepEqual(input, before);
  const controller = readFileSync(new URL("../../outputs/js/home/home-controller.js", import.meta.url), "utf8");
  assert.doesNotMatch(controller, /comNovidadesDoCodigo|novidadesPrimeiro/);
});
test("a composição inicial intercala notícias e áreas do Instituto", () => {
  const kinds = DEFAULT_HOME_BLOCKS.map((b) => b.id.startsWith("novidade-"));
  assert.equal(kinds[0], false);
  assert.equal(kinds[1], true);
  assert.ok(kinds.slice(3).includes(true));
});
test("relações automáticas usam temas e jamais sugerem rascunhos ou o próprio bloco", () => {
  const block = { id: "sono", tags: ["Saúde", "recente"], relatedContent: ["curso"] };
  const items = [block, { id: "curso" }, { id: "pratica", tags: ["saude"] }, { id: "oculto", tags: ["saúde"], published: false }, { id: "noticia", tags: ["recente"] }];
  assert.deepEqual(relatedFor(block, items), ["curso", "pratica"]);
  assert.deepEqual(relatedFor({ ...block, relatedMode: "manual", relatedContent: [] }, items), []);
  assert.deepEqual(comRelacoes([{ id: "cursos", relatedMode: "manual", relatedContent: [] }])[0].relatedContent, []);
});
test("composição e seleção manual sobrevivem ao ciclo formulário banco leitura", () => {
  const block = normalizeHomeBlock({ title: "Pausa", relatedContent: "cursos, cursos, profissionais", relatedMode: "manual", editorialVariant: "reflection" });
  const restored = homeBlockFromDatabase(homeBlockToDatabase(block));
  assert.deepEqual(restored.relatedContent, ["cursos", "profissionais"]);
  assert.equal(restored.relatedMode, "manual");
  assert.equal(restored.editorialVariant, "reflection");
  assert.notEqual(previewStructure([block]), previewStructure([{ ...block, editorialVariant: "portrait" }]));
});
test("formato de destaque é visível sem expansão e a notícia tem destino explícito", () => {
  const markup = renderRegion({ id: "curso", title: "Curso", editorialVariant: "feature", image: "media/journey-cuidado.webp", href: "cursos.html" }, 0, null, new Map());
  assert.match(markup, /data-editorial-variant="feature"/);
  assert.match(markup, /class="region-capa"/);
  const news = renderRegion({ id: "noticia", title: "Notícia", tags: ["recente"], href: "artigo.html?post=teste" }, 0, null, new Map());
  assert.match(news, /href="artigo.html\?post=teste"/);
  assert.match(news, /Continuar a leitura/);
});
test("encerramento integrado oferece retornos seguros e contato sem envio simulado", () => {
  const root = { innerHTML: "", querySelectorAll: () => [] };
  mountJourney(root, { regions: [{ id: "cursos", title: "Cursos", href: "cursos.html" }] });
  assert.match(root.innerHTML, /id="rodape-vivo"/);
  assert.match(root.innerHTML, /Obrigado por caminhar conosco/);
  assert.match(root.innerHTML, /href="cursos.html"/);
  assert.match(root.innerHTML, /data-water-plant/);
  assert.match(root.innerHTML, /data-takeaway-result hidden/);
  assert.doesNotMatch(renderLivingFooter([{ title: "Ataque", href: 'javascript:alert(1)' }]), /javascript:/);
  assert.match(root.innerHTML, /A mensagem só é enviada por você/);
});
test("plantinha guarda um cuidado por dia, preserva retornos e tolera dados inválidos", () => {
  const first = waterPlant({}, "2026-09-10");
  assert.equal(first.visits, 1);
  assert.deepEqual(waterPlant(first, "2026-09-10"), first);
  assert.deepEqual(waterPlant(first, "2026-09-09"), first);
  assert.equal(waterPlant(first, "2026-09-11").visits, 2);
  assert.equal(waterPlant(first, "2026-09-11").streak, 2);
  assert.equal(waterPlant(first, "2026-09-14").streak, 1);
  assert.deepEqual(plantState(null), { visits: 0, lastDay: "", streak: 0, history: [] });
  assert.equal(plantState({ visits: -200 }).visits, 0);
  assert.equal(plantStage(0), "Início");
  assert.equal(plantStage(3), "Crescimento");
  assert.equal(plantStage(7), "Florescimento");
  assert.equal(plantStage(20), "Plenitude");
  assert.equal(localDay(new Date(2026, 8, 10, 23, 59)), "2026-09-10");
  assert.deepEqual(mergePlantStates(
    { visits: 2, lastDay: "2026-09-11", streak: 2, history: ["2026-09-10", "2026-09-11"] },
    { visits: 3, lastDay: "2026-09-12", streak: 3, history: ["2026-09-10", "2026-09-11", "2026-09-12"] },
  ), { visits: 3, lastDay: "2026-09-12", streak: 3, history: ["2026-09-10", "2026-09-11", "2026-09-12"] });
});
test("migração protege a edição e transporta campos na publicação de rascunhos", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/202609100001_home_editorial_composition.sql", import.meta.url), "utf8");
  assert.match(sql, /replace_home_blocks_editorial\(payload jsonb\)/);
  assert.equal((sql.match(/if not public\.is_portal_admin\(\)/g) || []).length, 2);
  for (const name of ["editorial_variant", "related_mode", "related_content"]) {
    assert.match(sql, new RegExp(`drafts\\.${name}`));
    assert.match(sql, new RegExp(`${name} = excluded\\.${name}`));
  }
  assert.doesNotMatch(sql, /grant .* to anon|disable row level security|drop table/i);
});

test("rodapé recupera a planta, anima a troca de lembranças, tolera armazenamento bloqueado e remove eventos", async () => {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const events = new Map();
  const pageEvents = new Map();
  const elements = new Map();
  const fake = () => {
    const classes = new Set();
    return {
      textContent: "", dataset: {}, hidden: true, alt: "", disabled: false,
      offsetWidth: 1,
      attributes: new Map(), style: { setProperty() {} },
      getAttribute(name) { return this.attributes.get(name) || ""; },
      setAttribute(name, value) { this.attributes.set(name, String(value)); },
      removeAttribute(name) { this.attributes.delete(name); },
      classList: {
        add(...names) { names.forEach((name) => classes.add(name)); },
        remove(...names) { names.forEach((name) => classes.delete(name)); },
        toggle(name, force) { if (force ?? !classes.has(name)) classes.add(name); else classes.delete(name); },
        contains(name) { return classes.has(name); },
      },
    };
  };
  const selectors = ["[data-water-plant]", "[data-water-label]", "[data-plant-status]", "[data-plant-stage]", "[data-plant-image]", "[data-plant-stage-label]", "[data-plant-progress]", "[data-plant-storage]", ".closing-takeaway", "[data-choose-gift]", "[data-gift-message]", "[data-takeaway-result]", "[data-save-gift]"];
  selectors.forEach((key) => elements.set(key, fake()));
  const cards = [{ ...fake(), dataset: { takeaway: "poema" } }, { ...fake(), dataset: { takeaway: "reflexao" } }];
  const footer = {
    querySelector: (key) => elements.get(key),
    querySelectorAll: (key) => key === "[data-takeaway]" ? cards : [],
    addEventListener: (key, fn) => events.set(key, fn),
    removeEventListener: (key) => events.delete(key),
  };
  const saved = new Map();
  const fire = (selector) => events.get("click")({ target: { closest: (value) => value === selector } });
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: {
      addEventListener: (key, fn) => pageEvents.set(key, fn),
      removeEventListener: (key) => pageEvents.delete(key),
    } });
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
      getItem: (key) => saved.get(key), setItem: (key, value) => saved.set(key, value),
    } });
    let cleanup = mountLivingFooter({ querySelector: () => footer });
    fire("[data-water-plant]");
    assert.equal(elements.get("[data-water-plant]").disabled, true);
    assert.equal(JSON.parse(saved.get("potala.plantinha.v1")).visits, 1);
    assert.equal(elements.get("[data-plant-stage]").dataset.watering, "true");
    fire("[data-water-plant]");
    assert.equal(JSON.parse(saved.get("potala.plantinha.v1")).visits, 1);
    fire("[data-choose-gift]");
    const first = elements.get("[data-gift-message]").textContent;
    fire("[data-choose-gift]");
    assert.equal(elements.get("[data-gift-message]").textContent, first);
    assert.equal(elements.get("[data-gift-message]").classList.contains("is-leaving"), true);
    await new Promise((resolve) => setTimeout(resolve, 340));
    assert.notEqual(elements.get("[data-gift-message]").textContent, first);
    assert.equal(elements.get("[data-gift-message]").classList.contains("is-entering"), true);
    assert.equal(elements.get("[data-takeaway-result]").hidden, false);
    cleanup();
    assert.equal(elements.get("[data-plant-stage]").dataset.watering, undefined);
    assert.equal(events.size, 0);
    assert.equal(pageEvents.size, 0);
    cleanup = mountLivingFooter({ querySelector: () => footer });
    assert.equal(elements.get("[data-plant-stage]").dataset.plantStage, "Início");
    cleanup();
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("blocked"); } });
    cleanup = mountLivingFooter({ querySelector: () => footer });
    fire("[data-water-plant]");
    assert.match(elements.get("[data-plant-storage]").textContent, /não permitiu guardar/);
    cleanup();
  } finally {
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor); else delete globalThis.window;
    if (storageDescriptor) Object.defineProperty(globalThis, "localStorage", storageDescriptor); else delete globalThis.localStorage;
  }
});

test("migração da plantinha isola o cuidado por conta e mantém o estágio derivado", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/202609220001_plant_care.sql", import.meta.url), "utf8");
  assert.match(sql, /create table if not exists public\.plant_care/);
  assert.match(sql, /unique \(user_id\)/);
  assert.match(sql, /enable row level security/);
  assert.equal((sql.match(/auth\.uid\(\) = user_id/g) || []).length, 4);
  assert.doesNotMatch(sql, /stage|grant .*anon/i);
  const repository = readFileSync(new URL("../../outputs/js/home/plant-care-repository.js", import.meta.url), "utf8");
  assert.match(repository, /onConflict: "user_id"/);
  assert.doesNotMatch(repository, /service.role|service_role|user_id:/i);
});
