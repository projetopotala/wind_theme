import type {
  JourneyContent,
  JourneyExperienceSettings,
} from "../types/journey";

export const JOURNEY_PROLOGUE = {
  eyebrow: "Ecossistema Digital Potala",
  title: "Bem-vindo.",
  description: "O caminho continua.",
} as const;

export const PRIMARY_CONTENT_IDS = [
  "quem-somos",
  "atendimentos",
  "cursos",
  "atividades",
  "profissionais",
  "programacao",
  "arte-cultura",
  "inspiracao",
] as const;

export const SECONDARY_CONTENT_IDS = [
  "recepcao",
  "atendimento-online",
  "saude-integrativa",
  "sono-reflexao",
  "blog",
  "revista",
  "eventos",
  "novos-profissionais",
  "loja",
  "empresas",
  "acao-social",
] as const;

const primaryRegions = [
  {
    id: "quem-somos",
    category: "A entrada",
    title: "Quem somos",
    description: "Um instituto feito de pessoas, histórias e muitos modos de cuidar.",
    portal: { number: "01", href: "/quem-somos", description: "Pessoas, histórias e muitos modos de cuidar.", alignment: "left", secondaryIds: ["recepcao", "acao-social", "revista"] },
    legacyHref: "quem-somos.html",
    tags: ["história", "propósito", "comunidade"],
    relatedContent: ["recepcao", "acao-social", "revista"],
  },
  {
    id: "atendimentos",
    category: "O cuidado",
    title: "Atendimentos",
    description: "Cada pessoa chega com uma história diferente. O acolhimento vem antes da escolha de qualquer caminho.",
    portal: { number: "02", href: "/atendimentos", description: "O acolhimento vem antes da escolha de qualquer caminho.", alignment: "right", secondaryIds: ["recepcao", "saude-integrativa", "sono-reflexao"] },
    legacyHref: "atendimentos.html",
    tags: ["acolhimento", "terapias", "orientação"],
    relatedContent: ["recepcao", "saude-integrativa", "sono-reflexao"],
  },
  {
    id: "cursos",
    category: "O conhecimento",
    title: "Cursos",
    description: "Cuidar também é aprender: conhecimento e prática se encontram para abrir novas possibilidades.",
    portal: { number: "03", href: "/cursos", description: "Conhecimento e prática se encontram.", alignment: "left", secondaryIds: ["revista", "blog", "sono-reflexao"] },
    legacyHref: "cursos.html",
    tags: ["formações", "oficinas", "estudo"],
    relatedContent: ["revista", "blog", "sono-reflexao"],
  },
  {
    id: "atividades",
    category: "O movimento",
    title: "Atividades",
    description: "Conhecimento também precisa ser vivido no corpo, na criação e na convivência.",
    portal: { number: "04", href: "/atividades", description: "Conhecimento vivido no corpo e na convivência.", alignment: "right", secondaryIds: ["programacao", "arte-cultura", "saude-integrativa"] },
    legacyHref: "atividades.html",
    tags: ["yoga", "tai chi", "arte e movimento"],
    relatedContent: ["programacao", "arte-cultura", "saude-integrativa"],
  },
  {
    id: "profissionais",
    category: "As pessoas",
    title: "Profissionais",
    description: "Trajetórias diferentes, reunidas pelo compromisso de escutar e acompanhar.",
    portal: { number: "05", href: "/profissionais", description: "Escutar e acompanhar, em muitas trajetórias.", alignment: "left", secondaryIds: ["atendimentos", "recepcao", "novos-profissionais"] },
    legacyHref: "profissionais.html",
    tags: ["trajetórias", "especialidades", "presença"],
    relatedContent: ["atendimentos", "recepcao", "novos-profissionais"],
  },
  {
    id: "programacao",
    category: "O Potala está vivo",
    title: "Programação",
    description: "Atendimentos, cursos, vivências e atividades formam uma agenda em movimento.",
    portal: { number: "06", href: "/programacao", description: "Uma agenda em movimento.", alignment: "right", secondaryIds: ["eventos", "atividades", "arte-cultura"] },
    legacyHref: "programacao.html",
    tags: ["agenda", "encontros", "experiências"],
    relatedContent: ["eventos", "atividades", "arte-cultura"],
  },
  {
    id: "arte-cultura",
    category: "O encontro",
    title: "Arte e cultura",
    description: "Cinema, música, livros, conversa e criação ampliam o modo como encontramos o mundo.",
    portal: { number: "07", href: "/cultura", description: "Criação e encontro ampliam o mundo.", alignment: "left", secondaryIds: ["revista", "eventos", "acao-social"] },
    legacyHref: "cultura.html",
    tags: ["cinema", "música", "literatura"],
    relatedContent: ["revista", "eventos", "acao-social"],
  },
  {
    id: "inspiracao",
    category: "Uma pausa",
    title: "Inspiração",
    description: "Nem todo encontro precisa pedir uma decisão. Alguns apenas devolvem espaço.",
    portal: { number: "08", href: "/inspiracao", description: "Alguns encontros apenas devolvem espaço.", alignment: "right", secondaryIds: ["sono-reflexao", "blog", "revista"] },
    legacyHref: "inspiracao.html",
    tags: ["reflexões", "meditação", "silêncio"],
    relatedContent: ["sono-reflexao", "blog", "revista"],
  },
] satisfies ReadonlyArray<Omit<JourneyContent, "kind" | "importance" | "status">>;

const secondaryContent = [
  { id: "recepcao", category: "Recepção", title: "Comece com uma conversa", description: "Um primeiro contato para compreender possibilidades sem escolher sozinho.", legacyHref: "atendimentos.html", relatedContent: ["atendimentos", "profissionais"] },
  { id: "atendimento-online", category: "Cuidado", title: "Também à distância", description: "Conheça possibilidades de atendimento online.", legacyHref: "https://www.institutopotala.com/programacao", relatedContent: ["atendimentos", "recepcao"] },
  { id: "saude-integrativa", category: "Saúde integrativa", title: "Corpo, mente e relações", description: "Práticas que consideram a pessoa por inteiro.", legacyHref: "saude-integrativa.html", relatedContent: ["atendimentos", "atividades", "sono-reflexao"] },
  { id: "sono-reflexao", category: "Reflexão", title: "Um intervalo para o descanso", description: "Uma pequena pausa sobre presença, ritmo e sono.", legacyHref: "https://www.institutopotala.com/", relatedContent: ["inspiracao", "saude-integrativa", "atendimentos", "cursos"] },
  { id: "blog", category: "Blog", title: "Ideias para continuar pensando", description: "Textos que aproximam conhecimento e cotidiano.", legacyHref: "https://www.institutopotala.com/", relatedContent: ["revista", "cursos", "inspiracao"] },
  { id: "revista", category: "Revista", title: "Leituras do Ecossistema", description: "Reportagens, conversas e novas perspectivas.", legacyHref: "https://www.institutopotala.com/", relatedContent: ["blog", "arte-cultura", "quem-somos"] },
  { id: "eventos", category: "Acontece no Potala", title: "Encontros em movimento", description: "A programação reúne práticas, cursos, vivências e atividades.", legacyHref: "programacao.html", relatedContent: ["programacao", "atividades", "arte-cultura"] },
  { id: "novos-profissionais", category: "Comunidade", title: "Conheça quem constrói o Potala", description: "Pessoas, especialidades e trajetórias que se conectam.", legacyHref: "https://www.institutopotala.com/terapias", relatedContent: ["profissionais", "atendimentos"] },
  { id: "loja", category: "Loja", title: "Objetos que acompanham práticas", description: "Uma descoberta contextual, sem interromper a jornada.", legacyHref: "https://www.institutopotala.com/", relatedContent: ["saude-integrativa", "cursos"] },
  { id: "empresas", category: "Para empresas", title: "Cuidado em outros ambientes", description: "Possibilidades para grupos, equipes e organizações.", legacyHref: "https://www.institutopotala.com/", relatedContent: ["atividades", "cursos", "profissionais"] },
  { id: "acao-social", category: "Ação social", title: "Cuidado que circula", description: "Iniciativas de acolhimento e participação comunitária.", legacyHref: "https://www.institutopotala.com/", relatedContent: ["quem-somos", "arte-cultura", "recepcao"] },
] satisfies ReadonlyArray<Omit<JourneyContent, "kind" | "importance" | "status">>;

const pendingDestinations = new Set(["sono-reflexao", "blog", "revista", "loja", "empresas", "acao-social"]);

export const JOURNEY_TRANSITIONS: readonly JourneyContent[] = [
  { id: "transicao-chegada", kind: "transition", importance: "passive", status: "active", description: "Conhecer também é uma forma de chegar." },
  { id: "transicao-cuidado", kind: "transition", importance: "passive", status: "active", description: "Cuidar também é aprender." },
  { id: "transicao-conhecimento", kind: "transition", importance: "passive", status: "active", description: "Conhecimento também precisa ser vivido." },
  { id: "transicao-pausa", kind: "transition", importance: "passive", status: "active", description: "Você não precisa conhecer tudo hoje." },
];

export const ARRIVAL_CONCEPTS: readonly JourneyContent[] = [
  { id: "chegada-tempo", role: "Tempo", label: "O céu", cue: "A luz muda porque você chegou.", poem: ["O céu não começa agora —", "só encontrou alguém", "disposto a olhar."] },
  { id: "chegada-presenca", role: "Presença", label: "A árvore antiga", cue: "O vento só existe enquanto você está aqui.", poem: ["Ela não espera nada.", "Fica.", "E é isso que faz sombra."] },
  { id: "chegada-fluxo", role: "Fluxo", label: "A água da margem", cue: "A correnteza acorda com a sua atenção.", poem: ["A água não escolhe caminho:", "aceita a descida", "e chega."] },
  { id: "chegada-pausa", role: "Pausa", label: "Quem brinca na água", cue: "Eles convidam a respirar.", poem: ["Ninguém lhes ensinou", "a respirar assim —", "só ninguém desensinou."] },
  { id: "chegada-horizonte", role: "Horizonte", label: "Quem aponta o vale", cue: "A névoa abre para quem olha ao longe.", poem: ["O vale estava lá", "o tempo todo.", "Faltava a distância certa."] },
  { id: "chegada-caminho", role: "Caminho", label: "Quem segue a pedra", cue: "Um passo com eles. O resto é o seu.", poem: ["A pedra é antiga", "porque muita gente", "duvidou antes de você."] },
  { id: "chegada-escuta", role: "Escuta", label: "Quem descansa junto ao templo", cue: "Você não precisa conhecer tudo hoje.", poem: ["Sentar também é chegar.", "O corpo sabe disso", "antes da gente."] },
  { id: "chegada-entrada", role: "Entrada", label: "A porta do templo", cue: "Quando quiser, o Potala continua lá dentro.", poem: ["A porta não se abre.", "Ela deixa de ser parede", "quando alguém chega."] },
].map((content) => ({
  ...content,
  kind: "arrival" as const,
  importance: "passive" as const,
  status: "active" as const,
}));

const prologueContent: JourneyContent = {
  id: "prologo",
  kind: "prologue",
  importance: "primary",
  status: "active",
  ...JOURNEY_PROLOGUE,
};

const regionContent: JourneyContent[] = primaryRegions.map((content) => ({
  ...content,
  kind: "region",
  importance: "primary",
  status: "legacy-reference",
}));

const discoveryContent: JourneyContent[] = secondaryContent.map((content) => ({
  ...content,
  kind: "secondary",
  importance: "secondary",
  status: pendingDestinations.has(content.id) ? "pending-destination" : "legacy-reference",
  actions: [],
}));

export const JOURNEY_EPILOGUE: JourneyContent = {
  id: "epilogo",
  kind: "epilogue",
  importance: "primary",
  status: "active",
  description: "Uma jornada não precisa terminar aqui.",
  title: "Há sempre outro caminho para descobrir.",
};

export const JOURNEY_CONTENT: Readonly<Record<string, JourneyContent>> = Object.fromEntries([
  prologueContent,
  ...ARRIVAL_CONCEPTS,
  ...regionContent,
  ...JOURNEY_TRANSITIONS,
  ...discoveryContent,
  JOURNEY_EPILOGUE,
  {
    id: "trabalhe-conosco",
    category: "Trabalhe Conosco",
    kind: "secondary",
    importance: "secondary",
    status: "pending-content",
  } satisfies JourneyContent,
].map((content) => [content.id, content]));

export const JOURNEY_PRIMARY_REGIONS = PRIMARY_CONTENT_IDS.map((id) => JOURNEY_CONTENT[id]);
export const JOURNEY_SECONDARY_CONTENT = SECONDARY_CONTENT_IDS.map((id) => JOURNEY_CONTENT[id]);

export const EXPERIENCE_SETTINGS: JourneyExperienceSettings = {
  breathing: { patternSeconds: [3, 3, 3], cycles: 8, enabled: false },
  audio: {
    legacySrc: "musica-fundo.mp3",
    volume: 0.24,
    optIn: true,
    autoplay: false,
    enabled: false,
    supportsFade: true,
  },
};

export const JOURNEY_CONTACT = {
  name: "Instituto Cultural Potala",
  address: "Rua 24 de Maio, 748 — Centro, Indaiatuba/SP",
  phone: "(19) 3834-6147",
  whatsapp: "WhatsApp (19) 99776-6131",
  email: "contato@institutopotala.com",
} as const;
