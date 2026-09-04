import { normalizeHomeBlock, normalizeHomeBlocks } from "../home/content-model.js";
import { createLocalContentRepository } from "../home/content-repository.js";
import { DEFAULT_HOME_BLOCKS } from "../home/journey-data.js";
import { mergeBlocks, pendingCount } from "./admin-draft.js";
import { countEntries, filterEntries } from "./admin-filters.js";
import { createBlocksList } from "./admin-blocks-list.js";
import { createMediaPicker } from "./admin-media-picker.js";
import { createAdminPreview } from "./admin-preview.js";
import { createAdminEditor } from "./admin-editor.js";

const SIDES = new Set(["left", "right"]);
export const ADMIN_PREVIEW_MESSAGE = "potala:admin-preview";

export function previewBlocksForDraft(blocks, draft = {}) {
  const current = normalizeHomeBlocks(blocks);
  if (!String(draft.title || "").trim()) return current.filter((block) => block.published);

  const previewDraft = {
    ...draft,
    id: draft.id || "admin-preview-draft",
    slug: draft.slug || draft.id || "admin-preview-draft",
  };
  return applyDraft(current, previewDraft).filter((block) => block.published);
}

export function createPreviewMessage(blocks, focusId = "") {
  return {
    type: ADMIN_PREVIEW_MESSAGE,
    blocks,
    focusId,
  };
}
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
  const previewFrame = root.querySelector("[data-admin-preview]");
  const confirmacao = root.querySelector("[data-admin-confirm]");
  const confirmacaoTitulo = root.querySelector("[data-admin-confirm-title]");
  const confirmacaoDetalhe = root.querySelector("[data-admin-confirm-detail]");
  let confirmacaoRelogio = 0;
  let blocks = [];
  let drafts = [];
  let busca = "";
  let aba = "todos";
  let ativoId = "";
  let arrastando = null;
  let semRascunhos = false;
  let falhouLeitura = false;
  let previewFocusId = "";
  let previewFrameId = 0;

  const buscaCampo = root.querySelector("[data-admin-search]");
  const abasFiltro = root.querySelector("[data-admin-tabs]");
  const botaoPublicar = root.querySelector("[data-admin-publish]");
  const salvoEm = root.querySelector("[data-admin-saved-at]");

  const previewOrigin = globalThis.location?.origin || "*";
  const schedulePreview = globalThis.requestAnimationFrame
    ? globalThis.requestAnimationFrame.bind(globalThis)
    : (callback) => globalThis.setTimeout(callback, 0);
  const cancelPreview = globalThis.cancelAnimationFrame
    ? globalThis.cancelAnimationFrame.bind(globalThis)
    : globalThis.clearTimeout.bind(globalThis);

  function publicarPreview() {
    previewFrameId = 0;
    const draft = form ? lerFormulario() : {};
    const previewBlocks = previewBlocksForDraft(blocks, draft);
    const focusId = previewBlocks.some((block) => block.id === (draft.id || "admin-preview-draft"))
      ? draft.id || "admin-preview-draft"
      : previewFocusId;
    previewFrame?.contentWindow?.postMessage(
      createPreviewMessage(previewBlocks, focusId),
      previewOrigin === "null" ? "*" : previewOrigin,
    );
  }

  function agendarPreview() {
    if (previewFrameId) cancelPreview(previewFrameId);
    previewFrameId = schedulePreview(publicarPreview);
  }

  const anunciar = (mensagem) => {
    if (status) status.textContent = mensagem;
  };

  /*
   * A NOTIFICAÇÃO DE RESULTADO.
   *
   * Salvar e publicar respondiam com uma linha de status do mesmo tamanho e cor
   * de qualquer outro aviso, longe de onde o olho estava. Quem salvava ficava
   * sem saber se tinha funcionado — e a dúvida leva a salvar de novo, ou pior,
   * a fechar o painel achando que salvou.
   *
   * Cobre falha também, e não só sucesso. Uma notificação que só aparece quando
   * dá certo ensina o olho a ler a ausência dela como "não fiz nada", e a
   * ausência é o retrato exato de uma falha silenciosa.
   *
   * `anunciar` continua sendo chamado junto: é ele que atende leitor de tela,
   * pela região `aria-live`. Esta é o par visual, e não a substituta.
   */
  const notificar = (titulo, detalhe = "", tom = "ok") => {
    if (!confirmacao) return;
    if (confirmacaoRelogio) clearTimeout(confirmacaoRelogio);
    if (confirmacaoTitulo) confirmacaoTitulo.textContent = titulo;
    if (confirmacaoDetalhe) confirmacaoDetalhe.textContent = detalhe;
    /* O tom sobrevive entre avisos: sem reescrever sempre, o sucesso seguinte
       aparecia pintado de falha — a leitura oposta da verdade. */
    confirmacao.dataset.tom = tom;
    confirmacao.hidden = false;
    /* Um erro fica mais tempo: quem falhou precisa ler o que fazer, e quem
       acertou já sabe. */
    const espera = tom === "erro" ? 7000 : 4200;
    /* Some sozinha: uma notificação que exige ser fechada cobra mais um clique
       por um trabalho que já terminou, e acaba cobrindo a lista. */
    confirmacaoRelogio = setTimeout(() => { confirmacao.hidden = true; }, espera);
  };

  function entradas() {
    return mergeBlocks({ published: blocks, drafts });
  }

  /*
   * A contagem de pendências governa o botao de publicar.
   *
   * Ele fica desabilitado quando nao ha nada a publicar porque um botao que
   * aceita o clique e nao faz nada ensina o editor a desconfiar do painel.
   */
  function atualizarPublicar(todas) {
    if (!botaoPublicar) return;
    const pendentes = pendingCount(todas);
    botaoPublicar.disabled = pendentes === 0;
    botaoPublicar.textContent = pendentes
      ? `Publicar alterações (${pendentes})`
      : "Publicar alterações";
  }

  function desenhar() {
    const todas = entradas();
    listaUI?.render(filterEntries(todas, { query: busca, tab: aba }), {
      activeId: ativoId,
      counts: countEntries(todas),
    });
    atualizarPublicar(todas);
  }

  function marcarSalvo() {
    if (salvoEm) salvoEm.textContent = "Salvo há poucos segundos";
  }

  async function salvar(proximos, mensagem) {
    try {
      blocks = await repository.replaceAll(proximos);
      desenhar();
      anunciar(mensagem);
      notificar(mensagem, "A Home foi atualizada.");
      agendarPreview();
      return true;
    } catch (error) {
      console.error("Não foi possível salvar o conteúdo editorial.", error);
      anunciar("Não foi possível salvar. Nenhuma alteração foi publicada.");
      notificar("Não foi possível salvar", "Nenhuma alteração foi publicada. Verifique a conexão.", "erro");
      return false;
    }
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
    editorUI?.refresh();
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
    const saved = await salvar(applyDraft(blocks, draft), `Bloco "${draft.title}" salvo.`);
    if (saved) preencher(draftFromBlock(null, blocks.length));
  };

  const onListClick = async (event) => {
    const botao = event.target.closest("[data-action]");
    if (!botao) return;
    const { action, id } = botao.dataset;
    const bloco = blocks.find((item) => item.id === id);
    if (!bloco) return;

    if (action === "up" || action === "down") {
      const saved = await salvar(
        moveBlock(blocks, id, action === "up" ? -1 : 1),
        `"${bloco.title}" mudou de lugar.`,
      );
      if (!saved) return;
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
      previewFocusId = bloco.id;
      preencher(draftFromBlock(bloco));
      form?.querySelector("[name=title]")?.focus();
      anunciar(`Editando "${bloco.title}".`);
      agendarPreview();
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
    if (!confirm("Restaurar o conteúdo original? As alterações publicadas serão substituídas.")) return;
    try {
      blocks = await repository.reset();
      desenhar();
      anunciar("Conteúdo original restaurado.");
      notificar("Conteúdo original restaurado", "A Home voltou ao conteúdo de fábrica.");
      previewFocusId = "";
      agendarPreview();
    } catch (error) {
      console.error("Não foi possível restaurar o conteúdo editorial.", error);
      anunciar("Não foi possível restaurar. O conteúdo publicado não mudou.");
      notificar("Não foi possível restaurar", "O conteúdo publicado não mudou.", "erro");
    }
  };

  const onNew = () => {
    previewFocusId = "admin-preview-draft";
    preencher(draftFromBlock(null, blocks.length));
    form?.querySelector("[name=title]")?.focus();
    anunciar("Novo bloco em branco.");
    agendarPreview();
  };

  /*
   * Salvar rascunho é otimista, e a volta atrás é o que o torna honesto.
   *
   * A lista e a prévia mudam antes da resposta do servidor, porque esperar a
   * ida e volta a cada tecla deixaria o painel lento. Se a gravação falhar, o
   * estado anterior volta e a faixa de status diz o motivo — um painel que
   * mostra a mudança e perde a gravação em silêncio é pior que um lento.
   */
  const onSaveDraft = async (draft) => {
    const erros = validateBlockDraft(draft);
    mostrarErros(erros);
    if (Object.keys(erros).length) {
      anunciar("O rascunho não foi salvo: corrija os campos marcados.");
      return;
    }

    const anteriores = drafts.map((item) => ({ ...item }));
    const [normalizado] = applyDraft([], draft);
    drafts = [...drafts.filter((item) => item.id !== normalizado.id), normalizado];
    ativoId = normalizado.id;
    desenhar();
    agendarPreview();

    try {
      await repository.saveDraft(draft);
      marcarSalvo();
      anunciar(`Rascunho de "${draft.title}" guardado. A Home não mudou.`);
      notificar(`Rascunho de "${draft.title}" guardado`, "A Home ainda não mudou: publique para colocar no ar.");
    } catch (error) {
      console.error("Não foi possível guardar o rascunho.", error);
      drafts = anteriores;
      desenhar();
      agendarPreview();
      anunciar("Não foi possível guardar o rascunho. Nada foi alterado.");
      notificar("Não foi possível guardar o rascunho", "Nada foi alterado. Verifique a conexão e tente de novo.", "erro");
    }
  };

  const onPublish = async () => {
    if (!drafts.length) return;
    const anteriores = { blocos: blocks, rascunhos: drafts };
    try {
      const quantos = drafts.length;
      blocks = await repository.publishDrafts();
      drafts = [];
      desenhar();
      agendarPreview();
      /* O número entra na mensagem porque publicar é em lote: sem ele, quem
         tinha três rascunhos não sabe se foram os três. */
      const rotulo = quantos === 1 ? "1 bloco publicado" : `${quantos} blocos publicados`;
      anunciar(`${rotulo}. A Home foi atualizada.`);
      notificar(rotulo, "A Home foi atualizada.");
    } catch (error) {
      console.error("Não foi possível publicar.", error);
      blocks = anteriores.blocos;
      drafts = anteriores.rascunhos;
      desenhar();
      anunciar("Não foi possível publicar. Nada foi alterado.");
      notificar("Não foi possível publicar", "Nada foi alterado. O que está no ar continua igual.", "erro");
    }
  };

  const onDiscardDraft = async (id) => {
    const anteriores = drafts.map((item) => ({ ...item }));
    drafts = drafts.filter((item) => item.id !== id);
    desenhar();
    agendarPreview();
    try {
      await repository.discardDraft(id);
      anunciar("Rascunho descartado. O bloco voltou ao que está no ar.");
    notificar("Rascunho descartado", "O bloco voltou ao que está no ar.");
    } catch (error) {
      console.error("Não foi possível descartar o rascunho.", error);
      drafts = anteriores;
      desenhar();
      anunciar("Não foi possível descartar o rascunho.");
      notificar("Não foi possível descartar o rascunho", "O rascunho continua guardado.", "erro");
    }
  };

  const onBusca = (evento) => {
    busca = evento?.target?.value ?? "";
    desenhar();
  };

  const onAba = (evento) => {
    const botao = evento.target?.closest?.("[data-tab]");
    if (!botao) return;
    aba = botao.dataset.tab;
    for (const item of abasFiltro?.querySelectorAll("[data-tab]") || []) {
      item.setAttribute("aria-selected", item.dataset.tab === aba ? "true" : "false");
    }
    desenhar();
  };

  const onFormInput = () => agendarPreview();
  const onPreviewLoad = () => agendarPreview();

  const listaUI = createBlocksList({
    root,
    onAction: (acao, id) => {
      if (acao === "discard") return onDiscardDraft(id);
      return onListClick({ target: { closest: () => ({ dataset: { action: acao, id } }) } });
    },
  });
  const seletorImagem = createMediaPicker({
    root,
    fetchManifest: () => fetch("media/manifest.json").then((resposta) => resposta.json()),
    onPick: (caminho) => {
      const campo = form?.elements?.image;
      if (campo) campo.value = caminho;
      agendarPreview();
    },
  });
  const previaUI = createAdminPreview({ root, onPublish: () => agendarPreview() });
  /*
   * O editor precisa ser MONTADO, não só existir.
   *
   * Sem esta linha as abas Aparência e SEO ficavam desenhadas e mortas: o
   * clique não trocava `aria-selected` nem revelava o painel, e os campos de
   * ícone, escala e destino não tinham como ser alcançados.
   */
  const editorUI = createAdminEditor({
    root,
    onChange: () => agendarPreview(),
    onSaveDraft,
  });

  buscaCampo?.addEventListener("input", onBusca);
  abasFiltro?.addEventListener("click", onAba);
  botaoPublicar?.addEventListener("click", onPublish);
  lista?.addEventListener("click", onListClick);
  lista?.addEventListener("dragstart", onDragStart);
  lista?.addEventListener("dragover", onDragOver);
  lista?.addEventListener("drop", onDrop);
  form?.addEventListener("submit", onSubmit);
  form?.addEventListener("input", onFormInput);
  form?.addEventListener("change", onFormInput);
  previewFrame?.addEventListener("load", onPreviewLoad);
  root.querySelector("[data-admin-reset]")?.addEventListener("click", onReset);
  root.querySelector("[data-admin-new]")?.addEventListener("click", onNew);

  /*
   * A lista de rascunhos pode falhar sozinha, e falhar sozinha é o caso comum:
   * basta a migração da tabela de rascunhos ainda não ter sido aplicada ao
   * banco. Sem esta tolerância, a promessa rejeitava, `desenhar` nunca rodava e
   * o painel abria VAZIO — sem sinal de erro e sem os blocos publicados, que
   * estavam lá o tempo todo.
   */
  const rascunhosIniciais = repository.listDrafts
    ? repository.listDrafts().catch((error) => {
      console.error("Não foi possível ler os rascunhos.", error);
      semRascunhos = true;
      return [];
    })
    : Promise.resolve([]);

  /*
   * A leitura do publicado também precisa de rede: se ela falhar, o painel não
   * pode abrir mudo. Antes, a promessa rejeitava e a tela ficava sem lista, sem
   * contadores e sem explicação — indistinguível de um portal sem blocos.
   */
  const publicadosIniciais = repository.list().catch((error) => {
    console.error("Não foi possível ler os blocos publicados.", error);
    falhouLeitura = true;
    return [];
  });

  const pronto = Promise.all([publicadosIniciais, rascunhosIniciais]).then(([carregados, rascunhos]) => {
    blocks = carregados;
    drafts = rascunhos;
    desenhar();
    if (falhouLeitura) {
      anunciar("Não foi possível carregar os blocos. Verifique a conexão e recarregue a página.");
    } else if (semRascunhos) {
      anunciar("Os rascunhos não estão disponíveis. Você está vendo o que já está publicado.");
    }
    preencher(draftFromBlock(null, blocks.length));
    agendarPreview();
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
      form?.removeEventListener("input", onFormInput);
      form?.removeEventListener("change", onFormInput);
      previewFrame?.removeEventListener("load", onPreviewLoad);
      buscaCampo?.removeEventListener("input", onBusca);
      abasFiltro?.removeEventListener("click", onAba);
      botaoPublicar?.removeEventListener("click", onPublish);
      listaUI?.destroy();
      editorUI?.destroy();
      seletorImagem?.destroy();
      previaUI?.destroy();
      if (previewFrameId) cancelPreview(previewFrameId);
    },
  };
}
