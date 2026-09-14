import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { SECTION_RESOURCES, filterSectionResources, sectionResourcesFor } from "../../outputs/js/home/section-resources.js";
import { SECTION_ICON_NAMES } from "../../outputs/js/home/section-icons.js";
import { renderRegion, buildLookup } from "../../outputs/js/home/home-scenes.js";
import { JOURNEY_REGIONS } from "../../outputs/js/home/journey-data.js";
import { mountSectionPanels } from "../../outputs/js/home/section-panel.js";

test("as 12 seções têm catálogo, ícones, ações e destinos locais existentes", async () => {
  assert.equal(Object.keys(SECTION_RESOURCES).length, 12);
  const checked = new Map();
  for (const [id, config] of Object.entries(SECTION_RESOURCES)) {
    assert.ok(config.resources.length >= 6, id);
    assert.equal(config.benefits.length, 3, id);
    for (const item of [...config.resources, ...config.benefits, { href: config.primary[1] }]) {
      if (item.icon) assert.ok(SECTION_ICON_NAMES.includes(item.icon), `${id}: ${item.icon}`);
      assert.match(item.href, /^[\w-]+\.html(?:[?#].*)?$/);
      const url = new URL(item.href, "http://local/");
      const page = url.pathname.slice(1);
      if (!checked.has(page)) checked.set(page, await readFile(new URL(`../../outputs/${page}`, import.meta.url), "utf8"));
      if (url.hash) assert.ok(checked.get(page).includes(`id="${url.hash.slice(1)}"`), `${id}: âncora inexistente ${item.href}`);
    }
    for (const [label, icon] of config.chips) {
      assert.ok(SECTION_ICON_NAMES.includes(icon));
      assert.ok(filterSectionResources(config.resources, label).length > 0, `${id}: filtro vazio ${label}`);
    }
  }
});

test("busca ignora acentos e encontra múltiplas palavras sem executar HTML", () => {
  const resources = SECTION_RESOURCES.atendimentos.resources;
  assert.equal(filterSectionResources(resources, "ORACULOS")[0].icon, "spark");
  assert.equal(filterSectionResources(resources, "atendimento online")[0].icon, "monitor");
  assert.equal(filterSectionResources(resources, "<script>").length, 0);
  assert.equal(filterSectionResources(resources, "   ").length, resources.length);
});

test("catálogo não substitui notícias ou blocos com destino editorial diferente", () => {
  assert.equal(sectionResourcesFor({ id: "cursos", href: "artigo.html?post=curso" }), null);
  assert.equal(sectionResourcesFor({ id: "novidade-cursos", href: "cursos.html" }), null);
});

test("cada card mantém expansão acessível, conteúdo editorial e navegação com ícones", () => {
  const lookup = buildLookup(JOURNEY_REGIONS);
  for (const region of JOURNEY_REGIONS.filter(item => SECTION_RESOURCES[item.id])) {
    const html = renderRegion({ ...region, body: "Conteúdo editorial preservado." }, 0, null, lookup);
    assert.match(html, /data-resource-section=/);
    assert.match(html, /aria-hidden="true" inert/);
    assert.match(html, /Conteúdo editorial preservado/);
    assert.match(html, /type="search"/);
    assert.match(html, /data-section-share/);
    assert.doesNotMatch(html, /data-section-(?:search|filter|more|share)[^>]*tabindex="-1"/);
    assert.match(html, /section-panel-next/);
    assert.equal((html.match(/data-section-resource="/g) || []).length, SECTION_RESOURCES[region.id].resources.length);
    assert.doesNotMatch(html, /href="#"/);
  }
});

test("pesquisa, filtros, expansão da lista e desmontagem usam o mesmo catálogo", () => {
  const config = SECTION_RESOURCES.atendimentos;
  const rows = config.resources.map((_, index) => ({ dataset: { sectionResource: String(index) }, hidden: index >= 6 }));
  const status = { textContent: "" };
  const more = { hidden: false, expanded: "false", setAttribute(_, value) { this.expanded = value; }, getAttribute() { return this.expanded; } };
  const filter = { dataset: { sectionFilter: "Oráculos" }, pressed: "false", getAttribute() { return this.pressed; }, setAttribute(_, value) { this.pressed = value; } };
  const input = { value: "", matches: selector => selector === "[data-section-search]", closest: () => panel };
  const panel = { dataset: { resourceSection: "atendimentos" }, querySelector: selector => ({ "[data-section-search]": input, "[data-section-status]": status, "[data-section-more]": more })[selector], querySelectorAll: selector => selector === "[data-section-resource]" ? rows : [filter] };
  const listeners = new Map();
  const root = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
  const cleanup = mountSectionPanels(root);
  input.value = "online";
  listeners.get("input")({ target: input });
  assert.equal(rows.filter(row => !row.hidden).length, 1);
  assert.match(status.textContent, /1 recurso encontrado/);
  assert.equal(more.hidden, true);
  input.value = "semresultado";
  listeners.get("input")({ target: input });
  assert.equal(rows.filter(row => !row.hidden).length, 0);
  assert.match(status.textContent, /Nenhum recurso/);
  const click = control => listeners.get("click")({ target: { closest: selector => selector === "[data-resource-section]" ? panel : selector === control ? (control === "[data-section-filter]" ? filter : more) : null } });
  click("[data-section-filter]");
  assert.equal(filter.pressed, "true");
  assert.equal(rows.filter(row => !row.hidden).length, 1);
  click("[data-section-filter]");
  assert.equal(input.value, "");
  assert.equal(rows.filter(row => !row.hidden).length, 6);
  click("[data-section-more]");
  assert.equal(rows.filter(row => !row.hidden).length, config.resources.length);
  click("[data-section-more]");
  assert.equal(rows.filter(row => !row.hidden).length, 6);
  cleanup();
  assert.equal(listeners.size, 0);
});

test("compartilhamento copia o destino correto e informa falha sem confirmar sucesso", async () => {
  const status = { textContent: "" };
  const share = { dataset: { shareHref: "atendimentos.html" } };
  const panel = { querySelector: () => status };
  const listeners = new Map();
  const root = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
  const target = { closest: selector => selector === "[data-resource-section]" ? panel : selector === "[data-section-share]" ? share : null };
  let copied;
  const navigatorLike = { clipboard: { async writeText(value) { copied = value; } } };
  const cleanup = mountSectionPanels(root, { navigatorLike, locationLike: { href: "http://127.0.0.1:4183/transcendido.html" } });
  await listeners.get("click")({ target });
  assert.equal(copied, "http://127.0.0.1:4183/atendimentos.html");
  assert.equal(status.textContent, "Link copiado.");
  navigatorLike.clipboard.writeText = async () => { throw new Error("permission"); };
  await listeners.get("click")({ target });
  assert.match(status.textContent, /Copie o endereço:/);
  cleanup();
});
