import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { DISCOVERY_PATHS, renderPortalDiscovery, renderCommunityInvitation, renderNarrativeBridge, nextDiscoveryTab, mountPortalDiscovery } from "../../outputs/js/home/portal-discovery.js";

test("os quatro caminhos levam a páginas existentes e imagens locais", () => {
  assert.equal(DISCOVERY_PATHS.length, 4);
  const targets = new Set();
  for (const path of DISCOVERY_PATHS) {
    assert.ok(existsSync(new URL(`../../outputs/${path.image}`, import.meta.url)));
    for (const link of path.links) {
      if (link.href.startsWith("#")) continue;
      targets.add(link.href);
      assert.ok(existsSync(new URL(`../../outputs/${link.href}`, import.meta.url)), link.href);
    }
  }
  assert.ok(targets.size >= 10);
});
test("abas expõem rótulos e apenas o primeiro painel começa visível", () => {
  const html = renderPortalDiscovery();
  assert.equal((html.match(/role="tab"/g) || []).length, 4);
  assert.equal((html.match(/role="tabpanel"/g) || []).length, 4);
  assert.equal((html.match(/tabindex="0" hidden/g) || []).length, 3);
  for (const path of DISCOVERY_PATHS) assert.match(html, new RegExp(`aria-controls="discovery-panel-${path.id}"`));
});
test("setas percorrem os caminhos e Home e End chegam às extremidades", () => {
  assert.equal(nextDiscoveryTab(0, "ArrowLeft"), 3);
  assert.equal(nextDiscoveryTab(3, "ArrowRight"), 0);
  assert.equal(nextDiscoveryTab(2, "Home"), 0);
  assert.equal(nextDiscoveryTab(0, "End"), 3);
  assert.equal(nextDiscoveryTab(2, "Tab"), 2);
});
test("trocar caminho atualiza foco, visibilidade e geometria sem manter listeners", () => {
  const listeners = new Map();
  const tabs = DISCOVERY_PATHS.map((_, index) => ({ dataset: { discoveryTab: String(index) }, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, focus() { this.focused = true; } }));
  const panels = DISCOVERY_PATHS.map(() => ({ hidden: false }));
  const surface = { querySelectorAll: (selector) => selector.includes("discovery-tab") ? tabs : panels,
    addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: (key) => listeners.delete(key) };
  let layoutChanges = 0;
  const dispose = mountPortalDiscovery({ querySelector: () => surface }, { reducedMotion: true, onLayoutChange: () => layoutChanges++ });
  listeners.get("click")({ target: { closest: () => tabs[2] } });
  assert.deepEqual(panels.map((panel) => panel.hidden), [true, true, false, true]);
  assert.equal(tabs[2].attrs["aria-selected"], "true");
  let prevented = false;
  listeners.get("keydown")({ target: { closest: () => tabs[2] }, key: "End", preventDefault: () => { prevented = true; } });
  assert.equal(tabs[3].focused, true);
  assert.equal(panels[3].hidden, false);
  assert.equal(layoutChanges, 2);
  assert.ok(prevented);
  dispose(); assert.equal(listeners.size, 0);
});
test("convites institucionais encaminham à Recepção e pontes correspondem ao próximo assunto", () => {
  const html = renderCommunityInvitation();
  assert.equal((html.match(/href="recepcao.html"/g) || []).length, 3);
  assert.doesNotMatch(html, /inscrições abertas|vagas disponíveis|documento/i);
  assert.match(renderNarrativeBridge({ id: "cursos" }), /aprender/);
  assert.equal(renderNarrativeBridge({ id: "novo-conteudo" }), "");
});
test("efeitos respeitam movimento reduzido e estilos carregam apenas na Home", () => {
  const css = readFileSync(new URL("../../outputs/css/portal-discovery.css", import.meta.url), "utf8");
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\)/);
  assert.match(css, /\[hidden\].*display: none !important/);
  const arrival = readFileSync(new URL("../../outputs/transcender.html", import.meta.url), "utf8");
  assert.doesNotMatch(arrival, /portal-discovery/);
  const home = readFileSync(new URL("../../outputs/transcendido.html", import.meta.url), "utf8");
  assert.match(home, /css\/portal-discovery.css/);
});
