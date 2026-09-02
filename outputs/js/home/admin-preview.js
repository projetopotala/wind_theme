import { normalizeHomeBlocks } from "./content-model.js";

export const ADMIN_PREVIEW_MESSAGE = "potala:admin-preview";
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
    .map(({ id, side, position, published }) => `${id}:${side}:${position}:${published ? 1 : 0}`)
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
    if (payload.focusId && payload.focusId !== focusedId) {
      focusedId = payload.focusId;
      onFocus(payload.focusId);
    }
  };

  windowRef?.addEventListener?.("message", onMessage);
  return {
    destroy() {
      windowRef?.removeEventListener?.("message", onMessage);
    },
  };
}
