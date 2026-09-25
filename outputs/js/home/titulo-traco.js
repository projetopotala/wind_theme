/*
 * TÍTULO EM TRAÇO.
 *
 * Os títulos das cenas ("Quem somos", "Atendimentos"...) se desenham quando
 * chegam à tela: cada letra é contornada em dourado, uma depois da outra, e a
 * tinta varre o título da esquerda para a direita. É o StrokeText (React +
 * GSAP) portado para JavaScript puro — esta página não usa React nem GSAP.
 * Adaptações:
 *
 * - Mais rápido que o original (1,6 s de traço e a tinta só 0,2 s depois dele,
 *   em 0,8 s: o título ficava tempo demais vazio). Aqui o traço leva 1 s por
 *   letra, 40 ms entre letras, e a tinta entra aos 0,8 s, ainda com as
 *   últimas letras sendo contornadas, e varre em 0,5 s.
 * - O h2 continua com o texto de verdade (é ele que o editor da página, a
 *   busca e os leitores de tela usam). O desenho é uma camada SVG irmã,
 *   escondida da leitura, posta exatamente sobre as palavras do h2 — medidas
 *   no próprio layout dele, então as quebras de linha são as mesmas.
 * - O h2 e o texto começam escondidos desde o primeiro quadro (a classe
 *   cenas-escritas vem do <head>) e só aparecem quando marcados com
 *   data-escrito: nunca ficam parados na tela antes do efeito. O h2 continua
 *   transparente enquanto a camada desenha; no fim ela sai e ele aparece no
 *   mesmo lugar, sem salto.
 * - Começa com a rolagem, uma vez só, e espera o bloco de texto da cena
 *   aparecer (no computador ele surge aos poucos com a rolagem).
 * - O texto abaixo do título é digitado uma vez (como a frase do Bem-vindo,
 *   mas sem apagar nem recomeçar), a partir do momento em que a tinta do
 *   título entra. Até lá ele fica transparente, guardando o lugar.
 * - Com prefers-reduced-motion: reduce, título e texto aparecem prontos.
 */

import { digitarUmaVez } from "../texto-digitado.js";

const SVG = "http://www.w3.org/2000/svg";
const COR_DO_TRACO = "#a78855";
/* pausa negativa: a tinta começa antes de o traço de cada letra terminar. */
const PADRAO = { desenho: 1000, intervalo: 40, pausa: -200, tinta: 500 };
/* O parágrafo tem umas 150 letras: aos 50 ms do Bem-vindo levaria 8 s. */
const VELOCIDADE_DO_PARAGRAFO = 20;
/* As curvas do GSAP: power2.out no traço, power2.inOut na tinta. */
const POWER2_OUT = "cubic-bezier(.25, .46, .45, .94)";
const POWER2_IN_OUT = "cubic-bezier(.455, .03, .515, .955)";

export function tempos(letras, t = PADRAO) {
  const inicioDaTinta = t.desenho + t.pausa;
  const duracaoDaTinta = Math.max(400, t.tinta);
  return {
    atrasoDaLetra: (indice) => indice * t.intervalo,
    inicioDaTinta,
    duracaoDaTinta,
    fim: Math.max(t.desenho + t.intervalo * Math.max(0, letras - 1), inicioDaTinta + duracaoDaTinta),
  };
}

export const comprimentoDoTraco = (corpo) => Math.max(corpo * 7, 200);
export const espessuraDoTraco = (corpo) => Math.max(0.9, Math.round(corpo * 0.011 * 10) / 10);

const elemento = (nome, atributos = {}) => {
  const no = document.createElementNS(SVG, nome);
  for (const [chave, valor] of Object.entries(atributos)) no.setAttribute(chave, String(valor));
  return no;
};

/* Distância do topo da área do texto (a caixa que o Range devolve) até a
   linha de base, para cada fonte. A sonda é um span em linha: posicionado,
   ele viraria bloco e mediria a partir da caixa da linha, com a entrelinha. */
const bases = new Map();
function linhaDeBase(estilo) {
  const fonte = `${estilo.fontStyle} ${estilo.fontWeight} ${estilo.fontSize} ${estilo.fontFamily}`;
  if (!bases.has(fonte)) {
    const sonda = document.createElement("div");
    sonda.style.cssText = `position:absolute;left:-9999px;top:0;visibility:hidden;white-space:nowrap;font:${fonte};line-height:${estilo.lineHeight}`;
    sonda.innerHTML = '<span>H<i style="display:inline-block;width:0;height:0"></i></span>';
    document.body.append(sonda);
    const texto = sonda.firstElementChild;
    bases.set(fonte, texto.querySelector("i").getBoundingClientRect().top - texto.getBoundingClientRect().top);
    sonda.remove();
  }
  return bases.get(fonte);
}

/* As palavras do h2 onde ele as desenhou: a linha de base, a fonte e a
   posição de cada letra. Cada letra leva o x que o h2 deu a ela — com o
   kerning do HTML, que o SVG, letra por letra, não aplicaria. */
function palavras(titulo) {
  const origem = titulo.getBoundingClientRect();
  const nos = [];
  const percurso = document.createTreeWalker(titulo, NodeFilter.SHOW_TEXT);
  while (percurso.nextNode()) nos.push(percurso.currentNode);
  const caixaDe = (no, inicio, fim) => {
    const faixa = document.createRange();
    faixa.setStart(no, inicio);
    faixa.setEnd(no, fim);
    return faixa.getClientRects()[0];
  };
  return nos.flatMap((no) => {
    const estilo = getComputedStyle(no.parentElement);
    return [...no.data.matchAll(/\S+/g)].map((achado) => {
      const caixa = caixaDe(no, achado.index, achado.index + achado[0].length);
      if (!caixa) return null;
      let posicao = achado.index;
      const letras = [...achado[0]].map((letra) => {
        const x = (caixaDe(no, posicao, posicao + letra.length)?.left ?? caixa.left) - origem.left;
        posicao += letra.length;
        return { letra, x };
      });
      return { letras, y: caixa.top - origem.top + linhaDeBase(estilo), estilo };
    }).filter(Boolean);
  });
}

function textoDaPalavra(palavra, classe) {
  const texto = elemento("text", { y: palavra.y.toFixed(2) });
  const { fontStyle, fontWeight, fontSize, fontFamily, letterSpacing } = palavra.estilo;
  Object.assign(texto.style, { fontStyle, fontWeight, fontSize, fontFamily, letterSpacing });
  for (const { letra, x } of palavra.letras) {
    const tspan = elemento("tspan", { x: x.toFixed(2) });
    if (classe) tspan.setAttribute("class", classe);
    tspan.textContent = letra;
    texto.append(tspan);
  }
  return texto;
}

function montarCamada(titulo, copia) {
  const corpo = parseFloat(getComputedStyle(titulo).fontSize) || 64;
  const camada = elemento("svg", { class: "titulo-traco", focusable: "false" });
  camada.setAttribute("aria-hidden", "true");
  /* Medida fracionária (offsetLeft arredonda e desloca a camada até 1 px). A
     cópia só translada, então a diferença entre as duas caixas é exata. */
  const caixa = titulo.getBoundingClientRect();
  const base = copia.getBoundingClientRect();
  Object.assign(camada.style, {
    left: `${caixa.left - base.left - copia.clientLeft}px`, top: `${caixa.top - base.top - copia.clientTop}px`,
    width: `${caixa.width}px`, height: `${caixa.height}px`,
  });
  const risco = elemento("g", {
    fill: "none", stroke: COR_DO_TRACO, "stroke-width": espessuraDoTraco(corpo),
    "stroke-linejoin": "round", "stroke-linecap": "round",
  });
  const tinta = elemento("g", { fill: getComputedStyle(titulo).color });
  for (const palavra of palavras(titulo)) {
    risco.append(textoDaPalavra(palavra, "titulo-traco__letra"));
    tinta.append(textoDaPalavra(palavra, ""));
  }
  camada.append(risco, tinta);
  return { camada, letras: [...risco.querySelectorAll("tspan")], tinta, traco: comprimentoDoTraco(corpo) };
}

export function montarTitulosEmTraco(raiz = document) {
  const titulos = [...raiz.querySelectorAll(".home-scene__copy h2")];
  const pagina = document.documentElement;
  if (!titulos.length || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    pagina.classList.remove("cenas-escritas");
    return () => {};
  }
  /* Avisa o <head> de que o módulo chegou: sem isso, ele desfaz o
     esconderijo depois de alguns segundos. */
  pagina.classList.add("cenas-escritas-prontas");
  const emCurso = new Map();
  const paragrafoDe = (titulo) => titulo.parentElement?.querySelector(":scope > p:not(.home-scene__eyebrow)");
  const blocosDe = (titulo) => titulo.parentElement?.querySelector(":scope > .cena-blocos-ilha");
  const digitacoes = new Map();

  const mostrar = (titulo) => titulo.setAttribute("data-escrito", "");

  function digitarParagrafo(titulo, atraso) {
    const paragrafo = paragrafoDe(titulo);
    if (!paragrafo || digitacoes.has(paragrafo)) return;
    /* Visível já com as letras que faltam transparentes (a digitação as
       embrulha na mesma tarefa, antes do próximo quadro). */
    paragrafo.setAttribute("data-escrito", "");
    /* Os blocos da seção sobem junto (o CSS escalona um a um). */
    blocosDe(titulo)?.setAttribute("data-escrito", "");
    digitacoes.set(paragrafo, digitarUmaVez(paragrafo, { initialDelay: atraso, typingSpeed: VELOCIDADE_DO_PARAGRAFO }));
  }

  function encerrar(titulo) {
    const desenho = emCurso.get(titulo);
    if (!desenho) return;
    emCurso.delete(titulo);
    desenho.animacoes.forEach((animacao) => animacao.cancel());
    desenho.camada.remove();
    mostrar(titulo);
  }

  function desenhar(titulo) {
    const copia = titulo.offsetParent;
    if (!copia || !titulo.textContent.trim()) {
      mostrar(titulo);
      return digitarParagrafo(titulo, 0);
    }
    const { camada, letras, tinta, traco } = montarCamada(titulo, copia);
    copia.append(camada);
    const t = tempos(letras.length);
    digitarParagrafo(titulo, t.inicioDaTinta);
    const animacoes = letras.map((letra, indice) => {
      letra.style.strokeDasharray = `${traco}`;
      return letra.animate(
        [{ strokeDashoffset: `${traco}` }, { strokeDashoffset: "0" }],
        { duration: PADRAO.desenho, delay: t.atrasoDaLetra(indice), easing: POWER2_OUT, fill: "both" },
      );
    });
    animacoes.push(tinta.animate(
      [{ clipPath: "inset(-25% 100% -25% -2%)" }, { clipPath: "inset(-25% -2% -25% -2%)" }],
      { duration: t.duracaoDaTinta, delay: t.inicioDaTinta, easing: POWER2_IN_OUT, fill: "both" },
    ));
    emCurso.set(titulo, { camada, animacoes });
    Promise.all(animacoes.map((animacao) => animacao.finished)).then(() => {
      if (emCurso.get(titulo)?.camada !== camada) return;
      emCurso.delete(titulo);
      /* O h2 reaparece sob a tinta, que é idêntica; o contorno some devagar. */
      mostrar(titulo);
      camada.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, easing: "ease-out" })
        .finished.then(() => camada.remove(), () => camada.remove());
    }, () => {});
  }

  /* No computador o bloco de texto surge aos poucos com a rolagem: o título
     espera ele estar quase inteiro. Se a rolagem parar antes, desenha mesmo
     assim, para não ficar um título invisível sobre um parágrafo à vista. */
  function quandoVisivel(titulo) {
    const copia = titulo.offsetParent || titulo.parentElement;
    let quadro = 0;
    const pronto = () => Number(getComputedStyle(copia).opacity) >= 0.55;
    const partir = () => {
      window.removeEventListener("scroll", conferir);
      window.clearTimeout(reserva);
      window.cancelAnimationFrame(quadro);
      /* A medida das palavras precisa da fonte do título já carregada. */
      (document.fonts?.ready ?? Promise.resolve()).then(() => desenhar(titulo), () => desenhar(titulo));
    };
    const conferir = () => {
      window.cancelAnimationFrame(quadro);
      quadro = window.requestAnimationFrame(() => { if (pronto()) partir(); });
    };
    const reserva = window.setTimeout(partir, 1200);
    if (pronto()) return partir();
    window.addEventListener("scroll", conferir, { passive: true });
  }

  const observador = new IntersectionObserver((entradas) => {
    for (const entrada of entradas) {
      if (!entrada.isIntersecting) continue;
      observador.unobserve(entrada.target);
      quandoVisivel(entrada.target);
    }
  }, { rootMargin: "0px 0px -18% 0px" });

  titulos.forEach((titulo) => observador.observe(titulo));

  /* Mudou o tamanho da tela no meio do desenho: as posições não valem mais,
     então o título aparece pronto. */
  const aoRedimensionar = () => [...emCurso.keys()].forEach(encerrar);
  window.addEventListener("resize", aoRedimensionar);

  return () => {
    observador.disconnect();
    window.removeEventListener("resize", aoRedimensionar);
    [...emCurso.keys()].forEach(encerrar);
    digitacoes.forEach((parar) => parar());
    titulos.forEach((titulo) => {
      mostrar(titulo);
      paragrafoDe(titulo)?.setAttribute("data-escrito", "");
      blocosDe(titulo)?.setAttribute("data-escrito", "");
    });
    pagina.classList.remove("cenas-escritas", "cenas-escritas-prontas");
  };
}

if (typeof document !== "undefined") montarTitulosEmTraco();
