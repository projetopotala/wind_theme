import { arteDaCapa } from "./blog-arte.js";
import { CATEGORIAS, DEFAULT_BLOG_POSTS, contarPorCategoria, dataLegivel } from "./blog-data.js";
import { normalizePost, normalizePosts, placeBlogPosts } from "./blog-model.js";
import { criarBlogPublico, criarRestSemBanco, querAcervoLocal, quandoFoi, validarEnvioDeComentario } from "./blog-remoto.js";
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
    const foto = FOTO_DA_CATEGORIA[category.id] || FOTO_DA_CATEGORIA.todos;
    return `<li><button type="button" data-categoria="${escapar(category.id)}"
      aria-pressed="${category.id === ativa ? "true" : "false"}" ${count === 0 ? "disabled" : ""}>
      <span class="blog-medalhao"><img src="${foto}" alt="" loading="lazy" decoding="async"></span>
      <span class="blog-medalhao__rotulo">${escapar(category.rotulo)}</span><span class="blog-medalhao__conta">${count}</span></button></li>`;
  }).join("");
}

/* A foto de cada medalhão. Decorativa: o nome da categoria vem escrito embaixo. */
const FOTO_DA_CATEGORIA = Object.freeze({
  todos: "media/blog-hero-caminhante.webp",
  artigos: "media/home-travessia.webp",
  oraculos: "media/journey-inspiracao.webp",
  terapias: "media/saude-integrativa-escuta.webp",
  cursos: "media/journey-quem-somos.webp",
  cultura: "media/journey-cultura.webp",
  praticas: "media/atividades-pratica.webp",
});

/*
 * O destaque do Caderno, emoldurado no painel do hero.
 *
 * É outra peça, não o cartão da grade com outra classe: na moldura cabem só a
 * foto, a categoria, o título e o convite — o resumo e o crédito ficam para a
 * página do artigo.
 */
export function destaqueEmMoldura(post) {
  if (!post) return "";
  const item = cardValues(post);
  const href = `artigo.html?post=${encodeURIComponent(item.slug)}`;
  const foto = item.cover
    ? `<img src="${escapar(item.cover)}" alt="${escapar(item.coverAlt)}" decoding="async">`
    : arteDaCapa(item.motive);
  return `<a class="post-moldura" href="${href}">
      <figure class="cad-polaroid">${foto}
        <figcaption class="post-moldura__texto">
          <span class="post-moldura__etiqueta">Destaque · ${escapar(labelCategory(item.category))}</span>
          <span class="post-moldura__titulo">${escapar(item.title)}</span>
          <span class="post-moldura__ler">Ler artigo →</span>
        </figcaption>
      </figure>
    </a>`;
}

/*
 * A grade editorial: um texto grande à esquerda; à direita, dois médios e três
 * pequenos; o que sobra desce em linhas de três. A ordem de leitura continua a
 * da lista — só o tamanho muda com a posição.
 */
export function gradeEditorial(posts = []) {
  if (!posts.length) return "";
  const [grande, ...resto] = posts;
  const par = resto.slice(0, 2);
  const trio = resto.slice(2, 5);
  const depois = resto.slice(5);
  const bloco = (classe, itens) => (itens.length ? `<div class="${classe}">${itens.map((post) => cartaoDoPost(post)).join("")}</div>` : "");
  const lado = par.length || trio.length
    ? `<div class="blog-grade__lado">${bloco("blog-grade__par", par)}${bloco("blog-grade__trio", trio)}</div>`
    : "";
  return `<div class="blog-grade__topo"><div class="blog-grade__grande">${cartaoDoPost(grande)}</div>${lado}</div>${bloco("blog-grade__resto", depois)}`;
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

/* Uma faixa no topo deixa claro que a página não está mostrando o banco. */
export function avisarAcervoLocal(root = document) {
  const faixa = root.createElement?.("p");
  if (!faixa) return;
  faixa.className = "blog-acervo-local";
  faixa.setAttribute("role", "status");
  faixa.innerHTML = 'Prévia com os textos do código, sem o banco. Comentários e inscrições estão desligados. <a href="?acervo=banco">Voltar ao banco</a>';
  root.body?.prepend(faixa);
}

export const POR_PAGINA = 12;
export const MAIS_POR_VEZ = 9;

export function montar(root = document) {
  const featuredTarget = root.querySelector("[data-blog-destaque]");
  const gridTarget = root.querySelector("[data-blog-grade]");
  const categoriesTarget = root.querySelector("[data-blog-categorias]");
  const recentTarget = root.querySelector("[data-blog-recentes]");
  const empty = root.querySelector("[data-blog-vazio]");
  const search = root.querySelector("[data-blog-search]");
  if (!gridTarget) return { destroy() {} };

  const acervoLocal = querAcervoLocal();
  const blog = criarBlogPublico({
    rest: acervoLocal ? criarRestSemBanco() : criarRestPublico(),
    reserva: DEFAULT_BLOG_POSTS,
    aoFalhar: (erro) => console.warn("Caderno: leitura do banco falhou; mostrando o acervo empacotado.", erro),
  });
  const params = new URLSearchParams(globalThis.location?.search || "");
  const preview = params.get("preview") === "1";
  const menu = root.querySelector("[data-blog-menu]");
  const filtro = root.querySelector("[data-blog-filtro]");
  const buscaAbrir = root.querySelector("[data-blog-busca-abrir]");
  const buscaFaixa = root.querySelector("#blog-busca");
  let posts = [];
  let recebeuPrevia = false;
  /* O menu das outras páginas (o artigo) chega aqui por ?categoria=. */
  let activeCategory = CATEGORIAS.some(({ id }) => id === params.get("categoria")) ? params.get("categoria") : "todos";
  let term = "";
  /* A primeira tela mostra a composição inteira (1 + 2 + 3 + duas linhas de três); o resto vem sob pedido. */
  let limite = POR_PAGINA;
  const mais = root.querySelector("[data-blog-mais]");

  const visiblePosts = () => posts.filter((post) => {
    const categoryMatches = activeCategory === "todos" || post.category === activeCategory;
    const haystack = `${post.title} ${post.excerpt} ${post.author}`.toLocaleLowerCase("pt-BR");
    return categoryMatches && haystack.includes(term);
  });

  /*
   * O destaque fica no hero só na abertura do Caderno. Filtrando ou buscando,
   * todo resultado desce para a grade: um texto no alto da página que não
   * responde à busca parece resultado dela.
   */
  function draw() {
    const filtrando = activeCategory !== "todos" || Boolean(term);
    const abertura = placeBlogPosts(posts);
    const encontrados = placeBlogPosts(visiblePosts());
    const naGrade = filtrando ? [encontrados.featured, ...encontrados.grid].filter(Boolean) : abertura.grid;
    if (featuredTarget) featuredTarget.innerHTML = destaqueEmMoldura(abertura.featured);
    gridTarget.innerHTML = gradeEditorial(naGrade.slice(0, limite));
    empty.hidden = naGrade.length > 0;
    if (mais) {
      const faltam = naGrade.length - limite;
      mais.hidden = faltam <= 0;
      mais.textContent = faltam > 0 ? `Ver mais textos (${faltam})` : "Ver mais textos";
    }
    categoriesTarget.innerHTML = marcacaoDasCategorias(posts.filter((post) => post.status === "published"), activeCategory);
    if (recentTarget) {
      recentTarget.innerHTML = placeBlogPosts(posts).recent.map((post) => `<li>
        <a href="artigo.html?post=${encodeURIComponent(post.slug)}">${escapar(post.title)}</a></li>`).join("");
    }
    if (filtro) {
      filtro.textContent = term
        ? `busca: “${search?.value.trim() || ""}”`
        : activeCategory === "todos" ? "mais recentes" : labelCategory(activeCategory);
    }
    for (const link of menu?.querySelectorAll("[data-categoria-link]") || []) {
      if (link.dataset.categoriaLink === activeCategory) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
  }

  function escolherCategoria(id, { rolar = false } = {}) {
    activeCategory = id;
    limite = POR_PAGINA;
    try {
      const url = new URL(globalThis.location.href);
      if (id === "todos") url.searchParams.delete("categoria");
      else url.searchParams.set("categoria", id);
      globalThis.history?.replaceState(globalThis.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    } catch {
      /* Sem History API o filtro funciona igual; só o endereço não acompanha. */
    }
    draw();
    if (rolar) root.getElementById?.("artigos")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }

  categoriesTarget.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-categoria]");
    if (!button || button.disabled) return;
    escolherCategoria(button.dataset.categoria);
    categoriesTarget.querySelector(`[data-categoria="${activeCategory}"]`)?.focus();
  });
  menu?.addEventListener("click", (event) => {
    const link = event.target.closest?.("[data-categoria-link]");
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.button > 0) return;
    event.preventDefault();
    escolherCategoria(link.dataset.categoriaLink, { rolar: link.dataset.categoriaLink !== "todos" });
  });
  search?.addEventListener("input", () => { term = search.value.trim().toLocaleLowerCase("pt-BR"); limite = POR_PAGINA; draw(); });

  /* O foco vai para o primeiro texto novo: quem usa teclado continua de onde parou. */
  mais?.addEventListener("click", () => {
    const antes = gridTarget.querySelectorAll(".post").length;
    limite += MAIS_POR_VEZ;
    draw();
    gridTarget.querySelectorAll(".post-titulo a")[antes]?.focus();
  });

  /* A lupa do menu abre o campo; Escape com o campo vazio fecha e devolve o foco à lupa. */
  function abrirBusca(aberta) {
    if (!buscaFaixa || !buscaAbrir) return;
    buscaFaixa.hidden = !aberta;
    buscaAbrir.setAttribute("aria-expanded", String(aberta));
    if (aberta) search?.focus();
  }
  buscaAbrir?.addEventListener("click", () => abrirBusca(buscaFaixa?.hidden));
  search?.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || search.value) return;
    abrirBusca(false);
    buscaAbrir?.focus();
  });
  if (globalThis.location?.hash === "#buscar") abrirBusca(true);

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
  if (acervoLocal) avisarAcervoLocal(root);
  return { draw, carregado, destroy() { window.removeEventListener("message", onPreview); } };
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => montar(document), { once: true });
  else montar(document);
}
