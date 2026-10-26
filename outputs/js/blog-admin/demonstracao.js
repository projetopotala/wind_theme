/*
 * OS TEXTOS DO "ACESSO DE TESTE" DA MESA.
 *
 * A demonstração roda no navegador de quem abre /blog, sem conta. Ela não usa
 * textos do Blog real: uma página pública não pode entregar o acervo, e um
 * texto que a equipe tirou do ar não pode voltar por aqui. São três textos
 * inventados, marcados como demonstração, em três situações diferentes.
 */
export const CHAVE_DA_DEMONSTRACAO = "potala.blog.demonstracao.v2";
/* A chave antiga guardava uma cópia do acervo empacotado; é apagada ao entrar. */
export const CHAVE_ANTIGA = "potala.blog.frontend.v1";

const capa = "media/blog-hero-caminhante.webp";
const texto = (id, frases) => frases.map((frase, i) => ({ id: `${id}-${i + 1}`, type: "paragraph", text: frase }));

export const TEXTOS_DE_DEMONSTRACAO = Object.freeze([
  {
    id: "demonstracao-publicado",
    slug: "demonstracao-publicado",
    title: "Texto de demonstração (publicado)",
    excerpt: "Exemplo para conhecer a mesa. Não existe no Blog real.",
    category: "artigos",
    author: "Demonstração",
    publishedAt: "2026-10-01",
    cover: capa,
    coverAlt: "Imagem de exemplo",
    status: "published",
    content: texto("demonstracao-publicado", ["Este texto é só um exemplo. Experimente editar, tirar do ar ou arquivar: nada muda no Blog real."]),
  },
  {
    id: "demonstracao-revisao",
    slug: "demonstracao-revisao",
    title: "Texto de demonstração (em revisão)",
    excerpt: "Exemplo de texto aguardando revisão.",
    category: "praticas",
    author: "Demonstração",
    publishedAt: "2026-10-02",
    cover: capa,
    coverAlt: "Imagem de exemplo",
    status: "review",
    content: texto("demonstracao-revisao", ["Um texto em revisão ainda não aparece no Blog. Publique-o aqui para ver o caminho completo."]),
  },
  {
    id: "demonstracao-rascunho",
    slug: "demonstracao-rascunho",
    title: "Texto de demonstração (rascunho)",
    excerpt: "Exemplo de rascunho.",
    category: "cultura",
    author: "Demonstração",
    publishedAt: "2026-10-03",
    cover: capa,
    coverAlt: "Imagem de exemplo",
    status: "draft",
    content: texto("demonstracao-rascunho", ["Rascunhos ficam só na mesa."]),
  },
]);
