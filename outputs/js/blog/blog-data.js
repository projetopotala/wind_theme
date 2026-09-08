/*
 * O ACERVO DO BLOG — fictício por enquanto.
 *
 * O documento do Ecossistema chama o Blog de "principal ambiente de produção
 * intelectual" e de "pensamento vivo do Potala". Nada disso se demonstra com
 * `lorem ipsum`: um layout provado com texto falso esconde justamente os
 * problemas que aparecem com texto de verdade — título que quebra em três
 * linhas, resumo que não cabe, categoria comprida que estoura a etiqueta.
 *
 * Então estes textos são inventados, mas do tamanho e do assunto que os reais
 * terão. Trocar por conteúdo do Supabase depois é trocar esta lista; o resto do
 * blog não sabe de onde os dados vêm.
 */

/*
 * As categorias saem do que o Instituto REALMENTE faz — o site no ar fala em
 * terapias, oráculos, cursos, cultura e práticas corporais — e não de uma lista
 * genérica de blog. "Oráculos" é a que mais destoa de qualquer outro portal, e
 * é exatamente por isso que ela fica.
 */
export const CATEGORIAS = [
  { id: "todos", rotulo: "tudo" },
  { id: "artigos", rotulo: "artigos" },
  { id: "oraculos", rotulo: "oráculos" },
  { id: "terapias", rotulo: "terapias" },
  { id: "cursos", rotulo: "cursos" },
  { id: "cultura", rotulo: "cultura" },
  { id: "praticas", rotulo: "práticas" },
];

/*
 * `motivo` escolhe o desenho abstrato da capa, e é um campo do POST, não um
 * sorteio na hora de desenhar.
 *
 * Sorteado, o mesmo artigo mudaria de capa a cada visita, e quem voltasse não
 * reconheceria o que já tinha lido. A capa é parte da identidade do texto.
 */
export const POSTS = [
  {
    id: "novos-profissionais",
    categoria: "artigos",
    motivo: "lotus",
    titulo: "Novos profissionais chegaram ao Instituto",
    resumo: "Sete terapeutas passam a atender no Potala neste mês, trazendo constelação familiar, "
      + "osteopatia, terapia floral e três abordagens que ainda não existiam na casa.",
    autor: "Redação Potala",
    data: "2026-09-02",
    leitura: 4,
    destaque: true,
    tags: ["profissionais", "atendimentos"],
  },
  {
    id: "oraculo-de-hoje",
    categoria: "oraculos",
    motivo: "oraculo",
    titulo: "Oráculo de hoje: a carta da Ponte",
    resumo: "A Ponte não fala de chegada, e sim da travessia. Ela aparece quando as duas margens "
      + "já são conhecidas e o que falta é atravessar.",
    autor: "Núcleo de Oráculos",
    data: "2026-09-04",
    leitura: 2,
    destaque: false,
    tags: ["oráculo", "tarô", "cafeomancia"],
  },
  {
    id: "borra-de-cafe",
    categoria: "oraculos",
    motivo: "circulo",
    titulo: "O que a borra de café ainda tem a dizer",
    resumo: "A cafeomancia não adivinha o futuro: ela organiza a pergunta. Um panorama de uma "
      + "prática antiga que segue lotando as rodas de quarta-feira.",
    autor: "Marina Alves",
    data: "2026-08-28",
    leitura: 7,
    destaque: false,
    tags: ["cafeomancia", "oráculo"],
  },
  {
    id: "ansiedade-corpo",
    categoria: "terapias",
    motivo: "fumaca",
    titulo: "Onde a ansiedade se instala no corpo",
    resumo: "Antes de virar pensamento, ela é mandíbula travada, respiração curta e ombro erguido. "
      + "Três terapeutas da casa descrevem o que veem chegar no consultório.",
    autor: "Equipe de Medicina Integrativa",
    data: "2026-08-25",
    leitura: 9,
    destaque: false,
    tags: ["ansiedade", "corpo", "respiração"],
  },
  {
    id: "curso-desenho",
    categoria: "cursos",
    motivo: "cristal",
    titulo: "Desenhar é aprender a olhar",
    resumo: "O curso de desenho do Instituto não começa pela mão. Começa por desmontar o que o "
      + "olho acha que está vendo — e as vagas da nova turma abrem na segunda.",
    autor: "Ateliê Potala",
    data: "2026-08-21",
    leitura: 5,
    destaque: false,
    tags: ["desenho", "percepção", "cursos"],
  },
  {
    id: "cinema-quinta",
    categoria: "cultura",
    motivo: "montanha",
    titulo: "O cinema de quinta volta em setembro",
    resumo: "Quatro sessões, quatro conversas depois da projeção. O ciclo deste mês reúne filmes "
      + "sobre memória, e a entrada continua sendo um alimento não perecível.",
    autor: "Centro Cultural",
    data: "2026-08-18",
    leitura: 3,
    destaque: false,
    tags: ["cinema", "programação"],
  },
  {
    id: "meditacao-inicio",
    categoria: "praticas",
    motivo: "semente",
    titulo: "Começar a meditar sem virar outra pessoa",
    resumo: "A pergunta mais frequente da Recepção não é como meditar, e sim por quanto tempo. "
      + "A resposta honesta desaponta um pouco: menos do que você imagina.",
    autor: "Grupo de Práticas",
    data: "2026-08-14",
    leitura: 6,
    destaque: false,
    tags: ["meditação", "rotina"],
  },
  {
    id: "sono-estacoes",
    categoria: "artigos",
    motivo: "onda",
    titulo: "O sono muda de estação, e a rotina não",
    resumo: "A Medicina Tradicional Chinesa organiza o ano em ciclos com exigências diferentes. "
      + "Dormir igual o ano inteiro é ignorar metade dessa conversa.",
    autor: "Lin Watanabe",
    data: "2026-08-09",
    leitura: 8,
    destaque: false,
    tags: ["sono", "MTC", "estações"],
  },
];

const CAPAS = {
  lotus: "media/home-travessia.webp",
  oraculo: "media/journey-inspiracao.webp",
  circulo: "media/chegada-landscape.webp",
  fumaca: "media/saude-integrativa-escuta.webp",
  cristal: "media/journey-quem-somos.webp",
  montanha: "media/journey-cultura.webp",
  semente: "media/atividades-pratica.webp",
  onda: "media/atendimentos-acolhimento.webp",
};

export const DEFAULT_BLOG_POSTS = POSTS.map((post) => ({
  id: post.id,
  slug: post.id,
  title: post.titulo,
  subtitle: post.destaque ? "Um convite para reencontrar o essencial." : "Ideias que acompanham a vida cotidiana.",
  excerpt: post.resumo,
  category: post.categoria,
  author: post.autor,
  publishedAt: post.data,
  readingMinutes: post.leitura,
  cover: CAPAS[post.motivo] || "media/home-travessia.webp",
  coverAlt: `Paisagem contemplativa que acompanha o texto ${post.titulo}`,
  featured: post.destaque,
  status: "published",
  content: [
    { id: `${post.id}-intro`, type: "paragraph", text: post.resumo },
    { id: `${post.id}-heading`, type: "heading", text: "Um caminho para observar" },
    { id: `${post.id}-body`, type: "paragraph", text: "Cada experiência pode ser lida por muitos ângulos. Este texto abre uma pausa para reconhecer o que já está presente e perceber possibilidades que antes passavam despercebidas." },
    { id: `${post.id}-quote`, type: "quote", text: "Conhecimento ganha sentido quando encontra a experiência." },
  ],
  relatedPostIds: POSTS.filter((candidate) => candidate.id !== post.id).slice(0, 2).map(({ id }) => id),
  updatedAt: `${post.data}T12:00:00.000Z`,
}));

/*
 * O ORÁCULO DO DIA.
 *
 * A mesma carta para todo mundo, no mesmo dia, e mudando à meia-noite. Um
 * sorteio a cada carregamento transformaria o oráculo num gerador aleatório:
 * quem recarregasse duas vezes veria a mecânica em vez da leitura, e a segunda
 * carta desmentiria a primeira.
 */
export const CARTAS = [
  { nome: "A Ponte", motivo: "ponte", verso: "As duas margens já são conhecidas. O que falta é atravessar." },
  { nome: "A Semente", motivo: "semente", verso: "O que foi plantado não pede pressa. Pede constância." },
  { nome: "O Espelho", motivo: "circulo", verso: "O que incomoda no outro costuma ter endereço mais perto." },
  { nome: "A Montanha", motivo: "montanha", verso: "Subir devagar ainda é subir. Parar no meio também é caminho." },
  { nome: "A Fumaça", motivo: "fumaca", verso: "Nem tudo que sobe precisa ser retido. Deixe passar." },
  { nome: "O Cristal", motivo: "cristal", verso: "A mesma luz, vista por outra face, conta outra coisa." },
  { nome: "O Lótus", motivo: "lotus", verso: "Ele nasce na água parada, e não apesar dela." },
];

/**
 * Escolhe a carta do dia a partir da DATA, e não do relógio nem do acaso.
 *
 * Recebe a data por parâmetro para poder ser testada: uma função que lesse
 * `new Date()` por dentro só poderia ser verificada no dia em que o teste roda.
 *
 * @param {Date} quando
 * @returns {{nome: string, motivo: string, verso: string}}
 */
export function cartaDoDia(quando = new Date()) {
  const data = quando instanceof Date && !Number.isNaN(quando.getTime()) ? quando : new Date(0);
  /* Dias inteiros desde a época, no fuso de quem lê: `getTime()` puro viraria
     de carta às 21h no horário de Brasília, que é meia-noite em Londres. */
  const dia = Math.floor(
    Date.UTC(data.getFullYear(), data.getMonth(), data.getDate()) / 86400000,
  );
  const indice = ((dia % CARTAS.length) + CARTAS.length) % CARTAS.length;
  return CARTAS[indice];
}

/**
 * Filtra por categoria. "todos" devolve tudo, e é o estado inicial.
 *
 * @param {Array} posts
 * @param {string} categoria
 */
export function filtrarPorCategoria(posts, categoria) {
  const lista = Array.isArray(posts) ? posts : [];
  if (!categoria || categoria === "todos") return [...lista];
  return lista.filter((post) => post.categoria === categoria);
}

/**
 * Quantos posts cada categoria tem, para a navegação poder desligar as vazias.
 *
 * Uma aba que abre uma lista vazia é pior do que uma aba ausente: quem clica
 * conclui que o blog quebrou, e não que ainda não há texto ali.
 */
export function contarPorCategoria(posts) {
  const contas = { todos: Array.isArray(posts) ? posts.length : 0 };
  for (const post of Array.isArray(posts) ? posts : []) {
    contas[post.categoria] = (contas[post.categoria] || 0) + 1;
  }
  return contas;
}

/**
 * A data como se lê em voz alta, e o valor legível por máquina junto.
 *
 * Devolve os dois porque o `<time>` precisa dos dois: `datetime` para quem
 * indexa e o texto para quem lê.
 */
export function dataLegivel(iso) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!partes) return { iso: "", texto: "" };
  const [, ano, mes, dia] = partes;
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return { iso, texto: `${Number(dia)} de ${MESES[Number(mes) - 1]} de ${ano}` };
}
