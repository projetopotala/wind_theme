export function mergeRequiredDefaultSections(blocks, defaults, requiredIds = []) {
  const result = Array.isArray(blocks) ? [...blocks] : [];
  const canonical = Array.isArray(defaults) ? defaults : [];
  const required = new Set(requiredIds);
  const present = new Set(result.map((item) => item?.id).filter(Boolean));

  for (const fallback of canonical) {
    if (!required.has(fallback?.id) || present.has(fallback.id)) continue;

    const canonicalIndex = canonical.findIndex((item) => item?.id === fallback.id);
    const next = canonical.slice(canonicalIndex + 1).find((item) => present.has(item?.id));
    if (next) result.splice(result.findIndex((item) => item?.id === next.id), 0, fallback);
    else result.push(fallback);
    present.add(fallback.id);
  }

  return result.map((item, position) => ({ ...item, position }));
}

export function withRequiredDefaultSections(repository, defaults, requiredIds = []) {
  if (!repository?.list) throw new TypeError("O repositório precisa oferecer list().");

  const bridged = {};
  for (const [key, value] of Object.entries(repository)) {
    bridged[key] = typeof value === "function" ? value.bind(repository) : value;
  }
  bridged.list = async (options) => mergeRequiredDefaultSections(
    await repository.list(options),
    defaults,
    requiredIds,
  );
  return bridged;
}
