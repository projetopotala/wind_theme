import { arteDaCapa } from "./blog-arte.js";
import { CATEGORIAS, DEFAULT_BLOG_POSTS, contarPorCategoria, dataLegivel } from "./blog-data.js";
import { normalizePost, normalizePosts, placeBlogPosts } from "./blog-model.js";
import { createBlogRepository } from "./blog-repository.js";
import { applyBlogSettings } from "./blog-settings.js";

const escapar = (valor) => String(valor ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const labelCategory = (id) => CATEGORIAS.find((item) => item.id === id)?.rotulo
  || String(id || "Reflexão").replace(/(^|-)(\w)/g, (_, sep, letter) => `${sep ? " " : ""}${letter.toUpperCase()}`);

function cardValues(post) {
  const next = normalizePost(post);
  return {
    ...next,
    legacy: !post?.title,
    motive: post?.motivo,
  };
}

export function cartaoDoPost(post, { destaque = false } = {}) {
  if (!post) return "";
  const item = cardValues(post);
  const { iso, texto } = dataLegivel(item.publishedAt);
  const href = `artigo.html?post=${encodeURIComponent(item.slug)}`;
  const cover = item.cover
    ? `<img src="${escapar(item.cover)}" alt="${escapar(item.coverAlt)}" loading="lazy" decoding="async">`
    : arteDaCapa(item.motive);
  return `
    <article class="post${destaque ? " post--destaque" : ""}">
      <a class="post-capa" href="${href}" tabindex="-1" aria-hidden="true">${cover}</a>
      <div class="post-texto">
        <p class="post-etiqueta">${escapar(labelCategory(item.category))}</p>
        <h3 class="post-titulo"><a href="${href}">${escapar(item.title)}</a></h3>
        <p class="post-resumo">${escapar(item.excerpt)}</p>
        <p class="post-credito">
          <span>${escapar(item.author)}</span>
          <time datetime="${escapar(iso)}">${escapar(texto)}</time>
          <span>${escapar(item.readingMinutes)} min de leitura</span>
        </p>
        <a class="post-link" href="${href}">Ler artigo&nbsp; →</a>
      </div>
    </article>`;
}

export function marcacaoDasCategorias(posts, ativa = "todos") {
  const legacy = posts.some((post) => post?.categoria);
  const normalized = normalizePosts(posts);
  const counts = legacy
    ? contarPorCategoria(posts)
    : normalized.reduce((sum, post) => ({ ...sum, [post.category]: (sum[post.category] || 0) + 1 }), { todos: normalized.length });
  const known = new Set(CATEGORIAS.map(({ id }) => id));
  const catalog = [
    ...CATEGORIAS,
    ...normalized
      .filter(({ category }) => !known.has(category))
      .map(({ category }) => ({ id:category, rotulo:labelCategory(category) }))
      .filter((category, index, items) => items.findIndex(({ id }) => id === category.id) === index),
  ];
  return catalog.map((category) => {
    const count = counts[category.id] || 0;
    return `<li><button type="button" data-categoria="${escapar(category.id)}"
      aria-pressed="${category.id === ativa ? "true" : "false"}" ${count === 0 ? "disabled" : ""}>
      <span>${escapar(category.rotulo)}</span><span>${count}</span></button></li>`;
  }).join("");
}

const CONVERSA_INICIAL = [
  { nome: "Beatriz", quando: "há 2 dias", texto: "A leitura abriu uma pausa de que eu precisava. Voltei ao texto no fim do dia." },
  { nome: "Rogério M.", quando: "há 4 dias", texto: "Gosto quando a reflexão encontra uma prática possível, sem oferecer respostas prontas." },
];

function comentarioEmLista({ nome, quando, texto }) {
  const inicial = String(nome || "?").trim().charAt(0).toUpperCase();
  return `<li class="comentario"><span class="comentario-inicial" aria-hidden="true">${escapar(inicial)}</span><div>
    <p class="comentario-quem"><strong>${escapar(nome)}</strong> <span>${escapar(quando)}</span></p>
    <p class="comentario-texto">${escapar(texto)}</p></div></li>`;
}

export function validarComentario({ nome = "", texto = "" } = {}) {
  const erros = {};
  if (!String(nome).trim()) erros.nome = "Diga como quer ser chamada ou chamado.";
  if (String(texto).trim().length < 3) erros.texto = "Escreva ao menos algumas palavras.";
  return erros;
}

function wireComments(root) {
  const form = root.querySelector("[data-comentario-forma]");
  const list = root.querySelector("[data-comentario-lista]");
  const status = root.querySelector("[data-comentario-status]");
  const counter = root.querySelector("[data-comentario-contador]");
  if (list) list.innerHTML = CONVERSA_INICIAL.map(comentarioEmLista).join("");
  form?.elements?.texto?.addEventListener("input", () => { if (counter) counter.textContent = form.elements.texto.value.length; });
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const errors = validarComentario({ nome: form.elements.nome.value, texto: form.elements.texto.value });
    for (const field of ["nome", "texto"]) {
      const target = root.querySelector(`[data-erro-${field}]`);
      if (target) target.textContent = errors[field] || "";
      form.elements[field].setAttribute("aria-invalid", errors[field] ? "true" : "false");
    }
    if (Object.keys(errors).length) return form.querySelector('[aria-invalid="true"]')?.focus();
    list?.insertAdjacentHTML("afterbegin", comentarioEmLista({ nome: form.elements.nome.value.trim(), quando: "agora", texto: form.elements.texto.value.trim() }));
    form.reset();
    if (counter) counter.textContent = "0";
    if (status) status.textContent = "Comentário publicado nesta aba. Ele não fica gravado.";
  });
}

export function montar(root = document) {
  const featuredTarget = root.querySelector("[data-blog-destaque]");
  const gridTarget = root.querySelector("[data-blog-grade]");
  const categoriesTarget = root.querySelector("[data-blog-categorias]");
  const recentTarget = root.querySelector("[data-blog-recentes]");
  const empty = root.querySelector("[data-blog-vazio]");
  const search = root.querySelector("[data-blog-search]");
  if (!gridTarget) return { destroy() {} };

  const repository = createBlogRepository({ defaults: DEFAULT_BLOG_POSTS });
  let posts = repository.list();
  let activeCategory = "todos";
  let term = "";

  const visiblePosts = () => posts.filter((post) => {
    const categoryMatches = activeCategory === "todos" || post.category === activeCategory;
    const haystack = `${post.title} ${post.excerpt} ${post.author}`.toLocaleLowerCase("pt-BR");
    return categoryMatches && haystack.includes(term);
  });

  function draw() {
    const placements = placeBlogPosts(visiblePosts());
    featuredTarget.innerHTML = placements.featured ? cartaoDoPost(placements.featured, { destaque: true }) : "";
    gridTarget.innerHTML = placements.grid.map((post) => cartaoDoPost(post)).join("");
    empty.hidden = Boolean(placements.featured || placements.grid.length);
    categoriesTarget.innerHTML = marcacaoDasCategorias(posts.filter((post) => post.status === "published"), activeCategory);
    recentTarget.innerHTML = placeBlogPosts(posts).recent.map((post) => `<li>
      <img src="${escapar(post.cover)}" alt="" loading="lazy" decoding="async">
      <a href="artigo.html?post=${encodeURIComponent(post.slug)}">${escapar(post.title)}</a></li>`).join("");
  }

  categoriesTarget.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-categoria]");
    if (!button || button.disabled) return;
    activeCategory = button.dataset.categoria;
    draw();
    categoriesTarget.querySelector(`[data-categoria="${activeCategory}"]`)?.focus();
  });
  search?.addEventListener("input", () => { term = search.value.trim().toLocaleLowerCase("pt-BR"); draw(); });

  const newsletter = root.querySelector("[data-blog-newsletter]");
  newsletter?.addEventListener("submit", (event) => {
    event.preventDefault();
    newsletter.reset();
    root.querySelector("[data-blog-newsletter-status]").textContent = "Demonstração local: inscrição ainda não foi enviada.";
  });

  const onPreview = (evento) => {
    if (evento.origin !== window.location.origin || evento.data?.type !== "potala:blog-preview") return;
    posts = normalizePosts(evento.data.posts);
    draw();
  };
  const onStorage = (event) => { if (event.key === "potala.blog.frontend.v1") { posts = repository.list(); draw(); } };
  window.addEventListener("message", onPreview);
  window.addEventListener("storage", onStorage);
  wireComments(root);
  applyBlogSettings(root);
  draw();
  return { draw, destroy() { window.removeEventListener("message", onPreview); window.removeEventListener("storage", onStorage); } };
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => montar(document), { once: true });
  else montar(document);
}
