import { normalizeHomeBlocks } from "./content-model.js";

export const LOCAL_CONTENT_KEY = "potala.home.blocks.v1";

function cloneBlocks(blocks) {
  return blocks.map((block) => ({ ...block, tags: [...block.tags] }));
}

export function createLocalContentRepository({
  storage = globalThis.localStorage,
  defaults = [],
  key = LOCAL_CONTENT_KEY,
} = {}) {
  const normalizedDefaults = normalizeHomeBlocks(defaults);
  let memory = null;

  function read() {
    if (memory) return cloneBlocks(memory);

    try {
      const serialized = storage?.getItem(key);
      if (!serialized) return cloneBlocks(normalizedDefaults);
      const payload = JSON.parse(serialized);
      const blocks = normalizeHomeBlocks(Array.isArray(payload) ? payload : payload?.blocks);
      if (!blocks.length && normalizedDefaults.length) return cloneBlocks(normalizedDefaults);
      memory = blocks;
      return cloneBlocks(memory);
    } catch {
      return cloneBlocks(normalizedDefaults);
    }
  }

  return {
    async list({ publishedOnly = false } = {}) {
      const blocks = read();
      return publishedOnly ? blocks.filter((block) => block.published) : blocks;
    },

    async replaceAll(blocks) {
      memory = normalizeHomeBlocks(blocks);
      const snapshot = cloneBlocks(memory);
      try {
        storage?.setItem(key, JSON.stringify({ version: 1, blocks: snapshot }));
      } catch {
        // A prévia continua utilizável na aba mesmo quando o armazenamento é bloqueado.
      }
      return cloneBlocks(snapshot);
    },

    async reset() {
      memory = null;
      try {
        storage?.removeItem(key);
      } catch {
        // O retorno aos padrões ainda vale para a sessão atual.
      }
      return cloneBlocks(normalizedDefaults);
    },
  };
}

