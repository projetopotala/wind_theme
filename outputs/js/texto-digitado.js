/*
 * TEXTO DIGITADO.
 *
 * TextType — React Bits (https://reactbits.dev), por David Haz, portado para
 * JavaScript puro: esta página não usa React. O ciclo é o do original —
 * digitar a frase letra a letra, pausar com ela inteira, apagar e recomeçar —
 * com os mesmos tempos padrão (50 ms por letra, 2 s de pausa, 30 ms para
 * apagar) e o cursor "|" piscando a cada meio segundo. Adaptações:
 *
 * - O ciclo é uma máquina de estados pura (estadoInicial, esperaAntes, acao):
 *   o que o original fazia com três useState e um useEffect, aqui fica
 *   testável sem navegador.
 * - O cursor pisca por CSS, com a mesma curva do original (GSAP power2.inOut,
 *   ida e volta): a página não precisa carregar o GSAP só para isso.
 * - A frase inteira fica num molde invisível que reserva o espaço: o texto ao
 *   redor não sobe e desce enquanto a frase cresce e encolhe.
 * - Leitores de tela ouvem a frase inteira uma vez (não a digitação), e sem
 *   JavaScript ela aparece pronta no HTML.
 * - Com prefers-reduced-motion: reduce, a frase aparece inteira e parada.
 *
 * ---------------------------------------------------------------------------
 * MIT + Commons Clause License Condition v1.0 — Copyright (c) 2026 David Haz
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, and distribute the Software as part of
 * an application, website, or product, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * Commons Clause Restriction: you may use this Software, including for any
 * commercial purpose, so long as you do not sell, sublicense, or redistribute
 * the components themselves — whether alone, in a bundle, or as a ported
 * version.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED.
 * ---------------------------------------------------------------------------
 */

const PADRAO = {
  typingSpeed: 50,
  initialDelay: 0,
  pauseDuration: 2000,
  deletingSpeed: 30,
  loop: true,
  reverseMode: false,
  variableSpeed: null,
};

export const estadoInicial = () => ({ texto: "", indiceChar: 0, apagando: false, indiceFrase: 0 });

const fraseAtual = (estado, frases, { reverseMode }) => {
  const frase = frases[estado.indiceFrase] ?? "";
  return reverseMode ? [...frase].reverse().join("") : frase;
};

const velocidade = ({ typingSpeed, variableSpeed }) =>
  variableSpeed ? Math.random() * (variableSpeed.max - variableSpeed.min) + variableSpeed.min : typingSpeed;

/* Quanto esperar antes da próxima ação; null quando o ciclo terminou. */
export function esperaAntes(estado, frases, opcoes = {}) {
  const o = { ...PADRAO, ...opcoes };
  const frase = fraseAtual(estado, frases, o);
  if (estado.apagando) return estado.texto === "" ? 0 : o.deletingSpeed;
  if (estado.indiceChar === 0 && estado.texto === "") return o.initialDelay + velocidade(o);
  if (estado.indiceChar < frase.length) return velocidade(o);
  if (!o.loop && estado.indiceFrase === frases.length - 1) return null;
  return o.pauseDuration;
}

/* A ação seguinte: digitar uma letra, começar a apagar, apagar uma letra ou
   passar à próxima frase — na mesma ordem do original. */
export function acao(estado, frases, opcoes = {}) {
  const o = { ...PADRAO, ...opcoes };
  const frase = fraseAtual(estado, frases, o);
  if (estado.apagando) {
    if (estado.texto !== "") return { ...estado, texto: estado.texto.slice(0, -1) };
    return { texto: "", indiceChar: 0, apagando: false, indiceFrase: (estado.indiceFrase + 1) % frases.length };
  }
  if (estado.indiceChar < frase.length) {
    return { ...estado, texto: estado.texto + frase[estado.indiceChar], indiceChar: estado.indiceChar + 1 };
  }
  return { ...estado, apagando: true };
}

export function montarTextoDigitado(elemento, opcoes = {}) {
  const {
    text = elemento.textContent.trim(),
    showCursor = true,
    hideCursorWhileTyping = false,
    cursorCharacter = "|",
    cursorBlinkDuration = 0.5,
    textColors = [],
    startOnVisible = false,
    onSentenceComplete,
  } = opcoes;
  const frases = Array.isArray(text) ? text : [text];
  const maisLonga = frases.reduce((a, b) => (b.length > a.length ? b : a), "");

  const leitura = document.createElement("span");
  leitura.className = "text-type__sr";
  leitura.textContent = frases.join(" ");
  const molde = document.createElement("span");
  molde.className = "text-type__molde";
  molde.setAttribute("aria-hidden", "true");
  molde.textContent = `${maisLonga}${showCursor ? cursorCharacter : ""}`;
  const vivo = document.createElement("span");
  vivo.className = "text-type__vivo";
  vivo.setAttribute("aria-hidden", "true");
  const conteudo = document.createElement("span");
  conteudo.className = "text-type__content";
  vivo.append(conteudo);
  let cursor = null;
  if (showCursor) {
    cursor = document.createElement("span");
    cursor.className = "text-type__cursor";
    cursor.textContent = cursorCharacter;
    cursor.style.animationDuration = `${cursorBlinkDuration}s`;
    vivo.append(cursor);
  }
  elemento.replaceChildren(leitura, molde, vivo);
  elemento.classList.add("text-type");

  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    conteudo.textContent = frases[0];
    cursor?.remove();
    return () => {};
  }

  let estado = estadoInicial();
  let relogio = 0;
  let parado = false;

  const desenhar = () => {
    conteudo.textContent = estado.texto;
    conteudo.style.color = textColors.length ? textColors[estado.indiceFrase % textColors.length] : "";
    if (cursor && hideCursorWhileTyping) {
      const frase = frases[estado.indiceFrase];
      cursor.classList.toggle("text-type__cursor--hidden", estado.indiceChar < frase.length || estado.apagando);
    }
  };

  const seguir = () => {
    const espera = esperaAntes(estado, frases, opcoes);
    if (espera === null || parado) return;
    relogio = window.setTimeout(() => {
      const anterior = estado;
      estado = acao(estado, frases, opcoes);
      if (anterior.apagando && !estado.apagando) onSentenceComplete?.(frases[anterior.indiceFrase], anterior.indiceFrase);
      desenhar();
      seguir();
    }, espera);
  };

  desenhar();
  if (startOnVisible) {
    const observador = new IntersectionObserver((entradas) => {
      if (!entradas.some((entrada) => entrada.isIntersecting)) return;
      observador.disconnect();
      seguir();
    }, { threshold: 0.1 });
    observador.observe(elemento);
  } else {
    seguir();
  }

  return () => {
    parado = true;
    window.clearTimeout(relogio);
  };
}

/* Quantas letras já aparecem `decorrido` ms depois do início: uma a cada
   typingSpeed, passado o atraso inicial, sem passar do total. */
export function letrasDigitadas(decorrido, total, { typingSpeed = 20, initialDelay = 0 } = {}) {
  return Math.max(0, Math.min(total, Math.floor((decorrido - initialDelay) / typingSpeed)));
}

/*
 * DIGITAR UMA VEZ — a variação sem ciclo (loop: false), para textos longos: o
 * texto é digitado uma vez e fica, sem apagar nem recomeçar. Diferente de
 * montarTextoDigitado, o elemento guarda o próprio texto (o editor da página
 * lê e grava textContent; um molde duplicaria o texto): cada letra vira um
 * span, e só as ainda não digitadas ficam transparentes — o espaço fica
 * reservado, e o texto não pula de linha enquanto cresce. O cursor é um
 * pseudo-elemento, fora do texto. No fim ele pisca um instante e o elemento
 * volta a ser texto simples.
 */
export function digitarUmaVez(elemento, opcoes = {}) {
  const { typingSpeed = 20, initialDelay = 0, pausaDoCursor = 900 } = opcoes;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return () => {};

  const nos = [];
  const percurso = document.createTreeWalker(elemento, NodeFilter.SHOW_TEXT);
  while (percurso.nextNode()) nos.push(percurso.currentNode);
  const letras = [];
  for (const no of nos) {
    no.replaceWith(...[...no.data].map((letra) => {
      const span = document.createElement("span");
      span.className = "digitado__letra digitado__letra--oculta";
      span.append(letra);
      letras.push(span);
      return span;
    }));
  }

  let quadro = 0;
  let relogio = 0;
  let mostradas = 0;
  let cursor = null;
  const desfazer = () => {
    for (const span of letras) if (span.isConnected) span.replaceWith(...span.childNodes);
    elemento.normalize();
  };
  const inicio = performance.now();
  const passo = (agora) => {
    const alvo = letrasDigitadas(agora - inicio, letras.length, { typingSpeed, initialDelay });
    while (mostradas < alvo) letras[mostradas++].classList.remove("digitado__letra--oculta");
    const ultima = letras[mostradas - 1] ?? null;
    if (ultima !== cursor) {
      cursor?.classList.remove("digitado__letra--cursor");
      ultima?.classList.add("digitado__letra--cursor");
      cursor = ultima;
    }
    if (mostradas < letras.length) quadro = window.requestAnimationFrame(passo);
    else relogio = window.setTimeout(desfazer, pausaDoCursor);
  };
  quadro = window.requestAnimationFrame(passo);

  return () => {
    window.cancelAnimationFrame(quadro);
    window.clearTimeout(relogio);
    desfazer();
  };
}

/* Na página: a frase da entrada começa a ser digitada quando o "Bem-vindo"
   termina de se formar e o parágrafo acaba de aparecer. */
if (typeof document !== "undefined") {
  document.querySelectorAll("[data-texto-digitado]").forEach((elemento) => {
    montarTextoDigitado(elemento, { initialDelay: 1300 });
  });
}
