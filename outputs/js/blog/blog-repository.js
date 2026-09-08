import { normalizePost, normalizePosts } from "./blog-model.js";

export const BLOG_STORAGE_KEY = "potala.blog.frontend.v1";

const clone = (value) => JSON.parse(JSON.stringify(value));

export function createBlogRepository({
  storage = globalThis.localStorage,
  defaults = [],
  key = BLOG_STORAGE_KEY,
} = {}) {
  const fallback = normalizePosts(defaults);

  function read() {
    try {
      const raw = storage?.getItem?.(key);
      if (raw) return normalizePosts(JSON.parse(raw));
    } catch {
      // Dados locais corrompidos não impedem a leitura do acervo empacotado.
    }
    return clone(fallback);
  }

  function write(posts) {
    const normalized = normalizePosts(posts);
    storage?.setItem?.(key, JSON.stringify(normalized));
    return clone(normalized);
  }

  return {
    list() { return read(); },
    save(post) {
      const posts = read();
      const normalized = normalizePost(post, posts.length);
      if (normalized.featured) posts.forEach((item) => { item.featured = false; });
      const index = posts.findIndex(({ id }) => id === normalized.id);
      if (index >= 0) posts[index] = normalized;
      else posts.push(normalized);
      return write(posts).find(({ id }) => id === normalized.id);
    },
    remove(id) {
      return write(read().filter((post) => post.id !== id));
    },
    replace(posts) { return write(posts); },
    reset() {
      storage?.removeItem?.(key);
      return clone(fallback);
    },
  };
}
