import { normalizeHomeBlock, normalizeHomeBlocks } from "./content-model.js";

const HOME_BLOCK_COLUMNS = [
  "id", "slug", "category", "title", "summary", "body", "image", "icon",
  "tags", "href", "side", "position", "published", "updated_at",
].join(",");

export class SupabaseContentError extends Error {
  constructor(operation, cause = {}) {
    super(cause.message || `Falha ao executar ${operation} no Supabase.`);
    this.name = "SupabaseContentError";
    this.operation = operation;
    this.code = cause.code || "SUPABASE_CONTENT_ERROR";
    this.cause = cause;
  }
}

function throwIfError(operation, error) {
  if (error) throw new SupabaseContentError(operation, error);
}

export function homeBlockFromDatabase(row = {}, index = 0) {
  return normalizeHomeBlock({ ...row, updatedAt: row.updated_at }, index);
}

export function homeBlockToDatabase(block = {}, index = 0) {
  const normalized = normalizeHomeBlock(block, index);
  if (!normalized) return null;
  return {
    id: normalized.id,
    slug: normalized.slug,
    category: normalized.category,
    title: normalized.title,
    summary: normalized.summary,
    body: normalized.body,
    image: normalized.image,
    icon: normalized.icon,
    tags: [...normalized.tags],
    href: normalized.href,
    side: normalized.side,
    position: normalized.position,
    published: normalized.published,
    updated_at: normalized.updatedAt || new Date().toISOString(),
  };
}

function rowsToBlocks(rows = []) {
  return normalizeHomeBlocks(rows.map(homeBlockFromDatabase).filter(Boolean));
}

export function createSupabaseContentRepository({ client, defaults = [] } = {}) {
  if (!client?.from || !client?.rpc) {
    throw new TypeError("Um cliente Supabase válido é obrigatório.");
  }
  const normalizedDefaults = normalizeHomeBlocks(defaults);

  async function list({ publishedOnly = false } = {}) {
    let query = client
      .from("home_blocks")
      .select(HOME_BLOCK_COLUMNS);
    if (publishedOnly) query = query.eq("published", true);
    query = query.order("position", { ascending: true });
    const { data, error } = await query;
    throwIfError("list", error);
    return rowsToBlocks(data || []);
  }

  async function replaceAll(blocks) {
    const payload = normalizeHomeBlocks(blocks)
      .map(homeBlockToDatabase)
      .filter(Boolean);
    const { data, error } = await client.rpc("replace_home_blocks", { payload });
    throwIfError("replaceAll", error);
    return rowsToBlocks(data || []);
  }

  return {
    list,
    replaceAll,
    reset() {
      return replaceAll(normalizedDefaults);
    },
  };
}
