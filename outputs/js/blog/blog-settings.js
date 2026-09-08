const KEY = "potala.blog.settings.v1";
const DEFAULTS = {
  name: "Caderno de Travessia",
  cover: "media/chegada-landscape.webp",
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

export function applyBlogSettings(root = document, settings = readBlogSettings()) {
  const title = root.querySelector?.(".blog-panorama h1");
  const panorama = root.querySelector?.(".blog-panorama");
  if (title) title.textContent = settings.name;
  if (panorama && settings.cover) {
    panorama.style.backgroundImage = `url("${String(settings.cover).replace(/"/g, "")}")`;
  }
  return settings;
}
