/*
 * O formulário do bloco: três abas, o contador do resumo e o checklist.
 *
 * As duas partes que decidem alguma coisa — `checklistFor` e `summaryState` —
 * são puras, para poderem ser conferidas sem navegador. O resto é ligação de
 * evento.
 */

export const LIMITE_RESUMO = 160;
const AVISO_RESUMO = 140;

/**
 * O que o contador do resumo mostra e quando ele avisa.
 *
 * O aviso chega antes do limite de propósito: alguém que só descobre o teto ao
 * bater nele já perdeu a frase que estava escrevendo.
 */
export function summaryState(texto = "") {
  const usados = String(texto ?? "").length;
  return {
    usados,
    limite: LIMITE_RESUMO,
    rotulo: `${usados} / ${LIMITE_RESUMO}`,
    perto: usados >= AVISO_RESUMO,
  };
}

/**
 * O checklist da coluna da prévia, lido do rascunho em edição.
 *
 * "Título legível" olha o comprimento, não só a presença: um título de duas
 * letras passa por qualquer validação e não diz nada a quem chega na Home.
 */
export function checklistFor(draft = {}) {
  const texto = (valor) => String(valor ?? "").trim();
  return [
    {
      id: "titulo",
      ok: texto(draft.title).length >= 3,
      label: "Título legível",
      hint: "O título está claro e objetivo.",
    },
    {
      id: "resumo",
      ok: texto(draft.summary).length > 0,
      label: "Resumo preenchido",
      hint: "O resumo do card foi preenchido.",
    },
    {
      id: "imagem",
      ok: texto(draft.image).length > 0,
      label: "Imagem definida",
      hint: "O card possui uma imagem definida.",
    },
  ];
}

export function createAdminEditor({ root, onChange, onSaveDraft } = {}) {
  if (!root) throw new TypeError("root é obrigatório para montar o editor.");

  const form = root.querySelector("[data-admin-form]");
  const abas = root.querySelector("[data-admin-form-tabs]");
  const contador = root.querySelector("[data-admin-summary-counter]");
  const checklist = root.querySelector("[data-admin-checklist]");
  const titulo = root.querySelector("[data-admin-form-title]");
  const migalha = root.querySelector("[data-admin-breadcrumb-title]");
  const toolbar = root.querySelector("[data-admin-toolbar]");

  function trocarAba(painel) {
    for (const botao of abas?.querySelectorAll("[data-panel]") || []) {
      botao.setAttribute("aria-selected", botao.dataset.panel === painel ? "true" : "false");
    }
    for (const secao of form?.querySelectorAll('[role="tabpanel"]') || []) {
      secao.hidden = secao.dataset.panel !== painel;
    }
  }

  function read() {
    const draft = {};
    for (const controle of form?.elements || []) {
      if (!controle.name) continue;
      draft[controle.name] = controle.type === "checkbox" ? controle.checked : controle.value;
    }
    draft.relatedContent = [...(form?.querySelectorAll?.("[data-related-choice]:checked") || [])].map((choice) => choice.value);
    return draft;
  }

  function pintarChecklist(draft) {
    if (!checklist) return;
    checklist.innerHTML = checklistFor(draft)
      .map((item) => `<li data-ok="${item.ok}"><span>${item.label}<small>${item.hint}</small></span></li>`)
      .join("");
  }

  function pintarContador(draft) {
    if (!contador) return;
    const estado = summaryState(draft.summary);
    contador.textContent = estado.rotulo;
    contador.setAttribute("data-perto", String(estado.perto));
  }

  function refletir() {
    const draft = read();
    pintarContador(draft);
    pintarChecklist(draft);
    if (titulo) titulo.textContent = draft.title || "Novo bloco";
    if (migalha) migalha.textContent = draft.title || "Novo bloco";
    onChange?.(draft);
  }

  function onAbaClick(evento) {
    const botao = evento.target?.closest?.("[data-panel]");
    if (botao) trocarAba(botao.dataset.panel);
  }

  function onRascunho() {
    return onSaveDraft?.(read());
  }

  function onMark(event) {
    const button = event.target?.closest?.("[data-mark]");
    const body = form?.elements?.body;
    if (!button || !body) return;
    const mark = button.dataset.mark;
    if (!["bold", "italic", "link", "ul", "ol", "quote"].includes(mark)) return;
    event.preventDefault();
    let start = body.selectionStart ?? body.value.length;
    let end = body.selectionEnd ?? start;
    if (["ul", "ol", "quote"].includes(mark)) {
      // Marcas de bloco pertencem ao início da linha para o renderer reconhecê-las.
      start = body.value.lastIndexOf("\n", start - 1) + 1;
      const lineEnd = body.value.indexOf("\n", Math.max(start, end - 1));
      end = lineEnd < 0 ? body.value.length : lineEnd;
    }
    const selected = body.value.slice(start, end) || "texto";
    let replacement;
    if (mark === "bold") replacement = `**${selected}**`;
    else if (mark === "italic") replacement = `*${selected}*`;
    else if (mark === "link") replacement = `[${selected}](https://)`;
    else replacement = selected.split("\n").map((line, index) =>
      `${mark === "ol" ? `${index + 1}. ` : mark === "ul" ? "- " : "> "}${line}`).join("\n");
    body.value = body.value.slice(0, start) + replacement + body.value.slice(end);
    body.focus();
    body.setSelectionRange(start, start + replacement.length);
    refletir();
  }

  toolbar?.addEventListener?.("click", onMark);
  abas?.addEventListener?.("click", onAbaClick);
  form?.addEventListener?.("input", refletir);
  const botaoRascunho = root.querySelector("[data-admin-save-draft]");
  botaoRascunho?.addEventListener?.("click", onRascunho);

  return {
    read,
    load(draft = {}) {
      for (const controle of form?.elements || []) {
        if (!controle.name) continue;
        const valor = draft[controle.name];
        if (controle.type === "checkbox") controle.checked = valor !== false;
        else controle.value = valor ?? "";
      }
      trocarAba("conteudo");
      refletir();
    },
    refresh: refletir,
    destroy() {
      toolbar?.removeEventListener?.("click", onMark);
      abas?.removeEventListener?.("click", onAbaClick);
      form?.removeEventListener?.("input", refletir);
      botaoRascunho?.removeEventListener?.("click", onRascunho);
    },
  };
}
