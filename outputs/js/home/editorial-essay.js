/* A rolagem controla cada quadro diretamente: subir reverte o mesmo progresso. */
const scenes = [...document.querySelectorAll('[data-essay-scene]')];
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
let ticking = false;

const clamp = (value) => Math.max(0, Math.min(1, value));
const windows = {
  bottom: { left: 6, right: 53, top: 12, height: 73 },
  left: { left: 49, right: 94, top: 11, height: 75 },
  behind: { left: 50, right: 94, top: 12, height: 73 },
  panorama: { left: 5, right: 95, top: 9, height: 79 },
  cross: { left: 6, right: 57, top: 11, height: 75 },
};

/*
 * O texto fica sempre sobre o papel: a janela da foto e a foto de detalhe se
 * afastam dele — para o lado no computador, para cima no celular, onde o
 * texto vem abaixo.
 *
 * No computador o afastamento é um VÃO largo (VAO), não uma folga. A linha da
 * jornada pode cruzar sua borda e desaparecer atrás da fotografia, sem cobrir
 * o texto. No celular a linha corre numa faixa à direita (TRILHO).
 */
const FOLGA = 28;
const VAO = 104;
const TRILHO = 30;
const TEXTOS_MENORES = '.home-scene__eyebrow, .home-scene__copy > p, .cena-blocos, .home-scene__links, .home-scene__copy > a';

/* A área dos textos inclui o título: a linha corre no vão, e o vão não pode
   ficar embaixo de uma palavra grande. */
function areaDosTextos(scene, stage) {
  let area = null;
  const titulo = scene.querySelector('.home-scene__copy h2');
  const faixaDoTitulo = titulo && document.createRange();
  faixaDoTitulo?.selectNodeContents(titulo);
  for (const r of [...[...scene.querySelectorAll(TEXTOS_MENORES)].map((element) => element.getBoundingClientRect()), faixaDoTitulo?.getBoundingClientRect()]) {
    if (!r || !r.width || !r.height) continue;
    const caixa = { left: r.left - stage.left, right: r.right - stage.left, top: r.top - stage.top, bottom: r.bottom - stage.top };
    area = area
      ? { left: Math.min(area.left, caixa.left), right: Math.max(area.right, caixa.right), top: Math.min(area.top, caixa.top), bottom: Math.max(area.bottom, caixa.bottom) }
      : caixa;
  }
  return area;
}

/* Quanto a foto de detalhe precisa andar para sair de perto dos textos. A
   posição de repouso é a medida na tela menos o deslocamento já aplicado. */
function afastamentoDoDetalhe(scene, stage, textos, mobile, dx, dy) {
  const detail = scene.querySelector('.home-scene__detail-image');
  if (!detail || !textos) return [0, 0];
  const r = detail.getBoundingClientRect();
  const antesX = parseFloat(scene.style.getPropertyValue('--essay-detail-x')) || 0;
  const antesY = parseFloat(scene.style.getPropertyValue('--essay-detail-y')) || 0;
  const d = {
    left: r.left - stage.left - antesX + dx,
    right: r.right - stage.left - antesX + dx,
    top: r.top - stage.top - antesY + dy,
    bottom: r.bottom - stage.top - antesY + dy,
  };
  const lado = mobile ? FOLGA : VAO;
  const cruza = d.left < textos.right + lado && d.right > textos.left - lado
    && d.top < textos.bottom + FOLGA && d.bottom > textos.top - FOLGA;
  if (!cruza) return [0, 0];
  if (mobile) return [0, textos.top - FOLGA - d.bottom];
  return (d.left + d.right) / 2 < (textos.left + textos.right) / 2
    ? [textos.left - VAO - d.right, 0]
    : [textos.right + VAO - d.left, 0];
}

/* A moldura fina é a própria janela da foto — mesmo tamanho, medida na mesma
   régua (o palco) — deslocada para cima e para fora, do lado oposto ao do
   texto, como a moldura da abertura. O CSS recorta o trecho que cairia sobre
   a foto: fica à vista só o canto de fora. Como ela se afasta do texto, a
   janela (já recortada pelo vão) basta para que também não o cruze. A
   moldura mora na área da mídia, que começa depois do recuo do palco: as
   medidas são convertidas para essa área no fim. */
const DESENCONTRO = 24;
const DESENCONTRO_CELULAR = 12;
function molduraDaJanela(scene, stage, textos, mobile, janela) {
  const media = scene.querySelector('.home-scene__media').getBoundingClientRect();
  if (!media.width || !media.height || !stage.width || !stage.height) return null;
  const l = (stage.width * janela.left) / 100;
  const r = (stage.width * janela.right) / 100;
  const t = (stage.height * janela.top) / 100;
  const b = (stage.height * janela.bottom) / 100;
  const passo = mobile ? DESENCONTRO_CELULAR : DESENCONTRO;
  const textoADireita = Boolean(textos) && (textos.left + textos.right) / 2 > (l + r) / 2;
  const dx = mobile || textoADireita ? -passo : passo;
  const dy = -passo;
  const origemX = media.left - stage.left;
  const origemY = media.top - stage.top;
  const x = (v) => (((v + dx - origemX) / media.width) * 100).toFixed(2);
  const y = (v) => (((v + dy - origemY) / media.height) * 100).toFixed(2);
  return { left: x(l), right: x(Math.max(l, r)), top: y(t), bottom: y(Math.max(t, b)), dx, dy, fechada: r - l < 4 || b - t < 4 };
}

function paintScene(scene, viewportHeight) {
  const bounds = scene.getBoundingClientRect();
  const near = bounds.bottom >= -viewportHeight * .25 && bounds.top <= viewportHeight * 1.25;
  scene.classList.toggle('is-near', near);
  if (!near) return;

  const travel = Math.max(1, bounds.height - viewportHeight);
  const progress = scene.dataset.essayVariant === 'opening'
    ? clamp(-bounds.top / travel)
    : clamp((viewportHeight * .86 - bounds.top) / (bounds.height + viewportHeight * .16));
  const opening = scene.dataset.essayVariant === 'opening';
  const variant = scene.dataset.essayVariant;
  /* No celular e no tablet o palco não fica preso: a cena rola com a página.
     A foto entra e fica — sair para cima a tiraria da faixa enquanto a cena
     ainda está sendo lida. */
  const mobile = window.innerWidth <= 980;
  const copy = clamp((progress - .14) / .32);
  const detail = clamp((progress - .28) / .34) * (mobile ? 1 : 1 - clamp((progress - .76) / .18));

  scene.style.setProperty('--essay-progress', progress.toFixed(4));
  if (opening) return;

  // A foto permanece fixa no fundo; é a abertura do plano frontal que atravessa a cena.
  const stage = scene.querySelector('.home-scene__stage').getBoundingClientRect();
  const mobileWindowHeight = variant === 'behind' || variant === 'cross' ? 40 : 48;
  const mobileRight = stage.width ? 100 - (TRILHO / stage.width) * 100 : 96;
  const windowPose = mobile ? { left: 4, right: mobileRight, top: 6, height: mobileWindowHeight } : windows[variant];
  const enter = clamp(progress / .45);
  const exit = mobile ? 0 : clamp((progress - .77) / .23);
  const top = windowPose.top + (1 - enter) * (mobile ? 58 : 78) - exit * (mobile ? 68 : 106);
  let { left, right } = windowPose;
  let bottom = top + windowPose.height;

  const textos = areaDosTextos(scene, stage);
  if (textos && stage.width && stage.height) {
    const coluna = stage.width / 100;
    if (mobile) {
      // O texto vem abaixo da foto: a janela sobe de trás dele, nunca por baixo.
      bottom = Math.min(bottom, (textos.top - FOLGA) / (stage.height / 100));
    } else if ((textos.left + textos.right) / 2 < ((left + right) / 2) * coluna) {
      left = Math.max(left, (textos.right + VAO) / coluna);
    } else {
      right = Math.min(right, (textos.left - VAO) / coluna);
    }
  }
  const fechada = bottom - top < .5 || right - left < .5;
  if (fechada) bottom = top;
  const moldura = molduraDaJanela(scene, stage, textos, mobile, { left, right, top, bottom });
  scene.classList.toggle('is-janela-fechada', fechada || !moldura || moldura.fechada);
  if (moldura) {
    scene.style.setProperty('--essay-frame-left', `${moldura.left}%`);
    scene.style.setProperty('--essay-frame-right', `${moldura.right}%`);
    scene.style.setProperty('--essay-frame-top', `${moldura.top}%`);
    scene.style.setProperty('--essay-frame-bottom', `${moldura.bottom}%`);
    scene.style.setProperty('--essay-frame-dx', `${moldura.dx}px`);
    scene.style.setProperty('--essay-frame-dy', `${moldura.dy}px`);
  }

  /* No celular a foto de detalhe só sobe: deslizar para o lado a levaria à
     faixa da linha, à direita. */
  const detailX = mobile ? 0 : (variant === 'cross' ? 36 : -16) * (1 - detail);
  const detailY = 22 * (1 - detail);
  const [afastaX, afastaY] = afastamentoDoDetalhe(scene, stage, textos, mobile, detailX, detailY);

  scene.style.setProperty('--essay-window-left', `${left.toFixed(2)}%`);
  scene.style.setProperty('--essay-window-right', `${right.toFixed(2)}%`);
  scene.style.setProperty('--essay-window-top', `${top.toFixed(2)}%`);
  scene.style.setProperty('--essay-window-bottom', `${bottom.toFixed(2)}%`);
  scene.style.setProperty('--essay-copy-opacity', (.34 + .66 * copy).toFixed(3));
  scene.style.setProperty('--essay-copy-y', `${(16 * (1 - copy)).toFixed(2)}px`);
  scene.style.setProperty('--essay-detail-opacity', detail.toFixed(3));
  scene.style.setProperty('--essay-detail-x', `${(detailX + afastaX).toFixed(2)}px`);
  scene.style.setProperty('--essay-detail-y', `${(detailY + afastaY).toFixed(2)}px`);
}

function paint() {
  ticking = false;
  if (motionPreference.matches) return;
  const viewportHeight = window.innerHeight || 1;
  for (const scene of scenes) paintScene(scene, viewportHeight);
}

function schedulePaint() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(paint);
}

function setMotionMode() {
  if (motionPreference.matches) {
    document.documentElement.classList.remove('has-essay-motion');
    for (const scene of scenes) {
      scene.removeAttribute('style');
      scene.classList.remove('is-near', 'is-janela-fechada');
    }
  } else {
    const viewportHeight = window.innerHeight || 1;
    for (const scene of scenes) paintScene(scene, viewportHeight);
    document.documentElement.classList.add('has-essay-motion');
  }
  /* Com e sem movimento, as cenas se compõem de outro jeito: quem mediu a
     página antes (a linha da jornada) precisa medir de novo. */
  document.dispatchEvent(new CustomEvent('ensaio:composicao'));
}

if (scenes.length) {
  setMotionMode();
  window.addEventListener('scroll', schedulePaint, { passive: true });
  window.addEventListener('resize', schedulePaint, { passive: true });
  motionPreference.addEventListener('change', setMotionMode);
}
