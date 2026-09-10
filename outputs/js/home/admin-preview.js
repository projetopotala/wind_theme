import { normalizeHomeBlocks } from "./content-model.js";

export const ADMIN_PREVIEW_MESSAGE = "potala:admin-preview";
export const ADMIN_PREVIEW_EDIT = "potala:admin-preview-edit";
export const ADMIN_PREVIEW_STAGE = "potala:admin-stage";
export const ADMIN_PREVIEW_STORAGE_KEY = "potala.admin.preview.v1";

const safeHref = (value) => {
  const href = String(value || "").trim();
  if (/^https:\/\//i.test(href)) return href;
  if (/^(?:[a-z0-9][a-z0-9._/-]*\.html(?:[?#].*)?|#[a-z0-9_-]*)$/i.test(href)) return href;
  return "#";
};

const safeMediaSource = (value) => {
  const source = String(value || "").trim();
  if (/^https:\/\/[^\s"<>]+$/i.test(source)) return source;
  if (/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[a-z0-9][a-z0-9._/-]*\.(?:avif|jpe?g|png|webp)$/i.test(source)) {
    return source;
  }
  return "";
};

export function previewStructure(blocks = []) {
  return normalizeHomeBlocks(blocks)
    .map(({ id, side, position, published, editorialVariant, relatedMode, relatedContent, tags }) => `${id}:${side}:${position}:${published ? 1 : 0}:${editorialVariant}:${relatedMode}:${relatedContent.join(",")}:${tags.join(",")}`)
    .join("|");
}

export function parseAdminPreviewMessage(event, { origin, source } = {}) {
  if (!event || event.source !== source || event.origin !== origin) return null;
  if (event.data?.type !== ADMIN_PREVIEW_MESSAGE || !Array.isArray(event.data.blocks)) return null;

  const blocks = normalizeHomeBlocks(event.data.blocks).filter((block) => block.published);
  const requestedFocus = String(event.data.focusId || "");
  return {
    blocks,
    focusId: blocks.some((block) => block.id === requestedFocus) ? requestedFocus : "",
  };
}

export function readAdminPreviewSnapshot(storage) {
  try {
    const payload = JSON.parse(storage?.getItem(ADMIN_PREVIEW_STORAGE_KEY) || "null");
    if (!payload || !Array.isArray(payload.blocks)) return null;
    const blocks = normalizeHomeBlocks(payload.blocks).filter((block) => block.published);
    return {
      blocks,
      focusId: blocks.some((block) => block.id === payload.focusId) ? payload.focusId : "",
    };
  } catch {
    return null;
  }
}

export function writeAdminPreviewSnapshot(storage, payload) {
  try {
    storage?.setItem(ADMIN_PREVIEW_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // A prévia continua ao vivo mesmo quando o armazenamento de sessão falha.
  }
}

function replaceCategory(element, category, documentRef) {
  if (!element) return;
  const number = element.querySelector("span");
  element.replaceChildren(...(number ? [number] : []), documentRef.createTextNode(String(category || "")));
}

function replaceTags(element, tags, documentRef) {
  if (!element) return;
  element.replaceChildren(...(tags || []).map((tag) => {
    const item = documentRef.createElement("li");
    item.textContent = tag;
    return item;
  }));
}

function replaceMedia(details, block, documentRef) {
  details?.querySelector(".region-media")?.remove();
  if (!details) return;

  const source = safeMediaSource(block.image);
  const icon = String(block.icon || "").trim();
  if (!source && !icon) return;

  const figure = documentRef.createElement("figure");
  figure.className = "region-media";
  if (source) {
    const image = documentRef.createElement("img");
    image.src = source;
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    image.addEventListener("error", () => figure.remove(), { once: true });
    figure.append(image);
  }
  if (icon) {
    const badge = documentRef.createElement("span");
    badge.className = "region-icon";
    badge.setAttribute("aria-hidden", "true");
    badge.textContent = icon;
    figure.append(badge);
  }
  details.prepend(figure);
}

export function patchPreviewBlock(root, block, { documentRef = globalThis.document } = {}) {
  if (!root || !documentRef || !block?.id) return false;
  const region = [...root.querySelectorAll(".journey-region")]
    .find((candidate) => candidate.dataset.regionId === block.id);
  if (!region) return false;

  replaceCategory(region.querySelector(".region-category"), block.category, documentRef);
  const title = region.querySelector(".region-title");
  const summary = region.querySelector(".region-description");
  const body = region.querySelector(".region-details p");
  const link = region.querySelector(".region-link");
  if (title) title.textContent = block.title;
  if (summary) summary.textContent = block.summary;
  if (body) body.textContent = block.body;
  if (link) link.href = safeHref(block.href);
  replaceTags(region.querySelector(".region-tags"), block.tags, documentRef);
  replaceMedia(region.querySelector(".region-details"), block, documentRef);
  region.dataset.titleScale = Array.from(block.title || "").length >= 11 ? "compact" : "display";
  return true;
}

function emitirEdicao(windowRef, origin, payload) {
  const alvo = windowRef?.parent;
  if (!alvo || alvo === windowRef) return;
  alvo.postMessage?.({ type: ADMIN_PREVIEW_EDIT, ...payload }, origin || "*");
}

function marcarCampo(elemento, campo, editavel) {
  if (!elemento) return;
  elemento.dataset.previewField = campo;
  if (editavel) elemento.setAttribute("contenteditable", "true");
  else elemento.removeAttribute("contenteditable");
}

function marcarFoco(root, focusId) {
  if (!root) return;
  for (const region of root.querySelectorAll(".journey-region")) {
    const ativo = Boolean(focusId) && region.dataset.regionId === focusId;
    const aberto = region.classList.contains("is-expanded");
    region.classList.toggle("is-preview-focus", ativo);
    const cartao = region.querySelector(".region-content");
    cartao?.classList.toggle("is-preview-focus", ativo);
    /*
     * O texto só vira campo quando o bloco está aberto.
     *
     * No cartão fechado o clique tem de fazer o mesmo efeito da página. Se o
     * título já nasce editável, o botão não abre e a travessia não acontece.
     */
    marcarCampo(region.querySelector(".region-title"), "title", aberto);
    marcarCampo(region.querySelector(".region-description"), "summary", aberto);
    marcarCampo(region.querySelector(".region-details p"), "body", aberto);
  }
}

function ligarPalco(root, { windowRef, origin, onFocus }) {
  let origem = null;
  let ignorarClique = false;

  function emitir(payload) {
    emitirEdicao(windowRef, origin, payload);
  }

  function onPointerDown(event) {
    if (event.target?.closest?.("[contenteditable='true']")) return;
    const cartao = event.target?.closest?.(".region-content");
    const region = cartao?.closest?.(".journey-region");
    if (!cartao || !region?.dataset.regionId) return;
    if (event.button != null && event.button !== 0) return;
    origem = {
      x: event.clientX,
      y: event.clientY,
      id: region.dataset.regionId,
      cartao,
      arrastando: false,
    };
  }

  function onPointerMove(event) {
    if (!origem?.cartao) return;
    const dx = event.clientX - origem.x;
    const dy = event.clientY - origem.y;
    if (!origem.arrastando && Math.hypot(dx, dy) < 10) return;
    if (!origem.arrastando) {
      origem.arrastando = true;
      origem.cartao.classList.add("is-preview-dragging");
      origem.cartao.setPointerCapture?.(event.pointerId);
    }
    origem.cartao.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
  }

  function onPointerUp(event) {
    if (!origem) return;
    const cartao = origem.cartao;
    const arrastou = origem.arrastando;
    const id = origem.id;
    cartao?.classList.remove("is-preview-dragging");
    if (cartao) cartao.style.transform = "";
    origem = null;
    if (!arrastou) {
      windowRef.setTimeout?.(() => marcarFoco(root, id), 40);
      return;
    }
    ignorarClique = true;
    event.preventDefault?.();
    event.stopPropagation?.();
    emitir({
      id,
      field: "side",
      value: event.clientX < windowRef.innerWidth / 2 ? "left" : "right",
    });
  }

  function onClick(event) {
    if (ignorarClique) {
      ignorarClique = false;
      event.preventDefault?.();
      event.stopPropagation?.();
      return;
    }
    if (event.target?.closest?.("[contenteditable='true']")) {
      event.stopPropagation?.();
    }
  }

  function onBlur(event) {
    const campo = event.target?.closest?.("[data-preview-field]");
    const region = campo?.closest?.(".journey-region");
    if (!campo || !region?.dataset.regionId) return;
    emitir({
      id: region.dataset.regionId,
      field: campo.dataset.previewField,
      value: campo.textContent?.replace(/\s+/g, " ").trim() || "",
    });
  }

  function onStage(event) {
    if (event.source !== windowRef.parent || event.data?.type !== ADMIN_PREVIEW_STAGE) return;
    if (event.data.scroll && event.data.focusId) onFocus?.(event.data.focusId);
    const raiz = windowRef.document?.documentElement;
    if (!raiz || !event.data.effects) return;
    raiz.classList.toggle("is-hide-caption", event.data.effects.caption === false);
    raiz.classList.toggle("is-flat-cards", event.data.effects.offset === false);
  }

  const observador = typeof MutationObserver === "function"
    ? new MutationObserver(() => marcarFoco(root, ""))
    : null;
  observador?.observe(root, { subtree: true, attributes: true, attributeFilter: ["class"] });

  root.addEventListener("pointerdown", onPointerDown);
  root.addEventListener("pointermove", onPointerMove);
  root.addEventListener("pointerup", onPointerUp);
  root.addEventListener("pointercancel", onPointerUp);
  root.addEventListener("click", onClick, true);
  root.addEventListener("focusout", onBlur);
  windowRef.addEventListener("message", onStage);

  return () => {
    observador?.disconnect();
    root.removeEventListener("pointerdown", onPointerDown);
    root.removeEventListener("pointermove", onPointerMove);
    root.removeEventListener("pointerup", onPointerUp);
    root.removeEventListener("pointercancel", onPointerUp);
    root.removeEventListener("click", onClick, true);
    root.removeEventListener("focusout", onBlur);
    windowRef.removeEventListener("message", onStage);
  };
}

export function createHomeAdminPreview({
  root,
  initialBlocks = [],
  windowRef = globalThis.window,
  origin = globalThis.location?.origin,
  source = windowRef?.parent,
  onSnapshot = () => {},
  onStructureChange = () => {},
  onFocus = () => {},
} = {}) {
  let structure = previewStructure(initialBlocks);
  let focusedId = "";
  marcarFoco(root, "");
  const soltarPalco = ligarPalco(root, {
    windowRef,
    origin,
    onFocus: (id) => onFocus(id),
  });

  const onMessage = (event) => {
    const payload = parseAdminPreviewMessage(event, { origin, source });
    if (!payload) return;
    onSnapshot(payload);

    const nextStructure = previewStructure(payload.blocks);
    if (nextStructure !== structure) {
      structure = nextStructure;
      onStructureChange(payload);
      return;
    }

    payload.blocks.forEach((block) => patchPreviewBlock(root, block));
    marcarFoco(root, payload.focusId);
    if (payload.focusId && (event.data?.scroll || payload.focusId !== focusedId)) {
      focusedId = payload.focusId;
      onFocus(payload.focusId);
    }
  };

  windowRef?.addEventListener?.("message", onMessage);
  return {
    destroy() {
      windowRef?.removeEventListener?.("message", onMessage);
      soltarPalco?.();
    },
  };
}
