import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/*
 * AS COREOGRAFIAS DAS CENAS.
 *
 * No computador, cada cena é UMA timeline em `scrub` sobre todo o percurso
 * da cena (do topo dela entrando por baixo até a base sair por cima). A
 * rolagem é o relógio: descer avança, subir desfaz. Esse percurso tem três
 * trechos, proporcionais à distância rolada em cada um:
 *
 *   entrada      a cena sobe até o topo      — a imagem é descoberta
 *   permanência  o palco fica preso           — o texto entra em sequência
 *   saída        o palco vai embora           — a imagem é recortada de novo
 *                                               enquanto a próxima cena entra
 *
 * Uma timeline só, e não uma por trecho: cada propriedade tem um dono, e a
 * ordem em que os trechos se desenham é sempre a mesma — mesmo num salto de
 * rolagem, que antes deixava duas timelines disputando o mesmo `y`.
 *
 * Cada variante descobre a imagem de um jeito — de baixo, da esquerda, por
 * trás de um painel, numa janela que se abre, num cruzamento — para que a
 * travessia tenha ritmo em vez de repetir um efeito.
 *
 * No celular não há palco preso: cada imagem é descoberta quando entra na
 * tela e recortada quando sai, com menos sobreposição.
 */

const INTEIRA = "inset(0% 0% 0% 0%)";

/* Os três trechos, em frações da timeline. As alturas das cenas são medidas
   em svh, então a proporção não muda com o tamanho da janela. */
function fases(secao) {
  const tela = window.innerHeight;
  const altura = secao.offsetHeight;
  const total = altura + tela;
  const e = tela / total;
  const p = Math.max(altura - tela, 0) / total;
  const s = tela / total;
  const tl = gsap.timeline({
    defaults: { ease: "none" },
    scrollTrigger: { trigger: secao, start: "top bottom", end: "bottom top", scrub: 0.4, invalidateOnRefresh: true },
  });
  tl.set({}, {}, 1);
  /* Só a entrada desenha o estado inicial na montagem ("antes da entrada");
     os trechos seguintes partem de onde o anterior parou. */
  const trecho = (inicio, largura, imediato) => (alvos, de, para, em = 0, duracao = 1) =>
    tl.fromTo(alvos, de, { immediateRender: imediato, ...para, duration: duracao * largura }, inicio + em * largura);
  return { entrada: trecho(0, e, true), permanencia: trecho(e, p, false), saida: trecho(e + p, s, false) };
}

/* Número e marcador chegam no fim da entrada; o título tem o próprio
   SplitText; descrição, caminhos e escolha entram já com o palco preso. */
function texto(q, { entrada, permanencia }) {
  entrada(q(".cena__numero, .cena__kicker"), { opacity: 0, y: 34 }, { opacity: 1, y: 0, stagger: 0.03, ease: "power2.out" }, 0.62, 0.36);
  permanencia(q(".cena__descricao, .cena__links, .cena__escolha"), { opacity: 0, y: 26 }, { opacity: 1, y: 0, stagger: 0.04, ease: "power2.out", immediateRender: true }, 0.02, 0.3);
}

function saidaDoTexto(q, { saida }) {
  saida(q(".cena__texto"), { opacity: 1, y: 0 }, { opacity: 0, y: -50 }, 0, 0.6);
}

function noCelular(secao, { de, ate }) {
  const q = gsap.utils.selector(secao);
  const [foto] = q(".cena__foto");
  const [recorte] = q(".cena__recorte");
  const suave = { scrub: 0.4, invalidateOnRefresh: true };

  gsap.fromTo(foto, { clipPath: de }, { clipPath: INTEIRA, ease: "none", scrollTrigger: { ...suave, trigger: foto, start: "top 92%", end: "top 38%" } });
  gsap.fromTo(q(".cena__foto img"), { scale: 1.12 }, { scale: 1, ease: "none", scrollTrigger: { ...suave, trigger: foto, start: "top 92%", end: "bottom 30%" } });
  gsap.fromTo(foto, { clipPath: INTEIRA }, { clipPath: ate, ease: "none", immediateRender: false, scrollTrigger: { ...suave, trigger: foto, start: "bottom 42%", end: "bottom top" } });
  if (recorte) {
    gsap.fromTo(recorte, { clipPath: "inset(100% 0% 0% 0%)", y: 30 }, { clipPath: INTEIRA, y: 0, ease: "power2.out", scrollTrigger: { ...suave, trigger: recorte, start: "top 96%", end: "top 58%" } });
  }
  gsap.fromTo(q(".cena__numero, .cena__kicker, .cena__descricao, .cena__links, .cena__escolha"), { opacity: 0, y: 24 }, {
    opacity: 1,
    y: 0,
    stagger: 0.12,
    duration: 0.7,
    ease: "power2.out",
    scrollTrigger: { trigger: q(".cena__texto")[0], start: "top 84%", toggleActions: "play none none reverse" },
  });
}

export const COREOGRAFIAS = {
  /* 01 · A imagem surge de baixo enquanto a máscara sobe. */
  sobe(secao, { celular }) {
    if (celular) return noCelular(secao, { de: "inset(100% 0% 0% 0%)", ate: "inset(0% 0% 45% 0%)" });
    const q = gsap.utils.selector(secao);
    const f = fases(secao);
    f.entrada(q(".cena__foto"), { clipPath: "inset(100% 0% 0% 0%)", y: 90 }, { clipPath: INTEIRA, y: 0, ease: "power2.out" });
    f.entrada(q(".cena__foto img"), { yPercent: 10, scale: 1.08 }, { yPercent: 0, scale: 1.02 });
    f.entrada(q(".cena__moldura"), { y: 140, opacity: 0 }, { y: 40, opacity: 1 });
    f.entrada(q(".cena__recorte"), { clipPath: "inset(100% 0% 0% 0%)", y: 120 }, { clipPath: INTEIRA, y: 20, ease: "power2.out" }, 0.45, 0.55);
    texto(q, f);
    f.permanencia(q(".cena__foto img"), { yPercent: 0, scale: 1.02 }, { yPercent: -4, scale: 1 });
    f.permanencia(q(".cena__moldura"), { y: 40 }, { y: -40 });
    f.permanencia(q(".cena__recorte"), { y: 20 }, { y: -60 });
    f.saida(q(".cena__foto"), { clipPath: INTEIRA }, { clipPath: "inset(0% 0% 48% 0%)" });
    f.saida(q(".cena__recorte"), { y: -60, opacity: 1 }, { y: -180, opacity: 0 });
    f.saida(q(".cena__moldura"), { y: -40, opacity: 1 }, { y: -120, opacity: 0 });
    saidaDoTexto(q, f);
  },

  /* 02 · A imagem é descoberta da esquerda para a direita. */
  lateral(secao, { celular }) {
    if (celular) return noCelular(secao, { de: "inset(0% 100% 0% 0%)", ate: "inset(0% 0% 40% 0%)" });
    const q = gsap.utils.selector(secao);
    const f = fases(secao);
    f.entrada(q(".cena__foto"), { clipPath: "inset(0% 100% 0% 0%)", x: -60 }, { clipPath: INTEIRA, x: 0, ease: "power2.out" });
    f.entrada(q(".cena__foto img"), { scale: 1.16 }, { scale: 1.05 });
    f.entrada(q(".cena__moldura"), { x: -90, opacity: 0 }, { x: -20, opacity: 1 });
    f.entrada(q(".cena__recorte"), { clipPath: "inset(0% 0% 0% 100%)", x: 80, y: 0 }, { clipPath: INTEIRA, x: 0, y: 0, ease: "power2.out" }, 0.45, 0.55);
    texto(q, f);
    f.permanencia(q(".cena__foto img"), { scale: 1.05 }, { scale: 1 });
    f.permanencia(q(".cena__moldura"), { x: -20 }, { x: 30 });
    f.permanencia(q(".cena__recorte"), { y: 0 }, { y: -50 });
    f.saida(q(".cena__foto"), { clipPath: INTEIRA }, { clipPath: "inset(0% 0% 0% 55%)" });
    f.saida(q(".cena__recorte"), { y: -50, opacity: 1 }, { y: -160, opacity: 0 });
    f.saida(q(".cena__moldura"), { x: 30, opacity: 1 }, { x: 90, opacity: 0 });
    saidaDoTexto(q, f);
  },

  /* 03 · A imagem aparece por trás de um painel: a superfície que a cobria
     recolhe-se para dentro do painel de texto, que desliza até o lugar. */
  painel(secao, { celular }) {
    if (celular) return noCelular(secao, { de: "inset(0% 0% 100% 0%)", ate: "inset(42% 0% 0% 0%)" });
    const q = gsap.utils.selector(secao);
    const f = fases(secao);
    f.entrada(q(".cena__cortina"), { scaleX: 1 }, { scaleX: 0, ease: "power2.inOut" }, 0.1, 0.85);
    f.entrada(q(".cena__texto"), { x: -140 }, { x: 0, ease: "power2.out" }, 0.1, 0.85);
    f.entrada(q(".cena__foto img"), { scale: 1.1 }, { scale: 1.03 });
    f.entrada(q(".cena__moldura"), { y: 80, opacity: 0 }, { y: 20, opacity: 1 });
    f.entrada(q(".cena__recorte"), { clipPath: "inset(100% 0% 0% 0%)", y: 140 }, { clipPath: INTEIRA, y: 0, ease: "power2.out" }, 0.5, 0.5);
    texto(q, f);
    f.permanencia(q(".cena__foto img"), { scale: 1.03 }, { scale: 1 });
    f.permanencia(q(".cena__moldura"), { y: 20 }, { y: -30 });
    f.permanencia(q(".cena__recorte"), { y: 0 }, { y: -40 });
    f.saida(q(".cena__foto"), { clipPath: INTEIRA }, { clipPath: "inset(42% 0% 0% 0%)" });
    f.saida(q(".cena__recorte"), { y: -40, opacity: 1 }, { y: -150, opacity: 0 });
    f.saida(q(".cena__moldura"), { opacity: 1 }, { opacity: 0 }, 0, 0.5);
    saidaDoTexto(q, f);
  },

  /* 04 · Uma janela se abre até a paisagem inteira, que fica fixa enquanto as
     fotografias do primeiro plano passam por cima, em velocidades diferentes. */
  panorama(secao, { celular }) {
    if (celular) return noCelular(secao, { de: "inset(22% 18% 22% 18%)", ate: "inset(0% 0% 50% 0%)" });
    const q = gsap.utils.selector(secao);
    const f = fases(secao);
    const tela = () => window.innerHeight;
    f.entrada(q(".cena__foto"), { clipPath: "inset(16% 10% 16% 10%)" }, { clipPath: INTEIRA, ease: "power2.inOut" });
    f.entrada(q(".cena__foto img"), { scale: 1.14 }, { scale: 1.04 });
    f.entrada(q(".cena__moldura"), { opacity: 0, scale: 1.04 }, { opacity: 1, scale: 1 }, 0.3, 0.7);
    texto(q, f);
    f.permanencia(q(".cena__foto img"), { scale: 1.04, yPercent: 0 }, { scale: 1, yPercent: -3 });
    f.permanencia(q(".cena__recorte"), { y: () => tela() * 0.75 }, { y: () => -tela() * 0.75, immediateRender: true });
    f.permanencia(q(".cena__detalhe"), { y: () => tela() * 0.95 }, { y: () => -tela() * 1.05, immediateRender: true }, 0.08, 0.92);
    f.saida(q(".cena__foto"), { clipPath: INTEIRA }, { clipPath: "inset(0% 0% 62% 0%)" });
    f.saida(q(".cena__moldura"), { opacity: 1 }, { opacity: 0 }, 0, 0.5);
    saidaDoTexto(q, f);
  },

  /* 05 · Duas imagens se aproximam e se cruzam; uma delas toma a largura
     maior e a outra passa por trás dela. É a última cena: o texto e a
     escolha ficam até o rodapé chegar. */
  cruzamento(secao, { celular }) {
    if (celular) return noCelular(secao, { de: "inset(0% 50% 0% 50%)", ate: "inset(0% 0% 40% 0%)" });
    const q = gsap.utils.selector(secao);
    const f = fases(secao);
    f.entrada(q(".cena__foto"), { clipPath: "inset(0% 100% 0% 0%)", x: -40 }, { clipPath: "inset(0% 38% 0% 0%)", x: 0, ease: "power2.out" });
    f.entrada(q(".cena__foto img"), { scale: 1.12 }, { scale: 1.06 });
    f.entrada(q(".cena__recorte"), { clipPath: "inset(0% 0% 0% 100%)", x: 100 }, { clipPath: INTEIRA, x: 0, ease: "power2.out" }, 0.15, 0.85);
    f.entrada(q(".cena__moldura"), { opacity: 0, x: 60 }, { opacity: 1, x: 0 }, 0.3, 0.7);
    texto(q, f);
    f.permanencia(q(".cena__foto"), { clipPath: "inset(0% 38% 0% 0%)" }, { clipPath: INTEIRA, ease: "power1.inOut" }, 0, 0.7);
    f.permanencia(q(".cena__recorte"), { x: 0 }, { x: () => -window.innerWidth * 0.22, ease: "power1.inOut" }, 0, 0.7);
    f.permanencia(q(".cena__foto img"), { scale: 1.06 }, { scale: 1 });
    f.permanencia(q(".cena__moldura"), { x: 0 }, { x: -60 });
    f.saida(q(".cena__foto"), { clipPath: INTEIRA }, { clipPath: "inset(0% 0% 40% 0%)" });
    f.saida(q(".cena__moldura"), { opacity: 1 }, { opacity: 0 }, 0, 0.5);
  },
};

export function coreografar(secao, variante, opcoes) {
  COREOGRAFIAS[variante]?.(secao, opcoes);
}
