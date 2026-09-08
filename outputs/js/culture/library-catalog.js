const normalizar = (value) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("pt-BR")
  .trim();

export function filterLibraryCatalog(catalog, query) {
  const term = normalizar(query);
  if (!term) return [...catalog];

  return catalog.filter((item) => normalizar([
    item.title,
    item.author,
    item.format,
    ...(item.themes || []),
  ].join(" ")).includes(term));
}

export function mountLibrarySearch(root = document) {
  const field = root.querySelector?.("[data-library-search]");
  if (!field) return null;

  const items = [...root.querySelectorAll("[data-library-item]")];
  const status = root.querySelector("[data-library-status]");
  const catalog = items.map((element) => ({
    element,
    title: element.dataset.title,
    author: element.dataset.author,
    format: element.dataset.format,
    themes: String(element.dataset.themes || "").split(","),
  }));

  const update = () => {
    const visible = new Set(filterLibraryCatalog(catalog, field.value));
    items.forEach((element) => {
      element.hidden = !visible.has(catalog.find((item) => item.element === element));
    });
    if (status) status.textContent = `${visible.size} ${visible.size === 1 ? "obra encontrada" : "obras encontradas"}`;
  };

  field.addEventListener("input", update);
  update();
  return { destroy: () => field.removeEventListener("input", update) };
}

if (typeof document !== "undefined") mountLibrarySearch();
