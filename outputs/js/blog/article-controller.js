import { DEFAULT_BLOG_POSTS } from "./blog-data.js";
import { normalizePosts } from "./blog-model.js";
import { criarBlogPublico, quandoFoi } from "./blog-remoto.js";
import { findPostBySlug, renderArticle } from "./article-renderer.js";
import { criarRestPublico } from "../supabase/rest.js";

const escapeHtml = (value) => String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

/*
 * SALVAR E ACOMPANHAR, NO PRÓPRIO ARTIGO.
 *
 * Os botões só declaram o item; quem salva é js/conta/alternadores.js, que
 * escuta a página inteira e abre o painel da conta para quem ainda não entrou.
 * Acompanhar é pelo TEMA do texto: é o que alimenta "Para você" e os avisos de
 * conteúdo novo, e seguir um artigo isolado não teria o que avisar.
 *
 * Na prévia do painel editorial nada disso aparece: ali quem lê é o editor
 * conferindo o texto, e não um leitor guardando-o.
 */
const MARCADOR = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6.5 3.5h11v17l-5.5-4-5.5 4v-17Z"/></svg>';
const refDoTema = (tema) => String(tema).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function prepararLeitura(target, post, preview) {
  if (preview) return;
  const ref = post.id || post.slug;
  const href = `/artigo.html?post=${encodeURIComponent(post.slug)}`;
  const acompanhar = post.category
    ? `<button type="button" class="conta-alternar" data-acompanhar data-acompanhar-tipo="tema" data-acompanhar-ref="${escapeHtml(refDoTema(post.category))}" data-acompanhar-rotulo="${escapeHtml(post.category)}" aria-pressed="false"><span data-alternador-rotulo>Acompanhar</span><span class="conta-alternar-tema">${escapeHtml(post.category)}</span></button>`
    : "";
  target.querySelector(".article-hero__copy")?.insertAdjacentHTML("beforeend", `<div class="article-acoes">
    <button type="button" class="conta-alternar" data-salvar data-salvar-tipo="blog" data-salvar-ref="${escapeHtml(ref)}" data-salvar-titulo="${escapeHtml(post.title)}" data-salvar-href="${escapeHtml(href)}" data-salvar-imagem="${escapeHtml(post.cover || "")}" aria-pressed="false">${MARCADOR}<span data-alternador-rotulo>Salvar</span></button>
    ${acompanhar}
  </div>`);

  /* O histórico da conta lê o item daqui — ou do evento, se a conta já estiver montada. */
  Object.assign(target.dataset, { itemTipo: "blog", itemRef: ref, itemTitulo: post.title, itemHref: href });
  document.dispatchEvent(new CustomEvent("potala:item-visto", { detail: { tipo: "blog", ref, titulo: post.title, href } }));
}

function mount(root = document) {
  const target = root.querySelector("[data-article-root]");
  if (!target) return;
  const params = new URLSearchParams(window.location.search);
  const preview = params.get("preview") === "1";
  const blog = criarBlogPublico({
    rest: criarRestPublico(),
    reserva: DEFAULT_BLOG_POSTS,
    aoFalhar: (erro) => console.warn("Artigo: leitura do banco falhou; mostrando o acervo empacotado.", erro),
  });
  let posts = [];
  let slug = params.get("post") || "";
  let recebeuPrevia = false;
  let leituraContada = false;

  function draw() {
    const post = findPostBySlug(posts, slug, { preview });
    if (!post) {
      target.innerHTML = '<div class="article-content"><h1>Este texto não está disponível.</h1><p>Ele pode ter sido ocultado ou o endereço mudou.</p></div>';
      root.querySelector("[data-article-related]").innerHTML = "";
      return null;
    }
    document.title = `${post.title} — Caderno de Travessia`;
    target.innerHTML = renderArticle(post);
    prepararLeitura(target, post, preview);
    root.querySelector("[data-article-related]").innerHTML = posts
      .filter((item) => item.status === "published" && item.id !== post.id)
      .slice(0,2)
      .map((item) => `<a href="artigo.html?post=${encodeURIComponent(item.slug)}" style="background-image:url('${escapeHtml(item.cover)}')">${escapeHtml(item.title)}</a>`).join("");
    return post;
  }

  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin || event.data?.type !== "potala:blog-preview") return;
    recebeuPrevia = true;
    posts = normalizePosts(event.data.posts);
    slug = event.data.selectedSlug || slug;
    draw();
  });

  const list = root.querySelector("[data-article-comment-list]");
  const status = root.querySelector("[data-article-comment-status]");
  const comentario = (item) => `<li><strong>${escapeHtml(item.nome)}</strong> <small>${escapeHtml(quandoFoi(item.criadoEm))}</small><p>${escapeHtml(item.texto)}</p></li>`;

  const form = root.querySelector("[data-article-comment-form]");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = new FormData(form);
    const enviar = form.querySelector('[type="submit"]');
    enviar?.setAttribute("disabled", "");
    if (status) status.textContent = "Enviando…";
    try {
      await blog.enviarComentario({ slug, nome: values.get("name"), texto: values.get("text") });
      form.reset();
      if (status) status.textContent = "Recebido. Sua reflexão aparece aqui depois da leitura da equipe.";
    } catch (erro) {
      if (status) status.textContent = `Não foi possível enviar: ${erro.message}`;
    } finally {
      enviar?.removeAttribute("disabled");
    }
  });

  blog.listarPublicados().then((publicados) => {
    if (recebeuPrevia) return;
    posts = publicados;
    slug ||= posts[0]?.slug || "";
    const post = draw();
    if (!post || preview) return;
    if (!leituraContada) {
      leituraContada = true;
      blog.registrarLeitura(post.slug);
    }
    blog.listarComentarios(post.slug)
      .then((comentarios) => { if (list) list.innerHTML = comentarios.map(comentario).join(""); })
      .catch(() => {});
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => mount(document), { once:true });
else mount(document);
