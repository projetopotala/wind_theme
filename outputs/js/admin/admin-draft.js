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

/**
 * Traduz a falha do banco no que a pessoa precisa fazer a seguir.
 *
 * "Verifique a conexão e tente de novo" era a resposta para tudo. Quando a
 * causa era outra — a tabela de rascunhos nunca criada, ou uma conta sem
 * permissão de administrador — a mensagem mandava repetir uma ação que ia
 * falhar idêntica todas as vezes, e apontava a rede, que estava boa.
 *
 * O Postgres já diz o que houve, no `code`. O padrão de conexão continua, mas
 * como último recurso, e não como primeiro palpite.
 */
export function motivoDaFalha(erro) {
  const codigo = String(erro?.code || "");
  const texto = String(erro?.message || "");

  if (codigo === "PGRST202" || codigo === "PGRST204" || /editorial_variant|related_content|replace_home_blocks_editorial/i.test(texto)) {
    return "O banco ainda precisa da atualização da composição editorial. Seu conteúdo não foi publicado. Aplique a migração 202609100001_home_editorial_composition.";
  }

  /* 42P01 undefined_table, e o PGRST205 do PostgREST quando a tabela não está
     no cache de schema: na prática, a mesma migração faltando. */
  if (codigo === "42P01" || codigo === "PGRST205" || /home_block_drafts.*does not exist/i.test(texto)) {
    return "A tabela de rascunhos não existe neste banco: falta aplicar a migração home_block_drafts.";
  }

  /* 42703 undefined_column: a tabela existe, mas de uma versão anterior às
     colunas que o editor passou a gravar. */
  if (codigo === "42703") {
    return "O banco está numa versão anterior à do editor: falta aplicar a última migração.";
  }

  /* 42501 insufficient_privilege — inclui o que a RPC levanta quando
     `is_portal_admin()` diz não, que é o caso de uma conta sem permissão. */
  if (codigo === "42501" || /portal_admin_required/i.test(texto)) {
    return "Esta conta não tem permissão de administradora do portal.";
  }

  return "Verifique a conexão e tente de novo.";
}
