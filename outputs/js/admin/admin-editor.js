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
    onSaveDraft?.(read());
  }

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
      abas?.removeEventListener?.("click", onAbaClick);
      form?.removeEventListener?.("input", refletir);
      botaoRascunho?.removeEventListener?.("click", onRascunho);
    },
  };
}
