/*
 * O TEXTO DO CADERNO, normalizado.
 *
 * Tudo que chega ao banco, à página pública e à mesa passa por aqui. O que o
 * modelo não conhece não é gravado: um bloco de tipo inventado some, um status
 * desconhecido vira publicado ou rascunho conforme o dado antigo pedia.
 */

export const BLOG_BLOCK_TYPES = Object.freeze([
  "paragraph",
  "heading",
  "image",
  "gallery",
  "quote",
  "callout",
  "video",
  "list",
  "divider",
]);

export const BLOG_STATUSES = Object.freeze(["draft", "review", "scheduled", "published", "archived"]);

const TYPE_SET = new Set(BLOG_BLOCK_TYPES);
const text = (value) => String(value ?? "").trim();
const oneOf = (value, options, fallback) => (options.includes(value) ? value : fallback);
const cleanList = (value, limit = 50) => (Array.isArray(value) ? value : []).map(text).filter(Boolean).slice(0, limit);

export function slugifyBlogTitle(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "novo-texto";
}

function normalizeBlock(block = {}, index = 0, postId = "post") {
  const type = text(block.type);
  if (!TYPE_SET.has(type)) return null;
  const normalized = { id: text(block.id) || `${postId}-block-${index + 1}`, type };

  if (type === "paragraph") {
    normalized.text = text(block.text);
    if (block.align === "center") normalized.align = "center";
    if (block.size === "lead") normalized.size = "lead";
  } else if (type === "heading") {
    normalized.text = text(block.text);
    if (Number(block.level) === 3) normalized.level = 3;
  } else if (type === "quote") {
    normalized.text = text(block.text);
    if (text(block.cite)) normalized.cite = text(block.cite);
  } else if (type === "callout") {
    normalized.text = text(block.text);
    normalized.tone = oneOf(block.tone, ["nota", "dica", "aviso"], "nota");
  } else if (type === "image") {
    normalized.src = text(block.src);
    normalized.alt = text(block.alt);
    normalized.caption = text(block.caption);
    if (block.width === "full") normalized.width = "full";
  } else if (type === "gallery") {
    normalized.images = (Array.isArray(block.images) ? block.images : [])
      .map((image) => ({ src: text(image?.src), alt: text(image?.alt) }))
      .filter((image) => image.src)
      .slice(0, 12);
    normalized.caption = text(block.caption);
  } else if (type === "video") {
    normalized.url = text(block.url);
    normalized.caption = text(block.caption);
  } else if (type === "list") {
    normalized.items = cleanList(block.items, 40);
    if (block.ordered) normalized.ordered = true;
  }
  return normalized;
}

function normalizeStatus(post) {
  if (BLOG_STATUSES.includes(post.status)) return post.status;
  /* "Oculto" era o arquivado de antes dos status editoriais. */
  if (post.status === "hidden" || post.published === false) return "archived";
  return "published";
}

export function normalizePost(post = {}, index = 0) {
  const title = text(post.title || post.titulo) || "Novo texto";
  const id = text(post.id) || `post-${index + 1}`;
  const category = text(post.category || post.categoria) || "reflexao";
  const rawContent = Array.isArray(post.content) ? post.content : [];
  const seo = post.seo && typeof post.seo === "object" ? post.seo : {};

  return {
    id,
    slug: slugifyBlogTitle(post.slug || title),
    title,
    subtitle: text(post.subtitle),
    excerpt: text(post.excerpt || post.resumo),
    category,
    tags: cleanList(post.tags, 12),
    author: text(post.author || post.autor) || "Instituto Potala",
    publishedAt: text(post.publishedAt || post.data),
    readingMinutes: Math.max(1, Number(post.readingMinutes || post.leitura) || 1),
    cover: text(post.cover),
    coverAlt: text(post.coverAlt),
    featured: Boolean(post.featured ?? post.destaque),
    status: normalizeStatus(post),
    content: rawContent
      .map((block, blockIndex) => normalizeBlock(block, blockIndex, id))
      .filter(Boolean),
    relatedPostIds: cleanList(post.relatedPostIds, 6),
    relatedPortal: (Array.isArray(post.relatedPortal) ? post.relatedPortal : [])
      .map((item) => ({ titulo: text(item?.titulo), href: text(item?.href) }))
      .filter((item) => item.titulo && item.href)
      .slice(0, 6),
    seo: {
      title: text(seo.title).slice(0, 70),
      description: text(seo.description).slice(0, 170),
      image: text(seo.image),
    },
    updatedAt: text(post.updatedAt) || new Date(0).toISOString(),
  };
}

export function normalizePosts(posts = []) {
  const byId = new Map();
  for (const [index, post] of (Array.isArray(posts) ? posts : []).entries()) {
    const normalized = normalizePost(post, index);
    byId.set(normalized.id, normalized);
  }
  return [...byId.values()];
}

/* Tempo de leitura estimado: 200 palavras por minuto, contando todo texto dos blocos. */
export function estimateReadingMinutes(post = {}) {
  const partes = [post.title, post.subtitle, ...(post.content || []).flatMap((block) => [
    block.text, block.caption, block.cite, ...(block.items || []),
  ])];
  const palavras = partes.join(" ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(palavras / 200));
}

const descendingDate = (a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt));

export function placeBlogPosts(posts = []) {
  const published = normalizePosts(posts)
    .filter((post) => post.status === "published")
    .sort(descendingDate);
  const featured = published.find((post) => post.featured) || published[0] || null;
  const grid = published.filter((post) => post.id !== featured?.id);
  const categories = {};
  for (const post of published) categories[post.category] = (categories[post.category] || 0) + 1;
  return { featured, grid, recent: published.slice(0, 4), categories };
}
