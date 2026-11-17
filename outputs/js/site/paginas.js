/*
 * Páginas institucionais que o Owner pode editar visualmente, e como carregar o manifesto de cada uma.
 *
 * Só entra aqui página estática e institucional, cujo conteúdo é HTML do próprio Portal. Ficam de fora (e de
 * propósito): Home (Jornada tem editor próprio), Travessia (montada por JavaScript), Atendimentos, Cursos,
 * Blog, Marketplace e Meu Potala (áreas transacionais), e as páginas legais.
 */
export const PAGINAS_EDITAVEIS = Object.freeze([
  Object.freeze({ slug: "quem-somos", arquivo: "quem-somos.html", titulo: "Quem somos" }),
  Object.freeze({ slug: "saude-integrativa", arquivo: "saude-integrativa.html", titulo: "Saúde Integrativa" }),
  Object.freeze({ slug: "inspiracao", arquivo: "inspiracao.html", titulo: "Inspiração" }),
  Object.freeze({ slug: "cultura", arquivo: "cultura.html", titulo: "Cultura" }),
]);

/** Páginas públicas do Portal que um botão pode apontar (validação do destino de links internos). */
export const DESTINOS_DO_PORTAL = Object.freeze({
  "index.html": "Início", "travessia.html": "A Travessia", "quem-somos.html": "Quem somos",
  "saude-integrativa.html": "Saúde Integrativa", "inspiracao.html": "Inspiração", "cultura.html": "Cultura",
  "recepcao.html": "Recepção", "atendimentos.html": "Atendimentos", "cursos.html": "Cursos",
  "eventos.html": "Eventos", "workshops.html": "Workshops", "programacao.html": "Programação",
  "grupos-de-estudo.html": "Grupos de estudo", "mentorias.html": "Mentorias", "especialistas.html": "Especialistas",
  "profissionais.html": "Profissionais", "revista.html": "Revista", "palacio.html": "Palácio",
  "experiencias-culturais.html": "Experiências culturais", "marketplace.html": "Marketplace",
});

const SLUGS = new Set(PAGINAS_EDITAVEIS.map((pagina) => pagina.slug));

export function paginaPorSlug(slug) {
  return PAGINAS_EDITAVEIS.find((pagina) => pagina.slug === slug) || null;
}

/** Importa o manifesto só da página pedida (a página pública nunca carrega o das outras). */
export async function carregarManifesto(slug) {
  if (!SLUGS.has(slug)) throw new RangeError("Página não editável.");
  return (await import(`./manifesto/${slug}.js`)).default;
}
