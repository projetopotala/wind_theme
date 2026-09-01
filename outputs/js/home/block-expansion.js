const FOCUSABLE_SELECTOR = "a[href], button, input, select, textarea, [tabindex]";

function setFocusable(details, enabled) {
  details.querySelectorAll?.(FOCUSABLE_SELECTOR).forEach((element) => {
    if (enabled) {
      if (element.dataset?.previousTabindex !== undefined) {
        const previous = element.dataset.previousTabindex;
        if (previous) element.setAttribute("tabindex", previous);
        else element.removeAttribute("tabindex");
        delete element.dataset.previousTabindex;
      } else {
        element.removeAttribute("tabindex");
      }
      return;
    }

    if (element.dataset && element.dataset.previousTabindex === undefined) {
      element.dataset.previousTabindex = element.getAttribute("tabindex") ?? "";
    }
    element.setAttribute("tabindex", "-1");
  });
}

function setExpanded(entry, expanded) {
  entry.section.classList[expanded ? "add" : "remove"]("is-expanded");
  entry.summary.setAttribute("aria-expanded", String(expanded));
  entry.details.setAttribute("aria-hidden", String(!expanded));
  entry.details.inert = !expanded;
  if (expanded) entry.details.removeAttribute?.("inert");
  else entry.details.setAttribute?.("inert", "");
  setFocusable(entry.details, expanded);
}

export function createBlockExpansion(root) {
  if (!root) throw new TypeError("root é obrigatório para controlar os blocos");

  const entries = [...root.querySelectorAll(".journey-region")]
    .map((section) => ({
      id: section.dataset.regionId,
      section,
      summary: section.querySelector(".region-summary"),
      details: section.querySelector(".region-details"),
    }))
    .filter(({ id, summary, details }) => id && summary && details);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  let activeId = null;

  entries.forEach((entry) => setExpanded(entry, false));

  function close({ restoreFocus = false } = {}) {
    if (!activeId) return false;
    const current = byId.get(activeId);
    activeId = null;
    if (!current) return false;
    setExpanded(current, false);
    if (restoreFocus) current.summary.focus?.();
    return true;
  }

  function open(id) {
    const next = byId.get(id);
    if (!next) return false;
    if (activeId === id) return true;
    close();
    setExpanded(next, true);
    activeId = id;
    return true;
  }

  function onClick(event) {
    const summary = event.target?.closest?.(".region-summary");
    if (!summary) return;
    const entry = entries.find(({ section }) => section.contains(summary));
    if (!entry) return;
    if (activeId === entry.id) close({ restoreFocus: true });
    else open(entry.id);
  }

  function onKeydown(event) {
    if (event.key !== "Escape" || !activeId) return;
    event.preventDefault?.();
    close({ restoreFocus: true });
  }

  root.addEventListener("click", onClick);
  root.addEventListener("keydown", onKeydown);

  return {
    open,
    close,
    destroy() {
      root.removeEventListener("click", onClick);
      root.removeEventListener("keydown", onKeydown);
      close();
    },
    get activeId() {
      return activeId;
    },
  };
}

