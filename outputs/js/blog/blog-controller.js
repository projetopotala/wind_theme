import { arteDaCapa } from "./blog-arte.js";
import { CATEGORIAS, DEFAULT_BLOG_POSTS, contarPorCategoria, dataLegivel } from "./blog-data.js";
import { normalizePost, normalizePosts, placeBlogPosts } from "./blog-model.js";
import { criarBlogPublico, quandoFoi, validarEnvioDeComentario } from "./blog-remoto.js";
import { applyBlogSettings } from "./blog-settings.js";
import { criarRestPublico } from "../supabase/rest.js";

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

function comentarioEmLista({ nome, quando, texto }) {
  const inicial = String(nome || "?").trim().charAt(0).toUpperCase();
  return `<li class="comentario"><span class="comentario-inicial" aria-hidden="true">${escapar(inicial)}</span><div>
    <p class="comentario-quem"><strong>${escapar(nome)}</strong> <span>${escapar(quando)}</span></p>
    <p class="comentario-texto">${escapar(texto)}</p></div></li>`;
}

export function validarComentario(campos = {}) {
  return validarEnvioDeComentario(campos);
}

/*
 * A conversa da página do Caderno.
 *
 * O comentário vai ao banco como pendente e só aparece depois da leitura da
 * equipe. Por isso ele NÃO entra na lista ao enviar: mostrá-lo ali faria a
 * pessoa achar que já está público para todos.
 */
function wireComments(root, blog) {
  const form = root.querySelector("[data-comentario-forma]");
  const list = root.querySelector("[data-comentario-lista]");
  const status = root.querySelector("[data-comentario-status]");
  const counter = root.querySelector("[data-comentario-contador]");

  blog.listarComentarios(null)
    .then((comentarios) => {
      if (list) list.innerHTML = comentarios.map((item) => comentarioEmLista({ ...item, quando: quandoFoi(item.criadoEm) })).join("");
    })
    .catch(() => { if (list) list.innerHTML = ""; });

  form?.elements?.texto?.addEventListener("input", () => { if (counter) counter.textContent = form.elements.texto.value.length; });
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const errors = validarComentario({ nome: form.elements.nome.value, texto: form.elements.texto.value });
    for (const field of ["nome", "texto"]) {
      const target = root.querySelector(`[data-erro-${field}]`);
      if (target) target.textContent = errors[field] || "";
      form.elements[field].setAttribute("aria-invalid", errors[field] ? "true" : "false");
    }
    if (Object.keys(errors).length) return form.querySelector('[aria-invalid="true"]')?.focus();
    const enviar = form.querySelector('[type="submit"]');
    enviar?.setAttribute("disabled", "");
    if (status) status.textContent = "Enviando…";
    try {
      await blog.enviarComentario({ slug: null, nome: form.elements.nome.value, texto: form.elements.texto.value });
      form.reset();
      if (counter) counter.textContent = "0";
      if (status) status.textContent = "Recebido. Seu comentário aparece aqui depois da leitura da equipe.";
    } catch (erro) {
      if (status) status.textContent = `Não foi possível enviar: ${erro.message}`;
    } finally {
      enviar?.removeAttribute("disabled");
    }
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

  const blog = criarBlogPublico({
    rest: criarRestPublico(),
    reserva: DEFAULT_BLOG_POSTS,
    aoFalhar: (erro) => console.warn("Caderno: leitura do banco falhou; mostrando o acervo empacotado.", erro),
  });
  const preview = new URLSearchParams(globalThis.location?.search || "").get("preview") === "1";
  let posts = [];
  let recebeuPrevia = false;
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
  newsletter?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const aviso = root.querySelector("[data-blog-newsletter-status]");
    const campo = newsletter.querySelector('input[type="email"]');
    if (!campo?.value.trim() || campo.validity?.valid === false) {
      if (aviso) aviso.textContent = "Informe um e-mail válido.";
      campo?.focus();
      return;
    }
    if (aviso) aviso.textContent = "Enviando…";
    try {
      await blog.inscrever(campo.value, "blog");
      newsletter.reset();
      if (aviso) aviso.textContent = "Inscrição registrada. Obrigado por acompanhar o Caderno.";
    } catch (erro) {
      if (aviso) aviso.textContent = `Não foi possível inscrever: ${erro.message}`;
    }
  });

  const onPreview = (evento) => {
    if (evento.origin !== window.location.origin || evento.data?.type !== "potala:blog-preview") return;
    recebeuPrevia = true;
    posts = normalizePosts(evento.data.posts);
    draw();
  };
  window.addEventListener("message", onPreview);
  empty.hidden = true;
  const carregado = Promise.all([blog.listarPublicados(), blog.lerConfiguracao()]).then(([publicados, configuracao]) => {
    applyBlogSettings(root, configuracao);
    /* Na prévia do editor, o rascunho que chegou pela mensagem vale mais que o banco. */
    if (!recebeuPrevia) {
      posts = publicados;
      draw();
    }
  });
  if (!preview) wireComments(root, blog);
  return { draw, carregado, destroy() { window.removeEventListener("message", onPreview); } };
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => montar(document), { once: true });
  else montar(document);
}
