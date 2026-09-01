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

export function createBlockExpansion(root, {
  /*
   * O Escape escuta o DOCUMENTO, não a jornada.
   *
   * Preso à raiz, ele só funcionava enquanto o foco estivesse dentro dela — o
   * caminho comum, porque abrir um bloco foca o resumo. Mas basta clicar no
   * fundo da página, ou voltar de um link do bloco aberto, para o foco cair no
   * body: dali o Escape não fechava mais nada, e a única saída era achar o
   * botão de novo. Medido na prévia: com foco no resumo fechava, com foco no
   * body não.
   *
   * O clique continua na raiz porque ali a delegação é a intenção; o Escape é
   * um gesto global de "desfazer o que está aberto".
   */
  keyboardTarget = root?.ownerDocument ?? root,
  /*
   * A navegação é injetável para o teste poder observá-la sem sair da página.
   * Trocar `location.href` num teste levaria o corredor inteiro junto.
   */
  navigate = (href) => { if (href) globalThis.location.assign(href); },
  /* Avisado sempre que a expansão muda, para quem precisa acompanhar por fora —
     hoje o trajeto, que anda junto com o vão quando a página abre para o lado. */
  onChange = () => {},
} = {}) {
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
    onChange(null);
    return true;
  }

  function open(id) {
    const next = byId.get(id);
    if (!next) return false;
    if (activeId === id) return true;
    close();
    setExpanded(next, true);
    activeId = id;
    onChange(next);
    return true;
  }

  function onClick(event) {
    const summary = event.target?.closest?.(".region-summary");

    /*
     * Clique fora de qualquer bloco fecha o que estiver aberto.
     *
     * Isto passou a ser necessário quando o segundo clique virou navegação: sem
     * ele, quem abriu um bloco sem querer no telefone não teria como fechá-lo —
     * tocar de novo levaria para outra página, e Escape não existe no toque. A
     * única saída seria abrir outro bloco.
     */
    if (!summary) {
      if (activeId && !event.target?.closest?.(".region-content")) close();
      return;
    }

    const entry = entries.find(({ section }) => section.contains(summary));
    if (!entry) return;

    /*
     * O PRIMEIRO clique abre; o SEGUNDO leva ao destino.
     *
     * A regra aprovada era não redirecionar ao primeiro toque — alguém que só
     * quer ler o resumo não pode ser jogado para outra página. Ela continua de
     * pé: o primeiro clique abre e o texto completo aparece ali mesmo. O
     * segundo é uma escolha já informada, feita com o conteúdo à vista.
     *
     * O link explícito dentro da área expandida continua existindo: é ele que
     * anuncia o destino a quem usa leitor de tela, e é dele que sai o endereço
     * usado aqui — para não haver duas verdades sobre para onde o bloco leva.
     */
    if (activeId === entry.id) {
      navigate(entry.details.querySelector?.(".region-link")?.getAttribute?.("href"));
      return;
    }

    open(entry.id);
  }

  function onKeydown(event) {
    if (event.key !== "Escape" || !activeId) return;
    event.preventDefault?.();
    close({ restoreFocus: true });
  }

  root.addEventListener("click", onClick);
  keyboardTarget.addEventListener("keydown", onKeydown);

  return {
    open,
    close,
    destroy() {
      root.removeEventListener("click", onClick);
      keyboardTarget.removeEventListener("keydown", onKeydown);
      close();
    },
    get activeId() {
      return activeId;
    },
  };
}

