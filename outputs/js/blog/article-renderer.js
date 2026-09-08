import { dataLegivel } from "./blog-data.js";
import { normalizePost, normalizePosts } from "./blog-model.js";

const escapeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function findPostBySlug(posts, slug, { preview = false } = {}) {
  return normalizePosts(posts).find((post) => post.slug === String(slug || "")
    && (preview || post.status === "published")) || null;
}

export function renderArticleBlock(block = {}) {
  const text = escapeHtml(block.text);
  if (block.type === "paragraph") return `<p class="article-paragraph">${text}</p>`;
  if (block.type === "heading") return `<h2 class="article-heading">${text}</h2>`;
  if (block.type === "quote") return `<blockquote class="article-quote">${text}</blockquote>`;
  if (block.type === "image") return `<figure class="article-figure"><img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.alt)}" loading="lazy" decoding="async">${block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ""}</figure>`;
  if (block.type === "list") return `<ul class="article-list">${(block.items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
  if (block.type === "divider") return '<hr class="article-divider">';
  return "";
}

export function renderArticle(post) {
  if (!post) return "";
  const item = normalizePost(post);
  const date = dataLegivel(item.publishedAt);
  return `<header class="article-hero">
    <img src="${escapeHtml(item.cover)}" alt="${escapeHtml(item.coverAlt)}">
    <div class="article-hero__veil" aria-hidden="true"></div>
    <div class="article-hero__copy">
      <p>${escapeHtml(item.category)}</p>
      <h1>${escapeHtml(item.title)}</h1>
      <p class="article-subtitle">${escapeHtml(item.subtitle || item.excerpt)}</p>
      <p class="article-meta"><span>${escapeHtml(item.author)}</span><time datetime="${escapeHtml(date.iso)}">${escapeHtml(date.texto)}</time><span>${item.readingMinutes} min</span></p>
    </div>
  </header>
  <div class="article-content">${item.content.map(renderArticleBlock).join("")}</div>`;
}
