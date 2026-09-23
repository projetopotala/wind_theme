import { escaparHtml } from "../conta/html.js";
import { filterSectionResources, SECTION_RESOURCES, SUPPLEMENTAL_SECTION_RESOURCES } from "../home/section-resources.js";
import { sectionIcon } from "../home/section-icons.js";
import { safeLinkHref } from "../shared/markdown.js";

const renderResource = (item) => `
  <a class="resource-hero__item" href="${safeLinkHref(item.href)}" data-resource-hero-item
    data-resource-search="${escaparHtml(`${item.label} ${item.description} ${item.keywords || ""}`)}">
    <span class="resource-hero__item-icon">${sectionIcon(item.icon)}</span>
    <span><strong>${escaparHtml(item.label)}</strong><small>${escaparHtml(item.description)}</small></span>
    <i aria-hidden="true">${sectionIcon("arrow")}</i>
  </a>`;

function renderHero(config, { secondaryLabel, secondaryHref, hideActions, hidePrompt }) {
  return `
    <div class="resource-hero__tools">
      <label class="resource-hero__search">
        <span class="sr-only">Buscar caminhos de cuidado</span>
        ${sectionIcon("search")}
        <input type="search" placeholder="${escaparHtml(config.search)}" autocomplete="off" data-resource-hero-search>
      </label>
      <div class="resource-hero__chips" aria-label="Filtros rápidos">
        ${config.chips.map(([label, icon]) => `<button type="button" data-resource-hero-chip="${escaparHtml(label)}">${sectionIcon(icon)}<span>${escaparHtml(label)}</span></button>`).join("")}
      </div>
      ${hideActions ? "" : `<div class="resource-hero__actions">
        <a href="${safeLinkHref(config.primary[1])}">${escaparHtml(config.primary[0])}${sectionIcon("arrow")}</a>
        <a href="${safeLinkHref(secondaryHref)}">${escaparHtml(secondaryLabel)} ${sectionIcon("arrow")}</a>
      </div>`}
      <p class="resource-hero__status" data-resource-hero-status aria-live="polite"></p>
    </div>
    <aside class="resource-hero__panel" aria-labelledby="resource-hero-title">
      <h2 id="resource-hero-title"${hidePrompt ? ' class="sr-only"' : ""}>${escaparHtml(config.prompt)}</h2>
      <div data-resource-hero-list>${config.resources.slice(0, 6).map(renderResource).join("")}</div>
    </aside>
    <div class="resource-hero__benefits" aria-label="Como o Potala acompanha sua escolha">
      ${config.benefits.map((item) => `<a href="${safeLinkHref(item.href)}"><span>${sectionIcon(item.icon)}</span><strong>${escaparHtml(item.label)}</strong><small>${escaparHtml(item.description)}</small></a>`).join("")}
    </div>`;
}

/*
 * O QUE MUDOU NA LISTA, EM MOVIMENTO CURTO.
 *
 * Trocar os resultados de uma vez faz a pessoa reler tudo para descobrir o que
 * respondeu à busca. Quem já estava na lista desliza da posição antiga para a
 * nova (FLIP, sem biblioteca); quem entrou agora aparece. Nada é escondido, e
 * com movimento reduzido a lista simplesmente aparece pronta.
 */
function animarTroca(lista, antes) {
  if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const filhos = [...lista.children];
  if (!filhos[0]?.animate) return;
  filhos.forEach((item, indice) => {
    const anterior = antes.get(item.getAttribute("href"));
    const atual = item.getBoundingClientRect().top;
    if (anterior === undefined) {
      item.animate([{ opacity: 0, transform: "translateY(9px)" }, { opacity: 1, transform: "none" }],
        { duration: 260, delay: Math.min(indice, 5) * 35, easing: "cubic-bezier(.22,.61,.36,1)", fill: "backwards" });
      return;
    }
    const deslocamento = anterior - atual;
    if (Math.abs(deslocamento) > 1) {
      item.animate([{ transform: `translateY(${deslocamento}px)` }, { transform: "none" }],
        { duration: 320, easing: "cubic-bezier(.22,.61,.36,1)" });
    }
  });
}

export function mountResourceHero(root) {
  if (!root || root.dataset.resourceHeroMounted === "true") return;
  const config = SECTION_RESOURCES[root.dataset.resourceHero] || SUPPLEMENTAL_SECTION_RESOURCES[root.dataset.resourceHero];
  if (!config) return;
  root.classList.add("resource-hero");
  root.dataset.resourceHeroMounted = "true";
  root.innerHTML = renderHero(config, {
    secondaryLabel: root.dataset.resourceSecondaryLabel || "Explorar possibilidades",
    secondaryHref: root.dataset.resourceSecondaryHref || "#possibilidades",
    hideActions: root.dataset.resourceHideActions === "true",
    hidePrompt: root.dataset.resourceHidePrompt === "true",
  });

  const input = root.querySelector("[data-resource-hero-search]");
  const list = root.querySelector("[data-resource-hero-list]");
  const status = root.querySelector("[data-resource-hero-status]");

  const update = (query = "") => {
    const filtered = query.trim() ? filterSectionResources(config.resources, query) : config.resources.slice(0, 6);
    const antes = new Map([...list.children].map((item) => [item.getAttribute("href"), item.getBoundingClientRect().top]));
    list.innerHTML = filtered.map(renderResource).join("");
    animarTroca(list, antes);
    status.textContent = query.trim()
      ? filtered.length
        ? `${filtered.length} ${filtered.length === 1 ? "caminho encontrado" : "caminhos encontrados"}.`
        : "Nenhum caminho corresponde à busca. A Recepção pode ajudar você."
      : "";
  };

  input?.addEventListener("input", () => update(input.value));
  root.querySelectorAll("[data-resource-hero-chip]").forEach((button) => {
    button.addEventListener("click", () => {
      const selected = button.getAttribute("aria-pressed") !== "true";
      root.querySelectorAll("[data-resource-hero-chip]").forEach((item) => item.setAttribute("aria-pressed", "false"));
      button.setAttribute("aria-pressed", String(selected));
      input.value = selected ? button.dataset.resourceHeroChip || "" : "";
      update(input.value);
    });
  });
}

if (typeof document !== "undefined") {
  document.querySelectorAll("[data-resource-hero]").forEach(mountResourceHero);
}
