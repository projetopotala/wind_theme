/*
 * Páginas do Portal que o Owner pode editar visualmente, e como carregar o manifesto de cada uma.
 *
 * Só entra aqui o CONTEÚDO VISUAL de apresentação (títulos, textos, imagens e botões já presentes no HTML da
 * página). Cada manifesto é gerado a partir da página real e deixa de fora, por construção, tudo o que o
 * JavaScript da página monta com dados (listas de cursos, turmas, profissionais, artigos, preços, vagas…), os
 * formulários e os textos de estado. Botões ligados a fluxos do Portal têm o link travado (`fixo: ["href"]`).
 *
 * Ficam fora do editor, de propósito: Meu Potala, Admin, Blog (artigos individuais), Sala de atendimento,
 * confirmação de conta/redefinição de senha e páginas legais. A Travessia é montada pela Jornada (módulo próprio
 * da Central), então aqui ela só aponta para lá em vez de duplicar a edição.
 */
export const PAGINAS_EDITAVEIS = Object.freeze([
  Object.freeze({ slug: "pagina-inicial", arquivo: "transcender.html", titulo: "Página inicial (chegada)" }),
  Object.freeze({ slug: "quem-somos", arquivo: "quem-somos.html", titulo: "Quem somos" }),
  Object.freeze({ slug: "atendimentos", arquivo: "atendimentos.html", titulo: "Atendimentos" }),
  Object.freeze({ slug: "cursos", arquivo: "cursos.html", titulo: "Cursos" }),
  Object.freeze({ slug: "eventos", arquivo: "eventos.html", titulo: "Eventos" }),
  Object.freeze({ slug: "blog", arquivo: "blog.html", titulo: "Blog (apresentação)" }),
  Object.freeze({ slug: "marketplace", arquivo: "marketplace.html", titulo: "Loja (apresentação)" }),
  Object.freeze({ slug: "mentorias", arquivo: "mentorias.html", titulo: "Mentorias" }),
  Object.freeze({ slug: "workshops", arquivo: "workshops.html", titulo: "Workshops" }),
  Object.freeze({ slug: "grupos-de-estudo", arquivo: "grupos-de-estudo.html", titulo: "Grupos de estudo" }),
  Object.freeze({ slug: "programacao", arquivo: "programacao.html", titulo: "Programação" }),
  Object.freeze({ slug: "atividades", arquivo: "atividades.html", titulo: "Atividades" }),
  Object.freeze({ slug: "profissionais", arquivo: "profissionais.html", titulo: "Profissionais" }),
  Object.freeze({ slug: "especialistas", arquivo: "especialistas.html", titulo: "Especialistas" }),
  Object.freeze({ slug: "recepcao", arquivo: "recepcao.html", titulo: "Recepção" }),
  Object.freeze({ slug: "saude-integrativa", arquivo: "saude-integrativa.html", titulo: "Saúde Integrativa" }),
  Object.freeze({ slug: "inspiracao", arquivo: "inspiracao.html", titulo: "Inspiração" }),
  Object.freeze({ slug: "cultura", arquivo: "cultura.html", titulo: "Cultura" }),
  Object.freeze({ slug: "experiencias-culturais", arquivo: "experiencias-culturais.html", titulo: "Experiências culturais" }),
  Object.freeze({ slug: "revista", arquivo: "revista.html", titulo: "Revista" }),
]);

/** Páginas cujo conteúdo já é administrado por outro módulo da Central: o editor só indica o caminho. */
export const PAGINAS_EM_OUTRO_MODULO = Object.freeze([
  Object.freeze({ slug: "travessia", titulo: "A Travessia", secaoAdmin: "jornada", modulo: "Jornada" }),
]);

/** Páginas públicas do Portal que um botão pode apontar (validação do destino de links internos). */
export const DESTINOS_DO_PORTAL = Object.freeze({
  "index.html": "Início", "transcender.html": "Página inicial (chegada)", "travessia.html": "A Travessia",
  "quem-somos.html": "Quem somos", "saude-integrativa.html": "Saúde Integrativa", "inspiracao.html": "Inspiração",
  "cultura.html": "Cultura", "recepcao.html": "Recepção", "atendimentos.html": "Atendimentos", "cursos.html": "Cursos",
  "eventos.html": "Eventos", "workshops.html": "Workshops", "programacao.html": "Programação",
  "grupos-de-estudo.html": "Grupos de estudo", "mentorias.html": "Mentorias", "especialistas.html": "Especialistas",
  "profissionais.html": "Profissionais", "revista.html": "Revista", "palacio.html": "Palácio",
  "experiencias-culturais.html": "Experiências culturais", "marketplace.html": "Marketplace",
  "atividades.html": "Atividades", "blog.html": "Blog",
});

const SLUGS = new Set(PAGINAS_EDITAVEIS.map((pagina) => pagina.slug));

export function paginaPorSlug(slug) {
  return PAGINAS_EDITAVEIS.find((pagina) => pagina.slug === slug) || null;
}

export function paginaEmOutroModulo(slug) {
  return PAGINAS_EM_OUTRO_MODULO.find((pagina) => pagina.slug === slug) || null;
}

/** Importa o manifesto só da página pedida (a página pública nunca carrega o das outras). */
export async function carregarManifesto(slug) {
  if (!SLUGS.has(slug)) throw new RangeError("Página não editável.");
  return (await import(`./manifesto/${slug}.js`)).default;
}
