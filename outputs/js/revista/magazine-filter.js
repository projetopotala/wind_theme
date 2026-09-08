const normalizar = (value) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("pt-BR")
  .trim();

export function filterMagazineArticles(articles, { category = "todos", query = "" } = {}) {
  const chosen = normalizar(category) || "todos";
  const term = normalizar(query);

  return articles.filter((article) => {
    const belongs = chosen === "todos" || normalizar(article.category) === chosen;
    const copy = normalizar(`${article.title} ${article.excerpt} ${article.category}`);
    return belongs && (!term || copy.includes(term));
  });
}

export function mountMagazineFilter(root = document) {
  const shell = root.querySelector?.("[data-magazine-filter]");
  if (!shell) return null;

  const field = shell.querySelector("[data-magazine-query]");
  const buttons = [...shell.querySelectorAll("[data-magazine-category]")];
  const elements = [...root.querySelectorAll("[data-magazine-article]")];
  const status = shell.querySelector("[data-magazine-status]");
  const articles = elements.map((element) => ({
    element,
    title: element.dataset.title,
    excerpt: element.dataset.excerpt,
    category: element.dataset.category,
  }));
  let category = "todos";

  const update = () => {
    const visible = new Set(filterMagazineArticles(articles, { category, query: field?.value || "" }));
    elements.forEach((element) => {
      element.hidden = !visible.has(articles.find((article) => article.element === element));
    });
    buttons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.magazineCategory === category)));
    if (status) status.textContent = `${visible.size} ${visible.size === 1 ? "leitura encontrada" : "leituras encontradas"}`;
  };

  const listeners = [];
  buttons.forEach((button) => {
    const onClick = () => { category = button.dataset.magazineCategory || "todos"; update(); };
    button.addEventListener("click", onClick);
    listeners.push(() => button.removeEventListener("click", onClick));
  });
  const onInput = () => update();
  field?.addEventListener("input", onInput);
  update();

  return {
    destroy() {
      listeners.forEach((remove) => remove());
      field?.removeEventListener("input", onInput);
    },
  };
}

if (typeof document !== "undefined") mountMagazineFilter();
