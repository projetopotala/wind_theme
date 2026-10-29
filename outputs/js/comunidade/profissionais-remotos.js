import { criarRestPublico } from "../supabase/rest.js";

const texto = (value = "") => String(value ?? "");
const moeda = (cents) => cents == null ? "" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const escapeHtml = (value) => texto(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const normalizar = (value) => texto(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

export function filterProfessionals(profiles, { query = "", area = "todos" } = {}) {
  const needle = normalizar(query).trim();
  return profiles.filter((profile) => {
    const searchable = normalizar([
      profile.display_name,
      profile.professional_title,
      ...(profile.specialties || []),
      ...(profile.practice_areas || []),
      ...(profile.modalities || []),
      ...(profile.services || []).map(service => service.title),
    ].join(" "));
    const areas = normalizar((profile.practice_areas || []).join(" "));
    return (!needle || searchable.includes(needle)) && (area === "todos" || areas.includes(normalizar(area)));
  });
}

export function renderProfessional(profile) {
  const tags = [...(profile.practice_areas || []), ...(profile.specialties || [])];
  return `<article class="com-ficha" data-professional-id="${escapeHtml(profile.id)}">
    <div class="com-selo">${profile.photo_url ? `<img src="${escapeHtml(profile.photo_url)}" alt="">` : ""}</div>
    <div class="com-ficha-corpo">
      <p class="com-area">${escapeHtml(profile.professional_title || tags[0] || "Profissional do Instituto")}</p>
      <h2>${escapeHtml(profile.display_name)}</h2>
      <p class="com-frase">${escapeHtml(profile.presentation)}</p>
      ${tags.length ? `<ul class="com-aulas">${tags.map(tag => `<li>${escapeHtml(tag)}</li>`).join("")}</ul>` : ""}
      ${profile.services?.length ? `<div><strong>Serviços</strong><ul class="com-aulas">${profile.services.map(service => `<li>${escapeHtml(service.title)}${service.mode ? ` · ${escapeHtml(service.mode)}` : ""}${service.price_cents != null ? ` · ${escapeHtml(moeda(service.price_cents))}` : ""}</li>`).join("")}</ul></div>` : ""}
      <dl class="com-cv">
        ${profile.education ? `<div><dt>Formação</dt><dd>${escapeHtml(profile.education)}</dd></div>` : ""}
        ${profile.modalities?.length ? `<div><dt>Modalidades</dt><dd>${escapeHtml(profile.modalities.join(" e "))}</dd></div>` : ""}
        ${profile.availability ? `<div><dt>Disponibilidade</dt><dd>${escapeHtml(profile.availability)}</dd></div>` : ""}
        ${profile.price_cents != null ? `<div><dt>Valor de referência</dt><dd>${escapeHtml(moeda(profile.price_cents))}</dd></div>` : ""}
      </dl>
    </div>
  </article>`;
}

export async function loadPublishedProfessionals({ root = document, rest = criarRestPublico() } = {}) {
  const live = root.querySelector("[data-professionals-live]");
  const status = root.querySelector("[data-professionals-status]");
  const demo = [...root.querySelectorAll(".com-lista")].find(node => node !== live);
  if (!live) return [];
  try {
    const profiles = await rest.rpc("list_published_professionals");
    if (!Array.isArray(profiles) || profiles.length === 0) {
      if (status) status.textContent = "Os perfis reais ainda não foram publicados. Abaixo, exemplos demonstrativos.";
      return [];
    }
    live.innerHTML = profiles.map(renderProfessional).join("");
    live.hidden = false;
    if (demo) demo.hidden = true;
    if (status) status.textContent = `${profiles.length} profissional${profiles.length === 1 ? "" : "is"} publicado${profiles.length === 1 ? "" : "s"}.`;
    const search = root.querySelector("[data-professional-search]");
    const buttons = [...root.querySelectorAll("[data-specialist-area]")];
    let selectedArea = "todos";
    const apply = () => {
      const visible = new Set(filterProfessionals(profiles, { query: search?.value, area: selectedArea }).map(item => item.id));
      for (const card of live.querySelectorAll("[data-professional-id]")) card.hidden = !visible.has(card.dataset.professionalId);
      if (status) status.textContent = `${visible.size} profissional${visible.size === 1 ? "" : "is"} encontrado${visible.size === 1 ? "" : "s"}.`;
    };
    search?.addEventListener("input", apply);
    for (const button of buttons) {
      button.addEventListener("click", () => {
        selectedArea = button.dataset.specialistArea || "todos";
        buttons.forEach(item => item.setAttribute("aria-pressed", String(item === button)));
        apply();
      });
    }
    return profiles;
  } catch {
    if (status) status.textContent = "Não foi possível consultar os perfis agora. Exibindo a apresentação demonstrativa.";
    return [];
  }
}

if (typeof document !== "undefined") void loadPublishedProfessionals();
