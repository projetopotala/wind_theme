import { normalizeHomeBlocks } from "./content-model.js";

export const LOCAL_CONTENT_KEY = "potala.home.blocks.v1";
export const LOCAL_DRAFTS_KEY = "potala.home.drafts.v1";

function cloneBlocks(blocks) {
  return blocks.map((block) => ({ ...block, tags: [...block.tags] }));
}

export function createLocalContentRepository({
  storage = globalThis.localStorage,
  defaults = [],
  key = LOCAL_CONTENT_KEY,
  draftsKey = LOCAL_DRAFTS_KEY,
} = {}) {
  const normalizedDefaults = normalizeHomeBlocks(defaults);
  let memory = null;
  /* Os rascunhos vivem numa chave separada pelo mesmo motivo da tabela espelho
     no banco: publicar tem de ser um passo distinto de gravar. */
  let draftMemory = null;

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

  function readDrafts() {
    if (draftMemory) return cloneBlocks(draftMemory);
    try {
      const serialized = storage?.getItem(draftsKey);
      if (!serialized) return [];
      draftMemory = normalizeHomeBlocks(JSON.parse(serialized)?.blocks);
      return cloneBlocks(draftMemory);
    } catch {
      return [];
    }
  }

  function writeDrafts(blocks) {
    draftMemory = blocks;
    try {
      storage?.setItem(draftsKey, JSON.stringify({ version: 1, blocks: cloneBlocks(blocks) }));
    } catch {
      // O painel continua utilizavel na aba mesmo com o armazenamento bloqueado.
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

    async listDrafts() {
      return readDrafts();
    },

    async saveDraft(block) {
      const [normalizado] = normalizeHomeBlocks([block]);
      if (!normalizado) throw new TypeError("Um bloco sem titulo nao pode ser gravado.");
      const atual = readDrafts().filter((item) => item.id !== normalizado.id);
      const proximo = { ...normalizado, position: Number(block?.position) || 0 };
      writeDrafts([...atual, proximo]);
      return proximo;
    },

    async discardDraft(id) {
      writeDrafts(readDrafts().filter((item) => item.id !== id));
    },

    async publishDrafts() {
      const rascunhos = readDrafts();
      const publicados = read().filter(
        (bloco) => !rascunhos.some((rascunho) => rascunho.id === bloco.id),
      );
      const juntos = normalizeHomeBlocks([...publicados, ...rascunhos]);
      memory = juntos;
      try {
        storage?.setItem(key, JSON.stringify({ version: 1, blocks: cloneBlocks(juntos) }));
      } catch {
        // Mesma tolerancia do replaceAll: a sessao atual continua correta.
      }
      writeDrafts([]);
      return cloneBlocks(juntos);
    },

    async reset() {
      memory = null;
      draftMemory = null;
      try {
        storage?.removeItem(key);
        storage?.removeItem(draftsKey);
      } catch {
        // O retorno aos padrões ainda vale para a sessão atual.
      }
      return cloneBlocks(normalizedDefaults);
    },
  };
}

