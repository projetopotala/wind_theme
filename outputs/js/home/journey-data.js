import { normalizeHomeBlocks } from "./content-model.js";

export const JOURNEY_REGIONS = [
  {
    id: "quem-somos",
    type: "region",
    category: "A entrada",
    title: "Quem somos",
    description: "Um instituto feito de pessoas, histórias e muitos modos de cuidar.",
    media: "media/journey-quem-somos.webp",
    alt: "Pavilhão de pedra entre uma árvore antiga e montanhas ao amanhecer",
    href: "quem-somos.html",
    priority: 100,
    tags: ["história", "propósito", "comunidade"],
    relatedContent: ["recepcao", "acao-social", "revista"],
    layoutVariant: "landscape-manifesto",
    roadPlacement: "right",
  },
  {
    /*
     * A Recepção fica ao LADO de "Quem somos", e é por isso que ela vem logo
     * depois na lista: o lado de cada bloco nasce da posição (par à esquerda,
     * ímpar à direita), e os pares se formam de dois em dois na mesma ordem.
     * Mudar a ordem aqui muda com quem ela divide a passagem.
     *
     * O destino é a página própria da Recepção, que passou a existir.
     */
    id: "recepcao",
    type: "region",
    category: "O primeiro contato",
    title: "Recepção",
    description: "Comece com uma conversa: um primeiro contato para entender possibilidades sem escolher sozinho.",
    media: "media/journey-cuidado.webp",
    alt: "Abrigo acolhedor aberto para um lago e montanhas cobertas por névoa",
    href: "recepcao.html",
    priority: 96,
    tags: ["acolhimento", "escuta", "primeiro contato"],
    relatedContent: ["atendimentos", "profissionais"],
    layoutVariant: "editorial-right",
    roadPlacement: "left",
  },
  {
    id: "atendimentos",
    type: "region",
    category: "O cuidado",
    title: "Atendimentos",
    description: "Cada pessoa chega com uma história diferente. O acolhimento vem antes da escolha de qualquer caminho.",
    media: "media/journey-cuidado.webp",
    alt: "Abrigo acolhedor aberto para um lago e montanhas cobertas por névoa",
    href: "atendimentos.html",
    priority: 92,
    tags: ["acolhimento", "terapias", "orientação"],
    relatedContent: ["recepcao", "saude-integrativa", "sono-reflexao"],
    layoutVariant: "editorial-right",
    roadPlacement: "left",
    lateral: {
      left: ["recepcao", "atendimento-online"],
      right: ["saude-integrativa", "sono-reflexao"],
    },
  },
  {
    id: "cursos",
    type: "region",
    category: "O conhecimento",
    title: "Cursos",
    description: "Cuidar também é aprender: conhecimento e prática se encontram para abrir novas possibilidades.",
    media: "media/journey-quem-somos.webp",
    alt: "Pavilhão silencioso em uma paisagem de montanha iluminada",
    href: "cursos.html",
    priority: 86,
    tags: ["formações", "oficinas", "estudo"],
    relatedContent: ["revista", "blog", "sono-reflexao"],
    layoutVariant: "type-ledger",
    roadPlacement: "bottom",
  },
  {
    id: "atividades",
    type: "region",
    category: "O movimento",
    title: "Atividades",
    description: "Conhecimento também precisa ser vivido no corpo, na criação e na convivência.",
    media: "media/journey-cuidado.webp",
    alt: "Espaço aberto de madeira e pedra voltado para a natureza",
    href: "atividades.html",
    priority: 82,
    tags: ["yoga", "tai chi", "arte e movimento"],
    relatedContent: ["programacao", "arte-cultura", "saude-integrativa"],
    layoutVariant: "open-field",
    roadPlacement: "right",
    // A estrada cruza esta região na horizontal, então a informação larga fica
    // acima dela: encostada à esquerda sobrava um vazio de meia tela à direita.
    contentPlacement: "center",
  },
  {
    id: "profissionais",
    type: "region",
    category: "As pessoas",
    title: "Profissionais",
    description: "Trajetórias diferentes, reunidas pelo compromisso de escutar e acompanhar.",
    media: "media/journey-cuidado.webp",
    alt: "Duas poltronas em um abrigo sereno diante das montanhas",
    href: "profissionais.html",
    priority: 78,
    tags: ["trajetórias", "especialidades", "presença"],
    relatedContent: ["atendimentos", "recepcao", "novos-profissionais"],
    layoutVariant: "portrait-editorial",
    roadPlacement: "left",
    contentPlacement: "center",
    lateral: {
      left: ["recepcao", "atendimentos"],
      right: ["novos-profissionais", "programacao"],
    },
  },
  {
    id: "programacao",
    type: "region",
    category: "O Potala está vivo",
    title: "Programação",
    description: "Atendimentos, cursos, vivências e atividades formam uma agenda em movimento.",
    media: "media/journey-cultura.webp",
    alt: "Pavilhão cultural com pequenas lanternas acesas ao entardecer",
    href: "programacao.html",
    priority: 94,
    tags: ["agenda", "encontros", "experiências"],
    relatedContent: ["eventos", "atividades", "arte-cultura"],
    layoutVariant: "live-ribbon",
    roadPlacement: "top",
  },
  {
    id: "arte-cultura",
    type: "region",
    category: "O encontro",
    title: "Arte e cultura",
    description: "Cinema, música, livros, conversa e criação ampliam o modo como encontramos o mundo.",
    media: "media/journey-cultura.webp",
    alt: "Pavilhão artístico entre luzes quentes e uma paisagem azul de montanha",
    href: "cultura.html",
    priority: 74,
    tags: ["cinema", "música", "literatura"],
    relatedContent: ["revista", "eventos", "acao-social"],
    layoutVariant: "cinematic-left",
    roadPlacement: "right",
  },
  {
    id: "marketplace",
    type: "region",
    category: "A loja",
    title: "Marketplace",
    description: "Cristais, incensos, livros e óleos essenciais — o que a casa reúne para levar junto.",
    // `media` reaproveita o mesmo placeholder de "programacao" e
    // "arte-cultura" (não existe asset próprio do marketplace ainda); o `alt`
    // precisa descrever essa mesma imagem, não uma prateleira de loja que ela
    // não mostra — o campo `media` não é renderizado hoje, mas o par não pode
    // mentir sobre o que a imagem realmente é.
    media: "media/journey-cultura.webp",
    alt: "Pavilhão com mesas de produtos artesanais dispostas ao entardecer",
    href: "marketplace.html",
    priority: 74,
    tags: ["cristais", "incensos", "livros"],
    relatedContent: ["loja", "arte-cultura"],
    layoutVariant: "shelf-editorial",
    roadPlacement: "left",
  },
  {
    id: "inspiracao",
    type: "region",
    category: "Uma pausa",
    title: "Inspiração",
    description: "Nem todo encontro precisa pedir uma decisão. Alguns apenas devolvem espaço.",
    media: "media/journey-inspiracao.webp",
    alt: "Caminho de pedras ao lado de água calma e montanhas cobertas por névoa",
    href: "inspiracao.html",
    priority: 70,
    tags: ["reflexões", "meditação", "silêncio"],
    relatedContent: ["sono-reflexao", "blog", "revista"],
    layoutVariant: "quiet-fullscreen",
    roadPlacement: "left",
  },
  /*
   * O BLOG ERA UMA DESCOBERTA, e virou região.
   *
   * Enquanto não existia página, ele era um cartãozinho editorial apontando
   * para o site antigo — o suficiente para as relações o citarem. Agora que
   * `blog.html` existe, ele precisa ficar ONDE AS OUTRAS SEÇÕES FICAM: um bloco
   * da jornada, uma linha no menu lateral, e uma entrada no painel admin.
   *
   * Promovido em vez de duplicado. Um `id: "blog"` como descoberta E como
   * região colidiria no mapa de relações — que resolve descobertas por último,
   * e portanto faria as relações mostrarem o cartão antigo, apontando para o
   * site velho, enquanto a jornada mostrava o novo.
   */
  {
    id: "blog",
    type: "region",
    category: "O pensamento vivo",
    title: "Blog",
    description: "O que os profissionais da casa escrevem quando param para pensar em voz alta.",
    href: "blog.html",
    priority: 65,
    tags: ["artigos", "oráculos", "colunas"],
    relatedContent: ["revista", "cursos", "inspiracao"],
    layoutVariant: "paper",
    roadPlacement: "right",
  },
];

const EXPANDED_COPY = {
  "quem-somos": "Conheça a visão que reúne cuidado, conhecimento, cultura e convivência em um mesmo ecossistema humano.",
  recepcao: "Ninguém precisa saber de antemão o que procura. A conversa inicial existe para escutar o momento e apresentar os caminhos possíveis, sem pressa e sem compromisso.",
  atendimentos: "Encontre acolhimento, orientação e práticas que respeitam o momento e a história de cada pessoa.",
  cursos: "Formações, oficinas e vivências aproximam estudo e experiência para abrir novas possibilidades.",
  atividades: "Práticas corporais, arte e convivência transformam conhecimento em experiência compartilhada.",
  profissionais: "Conheça trajetórias e especialidades reunidas pelo compromisso de escutar e acompanhar.",
  programacao: "Descubra o que está acontecendo agora: encontros, práticas, cursos e experiências abertas à comunidade.",
  "arte-cultura": "Cinema, música, literatura e criação ampliam nossos modos de perceber, conviver e cuidar.",
  marketplace: "Uma seleção contextual de livros, aromas, objetos e materiais que podem acompanhar sua prática.",
  inspiracao: "Textos, meditações e pausas para recuperar espaço, presença e um ritmo mais atento.",
  blog: "Artigos, oráculos, colunas e entrevistas produzidos por quem atende, ensina e convive no Instituto.",
};

export const DEFAULT_HOME_BLOCKS = normalizeHomeBlocks(JOURNEY_REGIONS.map((region, position) => ({
  id: region.id,
  slug: region.id,
  category: region.category,
  title: region.title,
  summary: region.description,
  body: EXPANDED_COPY[region.id],
  image: "",
  icon: "",
  tags: region.tags,
  href: region.href,
  side: position % 2 === 0 ? "left" : "right",
  position,
  published: true,
  /* As relações vivem em JOURNEY_REGIONS, e os blocos editáveis nasciam sem
     elas: a lista de caminhos do painel do bloco ficava vazia sem erro, sem
     espaço em branco e sem nada que indicasse a falta. */
  relatedContent: region.relatedContent,
})));

export const JOURNEY_DISCOVERIES = [
  {
    id: "recepcao",
    type: "service",
    category: "Recepção",
    title: "Comece com uma conversa",
    description: "Um primeiro contato para compreender possibilidades sem escolher sozinho.",
    href: "recepcao.html",
    relatedContent: ["atendimentos", "profissionais"],
    layoutVariant: "soft-callout",
  },
  {
    id: "atendimento-online",
    type: "service",
    category: "Cuidado",
    title: "Também à distância",
    description: "Conheça possibilidades de atendimento online.",
    href: "https://www.institutopotala.com/programacao",
    relatedContent: ["atendimentos", "recepcao"],
    layoutVariant: "light-point",
  },
  {
    id: "saude-integrativa",
    type: "path",
    category: "Saúde integrativa",
    title: "Corpo, mente e relações",
    description: "Práticas que consideram a pessoa por inteiro.",
    href: "saude-integrativa.html",
    relatedContent: ["atendimentos", "atividades", "sono-reflexao"],
    layoutVariant: "branch",
  },
  {
    id: "sono-reflexao",
    type: "editorial",
    category: "Reflexão",
    title: "Um intervalo para o descanso",
    description: "Uma pequena pausa sobre presença, ritmo e sono.",
    href: "https://www.institutopotala.com/",
    relatedContent: ["inspiracao", "saude-integrativa", "atendimentos", "cursos"],
    layoutVariant: "quote",
  },
  {
    id: "revista",
    type: "editorial",
    category: "Revista",
    title: "Leituras do Ecossistema",
    description: "Reportagens, conversas e novas perspectivas.",
    href: "https://www.institutopotala.com/",
    relatedContent: ["blog", "arte-cultura", "quem-somos"],
    layoutVariant: "magazine",
  },
  {
    id: "eventos",
    type: "event",
    category: "Acontece no Potala",
    title: "Encontros em movimento",
    description: "A programação reúne práticas, cursos, vivências e atividades.",
    href: "programacao.html",
    relatedContent: ["programacao", "atividades", "arte-cultura"],
    layoutVariant: "lantern",
  },
  {
    id: "novos-profissionais",
    type: "people",
    category: "Comunidade",
    title: "Conheça quem constrói o Potala",
    description: "Pessoas, especialidades e trajetórias que se conectam.",
    href: "https://www.institutopotala.com/terapias",
    relatedContent: ["profissionais", "atendimentos"],
    layoutVariant: "portrait",
  },
  {
    id: "loja",
    type: "marketplace",
    category: "Loja",
    title: "Objetos que acompanham práticas",
    description: "Uma descoberta contextual, sem interromper a jornada.",
    href: "https://www.institutopotala.com/",
    relatedContent: ["saude-integrativa", "cursos"],
    layoutVariant: "shelf",
  },
  {
    id: "empresas",
    type: "institutional",
    category: "Para empresas",
    title: "Cuidado em outros ambientes",
    description: "Possibilidades para grupos, equipes e organizações.",
    href: "https://www.institutopotala.com/",
    relatedContent: ["atividades", "cursos", "profissionais"],
    layoutVariant: "distant-building",
  },
  {
    id: "acao-social",
    type: "social",
    category: "Ação social",
    title: "Cuidado que circula",
    description: "Iniciativas de acolhimento e participação comunitária.",
    href: "https://www.institutopotala.com/",
    relatedContent: ["quem-somos", "arte-cultura", "recepcao"],
    layoutVariant: "gathering",
  },
];

const ALL_CONTENT = [...JOURNEY_REGIONS, ...JOURNEY_DISCOVERIES];

export function findRelatedContent(id) {
  const item = ALL_CONTENT.find((candidate) => candidate.id === id);
  if (!item) return [];
  const related = new Set(item.relatedContent || []);
  return ALL_CONTENT.filter((candidate) => related.has(candidate.id));
}
