/*
 * O QUE HÁ EM CADA SEÇÃO — os blocos abaixo do texto de cada cena da Home
 * (outputs/atendimentos-conceito.html).
 *
 * Cada bloco aponta para um trecho real da página da seção (a âncora existe
 * lá; tests/potala/cenas-blocos.test.mjs confere) e resume o que se encontra
 * nele. Os rótulos vêm dos subtítulos das próprias páginas; as dicas, do
 * texto logo abaixo deles. Os ícones são do Lucide e são baixados por
 * `npm run vendor:lucide-blocos` a partir desta lista.
 */

export const BLOCOS = {
  "ensaio-quem-somos": [
    { rotulo: "Uma visão de cuidado", dica: "Saberes que conversam", href: "quem-somos.html#visao", icone: "hand-heart" },
    { rotulo: "Origem em 2012", dica: "Indaiatuba, 26 de maio", href: "quem-somos.html#historia", icone: "landmark" },
    { rotulo: "A lenda", dica: "Avalokiteshvara e a escuta", href: "quem-somos.html#historia", icone: "eye" },
    { rotulo: "Ecossistema", dica: "Cuidar, aprender, conviver", href: "quem-somos.html#ecossistema", icone: "network" },
  ],
  "ensaio-atendimentos": [
    { rotulo: "Mais de 150 técnicas", dica: "Corpo, emoções, energia", href: "atendimentos.html#possibilidades", icone: "layers" },
    { rotulo: "Oráculos", dica: "Linguagens de autoconhecimento", href: "atendimentos.html#oraculos", icone: "moon-star" },
    { rotulo: "Presencial e online", dica: "E iniciativas solidárias", href: "atendimentos.html#acesso", icone: "monitor-smartphone" },
    { rotulo: "Primeira conversa", dica: "Escolher com companhia", href: "atendimentos.html#primeiro-passo", icone: "message-circle-heart" },
  ],
  "ensaio-saude-integrativa": [
    { rotulo: "Corpo", dica: "Movimento e práticas manuais", href: "saude-integrativa.html#integrar", icone: "person-standing" },
    { rotulo: "Mente e emoções", dica: "Escuta e autoconhecimento", href: "saude-integrativa.html#integrar", icone: "brain" },
    { rotulo: "Relações e contexto", dica: "Vínculos, ambiente, história", href: "saude-integrativa.html#integrar", icone: "users-round" },
    { rotulo: "Presença e sentido", dica: "Práticas contemplativas", href: "saude-integrativa.html#integrar", icone: "sun" },
  ],
  "ensaio-profissionais": [
    { rotulo: "Escuta e vínculo", dica: "Psicoterapias e aconselhamento", href: "profissionais.html#encontro", icone: "ear" },
    { rotulo: "Corpo e movimento", dica: "Práticas manuais e movimento", href: "profissionais.html#encontro", icone: "hand" },
    { rotulo: "Energia e presença", dica: "Tradições energéticas", href: "profissionais.html#encontro", icone: "sparkles" },
    { rotulo: "Quem também ensina", dica: "Cursos e vivências da casa", href: "profissionais.html#encontro", icone: "book-open-text" },
  ],
  "ensaio-cursos": [
    { rotulo: "Cursos livres", dica: "Para conhecer um tema", href: "cursos.html#formatos", icone: "book-open" },
    { rotulo: "Formações", dica: "Com prática supervisionada", href: "cursos.html#formatos", icone: "graduation-cap" },
    { rotulo: "Vivências e oficinas", dica: "Aprender pela experiência", href: "cursos.html#formatos", icone: "palette" },
    { rotulo: "Monte seu curso", dica: "Para grupos e equipes", href: "cursos.html#monte-seu-curso", icone: "puzzle" },
  ],
  "ensaio-atividades": [
    { rotulo: "Corpo e consciência", dica: "Yoga, pilates, alongamento", href: "atividades.html#possibilidades", icone: "activity" },
    { rotulo: "Práticas orientais", dica: "Tai chi chuan e qi gong", href: "atividades.html#possibilidades", icone: "leaf" },
    { rotulo: "Dança e expressão", dica: "Linguagens do corpo", href: "atividades.html#possibilidades", icone: "music" },
    { rotulo: "Primeira aula", dica: "Experimente antes de decidir", href: "atividades.html#primeira-vez", icone: "footprints" },
  ],
  "ensaio-programacao": [
    { rotulo: "Agenda da semana", dica: "16 modalidades num só lugar", href: "programacao.html#orientacao", icone: "calendar-days" },
    { rotulo: "Eventos", dica: "Mostras, retiros e encontros", href: "eventos.html", icone: "ticket" },
    { rotulo: "Workshops", dica: "Intensivos de fim de semana", href: "workshops.html", icone: "pencil-ruler" },
    { rotulo: "Mentorias", dica: "Acompanhamento de longo prazo", href: "mentorias.html", icone: "route" },
  ],
  "ensaio-cultura": [
    { rotulo: "Cine Potala", dica: "Filme seguido de conversa", href: "cultura.html#encontros", icone: "clapperboard" },
    { rotulo: "Exposições", dica: "Música, dança, artes visuais", href: "cultura.html#encontros", icone: "frame" },
    { rotulo: "Café filosófico", dica: "Pensar junto, sem formação", href: "cultura.html#encontros", icone: "coffee" },
    { rotulo: "Saraus e lançamentos", dica: "Poesia e novos livros", href: "cultura.html#encontros", icone: "mic-vocal" },
  ],
  "ensaio-inspiracao": [
    { rotulo: "Respiração 3·3·3", dica: "Três ciclos, no seu ritmo", href: "inspiracao.html#pausa", icone: "wind" },
    { rotulo: "Frase do dia", dica: "Um instante de presença", href: "inspiracao.html#praticas", icone: "quote" },
    { rotulo: "Paisagem sonora", dica: "Ouvir o Potala", href: "inspiracao.html#praticas", icone: "audio-lines" },
    { rotulo: "Mensagem simbólica", dica: "Tarô, runas, I Ching", href: "inspiracao.html#mensagem-simbolica", icone: "sparkle" },
  ],
  "ensaio-blog": [
    { rotulo: "Artigos", dica: "Ideias para ler com calma", href: "blog.html?categoria=artigos", icone: "file-text" },
    { rotulo: "Práticas", dica: "Para fazer em casa", href: "blog.html?categoria=praticas", icone: "feather" },
    { rotulo: "Terapias", dica: "Como cada uma cuida", href: "blog.html?categoria=terapias", icone: "sprout" },
    { rotulo: "Cultura", dica: "Filmes, livros, encontros", href: "blog.html?categoria=cultura", icone: "drama" },
  ],
  "ensaio-revista": [
    { rotulo: "Música e cérebro", dica: "Ciência e saúde", href: "revista.html#pautas", icone: "microscope" },
    { rotulo: "Longevidade", dica: "Comportamento e sociedade", href: "revista.html#pautas", icone: "users" },
    { rotulo: "Calor e sono", dica: "Meio ambiente", href: "revista.html#pautas", icone: "trees" },
    { rotulo: "Cultura e encontro", dica: "Arte e cultura", href: "revista.html#pautas", icone: "brush" },
  ],
  "ensaio-loja": [
    { rotulo: "Livros", dica: "Para cursos e grupos", href: "marketplace.html#colecao", icone: "library" },
    { rotulo: "Óleos essenciais", dica: "Aromaterapia com orientação", href: "marketplace.html#colecao", icone: "droplets" },
    { rotulo: "Cristais e objetos", dica: "Símbolos e práticas", href: "marketplace.html#colecao", icone: "gem" },
    { rotulo: "Bem-estar cotidiano", dica: "Incensos e rituais simples", href: "marketplace.html#colecao", icone: "flower-2" },
  ],
  "ensaio-convivencia": [
    { rotulo: "Grupos de estudo", dica: "Ler, praticar, conversar", href: "grupos-de-estudo.html", icone: "messages-square" },
    { rotulo: "Rodas de conversa", dica: "Depois de cada encontro", href: "cultura.html#comunidades", icone: "message-square-quote" },
    { rotulo: "Primeira visita", dica: "Rua 24 de Maio, 748", href: "recepcao.html#primeiro-passo", icone: "map-pin" },
    { rotulo: "Fale conosco", dica: "Venha, escreva ou ligue", href: "recepcao.html#fale-conosco", icone: "phone" },
  ],
};

export const ICONES_DOS_BLOCOS = [...new Set(Object.values(BLOCOS).flat().map(({ icone }) => icone))];
