import { normalizeHomeBlock, normalizeHomeBlocks } from "../home/content-model.js";
import { createLocalContentRepository } from "../home/content-repository.js";
import { DEFAULT_HOME_BLOCKS } from "../home/journey-data.js";

const SIDES = new Set(["left", "right"]);

/**
 * Move um bloco na ordem da jornada e devolve uma lista NOVA.
 *
 * Sem a cópia, reordenar mexeria na lista que a tela ainda usa para desenhar —
 * e uma escrita recusada pelo armazenamento deixaria a página mostrando uma
 * ordem que nunca foi salva.
 *
 * As pontas param em vez de dar a volta: um clique repetido por engano em
 * "mover acima" no primeiro item jogaria a abertura da jornada para o fim.
 */
export function moveBlock(blocks, id, delta) {
  const lista = Array.isArray(blocks) ? blocks.map((block) => ({ ...block })) : [];
  const de = lista.findIndex((block) => block.id === id);
  if (de < 0) return lista;

  const para = Math.min(lista.length - 1, Math.max(0, de + Math.trunc(Number(delta) || 0)));
  if (para === de) return lista;

  const [movido] = lista.splice(de, 1);
  lista.splice(para, 0, movido);
  return lista.map((block, index) => ({ ...block, position: index }));
}

/**
 * Diz o que está errado num rascunho, campo a campo.
 *
 * Devolve objeto vazio quando está tudo certo — assim quem chama escreve
 * `if (Object.keys(erros).length)` sem um segundo valor de retorno, e cada
 * mensagem tem onde aparecer: ao lado do campo que a causou, não numa faixa no
 * topo que não diz o que corrigir.
 */
export function validateBlockDraft(draft = {}) {
  const erros = {};
  const texto = (valor) => (typeof valor === "string" ? valor.trim() : "");

  if (!texto(draft.title)) erros.title = "O bloco precisa de um título.";
  if (!texto(draft.summary)) erros.summary = "O resumo é o que aparece com o bloco fechado.";
  if (!SIDES.has(draft.side)) erros.side = "Escolha o lado do trajeto: esquerda ou direita.";

  const href = texto(draft.href);
  if (href) {
    /*
     * O valor é digitado por uma pessoa e vai parar num `href` da Home.
     * `javascript:` e `data:` viram execução dentro da página; `http://` tiraria
     * o visitante do canal seguro sem aviso. Sobram o caminho do próprio portal
     * e o endereço https.
     */
    const interno = !href.includes(":") && /^[\w./#-]+$/.test(href);
    if (!interno && !href.startsWith("https://")) {
      erros.href = "Use um caminho do portal (quem-somos.html) ou um endereço https://.";
    }
  }

  return erros;
}

/** Rascunho a partir de um bloco existente, ou em branco para um novo. */
export function draftFromBlock(block = null, index = 0) {
  if (!block) {
    return {
      id: "",
      slug: "",
      category: "",
      title: "",
      summary: "",
      body: "",
      image: "",
      icon: "",
      tags: "",
      href: "",
      side: index % 2 === 0 ? "left" : "right",
      published: true,
    };
  }
  return { ...block, tags: (block.tags || []).join(", ") };
}

/**
 * Aplica um rascunho à lista: substitui o bloco de mesmo id, ou acrescenta.
 *
 * A normalização acontece aqui, uma vez, e não em cada chamador: é ela que
 * transforma tags digitadas com vírgula em lista, gera o slug e mantém
 * `position` coerente depois da mudança.
 */
export function applyDraft(blocks, draft) {
  const lista = Array.isArray(blocks) ? blocks.map((block) => ({ ...block })) : [];
  const indice = lista.findIndex((block) => block.id && block.id === draft.id);
  const bloco = normalizeHomeBlock(
    { ...draft, position: indice >= 0 ? lista[indice].position : lista.length },
    indice >= 0 ? indice : lista.length,
  );
  if (!bloco) return lista;

  bloco.updatedAt = new Date().toISOString();
  if (indice >= 0) lista[indice] = bloco;
  else lista.push(bloco);

  return normalizeHomeBlocks(lista).map((item, index) => ({ ...item, position: index }));
}

export function removeBlock(blocks, id) {
  return (Array.isArray(blocks) ? blocks : [])
    .filter((block) => block.id !== id)
    .map((block, index) => ({ ...block, position: index }));
}

const escapeHtml = (valor) => String(valor ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

/**
 * Uma linha da lista.
 *
 * Exportada para o teste poder ler o markup: é aqui que mora a exigência de
 * que arrastar NUNCA seja o único caminho. O `draggable` serve ao mouse; os
 * botões "Mover acima" e "Mover abaixo" servem a todo mundo, e são eles que
 * fazem a reordenação existir para quem usa teclado ou leitor de tela.
 */
export function renderBlockRow(block, index, total) {
  const id = escapeHtml(block.id);
  return `
    <li class="admin-row" data-id="${id}" draggable="true">
      <span class="admin-row-grip" aria-hidden="true"></span>
      <span class="admin-row-order">${index + 1}</span>
      <span class="admin-row-main">
        <strong>${escapeHtml(block.title)}</strong>
        <span class="admin-row-meta">${block.side === "left" ? "Esquerda" : "Direita"} · ${block.published ? "Publicado" : "Oculto"}</span>
      </span>
      <span class="admin-row-actions">
        <button type="button" data-action="up" data-id="${id}" ${index === 0 ? "disabled" : ""}>Mover acima</button>
        <button type="button" data-action="down" data-id="${id}" ${index === total - 1 ? "disabled" : ""}>Mover abaixo</button>
        <button type="button" data-action="toggle" data-id="${id}">${block.published ? "Ocultar" : "Publicar"}</button>
        <button type="button" data-action="edit" data-id="${id}">Editar</button>
        <button type="button" data-action="delete" data-id="${id}">Excluir</button>
      </span>
    </li>`;
}

export function createAdminController({
  root,
  repository = createLocalContentRepository({ defaults: DEFAULT_HOME_BLOCKS }),
  confirm = globalThis.confirm ? globalThis.confirm.bind(globalThis) : () => true,
} = {}) {
  if (!root) throw new TypeError("root é obrigatório para o painel");

  const lista = root.querySelector("[data-admin-list]");
  const form = root.querySelector("[data-admin-form]");
  const status = root.querySelector("[data-admin-status]");
  let blocks = [];
  let arrastando = null;

  const anunciar = (mensagem) => {
    if (status) status.textContent = mensagem;
  };

  function desenhar() {
    if (!lista) return;
    lista.innerHTML = blocks.map((block, index) => renderBlockRow(block, index, blocks.length)).join("");
  }

  async function salvar(proximos, mensagem) {
    blocks = await repository.replaceAll(proximos);
    desenhar();
    anunciar(mensagem);
  }

  function mostrarErros(erros) {
    for (const alvo of form ? form.querySelectorAll("[data-error-for]") : []) {
      const campo = alvo.dataset.errorFor;
      alvo.textContent = erros[campo] || "";
      const controle = form.elements[campo];
      // `aria-invalid` é o que conta o erro a quem não vê a mensagem em vermelho.
      if (controle) controle.setAttribute("aria-invalid", erros[campo] ? "true" : "false");
    }
  }

  function preencher(draft) {
    if (!form) return;
    for (const [campo, valor] of Object.entries(draft)) {
      const controle = form.elements[campo];
      if (!controle) continue;
      if (controle.type === "checkbox") controle.checked = Boolean(valor);
      else controle.value = valor == null ? "" : valor;
    }
    mostrarErros({});
  }

  function lerFormulario() {
    const draft = {};
    for (const controle of form.elements) {
      if (!controle.name) continue;
      draft[controle.name] = controle.type === "checkbox" ? controle.checked : controle.value;
    }
    return draft;
  }

  const onSubmit = async (event) => {
    event.preventDefault();
    const draft = lerFormulario();
    const erros = validateBlockDraft(draft);
    mostrarErros(erros);
    if (Object.keys(erros).length) {
      anunciar("O bloco não foi salvo: corrija os campos marcados.");
      const primeiro = form.querySelector('[aria-invalid="true"]');
      if (primeiro) primeiro.focus();
      return;
    }
    await salvar(applyDraft(blocks, draft), `Bloco "${draft.title}" salvo.`);
    preencher(draftFromBlock(null, blocks.length));
  };

  const onListClick = async (event) => {
    const botao = event.target.closest("[data-action]");
    if (!botao) return;
    const { action, id } = botao.dataset;
    const bloco = blocks.find((item) => item.id === id);
    if (!bloco) return;

    if (action === "up" || action === "down") {
      await salvar(moveBlock(blocks, id, action === "up" ? -1 : 1), `"${bloco.title}" mudou de lugar.`);
      /*
       * A lista inteira é redesenhada, então o botão que recebeu o clique deixa
       * de existir e o foco cai no body. Sem devolvê-lo, quem reordena pelo
       * teclado é jogado de volta ao topo da página a cada passo — reordenar
       * nove blocos viraria nove viagens de Tab.
       */
      const volta = lista.querySelector(`[data-action="${action}"][data-id="${id}"]`);
      if (volta && !volta.disabled) volta.focus();
      else lista.querySelector(`[data-id="${id}"] [data-action]`)?.focus();
      return;
    }

    if (action === "toggle") {
      await salvar(
        blocks.map((item) => (item.id === id ? { ...item, published: !item.published } : item)),
        `"${bloco.title}" agora está ${bloco.published ? "oculto" : "publicado"}.`,
      );
      return;
    }

    if (action === "edit") {
      preencher(draftFromBlock(bloco));
      form?.querySelector("[name=title]")?.focus();
      anunciar(`Editando "${bloco.title}".`);
      return;
    }

    if (action === "delete") {
      if (!confirm(`Excluir "${bloco.title}"? Esta ação não pode ser desfeita.`)) return;
      await salvar(removeBlock(blocks, id), `"${bloco.title}" foi excluído.`);
    }
  };

  const onDragStart = (event) => {
    const linha = event.target.closest("[data-id]");
    arrastando = linha ? linha.dataset.id : null;
    if (arrastando && event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  };
  const onDragOver = (event) => {
    if (arrastando) event.preventDefault();
  };
  const onDrop = async (event) => {
    const linha = event.target.closest("[data-id]");
    const alvo = linha ? linha.dataset.id : null;
    if (!arrastando || !alvo || alvo === arrastando) return;
    event.preventDefault();
    const de = blocks.findIndex((block) => block.id === arrastando);
    const para = blocks.findIndex((block) => block.id === alvo);
    arrastando = null;
    await salvar(moveBlock(blocks, blocks[de].id, para - de), "Ordem atualizada.");
  };

  const onReset = async () => {
    if (!confirm("Restaurar o conteúdo original? As alterações locais serão perdidas.")) return;
    blocks = await repository.reset();
    desenhar();
    anunciar("Conteúdo original restaurado.");
  };

  const onNew = () => {
    preencher(draftFromBlock(null, blocks.length));
    form?.querySelector("[name=title]")?.focus();
    anunciar("Novo bloco em branco.");
  };

  lista?.addEventListener("click", onListClick);
  lista?.addEventListener("dragstart", onDragStart);
  lista?.addEventListener("dragover", onDragOver);
  lista?.addEventListener("drop", onDrop);
  form?.addEventListener("submit", onSubmit);
  root.querySelector("[data-admin-reset]")?.addEventListener("click", onReset);
  root.querySelector("[data-admin-new]")?.addEventListener("click", onNew);

  const pronto = repository.list().then((carregados) => {
    blocks = carregados;
    desenhar();
    preencher(draftFromBlock(null, blocks.length));
    return blocks;
  });

  return {
    pronto,
    get blocks() {
      return blocks.map((block) => ({ ...block }));
    },
    destroy() {
      lista?.removeEventListener("click", onListClick);
      lista?.removeEventListener("dragstart", onDragStart);
      lista?.removeEventListener("dragover", onDragOver);
      lista?.removeEventListener("drop", onDrop);
      form?.removeEventListener("submit", onSubmit);
    },
  };
}

if (typeof document !== "undefined") {
  const entrada = document.getElementById("admin-entry");
  const painel = document.getElementById("admin-panel");
  document.getElementById("admin-open")?.addEventListener("click", () => {
    entrada?.setAttribute("hidden", "");
    painel?.removeAttribute("hidden");
    painel?.querySelector("h2")?.focus();
    createAdminController({ root: painel });
  });
}
