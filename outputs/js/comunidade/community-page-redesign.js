const icon = (name) => {
  const paths = {
    book: '<path d="M4 5.5c3.3-1 5.9-.4 8 1.5 2.1-1.9 4.7-2.5 8-1.5V19c-3.3-1-5.9-.4-8 1.5C9.9 18.6 7.3 18 4 19V5.5ZM12 7v13.5"/>',
    people: '<circle cx="8" cy="9" r="3"/><circle cx="17" cy="8" r="2.5"/><path d="M2.8 20c.4-4 2.2-6 5.2-6s4.8 2 5.2 6m1.3-6c3.7-.8 6.1 1.2 6.7 4.8"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M7 3v4m10-4v4M3.5 10h17"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>',
    leaf: '<path d="M5 19C5 10 10 5 19 5c0 9-5 14-14 14Zm0 0 9-9"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.leaf}</svg>`;
};

const CONFIG = Object.freeze({
  workshops: {
    eyebrow: "Encontros que cabem na agenda",
    statement: "Pequenos encontros. Grandes transformações.",
    steps: [["book", "Conhecimento aplicado"], ["calendar", "Um encontro pontual"], ["compass", "Um caminho para continuar"]],
    benefits: [["leaf", "Experimente um tema", "Sem compromisso com uma turma longa"], ["clock", "Tempo concentrado", "Encontros de poucas horas"], ["people", "Com quem já ensina aqui", "Facilitação da comunidade Potala"]],
  },
  "grupos-de-estudo": {
    eyebrow: "Você pode chegar em qualquer ciclo",
    statement: "O mesmo tema se revela de outro jeito quando há outras pessoas.",
    steps: [["book", "Ler"], ["people", "Conversar"], ["compass", "Retornar"]],
    benefits: [["leaf", "Sem matrícula", "Entre quando fizer sentido"], ["calendar", "Encontros recorrentes", "Continuidade que aprofunda"], ["people", "Leitura compartilhada", "Mais vozes, mais perspectivas"]],
  },
  mentorias: {
    eyebrow: "Um ciclo para o que pede atenção particular",
    statement: "Acompanhamento com começo, meio e fim.",
    steps: [["people", "Escutar"], ["compass", "Orientar"], ["leaf", "Acompanhar"]],
    benefits: [["people", "Encontro individual", "Tempo e atenção para seu percurso"], ["calendar", "Ciclo definido", "Com começo, meio e fim"], ["book", "Plano construído junto", "Apoio baseado na sua realidade"]],
  },
  eventos: {
    eyebrow: "Planeje os próximos encontros",
    statement: "Datas em que diferentes caminhos ocupam a mesma casa.",
    steps: [["calendar", "Acompanhar"], ["people", "Encontrar"], ["compass", "Participar"]],
    benefits: [["calendar", "Visão do semestre", "Antecipe os próximos encontros"], ["people", "Casa aberta", "Atividades que recebem novos públicos"], ["compass", "Programação atualizada", "Confirme datas antes de participar"]],
  },
});

export function mountCommunityPageRedesign(root = document) {
  const section = root.body?.dataset.section;
  const config = CONFIG[section];
  const hero = root.querySelector?.(".com-hero");
  if (!config || !hero || hero.querySelector(".community-hero-diagram")) return null;

  const diagram = root.createElement("aside");
  diagram.className = `community-hero-diagram community-hero-diagram--${section}`;
  diagram.setAttribute("aria-label", config.eyebrow);
  diagram.innerHTML = `<p>${config.eyebrow}</p><div>${config.steps.map(([symbol, label], index) => `
    <article>${icon(symbol)}<span>0${index + 1}</span><strong>${label}</strong></article>`).join("")}</div><blockquote>${config.statement}</blockquote>`;
  hero.append(diagram);

  const band = root.createElement("section");
  band.className = "community-benefits";
  band.setAttribute("aria-label", "Como funciona");
  band.innerHTML = config.benefits.map(([symbol, title, detail]) => `<article>${icon(symbol)}<div><strong>${title}</strong><p>${detail}</p></div></article>`).join("");
  hero.after(band);
  return { diagram, band };
}

if (typeof document !== "undefined") mountCommunityPageRedesign();
