const KEY = "potala.blog.settings.v1";
/*
 * A capa antiga era o padrão até o redesenho do Caderno. Quem nunca trocou a
 * capa ainda tem esse valor gravado (no banco e no navegador): tratá-lo como
 * "padrão" faz essas pessoas verem a capa nova sem que ninguém precise mexer
 * nos dados. Uma capa escolhida de propósito continua valendo.
 */
export const CAPA_ANTERIOR = "media/chegada-landscape.webp";
export const CAPA_PADRAO = "media/blog-hero-caminhante.webp";
const DEFAULTS = {
  name: "Caderno de Travessia",
  cover: CAPA_PADRAO,
};

export function readBlogSettings(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem(KEY) || "{}");
    return {
      name: String(parsed.name || DEFAULTS.name).trim() || DEFAULTS.name,
      cover: String(parsed.cover || DEFAULTS.cover).trim() || DEFAULTS.cover,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveBlogSettings(settings, storage = globalThis.localStorage) {
  const next = {
    name: String(settings?.name || DEFAULTS.name).trim() || DEFAULTS.name,
    cover: String(settings?.cover || DEFAULTS.cover).trim() || DEFAULTS.cover,
  };
  storage?.setItem(KEY, JSON.stringify(next));
  return next;
}

export function capaDoCaderno(cover) {
  const valor = String(cover || "").trim();
  return !valor || valor === CAPA_ANTERIOR ? CAPA_PADRAO : valor;
}

export function applyBlogSettings(root = document, settings = readBlogSettings()) {
  const title = root.querySelector?.("[data-blog-nome]");
  const capa = root.querySelector?.("[data-blog-capa]");
  if (title) title.textContent = settings.name;
  if (capa) capa.setAttribute("src", capaDoCaderno(settings.cover));
  return settings;
}
