// Síntese editorial das seções 3–6, 19 e 20 de Ecossistema Digital Potala.
// Estes convites institucionais não representam cursos ou eventos agendados.
export const DISCOVERY_PATHS = [
  {
    id: "cuidar", label: "Quero cuidar de mim", eyebrow: "Escuta antes da escolha",
    title: "Você não precisa chegar com todas as respostas.",
    description: "Às vezes sabemos o que procuramos. Em outras, precisamos de uma conversa para compreender o momento. Conheça abordagens, pessoas e possibilidades de cuidado antes de decidir por onde seguir.",
    image: "media/saude-integrativa-escuta.webp", alt: "Paisagem contemplativa que acompanha o convite ao cuidado",
    links: [
      { title: "Começar com uma conversa", detail: "A Recepção ajuda a encontrar caminhos.", href: "recepcao.html" },
      { title: "Conhecer os atendimentos", detail: "Diferentes abordagens de cuidado e orientação.", href: "atendimentos.html" },
      { title: "Olhar para a pessoa por inteiro", detail: "Corpo, emoções e relações na saúde integrativa.", href: "saude-integrativa.html" },
    ],
  },
  {
    id: "aprender", label: "Quero aprender", eyebrow: "Conhecimento que se torna experiência",
    title: "Uma descoberta pode abrir um caminho inteiro.",
    description: "Aprender também é experimentar, fazer perguntas e compartilhar. Percorra cursos, grupos de estudo e leituras que aproximam conhecimento, prática e desenvolvimento humano.",
    image: "media/journey-quem-somos.webp", alt: "Pavilhão entre montanhas em uma paisagem serena",
    links: [
      { title: "Explorar os cursos", detail: "Formações e experiências de aprendizagem.", href: "cursos.html" },
      { title: "Estudar em companhia", detail: "Conheça os grupos de estudo.", href: "grupos-de-estudo.html" },
      { title: "Encontrar uma nova perspectiva", detail: "Artigos e reflexões no Blog.", href: "blog.html" },
    ],
  },
  {
    id: "conviver", label: "Quero me conectar", eyebrow: "A transformação também acontece no encontro",
    title: "Há conhecimentos que florescem na convivência.",
    description: "O corpo em movimento, a arte e uma boa conversa ampliam nossas formas de estar no mundo. Descubra ambientes de expressão, prática e encontro, no seu próprio ritmo.",
    image: "media/journey-cultura.webp", alt: "Pavilhão cultural iluminado por lanternas",
    links: [
      { title: "Encontrar uma atividade", detail: "Práticas, expressão e convivência.", href: "atividades.html" },
      { title: "Aproximar-se da arte", detail: "Cinema, música, literatura e criação.", href: "cultura.html" },
      { title: "Consultar a programação", detail: "Veja os encontros apresentados pelo Instituto.", href: "programacao.html" },
    ],
  },
  {
    id: "pausar", label: "Quero uma pausa", eyebrow: "Presença também é um caminho",
    title: "Nem todo encontro precisa pedir uma decisão.",
    description: "Uma leitura, um instante de silêncio ou uma prática breve podem abrir espaço no dia. Você pode permanecer, descobrir algo novo e continuar quando fizer sentido.",
    image: "media/journey-inspiracao.webp", alt: "Caminho de pedras entre água e montanhas cobertas de névoa",
    links: [
      { title: "Encontrar inspiração", detail: "Textos e possibilidades de pausa.", href: "inspiracao.html" },
      { title: "Ler o mundo com cuidado", detail: "Conhecimento e contexto na Revista.", href: "revista.html" },
      { title: "Guardar uma lembrança", detail: "Um poema, uma reflexão ou uma pergunta para levar.", href: "#rodape-vivo" },
    ],
  },
];

const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function panel(path, index) {
  return `<section class="discovery-panel" id="discovery-panel-${path.id}" role="tabpanel" aria-labelledby="discovery-tab-${path.id}" tabindex="0"${index ? " hidden" : ""}>
    <figure class="discovery-figure"><img src="${path.image}" alt="${path.alt}" width="800" height="600" loading="lazy" decoding="async"><figcaption>${path.eyebrow}</figcaption></figure>
    <div class="discovery-copy"><p class="discovery-eyebrow">${String(index + 1).padStart(2, "0")} / Um caminho possível</p>
      <h3>${path.title}</h3><p>${path.description}</p>
      <ul class="discovery-links">${path.links.map((link) => `<li><a href="${link.href}"><span><strong>${link.title}</strong><small>${link.detail}</small></span><span aria-hidden="true">↗</span></a></li>`).join("")}</ul>
    </div>
  </section>`;
}

export function renderPortalDiscovery() {
  return `<section class="portal-discovery" aria-labelledby="discovery-title" data-portal-discovery data-keeps-expansion>
    <header class="discovery-heading" data-home-reveal><div><p class="discovery-eyebrow">Encontre seu ponto de partida</p><h2 id="discovery-title">O que faz sentido<br>para você hoje?</h2></div>
      <p>Um interesse pode levar a uma leitura. Uma leitura, a uma conversa. E uma conversa, a um novo caminho. O Potala aproxima pessoas, conhecimento, cuidado e cultura.</p></header>
    <div class="discovery-tabs" role="tablist" aria-label="Escolha um caminho">${DISCOVERY_PATHS.map((path, index) => `<button type="button" role="tab" id="discovery-tab-${path.id}" aria-controls="discovery-panel-${path.id}" aria-selected="${!index}" tabindex="${index ? -1 : 0}" data-discovery-tab="${index}"><span aria-hidden="true">0${index + 1}</span>${path.label}</button>`).join("")}</div>
    <div class="discovery-panels">${DISCOVERY_PATHS.map(panel).join("")}</div>
    <p class="discovery-footnote"><span aria-hidden="true">✧</span> Você pode mudar de caminho a qualquer momento.</p>
  </section>`;
}

export function renderCommunityInvitation() {
  return `<section class="home-community" aria-labelledby="community-title" data-home-reveal data-keeps-expansion>
    <header><p class="discovery-eyebrow">O ecossistema é feito de pessoas</p><h2 id="community-title">Existe espaço para<br>a sua contribuição.</h2>
      <p>Conhecimento compartilhado, cooperação e cuidado fazem uma comunidade crescer. Essa conversa também pode começar com você.</p></header>
    <div class="community-paths">
      <article><span class="community-symbol" aria-hidden="true">01</span><h3>Na sua organização</h3><p>Desenvolvimento humano, aprendizagem e bem-estar também fazem parte da vida das equipes.</p><a href="recepcao.html">Conversar sobre uma demanda da empresa ↗</a></article>
      <article><span class="community-symbol" aria-hidden="true">02</span><h3>Na comunidade</h3><p>Compartilhar tempo, conhecimento e presença é uma forma de ampliar os caminhos de cuidado.</p><a href="recepcao.html">Perguntar como participar ↗</a></article>
      <article><span class="community-symbol" aria-hidden="true">03</span><h3>Com o que você sabe</h3><p>Uma proposta de curso, uma colaboração cultural ou uma ideia podem dar início a novos encontros.</p><a href="recepcao.html">Apresentar uma ideia à Recepção ↗</a></article>
    </div>
  </section>`;
}

const BRIDGES = {
  cursos: ["Cuidar também é aprender.", "O conhecimento pode transformar a maneira como enxergamos os próximos passos."],
  atividades: ["Algumas experiências precisam ser vividas.", "Com o corpo, com a sensibilidade e com a convivência."],
  profissionais: ["Por trás de cada caminho, pessoas.", "Conhecer quem escuta, ensina e acompanha faz parte da escolha."],
  "arte-cultura": ["A arte também amplia o cuidado.", "Uma música, uma história e um encontro podem abrir novas perspectivas."],
  revista: ["O mundo também passa por aqui.", "Informação com contexto pode se transformar em compreensão."],
  inspiracao: ["Há espaço para simplesmente estar.", "Nem toda descoberta precisa se tornar uma decisão agora."],
};
export function renderNarrativeBridge(region) {
  const copy = BRIDGES[region?.id];
  if (!copy) return "";
  return `<div class="home-narrative-bridge" data-home-reveal><span aria-hidden="true">✧</span><p>${escape(copy[0])}</p><small>${escape(copy[1])}</small></div>`;
}

export function nextDiscoveryTab(current, key, count = DISCOVERY_PATHS.length) {
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowRight") return (current + 1) % count;
  if (key === "ArrowLeft") return (current - 1 + count) % count;
  return current;
}

export function mountPortalDiscovery(root, { reducedMotion = false, onLayoutChange = () => {} } = {}) {
  const surface = root.querySelector?.("[data-portal-discovery]");
  if (!surface) return () => {};
  const tabs = [...surface.querySelectorAll("[data-discovery-tab]")];
  const panels = [...surface.querySelectorAll('[role="tabpanel"]')];
  function select(index, focus = false) {
    tabs.forEach((tab, position) => { tab.setAttribute("aria-selected", String(position === index)); tab.tabIndex = position === index ? 0 : -1; });
    panels.forEach((element, position) => { element.hidden = position !== index; });
    if (focus) tabs[index]?.focus({ preventScroll: true });
    onLayoutChange();
  }
  const click = (event) => {
    const tab = event.target.closest("[data-discovery-tab]");
    if (tab) select(Number(tab.dataset.discoveryTab));
  };
  const keydown = (event) => {
    const tab = event.target.closest("[data-discovery-tab]");
    if (!tab || !["Home", "End", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault(); select(nextDiscoveryTab(Number(tab.dataset.discoveryTab), event.key, tabs.length), true);
  };
  surface.addEventListener("click", click);
  surface.addEventListener("keydown", keydown);
  let observer;
  if (!reducedMotion && typeof IntersectionObserver !== "undefined") {
    observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("home-revealed"); observer.unobserve(entry.target);
    }), { threshold: 0.15 });
    root.querySelectorAll("[data-home-reveal]").forEach((element) => observer.observe(element));
  }
  return () => { surface.removeEventListener("click", click); surface.removeEventListener("keydown", keydown); observer?.disconnect(); };
}
