const HOME_BLOCK_SIDES = new Set(["left", "right"]);

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function slugify(value) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeTags(value) {
  const source = Array.isArray(value) ? value : cleanString(value).split(",");
  return [...new Set(source.map(cleanString).filter(Boolean))];
}

export function normalizeHomeBlock(input = {}, index = 0) {
  const title = cleanString(input.title);
  if (!title) return null;

  const sourceId = cleanString(input.id) || cleanString(input.slug) || title;
  const slug = slugify(cleanString(input.slug) || sourceId || title) || `bloco-${index + 1}`;
  const id = slugify(sourceId) || slug;
  const position = Number.isFinite(Number(input.position)) ? Number(input.position) : index;
  const side = HOME_BLOCK_SIDES.has(input.side)
    ? input.side
    : index % 2 === 0 ? "left" : "right";

  return {
    id,
    slug,
    category: cleanString(input.category),
    title,
    summary: cleanString(input.summary ?? input.description),
    body: cleanString(input.body ?? input.summary ?? input.description),
    image: cleanString(input.image ?? input.media),
    icon: cleanString(input.icon),
    tags: normalizeTags(input.tags),
    href: cleanString(input.href) || "#",
    side,
    position,
    published: input.published !== false,
    /* Só o que o CSS da Home entende. Um valor inventado no banco viraria um
       data-attribute desconhecido, e o titulo perderia escala sem aviso. */
    titleScale: input.titleScale === "compact" ? "compact" : "normal",
    allowPanel: input.allowPanel !== false,
    metaDescription: cleanString(input.metaDescription),
    updatedAt: cleanString(input.updatedAt),
  };
}

export function normalizeHomeBlocks(input = []) {
  if (!Array.isArray(input)) return [];

  return input
    .map((candidate, index) => ({
      block: normalizeHomeBlock(candidate, index),
      hasExplicitSide: HOME_BLOCK_SIDES.has(candidate?.side),
    }))
    .filter(({ block }) => Boolean(block))
    .sort((left, right) => left.block.position - right.block.position)
    .map(({ block, hasExplicitSide }, position) => ({
      ...block,
      tags: [...block.tags],
      position,
      side: hasExplicitSide ? block.side : position % 2 === 0 ? "left" : "right",
    }));
}

