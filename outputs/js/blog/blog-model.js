export const BLOG_BLOCK_TYPES = Object.freeze([
  "paragraph",
  "heading",
  "image",
  "quote",
  "list",
  "divider",
]);

const TYPE_SET = new Set(BLOG_BLOCK_TYPES);
const text = (value) => String(value ?? "").trim();

export function slugifyBlogTitle(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "novo-texto";
}

function normalizeBlock(block = {}, index = 0, postId = "post") {
  const type = text(block.type);
  if (!TYPE_SET.has(type)) return null;
  const normalized = { id: text(block.id) || `${postId}-block-${index + 1}`, type };

  if (["paragraph", "heading", "quote"].includes(type)) {
    normalized.text = text(block.text);
  } else if (type === "image") {
    normalized.src = text(block.src);
    normalized.alt = text(block.alt);
    normalized.caption = text(block.caption);
  } else if (type === "list") {
    normalized.items = (Array.isArray(block.items) ? block.items : [])
      .map(text)
      .filter(Boolean);
  }
  return normalized;
}

export function normalizePost(post = {}, index = 0) {
  const title = text(post.title || post.titulo) || "Novo texto";
  const id = text(post.id) || `post-${index + 1}`;
  const legacyPublished = post.published === false ? "hidden" : "published";
  const status = ["draft", "published", "hidden"].includes(post.status)
    ? post.status
    : legacyPublished;
  const category = text(post.category || post.categoria) || "reflexao";
  const rawContent = Array.isArray(post.content) ? post.content : [];

  return {
    id,
    slug: slugifyBlogTitle(post.slug || title),
    title,
    subtitle: text(post.subtitle),
    excerpt: text(post.excerpt || post.resumo),
    category,
    author: text(post.author || post.autor) || "Instituto Potala",
    publishedAt: text(post.publishedAt || post.data),
    readingMinutes: Math.max(1, Number(post.readingMinutes || post.leitura) || 1),
    cover: text(post.cover),
    coverAlt: text(post.coverAlt),
    featured: Boolean(post.featured ?? post.destaque),
    status,
    content: rawContent
      .map((block, blockIndex) => normalizeBlock(block, blockIndex, id))
      .filter(Boolean),
    relatedPostIds: (Array.isArray(post.relatedPostIds) ? post.relatedPostIds : [])
      .map(text)
      .filter(Boolean),
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
