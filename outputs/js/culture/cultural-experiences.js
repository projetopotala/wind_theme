export const CULTURAL_EXPERIENCES = [
  {
    slug: "cine-potala",
    eyebrow: "Cinema, conversa e presença",
    title: "Cine Potala",
    lead: "Uma sessão não termina nos créditos. O filme abre um território para escuta, contexto e conversa.",
    image: "media/journey-cultura.webp",
    sections: [
      { title: "Como acontece", text: "Cada encontro reúne uma obra cuidadosamente escolhida, uma breve apresentação e uma conversa mediada após a exibição." },
      { title: "O que acompanha", text: "Referências, perguntas e materiais complementares ajudam quem quiser continuar a reflexão depois da sessão." },
      { title: "Próxima experiência", text: "A programação informa filme, classificação, duração, formato do debate e condições de participação." },
    ],
  },
  {
    slug: "exposicoes",
    eyebrow: "Arte em circulação",
    title: "Exposições e apresentações",
    lead: "Artes visuais, música, recitais, coral e dança transformam a casa em lugar de encontro entre obra, artista e comunidade.",
    image: "media/atividades-pratica.webp",
    sections: [
      { title: "O que acontece", text: "Mostras, apresentações e temporadas podem ocupar diferentes ambientes do Instituto, respeitando a linguagem de cada trabalho." },
      { title: "Conhecer quem cria", text: "Cada experiência apresenta artistas, processos, contexto da obra e formas de acompanhar seus próximos trabalhos." },
      { title: "Visitação e acesso", text: "A programação reúne período, horários, classificação, acessibilidade e necessidade de reserva." },
    ],
  },
  {
    slug: "cafe-filosofico",
    eyebrow: "Pensar em companhia",
    title: "Café filosófico",
    lead: "Grandes perguntas deixam de ser abstrações quando encontram experiências reais e diferentes pontos de vista.",
    image: "media/quem-somos-acolhimento.webp",
    sections: [
      { title: "Tema do encontro", text: "Uma questão orientadora abre a conversa sem exigir formação prévia ou uma resposta definitiva." },
      { title: "Mediação", text: "Um facilitador oferece contexto, organiza a escuta e mantém o diálogo respeitoso entre perspectivas distintas." },
      { title: "Para continuar", text: "Leituras, filmes e conteúdos do Ecossistema prolongam o tema para além do encontro presencial." },
    ],
  },
  {
    slug: "saraus",
    eyebrow: "Palavra, música e comunidade",
    title: "Saraus e lançamentos",
    lead: "Um palco aberto para literatura, poesia, música e livros encontrarem novas vozes e novos leitores.",
    image: "media/journey-cultura.webp",
    sections: [
      { title: "Programa", text: "Cada edição combina leituras, apresentações musicais, conversas com autores e momentos de participação da comunidade." },
      { title: "Quem pode participar", text: "Visitantes podem chegar para ouvir ou manifestar interesse em compartilhar uma criação nas edições abertas." },
      { title: "Livros e autores", text: "Lançamentos apresentam a obra, seu processo de criação e caminhos para continuar a leitura na Biblioteca Potala." },
    ],
  },
  {
    slug: "festivais",
    eyebrow: "Muitas linguagens, uma experiência",
    title: "Festivais e mostras",
    lead: "Programações especiais aproximam cinema, música, dança, literatura e artes visuais sem transformar o encontro em excesso.",
    image: "media/home-travessia.webp",
    sections: [
      { title: "Curadoria", text: "Um tema comum conecta diferentes linguagens e ajuda cada atividade a fazer parte de uma narrativa maior." },
      { title: "Percurso", text: "O visitante encontra horários, duração, locais e intervalos para construir seu próprio caminho pelo evento." },
      { title: "Participação", text: "A página informa reservas, acessibilidade, atividades livres e experiências que exigem inscrição." },
    ],
  },
  {
    slug: "rodas-de-conversa",
    eyebrow: "Escuta compartilhada",
    title: "Rodas de conversa",
    lead: "Um tema comum reúne histórias diferentes, preservando o direito de falar, ouvir e permanecer em silêncio.",
    image: "media/profissionais-encontro.webp",
    sections: [
      { title: "Como acontece", text: "A mediação apresenta o tema, combina acordos de convivência e oferece espaço para diferentes formas de participação." },
      { title: "Temas", text: "Cuidado, relações, cultura, cotidiano e questões da comunidade podem orientar cada encontro." },
      { title: "Acolhimento", text: "Quando uma conversa revela uma necessidade individual, a Recepção pode indicar outros caminhos do Instituto." },
    ],
  },
];

export function culturalExperienceFor(slug) {
  return CULTURAL_EXPERIENCES.find((item) => item.slug === slug) || CULTURAL_EXPERIENCES[0];
}

const setText = (root, selector, value) => {
  const element = root.querySelector(selector);
  if (element) element.textContent = value;
};

export function mountCulturalExperience(root = document, locationLike = globalThis.location) {
  const shell = root.querySelector?.("[data-cultural-experience]");
  if (!shell) return null;

  const slug = new URLSearchParams(locationLike?.search || "").get("experiencia") || "cine-potala";
  const experience = culturalExperienceFor(slug);
  setText(shell, "[data-cultural-eyebrow]", experience.eyebrow);
  setText(shell, "[data-cultural-title]", experience.title);
  setText(shell, "[data-cultural-lead]", experience.lead);
  const image = shell.querySelector("[data-cultural-image]");
  if (image) {
    image.src = experience.image;
    image.alt = `Imagem editorial para ${experience.title}`;
  }
  const sections = [...shell.querySelectorAll("[data-cultural-section]")];
  sections.forEach((element, index) => {
    setText(element, "h2", experience.sections[index]?.title || "");
    setText(element, "p", experience.sections[index]?.text || "");
  });
  root.title = `${experience.title} — Instituto Potala`;

  const interest = shell.querySelector("[data-cultural-interest]");
  const onInterest = () => {
    const active = interest.getAttribute("aria-pressed") !== "true";
    interest.setAttribute("aria-pressed", String(active));
    interest.textContent = active ? "Interesse registrado nesta visita" : "Tenho interesse";
  };
  interest?.addEventListener("click", onInterest);
  return { experience, destroy: () => interest?.removeEventListener("click", onInterest) };
}

if (typeof document !== "undefined") mountCulturalExperience();
