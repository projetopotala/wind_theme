// A ordem publicada pertence ao editor. Novidade é uma característica do
// conteúdo, não uma posição obrigatória na jornada.
export function composeEditorial(blocks = []) {
  return blocks.filter((block) => block.published !== false)
    .map((block, index) => ({ block, index }))
    .sort((a, b) => (a.block.position ?? a.index) - (b.block.position ?? b.index))
    .map(({ block }, position) => ({ ...block, position }));
}

export function relatedFor(block, blocks = [], discoveries = [], limit = 3) {
  const catalog = new Map([...discoveries, ...blocks].map((item) => [item.id, item]));
  const explicit = [...new Set(block.relatedContent || [])]
    .filter((id) => id !== block.id && catalog.has(id) && catalog.get(id).published !== false);
  if (block.relatedMode === "manual") return explicit.slice(0, limit);
  const normalize = (value) => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const tags = new Set((block.tags || []).map(normalize).filter((tag) => !/^(recente|recentes|novidade|novidades)$/.test(tag)));
  const suggestions = blocks.filter((item) => item.id !== block.id && item.published !== false && !explicit.includes(item.id))
    .map((item, index) => ({ item, index, score: (item.tags || []).filter((tag) => tags.has(normalize(tag))).length }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ item }) => item.id);
  return [...explicit, ...suggestions].slice(0, limit);
}
