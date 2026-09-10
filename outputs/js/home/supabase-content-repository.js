import { normalizeHomeBlock, normalizeHomeBlocks } from "./content-model.js";

/*
 * Todas as colunas, e não uma lista explícita.
 *
 * A lista explícita quebra contra um banco que ainda não recebeu a migração:
 * pedir `title_scale` onde a coluna não existe faz o Postgres recusar o SELECT
 * INTEIRO, e o painel abre sem nenhum bloco — inclusive os que estão lá desde
 * sempre. Com `*`, uma coluna que ainda não chegou simplesmente não vem, e
 * `normalizeHomeBlock` põe o padrão dela.
 *
 * A tabela é conteúdo público de ponta a ponta — `anon` já tem select nela —
 * então não há coluna que a lista explícita estivesse protegendo.
 */
const HOME_BLOCK_COLUMNS = "*";

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
  return normalizeHomeBlock({
    ...row,
    updatedAt: row.updated_at,
    titleScale: row.title_scale,
    allowPanel: row.allow_panel,
    metaDescription: row.meta_description,
    editorialVariant: row.editorial_variant,
    relatedMode: row.related_mode,
    relatedContent: row.related_content,
  }, index);
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
    title_scale: normalized.titleScale,
    allow_panel: normalized.allowPanel,
    meta_description: normalized.metaDescription,
    editorial_variant: normalized.editorialVariant,
    related_mode: normalized.relatedMode,
    related_content: normalized.relatedContent,
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
    const { data, error } = await client.rpc("replace_home_blocks_editorial", { payload });
    throwIfError("replaceAll", error);
    return rowsToBlocks(data || []);
  }

  /*
   * As quatro operações de rascunho.
   *
   * Todas nomeiam "home_block_drafts" explicitamente. Um erro de tabela aqui
   * gravaria texto inacabado direto no site, e nada na tela do editor diria
   * que isso aconteceu.
   */
  async function listDrafts() {
    const { data, error } = await client
      .from("home_block_drafts")
      .select(HOME_BLOCK_COLUMNS)
      .order("position", { ascending: true });
    throwIfError("listDrafts", error);
    return rowsToBlocks(data || []);
  }

  async function saveDraft(block) {
    const linha = homeBlockToDatabase(block, Number(block?.position) || 0);
    if (!linha) {
      throw new SupabaseContentError("saveDraft", {
        message: "Um bloco sem titulo nao pode ser gravado.",
      });
    }
    const { data, error } = await client
      .from("home_block_drafts")
      .upsert(linha)
      .select()
      .single();
    throwIfError("saveDraft", error);
    return homeBlockFromDatabase(data || linha, linha.position);
  }

  async function discardDraft(id) {
    const { error } = await client.from("home_block_drafts").delete().eq("id", id);
    throwIfError("discardDraft", error);
  }

  async function publishDrafts() {
    const { data, error } = await client.rpc("publish_home_block_drafts");
    throwIfError("publishDrafts", error);
    return rowsToBlocks(data || []);
  }

  return {
    list,
    replaceAll,
    listDrafts,
    saveDraft,
    discardDraft,
    publishDrafts,
    reset() {
      return replaceAll(normalizedDefaults);
    },
  };
}
