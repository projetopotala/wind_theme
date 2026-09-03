/*
 * A lista de blocos do mockup: miniatura, número, título, categoria e o badge
 * de estado, com o menu de ações ao lado.
 *
 * O `draggable` serve ao mouse. "Mover acima" e "Mover abaixo" servem a todo
 * mundo, e são eles que fazem a reordenação existir para quem usa teclado ou
 * leitor de tela — por isso continuam no markup, e não escondidos atrás de um
 * menu.
 */

function escapar(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const ROTULO = {
  publicado: "Publicado",
  rascunho: "Rascunho",
  pendente: "Publicado",
};

/**
 * Uma linha da lista.
 *
 * Exportada para o teste poder ler o markup sem montar um DOM.
 */
export function renderEntryRow(entry, index, total) {
  const id = escapar(entry.id);
  const bloco = entry.block || {};
  const imagem = escapar(bloco.image);

  return `
    <li class="admin-row" data-id="${id}" draggable="true"${entry.active ? ' aria-current="true"' : ""}>
      <button type="button" class="admin-drag" data-action="grip" data-id="${id}"
        aria-label="Arrastar ${escapar(bloco.title)}">⠿</button>
      ${imagem
        ? `<img src="${imagem}" alt="" loading="lazy">`
        : '<span class="admin-row-thumb" aria-hidden="true"></span>'}
      <span class="admin-row-main">
        <span class="admin-row-index">${String(index + 1).padStart(2, "0")}</span>
        <span class="admin-row-title">${escapar(bloco.title)}</span>
        <span class="admin-row-category">${escapar(bloco.category)}</span>
        <span class="admin-badge" data-state="${escapar(entry.state)}">${ROTULO[entry.state] || "Rascunho"}</span>
        ${entry.state === "pendente" ? '<span class="admin-badge" data-state="pendente">alterações por publicar</span>' : ""}
      </span>
      <span class="admin-row-move">
        <button type="button" data-action="up" data-id="${id}" ${index === 0 ? "disabled" : ""}
          title="Mover acima"><span class="admin-sr">Mover acima</span><span aria-hidden="true">↑</span></button>
        <button type="button" data-action="down" data-id="${id}" ${index === total - 1 ? "disabled" : ""}
          title="Mover abaixo"><span class="admin-sr">Mover abaixo</span><span aria-hidden="true">↓</span></button>
      </span>
      <details class="admin-row-menu">
        <summary title="Mais ações"><span class="admin-sr">Mais ações para ${escapar(bloco.title)}</span><span aria-hidden="true">⋮</span></summary>
        <span class="admin-row-actions">
          <button type="button" data-action="edit" data-id="${id}">Editar</button>
          <button type="button" data-action="duplicate" data-id="${id}">Duplicar</button>
          ${entry.hasDraft ? `<button type="button" data-action="discard" data-id="${id}">Descartar rascunho</button>` : ""}
          <button type="button" data-action="delete" data-id="${id}">Apagar</button>
        </span>
      </details>
    </li>`;
}

export function createBlocksList({ root, onAction } = {}) {
  if (!root) throw new TypeError("root é obrigatório para montar a lista.");
  const lista = root.querySelector("[data-admin-list]");
  const contadores = root.querySelector("[data-admin-counts]");

  function onClick(evento) {
    const botao = evento.target?.closest?.("[data-action]");
    if (!botao) return;
    const { action, id } = botao.dataset || {};
    if (action === "grip") return;
    onAction?.(action, id);
  }

  lista?.addEventListener?.("click", onClick);

  return {
    render(entries = [], { activeId = "", counts = null } = {}) {
      if (lista) {
        lista.innerHTML = entries
          .map((entry, index) =>
            renderEntryRow({ ...entry, active: entry.id === activeId }, index, entries.length))
          .join("");
      }
      if (contadores && counts) {
        contadores.textContent =
          `${counts.total} blocos · ${counts.publicados} publicados · ${counts.rascunhos} rascunhos`;
      }
    },

    destroy() {
      lista?.removeEventListener?.("click", onClick);
    },
  };
}
