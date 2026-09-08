import { DEFAULT_BLOG_POSTS } from "./blog-data.js";
import { normalizePosts } from "./blog-model.js";
import { createBlogRepository } from "./blog-repository.js";
import { findPostBySlug, renderArticle } from "./article-renderer.js";

const escapeHtml = (value) => String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

function mount(root = document) {
  const target = root.querySelector("[data-article-root]");
  if (!target) return;
  const params = new URLSearchParams(window.location.search);
  const preview = params.get("preview") === "1";
  const repository = createBlogRepository({ defaults:DEFAULT_BLOG_POSTS });
  let posts = repository.list();
  let slug = params.get("post") || posts[0]?.slug;

  function draw() {
    const post = findPostBySlug(posts, slug, { preview });
    if (!post) {
      target.innerHTML = '<div class="article-content"><h1>Este texto não está disponível.</h1><p>Ele pode ter sido ocultado ou o endereço mudou.</p></div>';
      root.querySelector("[data-article-related]").innerHTML = "";
      return;
    }
    document.title = `${post.title} — Caderno de Travessia`;
    target.innerHTML = renderArticle(post);
    root.querySelector("[data-article-related]").innerHTML = posts
      .filter((item) => item.status === "published" && item.id !== post.id)
      .slice(0,2)
      .map((item) => `<a href="artigo.html?post=${encodeURIComponent(item.slug)}" style="background-image:url('${escapeHtml(item.cover)}')">${escapeHtml(item.title)}</a>`).join("");
  }

  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin || event.data?.type !== "potala:blog-preview") return;
    posts = normalizePosts(event.data.posts);
    slug = event.data.selectedSlug || slug;
    draw();
  });

  const form = root.querySelector("[data-article-comment-form]");
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const values = new FormData(form);
    root.querySelector("[data-article-comment-list]").insertAdjacentHTML("afterbegin", `<li><strong>${escapeHtml(values.get("name"))}</strong><p>${escapeHtml(values.get("text"))}</p></li>`);
    form.reset();
    root.querySelector("[data-article-comment-status]").textContent = "Comentário visível somente nesta aba.";
  });
  draw();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => mount(document), { once:true });
else mount(document);
