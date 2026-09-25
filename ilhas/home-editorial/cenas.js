/*
 * O CONTEÚDO DA HOME EDITORIAL.
 *
 * Só dados: textos, imagens e destinos. Nada aqui é inventado — os títulos e
 * frases vêm das páginas de cada seção, e os destinos são páginas que existem
 * em outputs/ (tests/potala/home-editorial.test.mjs confere).
 *
 * `foco` é o object-position de cada foto por faixa de largura: quando a
 * foto é recortada, o rosto e o ponto de interesse ficam dentro do quadro.
 *
 * `variante` escolhe a coreografia da cena (movimento/coreografias.js); cada
 * cena revela sua imagem de um jeito, para não repetir o mesmo efeito.
 */

export const ABERTURA = {
  id: "inicio",
  kicker: "Desde 2012 · Indaiatuba, SP",
  titulo: "Instituto Potala",
  frase:
    "Cuidado, conhecimento, cultura e convivência reunidos para que cada pessoa descubra, em seu próprio tempo, aquilo que faz sentido para sua jornada.",
  panorama: {
    src: "media/home-travessia.webp",
    srcCelular: "media/home-travessia-mobile.webp",
    largura: 2048,
    altura: 1152,
    alt: "Vale ao amanhecer, com névoa entre as montanhas e um caminho de pedra que desce em direção à água",
    foco: { computador: "50% 55%", celular: "50% 60%" },
  },
  recorte: {
    src: "media/palacio-master.webp",
    largura: 2048,
    altura: 1152,
    alt: "Pessoas caminham por um salão de colunas de madeira em direção à luz de uma porta aberta",
    foco: { computador: "52% 50%", celular: "52% 50%" },
  },
  acao: { rotulo: "Começar a travessia", href: "#quem-somos" },
};

export const CENAS = [
  {
    id: "quem-somos",
    numero: "01",
    kicker: "Quem somos",
    titulo: "Um lugar onde muitos caminhos se encontram.",
    texto:
      "O Instituto Cultural Potala nasceu em 2012, em Indaiatuba. Seu nome remete ao Monte Potala, no Tibete, associado à morada de Avalokiteshvara — figura que simboliza a compaixão e a escuta dos clamores do mundo.",
    variante: "sobe",
    lado: "imagem-esquerda",
    principal: {
      src: "media/quem-somos-acolhimento.webp",
      largura: 1664,
      altura: 936,
      alt: "Quatro pessoas de gerações diferentes conversam de pé num jardim, sorrindo",
      foco: { computador: "48% 38%", celular: "58% 36%" },
    },
    recorte: {
      src: "media/journey-quem-somos.webp",
      largura: 1920,
      altura: 1080,
      alt: "Templo de colunas no alto de uma colina, ao pôr do sol entre montanhas",
      foco: { computador: "72% 50%", celular: "72% 50%" },
    },
    links: [{ rotulo: "Conhecer o Potala", href: "quem-somos.html" }],
  },
  {
    id: "cuidado",
    numero: "02",
    kicker: "Cuidado",
    titulo: "Cuidar da pessoa inteira.",
    texto:
      "Da primeira conversa na Recepção aos atendimentos e à Saúde Integrativa: um cuidado que reconhece que sintomas, emoções, vínculos, hábitos e contexto podem fazer parte da mesma história.",
    variante: "lateral",
    lado: "imagem-direita",
    principal: {
      src: "media/recepcao-acolhimento.webp",
      largura: 1280,
      altura: 1600,
      alt: "Na recepção, uma mulher sorri e conversa com uma visitante do outro lado do balcão",
      foco: { computador: "38% 30%", celular: "36% 26%" },
    },
    recorte: {
      src: "media/saude-integrativa-escuta.webp",
      largura: 1600,
      altura: 1000,
      alt: "Duas mulheres conversam com atenção, sentadas frente a frente numa sala clara",
      foco: { computador: "40% 40%", celular: "40% 40%" },
    },
    links: [
      { rotulo: "Recepção", href: "recepcao.html" },
      { rotulo: "Atendimentos", href: "atendimentos-conceito.html" },
      { rotulo: "Saúde Integrativa", href: "saude-integrativa.html" },
    ],
  },
  {
    id: "conhecimento",
    numero: "03",
    kicker: "Conhecimento",
    titulo: "Conhecimento que se torna caminho.",
    texto:
      "Aprender, no Potala, é transformar conhecimento em experiência — com tempo para estudar, praticar e integrar. Aqui se encontram pessoas com formações, histórias e modos de escutar diferentes.",
    variante: "painel",
    lado: "imagem-esquerda",
    principal: {
      src: "media/profissionais-encontro.webp",
      largura: 1600,
      altura: 1000,
      alt: "Três pessoas conversam sentadas numa sala com livros, plantas e luz natural",
      foco: { computador: "50% 45%", celular: "62% 45%" },
    },
    recorte: {
      src: "media/blog-caderno-vela.webp",
      largura: 900,
      altura: 1125,
      alt: "Caderno aberto com anotações à mão, uma caneta-tinteiro e uma vela acesa",
      foco: { computador: "50% 50%", celular: "50% 50%" },
    },
    links: [
      { rotulo: "Cursos", href: "cursos.html" },
      { rotulo: "Profissionais", href: "profissionais.html" },
      { rotulo: "Caderno de Travessia", href: "blog.html" },
      { rotulo: "Revista", href: "revista.html" },
    ],
  },
  {
    id: "movimento-e-cultura",
    numero: "04",
    kicker: "Movimento e cultura",
    titulo: "Experiências para viver no corpo, na mente e em comunidade.",
    texto:
      "Práticas corporais, dança e expressão ao longo da semana. Cinema, música, livros e conversa criam outras formas de compreender a vida — juntos.",
    variante: "panorama",
    lado: "imagem-direita",
    principal: {
      src: "media/journey-cultura.webp",
      largura: 1920,
      altura: 1080,
      alt: "Varanda de pedra ao entardecer, com lanternas acesas e montanhas azuladas ao fundo",
      foco: { computador: "50% 50%", celular: "62% 50%" },
    },
    recorte: {
      src: "media/atividades-pratica.webp",
      largura: 1600,
      altura: 1000,
      alt: "Grupo pratica movimentos lentos, de roupas claras, num pátio de pedra entre árvores",
      foco: { computador: "45% 45%", celular: "45% 45%" },
    },
    detalhe: {
      src: "media/journey-inspiracao.webp",
      largura: 1920,
      altura: 1080,
      alt: "Lago entre montanhas sob uma névoa clara, com uma trilha de pedras na margem",
      foco: { computador: "60% 55%", celular: "60% 55%" },
    },
    links: [
      { rotulo: "Atividades", href: "atividades.html" },
      { rotulo: "Programação", href: "programacao.html" },
      { rotulo: "Arte e cultura", href: "cultura.html" },
      { rotulo: "Experiências culturais", href: "experiencias-culturais.html" },
    ],
  },
  {
    id: "convivencia",
    numero: "05",
    kicker: "Convivência",
    titulo: "Somos todos um único instituto.",
    texto:
      "Grupos permanentes de leitura, prática e conversa, eventos abertos e mentorias de longo prazo com os especialistas da casa.",
    variante: "cruzamento",
    lado: "imagem-esquerda",
    principal: {
      src: "media/quem-somos-encerramento-v1.webp",
      largura: 1672,
      altura: 941,
      alt: "Duas pessoas caminham juntas por um jardim em direção a uma casa acolhedora",
      foco: { computador: "40% 55%", celular: "34% 55%" },
    },
    recorte: {
      src: "media/journey-cuidado.webp",
      largura: 1920,
      altura: 1080,
      alt: "Varanda de madeira com duas poltronas diante de um lago e montanhas",
      foco: { computador: "62% 55%", celular: "62% 55%" },
    },
    links: [
      { rotulo: "Grupos de estudo", href: "grupos-de-estudo.html" },
      { rotulo: "Eventos", href: "eventos.html" },
      { rotulo: "Mentorias", href: "mentorias.html" },
    ],
    escolha: {
      pergunta: "Por onde continuar?",
      principal: { rotulo: "Começar uma conversa", href: "recepcao.html" },
      secundaria: { rotulo: "Percorrer a Travessia", href: "travessia.html" },
    },
  },
];

export const NAVEGACAO = [
  { rotulo: "Quem somos", href: "quem-somos.html" },
  { rotulo: "Recepção", href: "recepcao.html" },
  { rotulo: "Atendimentos", href: "atendimentos-conceito.html" },
  { rotulo: "Saúde Integrativa", href: "saude-integrativa.html" },
  { rotulo: "Profissionais", href: "profissionais.html" },
  { rotulo: "Cursos", href: "cursos.html" },
  { rotulo: "Atividades", href: "atividades.html" },
  { rotulo: "Programação", href: "programacao.html" },
  { rotulo: "Arte e cultura", href: "cultura.html" },
  { rotulo: "Caderno de Travessia", href: "blog.html" },
  { rotulo: "Revista", href: "revista.html" },
  { rotulo: "Loja", href: "marketplace.html" },
  { rotulo: "A Travessia", href: "travessia.html" },
];

export const CONTATO = {
  endereco: ["Rua 24 de Maio, 748", "Centro · Indaiatuba, SP"],
  canais: [
    { rotulo: "WhatsApp", valor: "(19) 99776-6131", href: "https://wa.me/5519997766131" },
    { rotulo: "Telefone", valor: "(19) 3834-6147", href: "tel:+551938346147" },
    { rotulo: "E-mail", valor: "contato@institutopotala.com", href: "mailto:contato@institutopotala.com" },
  ],
};
