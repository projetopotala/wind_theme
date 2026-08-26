/**
 * O poema de cada lugar da Chegada.
 *
 * O visitante encosta num lugar e lê o papel dele ("Fluxo", "Presença"). Se
 * tocar, a paisagem escurece, o lugar diz três versos e a tela volta ao normal.
 * A pausa é o conteúdo: nada aqui pede clique de volta, e o poema sai sozinho.
 */

const DEFAULT_LINES = 3;

/**
 * Tempos da leitura, em milissegundos.
 *
 * A espera é proporcional ao número de versos porque um poema de três linhas
 * precisa de mais tempo em tela que um de uma — e porque o visitante não deve
 * sentir que precisa correr para terminar de ler.
 */
export function poemTimings({ lines = DEFAULT_LINES, reducedMotion = false } = {}) {
  const count = Math.max(1, Math.round(Number(lines) || DEFAULT_LINES));

  if (reducedMotion) {
    const hold = 2400 + count * 900;
    return { fadeIn: 1, stagger: 0, reveal: 1, hold, fadeOut: 1, total: hold + 2 };
  }

  const fadeIn = 900;
  const stagger = 420;
  const fadeOut = 900;
  const reveal = fadeIn + (count - 1) * stagger;
  const hold = 2400 + count * 900;
  return { fadeIn, stagger, reveal, hold, fadeOut, total: reveal + hold + fadeOut };
}

/** O poema é opcional: um lugar sem versos simplesmente não abre a tela. */
export function poemLinesOf(actor) {
  const lines = Array.isArray(actor?.poem) ? actor.poem : [];
  return lines.map((line) => String(line).trim()).filter(Boolean);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function mountWorldPoem(root, { reducedMotion = false } = {}) {
  if (!root) throw new TypeError("root é obrigatório para o poema da Chegada");

  root.classList.add("world-poem");
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "Poema do lugar");
  root.tabIndex = -1;
  root.hidden = true;

  let timers = [];
  let open = false;
  let pendingClose = null;
  let previousFocus = null;

  const clearTimers = () => {
    for (const timer of timers) clearTimeout(timer);
    timers = [];
  };

  const later = (fn, delay) => {
    timers.push(setTimeout(fn, Math.max(0, delay)));
  };

  const finish = () => {
    root.hidden = true;
    root.innerHTML = "";
    open = false;
    const callback = pendingClose;
    pendingClose = null;
    if (previousFocus?.isConnected) previousFocus.focus?.({ preventScroll: true });
    previousFocus = null;
    document.body.classList.remove("is-poem-open");
    callback?.();
  };

  const close = () => {
    if (!open) return;
    clearTimers();
    root.dataset.state = "leaving";
    const { fadeOut } = poemTimings({ reducedMotion });
    later(finish, fadeOut);
  };

  const onKeyDown = (event) => {
    if (!open) return;
    if (event.key === "Escape" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      close();
    }
  };

  const onPointerDown = () => close();

  root.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("keydown", onKeyDown);

  return {
    get isOpen() {
      return open;
    },
    /**
     * Abre o poema do lugar. Devolve `false` quando o lugar não tem versos, para
     * quem chamou saber que a ação dele deve seguir imediatamente.
     */
    show(actor, { onClose } = {}) {
      const lines = poemLinesOf(actor);
      if (!lines.length) return false;

      clearTimers();
      // Trocar de poema com um já aberto não pode engolir a ação represada do
      // anterior: ela é disparada antes que `pendingClose` seja substituída.
      if (open && pendingClose) pendingClose();
      if (!open) previousFocus = document.activeElement;

      const timing = poemTimings({ lines: lines.length, reducedMotion });
      pendingClose = typeof onClose === "function" ? onClose : null;
      open = true;

      root.innerHTML = `
        <p class="world-poem-kicker">${escapeHtml(actor.role || "")}</p>
        <blockquote class="world-poem-verse">
          ${lines.map((line, index) => `
            <span style="--poem-line:${index}">${escapeHtml(line)}</span>
          `).join("")}
        </blockquote>
        <p class="world-poem-source">${escapeHtml(actor.label || "")}</p>
      `;
      root.style.setProperty("--poem-fade-in", `${timing.fadeIn}ms`);
      root.style.setProperty("--poem-stagger", `${timing.stagger}ms`);
      root.style.setProperty("--poem-fade-out", `${timing.fadeOut}ms`);
      root.style.setProperty("--poem-line-count", String(lines.length));
      root.hidden = false;
      document.body.classList.add("is-poem-open");

      // O estado de entrada só entra no quadro seguinte: aplicado junto com
      // `hidden = false`, o navegador colapsa os dois e não há transição.
      root.dataset.state = "entering";
      requestAnimationFrame(() => {
        if (open) root.dataset.state = "open";
      });
      root.focus?.({ preventScroll: true });

      later(close, timing.reveal + timing.hold);
      return true;
    },
    close,
    destroy() {
      clearTimers();
      root.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      pendingClose = null;
      previousFocus = null;
      open = false;
      root.hidden = true;
      root.innerHTML = "";
      document.body.classList.remove("is-poem-open");
    },
  };
}
