/*
 * Os três estados de um bloco, e o que "Publicar alterações" leva.
 *
 * Sem DOM e sem rede, de propósito: é a lógica que decide o que o editor
 * acredita estar no ar, e errar aqui não aparece na tela — aparece depois, com
 * alguém publicando o que não queria.
 */

/**
 * @returns {"rascunho"|"publicado"|"pendente"}
 */
export function blockState({ published = null, draft = null } = {}) {
  if (draft && published) return "pendente";
  if (draft) return "rascunho";
  /* Publicado com "Exibir na jornada" desligado é invisível para quem visita,
     e chamar isso de publicado seria mentir para quem edita. */
  if (published) return published.published === false ? "rascunho" : "publicado";
  return "rascunho";
}

/**
 * Junta a lista publicada com a de rascunhos numa lista só.
 *
 * O rascunho ganha do publicado em `block`, porque é ele que o editor está
 * escrevendo — a lista precisa mostrar o que a pessoa acabou de digitar, não a
 * versão que está no ar.
 */
export function mergeBlocks({ published = [], drafts = [] } = {}) {
  const porId = new Map();

  for (const bloco of published) {
    if (bloco?.id) porId.set(bloco.id, { id: bloco.id, published: bloco, draft: null });
  }
  for (const bloco of drafts) {
    if (!bloco?.id) continue;
    const atual = porId.get(bloco.id) || { id: bloco.id, published: null, draft: null };
    porId.set(bloco.id, { ...atual, draft: bloco });
  }

  return [...porId.values()]
    .map(({ id, published: publicado, draft }) => ({
      id,
      block: draft || publicado,
      state: blockState({ published: publicado, draft }),
      hasDraft: Boolean(draft),
    }))
    /* Duas posições iguais acontecem: o painel grava a posição ao reordenar, e
       um rascunho salvo antes disso carrega a antiga. Sem desempate, a ordem da
       lista mudaria entre dois carregamentos sem nada ter mudado. */
    .sort((esquerda, direita) => {
      const a = Number(esquerda.block?.position ?? 0);
      const b = Number(direita.block?.position ?? 0);
      return a === b ? esquerda.id.localeCompare(direita.id) : a - b;
    });
}

export function pendingCount(entries = []) {
  return entries.filter((entrada) => entrada.hasDraft).length;
}

export function publishPayload(entries = []) {
  return entries.filter((entrada) => entrada.hasDraft).map((entrada) => entrada.block);
}
