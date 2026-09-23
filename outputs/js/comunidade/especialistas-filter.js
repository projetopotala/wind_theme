const normalizar = (valor = "") => String(valor)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("pt-BR");

export function areaDoEspecialista(texto = "") {
  const area = normalizar(texto);
  if (/danca|express|musica|canto|teatro|arte|escrita|criacao/.test(area)) return "expressao";
  if (/escuta|grupo|conversa|psico|acolh|facilita|vinculo/.test(area)) return "escuta";
  if (/chines|medit|silencio|oriental|tai chi|qi gong|yoga/.test(area)) return "orientais";
  return "corpo";
}

export function mountSpecialistsFilter(root = document) {
  const shell = root.querySelector?.("[data-specialists-filter]");
  const cards = [...(root.querySelectorAll?.(".com-ficha") || [])];
  if (!shell || !cards.length) return null;
  const buttons = [...shell.querySelectorAll("[data-specialist-area]")];
  const status = shell.querySelector("[data-specialist-status]");

  cards.forEach((card) => {
    card.dataset.specialistArea = areaDoEspecialista(card.querySelector(".com-area")?.textContent);
  });

  const apply = (button) => {
    const selected = button.dataset.specialistArea || "todos";
    buttons.forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    let visible = 0;
    cards.forEach((card) => {
      const show = selected === "todos" || card.dataset.specialistArea === selected;
      card.hidden = !show;
      if (show) visible += 1;
    });
    if (status) status.textContent = selected === "todos" ? `${visible} especialistas · 22 aulas` : `${visible} especialistas nesta área`;
  };

  const listeners = buttons.map((button) => {
    const listener = () => apply(button);
    button.addEventListener("click", listener);
    return () => button.removeEventListener("click", listener);
  });
  apply(buttons.find((button) => button.getAttribute("aria-pressed") === "true") || buttons[0]);
  return { destroy: () => listeners.forEach((remove) => remove()) };
}

if (typeof document !== "undefined") mountSpecialistsFilter();
