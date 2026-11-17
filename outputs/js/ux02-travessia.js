const root = document.querySelector('[data-journey]');
const welcome = document.querySelector('[data-welcome]');
const status = document.querySelector('[data-status]');
const context = document.querySelector('[data-context]');

const regions = {
  care: {
    kicker: 'Quero cuidar de mim',
    title: 'Atendimentos e profissionais',
    body: 'Conheça os caminhos de cuidado, compare possibilidades e entenda como solicitar um horário. Conhecer é público; pedir um horário pode exigir conta e confirmação do Instituto.',
    actions: [{ label: 'Conhecer atendimentos', href: 'atendimentos.html' }, { label: 'Ver profissionais', href: 'profissionais.html' }],
  },
  learn: {
    kicker: 'Quero aprender',
    title: 'Cursos e conhecimento',
    body: 'Descubra cursos, formações e conteúdos do Instituto. A programação pública mostra os caminhos disponíveis; inscrições e turmas dependem da oferta confirmada.',
    actions: [{ label: 'Conhecer cursos', href: 'cursos.html' }, { label: 'Ver atividades', href: 'atividades.html' }],
  },
  move: {
    kicker: 'Quero participar',
    title: 'Atividades e encontros',
    body: 'Encontre práticas corporais, arte, convivência e experiências culturais. Você pode conhecer as opções antes de decidir e falar com a Recepção para confirmar horários.',
    actions: [{ label: 'Conhecer atividades', href: 'atividades.html' }, { label: 'Falar com a Recepção', href: 'recepcao.html' }],
  },
};

function showRegion(key) {
  const data = regions[key];
  if (!data) return;
  context.replaceChildren();
  const kicker = document.createElement('p'); kicker.className = 'guided__context-kicker'; kicker.textContent = data.kicker;
  const title = document.createElement('h3'); title.textContent = data.title;
  const body = document.createElement('p'); body.textContent = data.body;
  const actions = document.createElement('p');
  for (const action of data.actions) { const link = document.createElement('a'); link.href = action.href; link.textContent = action.label; link.style.marginRight = '16px'; actions.append(link); }
  context.append(kicker, title, body, actions);
  context.scrollIntoView?.({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
  status.textContent = `${data.title}: escolha uma ação ou continue explorando.`;
}

for (const button of document.querySelectorAll('[data-region]')) button.addEventListener('click', () => showRegion(button.dataset.region));
for (const button of document.querySelectorAll('[data-start]')) button.addEventListener('click', () => {
  root.hidden = false; welcome.hidden = true;
  if (button.dataset.start === 'free') status.textContent = 'Explore os três caminhos; você pode voltar à Chegada a qualquer momento.';
  document.querySelector('[data-journey] h2')?.focus?.({ preventScroll: true });
});
