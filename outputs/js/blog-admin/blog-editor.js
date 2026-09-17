import { BLOG_BLOCK_TYPES, normalizePost, normalizePosts, slugifyBlogTitle } from "../blog/blog-model.js";

const clone = (value) => JSON.parse(JSON.stringify(value));
const escapeHtml = (value) => String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const uid = (prefix = "item") => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;

export function createBlankPost(now = new Date().toISOString()) {
  const stamp = String(now || new Date().toISOString());
  const id = `post-${stamp.replace(/\D/g, "").slice(0,14) || Date.now()}`;
  return normalizePost({ id, slug:`novo-texto-${id.slice(-6)}`, title:"Novo texto", subtitle:"", excerpt:"", category:"reflexao", author:"Instituto Potala", publishedAt:stamp.slice(0,10), readingMinutes:4, cover:"media/home-travessia.webp", coverAlt:"", featured:false, status:"draft", content:[], updatedAt:stamp });
}

export function addContentBlock(post, type) {
  if (!BLOG_BLOCK_TYPES.includes(type)) return post;
  const block = { id:uid("block"), type };
  if (["paragraph","heading","quote"].includes(type)) block.text = "";
  if (type === "image") Object.assign(block, { src:"media/home-travessia.webp", alt:"", caption:"" });
  if (type === "list") block.items = [""];
  return { ...post, content:[...(post.content || []), block] };
}

export function moveContentBlock(post, blockId, direction) {
  const content = clone(post.content || []);
  const from = content.findIndex(({ id }) => id === blockId);
  const to = Math.max(0, Math.min(content.length - 1, from + Number(direction || 0)));
  if (from < 0 || from === to) return { ...post, content };
  const [block] = content.splice(from,1);
  content.splice(to,0,block);
  return { ...post, content };
}

export function removeContentBlock(post, blockId) {
  return { ...post, content:(post.content || []).filter(({ id }) => id !== blockId) };
}

export function mergeDraftPosts(posts, draft) {
  const copy = clone(posts || []);
  const normalized = normalizePost(draft);
  if (normalized.featured) copy.forEach((post) => { post.featured = false; });
  const index = copy.findIndex(({ id }) => id === normalized.id);
  if (index >= 0) copy[index] = normalized;
  else copy.push(normalized);
  return normalizePosts(copy);
}

export function postPreview(previewWindow, posts, selectedSlug, origin = globalThis.location?.origin || "*") {
  previewWindow?.postMessage?.({ type:"potala:blog-preview", posts:normalizePosts(posts), selectedSlug:String(selectedSlug || "") }, origin);
}

function blockMarkup(block, index, total) {
  const label = { paragraph:"Parágrafo", heading:"Título", image:"Imagem", quote:"Citação", list:"Lista", divider:"Divisor" }[block.type];
  let fields = "";
  if (["paragraph","heading","quote"].includes(block.type)) fields = `<textarea data-block-field="text" rows="${block.type === "paragraph" ? 5 : 2}">${escapeHtml(block.text)}</textarea>`;
  if (block.type === "image") fields = `<label>Arquivo ou endereço<input data-block-field="src" value="${escapeHtml(block.src)}"></label><label>Descrição acessível<input data-block-field="alt" value="${escapeHtml(block.alt)}"></label><label>Legenda<input data-block-field="caption" value="${escapeHtml(block.caption)}"></label>`;
  if (block.type === "list") fields = `<label>Um item por linha<textarea data-block-field="items" rows="4">${escapeHtml((block.items || []).join("\n"))}</textarea></label>`;
  if (block.type === "divider") fields = "<p>Uma pausa visual será inserida no texto.</p>";
  return `<article class="blog-editor-block" data-block-id="${escapeHtml(block.id)}">
    <header><strong>${String(index + 1).padStart(2,"0")} · ${label}</strong><span>
      <button type="button" data-block-action="up" ${index === 0 ? "disabled" : ""} aria-label="Mover para cima">↑</button>
      <button type="button" data-block-action="down" ${index === total - 1 ? "disabled" : ""} aria-label="Mover para baixo">↓</button>
      <button type="button" data-block-action="remove" aria-label="Excluir bloco">×</button></span></header>${fields}</article>`;
}

export function createBlogEditor({ root, repository, previewWindow } = {}) {
  if (!root || !repository) throw new TypeError("root e repository são obrigatórios");
  const form = root.querySelector("[data-blog-editor-form]");
  const list = root.querySelector("[data-blog-editor-list]");
  const blocksTarget = root.querySelector("[data-blog-blocks]");
  const iframe = root.querySelector("[data-blog-preview]");
  const status = root.querySelector("[data-blog-editor-status]");
  let posts = [];
  let selectedId = null;
  let draft = createBlankPost();
  let previewPage = "blog";
  let saving = false;

  const announce = (message) => { if (status) status.textContent = message; };
  const getPreviewWindow = () => previewWindow || iframe?.contentWindow;
  const sendPreview = () => postPreview(getPreviewWindow(), mergeDraftPosts(posts,draft), draft.slug, window.location.origin);

  function renderList() {
    list.innerHTML = posts.map((post) => `<li><button type="button" data-select-post="${escapeHtml(post.id)}" aria-current="${post.id === selectedId ? "true" : "false"}"><span>${escapeHtml(post.title)}</span><small>${post.featured ? "Destaque · " : ""}${post.status === "published" ? "Publicado" : post.status === "hidden" ? "Oculto" : "Rascunho"}</small></button></li>`).join("");
  }
  function renderBlocks() {
    blocksTarget.innerHTML = draft.content.length ? draft.content.map((block,index) => blockMarkup(block,index,draft.content.length)).join("") : '<p class="blog-editor-empty">Adicione o primeiro bloco de conteúdo.</p>';
  }
  function fillForm() {
    for (const name of ["title","subtitle","excerpt","category","author","publishedAt","readingMinutes","cover","coverAlt","status"]) {
      if (form.elements[name]) form.elements[name].value = draft[name] ?? "";
    }
    form.elements.featured.checked = Boolean(draft.featured);
    renderBlocks();
    sendPreview();
  }
  function readForm() {
    const values = new FormData(form);
    const title = String(values.get("title") || "Novo texto");
    draft = normalizePost({ ...draft,
      title, slug:draft.slug.startsWith("novo-texto-") ? slugifyBlogTitle(title) : draft.slug,
      subtitle:values.get("subtitle"), excerpt:values.get("excerpt"), category:values.get("category"), author:values.get("author"), publishedAt:values.get("publishedAt"), readingMinutes:values.get("readingMinutes"), cover:values.get("cover"), coverAlt:values.get("coverAlt"), status:values.get("status"), featured:form.elements.featured.checked,
      updatedAt:new Date().toISOString(), content:draft.content,
    });
  }
  function select(id) {
    readForm();
    const found = posts.find((post) => post.id === id);
    if (!found) return;
    selectedId = id; draft = clone(found); renderList(); fillForm();
  }
  async function save(statusOverride) {
    if (saving) return;
    readForm();
    if (statusOverride) draft.status = statusOverride;
    saving = true;
    announce("Salvando…");
    try {
      const saved = await repository.save(draft);
      posts = await repository.list(); selectedId = saved.id; draft = clone(saved);
      renderList(); fillForm();
      const onde = repository.demonstracao ? " nesta demonstração" : "";
      announce(saved.status === "published" ? `Artigo publicado${onde}.` : `Rascunho salvo${onde}.`);
    } catch (error) {
      announce(`Não foi possível salvar: ${error.message}`);
    } finally {
      saving = false;
    }
  }

  /* Restaurar a demonstração só existe na mesa de teste; na real apagaria o Blog de todos. */
  const reset = root.querySelector("[data-blog-reset]");

  async function load(id) {
    if (reset) reset.hidden = !repository.demonstracao;
    posts = await repository.list();
    const found = posts.find((post) => post.id === id) || (id === undefined ? posts[0] : null);
    selectedId = found?.id || null;
    draft = found ? clone(found) : createBlankPost();
    renderList(); fillForm();
  }

  list.addEventListener("click", (event) => { const button = event.target.closest?.("[data-select-post]"); if (button) select(button.dataset.selectPost); });
  form.addEventListener("input", () => { readForm(); sendPreview(); });
  form.addEventListener("change", () => { readForm(); sendPreview(); });
  form.addEventListener("submit", (event) => { event.preventDefault(); save(); });
  root.querySelector("[data-blog-new]")?.addEventListener("click", () => { selectedId = null; draft = createBlankPost(); fillForm(); renderList(); announce("Novo rascunho iniciado."); form.elements.title.focus(); });
  root.querySelector("[data-blog-publish]")?.addEventListener("click", () => save("published"));
  root.querySelector("[data-blog-delete]")?.addEventListener("click", async () => {
    if (!selectedId || !globalThis.confirm("Excluir este texto? Ele sai do Blog para todos os visitantes.")) return;
    try {
      await repository.remove(selectedId);
      await load();
      announce("Texto excluído.");
    } catch (error) {
      announce(`Não foi possível excluir: ${error.message}`);
    }
  });
  reset?.addEventListener("click", async () => {
    if (!repository.demonstracao || !globalThis.confirm("Restaurar os textos de demonstração?")) return;
    await repository.reset();
    await load();
    announce("Demonstração restaurada.");
  });
  root.querySelector("[data-blog-block-types]")?.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-add-block]"); if (!button) return;
    readForm(); draft = addContentBlock(draft,button.dataset.addBlock); renderBlocks(); sendPreview();
  });
  blocksTarget.addEventListener("click", (event) => {
    const action = event.target.closest?.("[data-block-action]"); if (!action) return;
    const id = action.closest("[data-block-id]").dataset.blockId;
    if (action.dataset.blockAction === "remove") draft = removeContentBlock(draft,id);
    else draft = moveContentBlock(draft,id,action.dataset.blockAction === "up" ? -1 : 1);
    renderBlocks(); sendPreview();
  });
  blocksTarget.addEventListener("input", (event) => {
    const field = event.target.dataset.blockField; if (!field) return;
    const id = event.target.closest("[data-block-id]").dataset.blockId;
    draft = { ...draft, content:draft.content.map((block) => block.id === id ? { ...block, [field]:field === "items" ? event.target.value.split("\n") : event.target.value } : block) };
    sendPreview();
  });
  root.querySelector("[data-preview-pages]")?.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-preview-page]"); if (!button) return;
    previewPage = button.dataset.previewPage;
    root.querySelectorAll("[data-preview-page]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    iframe.src = previewPage === "article" ? `artigo.html?post=${encodeURIComponent(draft.slug)}&preview=1` : "blog.html?preview=1";
  });
  root.querySelector("[data-preview-devices]")?.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-preview-device]"); if (!button) return;
    root.dataset.previewDevice = button.dataset.previewDevice;
    root.querySelectorAll("[data-preview-device]").forEach((item) => item.setAttribute("aria-pressed",String(item === button)));
  });
  iframe?.addEventListener("load", sendPreview);

  renderList(); fillForm();
  const pronto = load().catch((error) => announce(`Não foi possível carregar os textos: ${error.message}`));
  return {
    pronto,
    getDraft:() => clone(draft),
    getPosts:() => clone(posts),
    async open(id) {
      await pronto;
      await load(id).catch((error) => announce(`Não foi possível abrir o texto: ${error.message}`));
    },
    async startNew() {
      await pronto;
      posts = await repository.list().catch(() => posts);
      selectedId = null;
      draft = createBlankPost();
      fillForm();
      renderList();
      announce("Novo rascunho iniciado.");
      form.elements.title?.focus();
    },
    destroy() {},
  };
}
