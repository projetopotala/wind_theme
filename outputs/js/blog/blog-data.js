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
  /*
   * Da segunda leva em diante, cada texto traz o próprio conteúdo e a própria
   * capa. Os oito de cima continuam com o corpo curto de sempre: eles já estão
   * gravados no banco, e mudar o que o gerador produz para eles faria a semente
   * aplicada divergir do código.
   */
  {
    id: "respiracao-quatro-tempos",
    categoria: "praticas",
    motivo: "onda",
    capa: "media/chegada-landscape-mobile.webp",
    titulo: "Respirar em quatro tempos quando o dia aperta",
    resumo: "Inspirar, segurar, soltar, esperar. Um exercício de dois minutos que cabe entre um "
      + "compromisso e outro — e que funciona melhor quando ninguém percebe.",
    autor: "Grupo de Práticas",
    data: "2026-09-15",
    leitura: 3,
    destaque: false,
    tags: ["respiração", "pausa", "ansiedade"],
    conteudo: [
      { type: "paragraph", text: "Nem toda pausa precisa de uma sala silenciosa. Algumas cabem na fila, no carro parado, no minuto antes de abrir um e-mail difícil. A respiração em quatro tempos é uma delas: simples o bastante para ser lembrada no meio do aperto." },
      { type: "heading", text: "Como fazer" },
      { type: "list", items: ["Inspire pelo nariz contando até quatro.", "Segure o ar contando até quatro, sem forçar.", "Solte pela boca contando até quatro.", "Fique sem ar por mais quatro tempos e recomece."] },
      { type: "paragraph", text: "Três ou quatro voltas bastam. Se contar até quatro parecer longo, comece com três; o ritmo importa mais que o número. Quem tem alguma condição respiratória deve ajustar o exercício com um profissional." },
      { type: "quote", text: "A respiração é o único gesto do corpo que acontece sozinho e, ainda assim, aceita ser conduzido." },
      { type: "paragraph", text: "Com a prática, o exercício deixa de ser técnica e vira hábito: o corpo passa a lembrar sozinho de desacelerar quando o dia acelera." },
    ],
  },
  {
    id: "carta-da-semente",
    categoria: "oraculos",
    motivo: "semente",
    capa: "media/chegada-mobile.webp",
    titulo: "A carta da Semente e a paciência que não é espera",
    resumo: "O que foi plantado não pede pressa, pede constância. Uma leitura da carta que aparece "
      + "quando o resultado ainda não se vê, mas o trabalho já começou.",
    autor: "Núcleo de Oráculos",
    data: "2026-09-11",
    leitura: 3,
    destaque: false,
    tags: ["oráculo", "semente", "constância"],
    conteudo: [
      { type: "paragraph", text: "A Semente costuma sair para quem está no meio de algo que ainda não deu sinal de vida: um projeto recém-começado, uma mudança de hábito, uma conversa que precisa de tempo para amadurecer." },
      { type: "heading", text: "Paciência não é ficar parado" },
      { type: "paragraph", text: "A carta não pede espera passiva. Pede rega: pequenos cuidados diários, feitos mesmo quando nada parece acontecer. É na constância que a semente se decide." },
      { type: "quote", text: "O que foi plantado não pede pressa. Pede constância." },
      { type: "paragraph", text: "Uma pergunta para levar ao dia: o que você plantou recentemente e está tentado a desenterrar só para ver se já brotou?" },
    ],
  },
  {
    id: "primeira-conversa",
    categoria: "terapias",
    motivo: "fumaca",
    capa: "media/recepcao-acolhimento.webp",
    titulo: "O que acontece na primeira conversa de um atendimento",
    resumo: "Antes de qualquer técnica, um tempo inteiro para contar a própria história. Como a "
      + "escuta inicial ajuda a escolher o caminho de cuidado.",
    autor: "Equipe de Acolhimento",
    data: "2026-09-09",
    leitura: 5,
    destaque: false,
    tags: ["acolhimento", "atendimentos", "escuta"],
    conteudo: [
      { type: "paragraph", text: "Muita gente chega ao Instituto sem saber o nome do que procura. Sabe apenas que algo pesa, cansa ou insiste. A primeira conversa existe justamente para isso: dar tempo ao que ainda não tem nome." },
      { type: "heading", text: "Escutar antes de indicar" },
      { type: "paragraph", text: "Nessa conversa ninguém escolhe técnica. O profissional pergunta sobre o momento de vida, o corpo, o sono, as relações e o que a pessoa espera do cuidado. A indicação vem depois, e pode ser uma só ou uma combinação." },
      { type: "list", items: ["Não é preciso trazer diagnóstico.", "Tudo o que é dito fica entre a pessoa e a equipe.", "Sair sem decisão também é um resultado possível."] },
      { type: "quote", text: "Compreender vem antes de escolher." },
      { type: "paragraph", text: "Para marcar essa conversa, o caminho é a Recepção, pelo WhatsApp ou pessoalmente." },
    ],
  },
  {
    id: "leituras-da-casa",
    categoria: "cultura",
    motivo: "cristal",
    capa: "media/palacio-master.webp",
    titulo: "Leituras que atravessaram a casa este ano",
    resumo: "De filosofia oriental a poesia brasileira: os temas que mais circularam entre alunos, "
      + "terapeutas e visitantes, e por que eles conversam entre si.",
    autor: "Centro Cultural",
    data: "2026-09-07",
    leitura: 6,
    destaque: false,
    tags: ["leitura", "biblioteca", "cultura"],
    conteudo: [
      { type: "paragraph", text: "Uma casa de cuidado também é feita do que se lê nela. Neste ano, algumas estantes se esvaziaram mais rápido que outras, e o movimento diz muito sobre as perguntas de quem passa por aqui." },
      { type: "heading", text: "O que mais circulou" },
      { type: "list", items: ["Filosofia oriental e textos sobre atenção plena.", "Poesia brasileira, lida em voz alta nas rodas de sábado.", "Relatos de viagem e de peregrinação.", "Livros sobre sono, alimentação e ritmo do corpo."] },
      { type: "paragraph", text: "Os temas parecem distantes, mas voltam ao mesmo lugar: como viver com mais presença no tempo que se tem." },
      { type: "quote", text: "Todo livro emprestado volta um pouco diferente, e quem o leu também." },
    ],
  },
  {
    id: "voltar-a-estudar",
    categoria: "cursos",
    motivo: "semente",
    capa: "media/profissionais-encontro.webp",
    titulo: "Voltar a estudar depois dos quarenta",
    resumo: "A pergunta não é se ainda dá tempo, e sim o que se quer aprender agora. Conversas de "
      + "sala de aula sobre recomeçar com calma.",
    autor: "Coordenação de Cursos",
    data: "2026-09-01",
    leitura: 5,
    destaque: false,
    tags: ["cursos", "aprendizagem", "recomeço"],
    conteudo: [
      { type: "paragraph", text: "Em quase toda turma nova há alguém que pede desculpas por estar ali. Diz que faz tempo que não estuda, que talvez não acompanhe. Quase sempre é quem mais pergunta, e quem mais aproveita." },
      { type: "heading", text: "Aprender com a vida já vivida" },
      { type: "paragraph", text: "Quem volta a estudar mais tarde traz uma vantagem que não aparece no currículo: sabe por que está ali. O conteúdo encontra experiências reais onde se apoiar, e a teoria ganha corpo." },
      { type: "quote", text: "Conhecimento ganha sentido quando encontra a experiência." },
      { type: "paragraph", text: "Se há um tema que você adia há anos, o formulário “Monte seu curso”, na página de Cursos, é um bom lugar para começar a conversa." },
    ],
  },
  {
    id: "ritual-da-manha",
    categoria: "praticas",
    motivo: "lotus",
    capa: "media/atendimentos-vidraca-1.webp",
    titulo: "Um ritual de manhã que não pede acordar mais cedo",
    resumo: "Cinco minutos entre abrir os olhos e pegar o celular. Três gestos simples para começar "
      + "o dia pelo corpo, e não pela lista de tarefas.",
    autor: "Grupo de Práticas",
    data: "2026-08-30",
    leitura: 4,
    destaque: false,
    tags: ["manhã", "rotina", "presença"],
    conteudo: [
      { type: "paragraph", text: "Rituais de manhã costumam vir com promessas grandes e despertadores mais cedo. Este não. Ele cabe no tempo que você já tem, antes da primeira notificação." },
      { type: "heading", text: "Três gestos" },
      { type: "list", items: ["Sente-se na cama e sinta os pés no chão por algumas respirações.", "Beba um copo de água devagar, prestando atenção na temperatura.", "Escolha uma única intenção para o dia, em uma frase curta."] },
      { type: "paragraph", text: "O celular pode esperar esses cinco minutos. O que ele tem a dizer continuará lá, e você chegará a ele de outro jeito." },
      { type: "quote", text: "O dia começa onde a atenção começa." },
    ],
  },
  {
    id: "aromaterapia-cotidiano",
    categoria: "terapias",
    motivo: "fumaca",
    capa: "media/marketplace-contexto.webp",
    titulo: "Aromaterapia no cotidiano, sem exageros",
    resumo: "Óleos essenciais não são enfeite nem milagre. Cuidados básicos para quem está "
      + "começando a usá-los em casa.",
    autor: "Equipe de Medicina Integrativa",
    data: "2026-08-27",
    leitura: 6,
    destaque: false,
    tags: ["aromaterapia", "óleos essenciais", "cuidado"],
    conteudo: [
      { type: "paragraph", text: "A aromaterapia entra na vida de muita gente por um frasco ganhado de presente. É um bom começo, desde que venha acompanhado de alguns cuidados que o rótulo nem sempre explica." },
      { type: "heading", text: "Cuidados básicos" },
      { type: "list", items: ["Óleo essencial não vai puro na pele: dilua em um óleo vegetal.", "Crianças, gestantes e animais pedem orientação específica.", "Difusor ligado por períodos curtos, com o ambiente ventilado.", "Aroma agradável não substitui tratamento médico."] },
      { type: "paragraph", text: "Usada com critério, a aromaterapia é um convite à pausa: um cheiro que marca o fim do expediente, o começo da meditação, a hora de dormir." },
      { type: "quote", text: "O cheiro chega antes do pensamento, e por isso sabe acalmar." },
    ],
  },
  {
    id: "tres-cartas",
    categoria: "oraculos",
    motivo: "oraculo",
    capa: "media/journey-cuidado.webp",
    titulo: "Três cartas na mesa: o que foi, o que é, o que se abre",
    resumo: "A tiragem mais simples do tarô também é a mais honesta. Como ler três cartas sem "
      + "transformar a leitura em previsão.",
    autor: "Núcleo de Oráculos",
    data: "2026-08-20",
    leitura: 4,
    destaque: false,
    tags: ["tarô", "tiragem", "autoconhecimento"],
    conteudo: [
      { type: "paragraph", text: "Três cartas lado a lado: a primeira fala do que trouxe você até aqui, a segunda do que está em jogo agora, a terceira do que começa a se abrir. Não é destino. É uma forma de organizar a pergunta." },
      { type: "heading", text: "Ler sem prever" },
      { type: "paragraph", text: "A tentação é tratar a terceira carta como resposta final. Ela funciona melhor como direção: aponta um movimento possível, que depende do que se faz com as outras duas." },
      { type: "quote", text: "O oráculo não adivinha o futuro: ele organiza a pergunta." },
      { type: "paragraph", text: "Nas rodas do Núcleo, cada leitura termina com uma pergunta, e não com uma sentença. É ela que a pessoa leva para casa." },
    ],
  },
  {
    id: "perguntar-em-grupo",
    categoria: "cultura",
    motivo: "montanha",
    capa: "media/quem-somos-acolhimento.webp",
    titulo: "Por que perguntar em grupo muda a pergunta",
    resumo: "Nas rodas de conversa, a mesma questão soa diferente em cada voz. O que se aprende "
      + "com encontros abertos sobre temas difíceis.",
    autor: "Centro Cultural",
    data: "2026-08-16",
    leitura: 5,
    destaque: false,
    tags: ["rodas de conversa", "filosofia", "comunidade"],
    conteudo: [
      { type: "paragraph", text: "Sozinhos, costumamos fazer as mesmas perguntas do mesmo jeito. Em roda, alguém sempre a formula de outro modo, e é aí que ela se abre." },
      { type: "heading", text: "Como funciona uma roda" },
      { type: "list", items: ["Um tema é proposto, sem resposta pronta.", "Cada pessoa fala uma vez antes que alguém fale de novo.", "Ninguém precisa concordar para a conversa andar."] },
      { type: "paragraph", text: "O resultado raramente é uma conclusão. Mais comum é sair com a pergunta maior, e com a companhia de quem a carrega junto." },
      { type: "quote", text: "Uma boa pergunta dita em voz alta já não pertence só a quem a fez." },
    ],
  },
  {
    id: "caligrafia-como-pausa",
    categoria: "cursos",
    motivo: "cristal",
    capa: "media/blog-caderno-vela.webp",
    titulo: "Caligrafia como pausa: o traço que obriga a ir devagar",
    resumo: "Pena, tinta e uma folha: a caligrafia pede o que o dia raramente oferece — atenção a "
      + "um gesto de cada vez.",
    autor: "Ateliê Potala",
    data: "2026-08-12",
    leitura: 4,
    destaque: false,
    tags: ["caligrafia", "ateliê", "atenção"],
    conteudo: [
      { type: "paragraph", text: "Não dá para fazer caligrafia com pressa. A tinta escorre, o traço treme, a letra denuncia. Por isso ela ensina, antes de qualquer alfabeto, a respirar junto com a mão." },
      { type: "heading", text: "O que se aprende além das letras" },
      { type: "paragraph", text: "Postura, ritmo, repetição sem tédio. Uma linha inteira da mesma letra parece exercício escolar, mas é meditação disfarçada: cada repetição sai um pouco diferente, e é isso que se aprende a ver." },
      { type: "quote", text: "O traço mostra a pressa antes de quem escreve perceber que estava com ela." },
      { type: "paragraph", text: "Não é preciso ter letra bonita para começar. É preciso só aceitar ir devagar." },
    ],
  },
  {
    id: "cuidar-de-quem-cuida",
    categoria: "artigos",
    motivo: "onda",
    capa: "media/atendimentos-vidraca-4.webp",
    titulo: "Quem cuida também precisa de cuidado",
    resumo: "Mães, filhos que cuidam dos pais, profissionais de saúde: quem sustenta os outros "
      + "costuma ser o último a pedir ajuda. Um convite a inverter a ordem.",
    autor: "Redação Potala",
    data: "2026-08-05",
    leitura: 6,
    destaque: false,
    tags: ["cuidadores", "autocuidado", "saúde emocional"],
    conteudo: [
      { type: "paragraph", text: "Existe um cansaço que não passa com uma noite de sono: o de quem passa os dias cuidando de alguém. Ele se acumula em silêncio, porque parece egoísmo reclamar dele." },
      { type: "heading", text: "Sinais de alerta" },
      { type: "list", items: ["Irritação constante com pequenas coisas.", "Sensação de que o próprio tempo desapareceu.", "Culpa ao descansar.", "Adiar a própria saúde indefinidamente."] },
      { type: "paragraph", text: "Reconhecer esses sinais não é fraqueza: é o primeiro cuidado. Quem cuida precisa de lugar para ser cuidado também, seja numa terapia, num grupo ou numa conversa franca com a família." },
      { type: "quote", text: "Ninguém sustenta os outros por muito tempo sem ser sustentado." },
    ],
  },
  {
    id: "caminhar-em-silencio",
    categoria: "artigos",
    motivo: "montanha",
    capa: "media/home-travessia-mobile.webp",
    titulo: "Caminhar em silêncio: notas sobre andar sem destino",
    resumo: "Sem fone, sem meta de passos, sem pressa de chegar. O que muda quando a caminhada "
      + "deixa de ser exercício e vira travessia.",
    autor: "Redação Potala",
    data: "2026-07-29",
    leitura: 7,
    destaque: false,
    tags: ["caminhada", "silêncio", "travessia"],
    conteudo: [
      { type: "paragraph", text: "Caminhar virou tarefa: contamos passos, medimos ritmo, ouvimos alguma coisa para o tempo passar. Caminhar em silêncio devolve à caminhada o que ela tinha de mais antigo, que é pensar com os pés." },
      { type: "heading", text: "Uma proposta simples" },
      { type: "list", items: ["Escolha um trajeto conhecido e sem trânsito pesado.", "Deixe o celular no bolso, no silencioso.", "Caminhe um pouco mais devagar do que o costume.", "Repare em três coisas que nunca tinha notado no caminho."] },
      { type: "paragraph", text: "Nos primeiros minutos a cabeça fala sem parar. Depois ela cansa de falar sozinha, e o caminho começa a aparecer." },
      { type: "quote", text: "Todo caminho verdadeiro começa no mundo interno." },
    ],
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
  cover: post.capa || CAPAS[post.motivo] || "media/home-travessia.webp",
  coverAlt: `Paisagem contemplativa que acompanha o texto ${post.titulo}`,
  featured: post.destaque,
  status: "published",
  content: post.conteudo
    ? post.conteudo.map((bloco, indice) => ({ id: `${post.id}-${indice + 1}`, ...bloco }))
    : [
      { id: `${post.id}-intro`, type: "paragraph", text: post.resumo },
      { id: `${post.id}-heading`, type: "heading", text: "Um caminho para observar" },
      { id: `${post.id}-body`, type: "paragraph", text: "Cada experiência pode ser lida por muitos ângulos. Este texto abre uma pausa para reconhecer o que já está presente e perceber possibilidades que antes passavam despercebidas." },
      { id: `${post.id}-quote`, type: "quote", text: "Conhecimento ganha sentido quando encontra a experiência." },
    ],
  /* Os textos novos indicam primeiro os do mesmo tema; os oito primeiros mantêm a indicação já gravada. */
  relatedPostIds: post.conteudo
    ? [
      ...POSTS.filter((candidate) => candidate.id !== post.id && candidate.categoria === post.categoria),
      ...POSTS.filter((candidate) => candidate.id !== post.id && candidate.categoria !== post.categoria),
    ].slice(0, 2).map(({ id }) => id)
    : POSTS.filter((candidate) => candidate.id !== post.id).slice(0, 2).map(({ id }) => id),
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
