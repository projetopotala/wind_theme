import { sectionIcon } from "./section-icons.js";
import { SECTION_RESOURCES, filterSectionResources } from "./section-resources.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const link = item => `<a href="${esc(item.href)}">${sectionIcon(item.icon)}<span><strong>${esc(item.label)}</strong><small>${esc(item.description)}</small></span></a>`;

export function renderSectionPanel({ id, region, config, bodyHtml, lookup }) {
  const related = config.related.map(key => lookup?.get(key)).filter(item => item && /^[\w-]+\.html$/.test(item.href));
  return `<div class="section-panel-tools">
      <button type="button" data-section-share data-share-href="${esc(region.href)}">${sectionIcon("share")}<span>Compartilhar</span></button>
      <button type="button" data-region-close aria-label="Fechar ${esc(region.title)} e voltar à jornada">${sectionIcon("close")}</button>
      <span class="section-share-status" data-share-status role="status"></span>
    </div>
    <section class="region-details-main section-panel-main">
      <div class="section-panel-intro">${bodyHtml || `<p>${esc(config.intro)}</p>`}</div>
      <form class="section-resource-search" role="search" aria-label="Recursos de ${esc(region.title)}">
        <label class="section-sr-only" for="${id}-resource-search">Buscar recursos em ${esc(region.title)}</label>
        ${sectionIcon("search")}<input type="search" id="${id}-resource-search" data-section-search placeholder="${esc(config.search)}" autocomplete="off" aria-controls="${id}-resources">
      </form>
      <div class="section-resource-chips" aria-label="Filtrar recursos de ${esc(region.title)}">
        ${config.chips.map(([label, icon]) => `<button type="button" data-section-filter="${esc(label)}" aria-pressed="false">${sectionIcon(icon)}${esc(label)}</button>`).join("")}
      </div>
      <ul class="section-benefits" aria-label="Possibilidades em ${esc(region.title)}">${config.benefits.map(item => `<li>${link(item)}</li>`).join("")}</ul>
      <div class="section-panel-actions region-actions">
        <a class="section-primary region-link" href="${esc(config.primary[1])}">${sectionIcon("arrow")}${esc(config.primary[0])}</a>
        <a class="section-secondary" href="${esc(region.href)}">Explorar ${esc(region.title)} ${sectionIcon("arrow")}</a>
      </div>
    </section>
    <aside class="region-details-aside section-panel-aside">
      <h3>${esc(config.prompt)}</h3>
      <ul class="section-resource-list" id="${id}-resources">
        ${config.resources.map((item, index) => `<li data-section-resource="${index}"${index >= 6 ? " hidden" : ""}><a href="${esc(item.href)}">${sectionIcon(item.icon)}<span><strong>${esc(item.label)}</strong><small>${esc(item.description)}</small></span>${sectionIcon("arrow")}</a></li>`).join("")}
      </ul>
      <p class="section-resource-status" data-section-status role="status"></p>
      ${config.resources.length > 6 ? `<button class="section-resource-more" type="button" data-section-more aria-expanded="false" aria-controls="${id}-resources">Ver todos os ${config.resources.length} recursos ${sectionIcon("arrow")}</button>` : ""}
    </aside>
    <nav class="section-panel-next" aria-label="Continue sua jornada a partir de ${esc(region.title)}"><span>Continue sua jornada</span>${related.map(item => `<a href="${esc(item.href)}">${esc(item.title)} ${sectionIcon("arrow")}</a>`).join("")}</nav>`;
}

export function mountSectionPanels(root, { navigatorLike = globalThis.navigator, locationLike = globalThis.location } = {}) {
  let disposed = false;
  const renderMatches = (panel, query, showAll = false) => {
    const config = SECTION_RESOURCES[panel.dataset.resourceSection];
    if (!config) return;
    const matches = filterSectionResources(config.resources, query);
    panel.querySelectorAll("[data-section-resource]").forEach(row => {
      const item = config.resources[Number(row.dataset.sectionResource)];
      row.hidden = !matches.includes(item) || (!query && !showAll && Number(row.dataset.sectionResource) >= 6);
    });
    const status = panel.querySelector("[data-section-status]");
    status.textContent = matches.length ? (query ? `${matches.length} recurso${matches.length === 1 ? " encontrado" : "s encontrados"}.` : "") : "Nenhum recurso encontrado. Tente outro termo ou limpe a busca.";
    const more = panel.querySelector("[data-section-more]");
    if (more) { more.hidden = Boolean(query); more.setAttribute("aria-expanded", String(showAll)); more.textContent = showAll ? "Mostrar menos" : `Ver todos os ${config.resources.length} recursos →`; }
  };
  const onInput = event => {
    if (!event.target.matches?.("[data-section-search]")) return;
    const panel = event.target.closest("[data-resource-section]");
    panel.querySelectorAll("[data-section-filter]").forEach(button => button.setAttribute("aria-pressed", "false"));
    renderMatches(panel, event.target.value);
  };
  const onSubmit = event => { if (event.target.matches?.(".section-resource-search")) event.preventDefault(); };
  const onClick = async event => {
    const panel = event.target.closest?.("[data-resource-section]");
    if (!panel) return;
    const filter = event.target.closest("[data-section-filter]");
    if (filter) {
      const query = filter.getAttribute("aria-pressed") === "true" ? "" : filter.dataset.sectionFilter;
      panel.querySelectorAll("[data-section-filter]").forEach(button => button.setAttribute("aria-pressed", String(button === filter && Boolean(query))));
      panel.querySelector("[data-section-search]").value = query;
      renderMatches(panel, query);
    }
    const more = event.target.closest("[data-section-more]");
    if (more) renderMatches(panel, "", more.getAttribute("aria-expanded") !== "true");
    const share = event.target.closest("[data-section-share]");
    if (share) {
      const status = panel.querySelector("[data-share-status]");
      const url = new URL(share.dataset.shareHref, locationLike.href).href;
      try {
        if (navigatorLike?.share) await navigatorLike.share({ title: panel.querySelector(".region-title").textContent, url });
        else if (navigatorLike?.clipboard?.writeText) {
          await navigatorLike.clipboard.writeText(url);
          if (!disposed) status.textContent = "Link copiado.";
        } else if (!disposed) status.textContent = `Copie o endereço: ${url}`;
      } catch (error) {
        if (!disposed && error?.name !== "AbortError") status.textContent = `Copie o endereço: ${url}`;
      }
    }
  };
  root.addEventListener("input", onInput);
  root.addEventListener("submit", onSubmit);
  root.addEventListener("click", onClick);
  return () => { disposed = true; root.removeEventListener("input", onInput); root.removeEventListener("submit", onSubmit); root.removeEventListener("click", onClick); };
}
