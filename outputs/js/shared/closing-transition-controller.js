/**
 * Quanto o centro do elemento está longe do centro da tela, em fração da altura.
 *
 * 0 quer dizer centrado. 0.5 quer dizer meia tela de distância.
 *
 * Pura e exportada porque é a regra que decide quando a frase de encerramento
 * aparece — e a regra é o que se erra, não a mecânica do observador.
 */
export function desvioDoCentro(retangulo, alturaDaTela) {
  const altura = Number(alturaDaTela) || 0;
  if (!retangulo || !altura) return 1;
  const centroDoElemento = retangulo.top + retangulo.height / 2;
  return Math.abs(centroDoElemento - altura / 2) / altura;
}

/**
 * A folga que ainda conta como centralizado.
 *
 * 18% da altura da tela. Zero exigiria o pixel exato e a frase talvez nunca
 * aparecesse — a rolagem por roda anda de cem em cem pixels e pode pular o
 * ponto. 18% é perto o bastante para a imagem estar claramente no meio.
 */
export const FOLGA_DE_CENTRO = 0.18;

export function mountClosingTransition({
  triggerSelector = "[data-section-closing-trigger]",
  veilSelector = "[data-section-closing-veil]",
  canvasSelector = "[data-section-closing-canvas]",
  activeClass = "is-section-closing",
} = {}) {
  const body = document.body;
  const trigger = document.querySelector(triggerSelector);
  const veil = document.querySelector(veilSelector);
  if (!trigger || !veil) return;

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const canvas = veil.querySelector?.(canvasSelector);
  let played = false;
  let scrollDismissEnabled = false;
  let scrollUnlockTimer = 0;
  let closingScene = null;

  const startClosingScene = () => {
    if (!canvas || reducedMotion) return;
    import("../about/about-closing-scene.js")
      .then(({ createAboutClosingScene }) => {
        closingScene ||= createAboutClosingScene({ canvas });
        if (!veil.hidden && veil.dataset.state !== "leaving") closingScene.start();
      })
      .catch(() => {
        canvas.hidden = true;
      });
  };

  const onScrollIntent = (event) => {
    if (veil.hidden || veil.dataset.state === "leaving") return;
    event.preventDefault();
    if (scrollDismissEnabled) leave();
  };

  const onKeydown = (event) => {
    const scrollKeys = ["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "];
    const closesImmediately = event.key === "Escape" || event.key === "Enter";
    if (!closesImmediately && !scrollKeys.includes(event.key)) return;
    event.preventDefault();
    if (closesImmediately || scrollDismissEnabled) leave();
  };

  const finish = () => {
    clearTimeout(scrollUnlockTimer);
    closingScene?.stop();
    veil.hidden = true;
    delete veil.dataset.state;
    delete veil.dataset.scrollReady;
    body.classList.remove(activeClass);
    document.documentElement?.classList.remove(activeClass);
    veil.removeEventListener("click", leave);
    veil.removeEventListener("wheel", onScrollIntent);
    veil.removeEventListener("touchmove", onScrollIntent);
    veil.removeEventListener("keydown", onKeydown);
  };

  const leave = () => {
    if (veil.hidden || veil.dataset.state === "leaving") return;
    veil.dataset.state = "leaving";
    setTimeout(finish, reducedMotion ? 1 : 800);
  };

  const play = () => {
    if (played) return;
    played = true;
    body.classList.add(activeClass);
    document.documentElement?.classList.add(activeClass);
    veil.hidden = false;
    veil.dataset.state = "covering";
    startClosingScene();
    veil.focus?.({ preventScroll: true });
    veil.addEventListener("click", leave);
    veil.addEventListener("wheel", onScrollIntent, { passive: false });
    veil.addEventListener("touchmove", onScrollIntent, { passive: false });
    veil.addEventListener("keydown", onKeydown);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        veil.dataset.state = "message";
        scrollUnlockTimer = setTimeout(() => {
          scrollDismissEnabled = true;
          veil.dataset.scrollReady = "true";
        }, 4500);
      });
    });
  };

  if (typeof globalThis.IntersectionObserver !== "function") {
    play();
    return;
  }

  /*
   * A FRASE SÓ APARECE COM A IMAGEM NO CENTRO.
   *
   * O gatilho era `threshold: 0.08` — bastavam 8% da imagem assomando na borda
   * de baixo para o véu cobrir a tela e o texto começar. Quem ainda estava
   * lendo a seção era interrompido por uma frase sobre uma imagem que mal tinha
   * visto.
   *
   * A `rootMargin` negativa nos dois lados encolhe a área de observação a uma
   * faixa no meio da tela: o elemento passa a "intersectar" só quando cruza o
   * centro. E a conferência do desvio confirma que é o CENTRO DELE que chegou
   * ali, e não só uma ponta — numa imagem alta as duas coisas são bem
   * diferentes.
   *
   * Enquanto não estiver centrado, continua observando: desistir na primeira
   * checagem faria a frase nunca aparecer se a pessoa rolasse depressa.
   */
  /*
   * Centrado o bastante para tocar? Sem como medir, sim — reter a frase por uma
   * limitação do ambiente transformaria conteúdo em coisa que nunca aparece.
   */
  const noCentro = () => {
    const retangulo = trigger.getBoundingClientRect?.();
    const altura = globalThis.innerHeight;
    if (!retangulo || !altura) return true;
    return desvioDoCentro(retangulo, altura) <= FOLGA_DE_CENTRO;
  };

  /*
   * O OBSERVADOR AVISA QUE CHEGOU PERTO; QUEM ESPERA O CENTRO É A ROLAGEM.
   *
   * `IntersectionObserver` só chama de volta quando um limiar é CRUZADO. Uma
   * imagem alta entra na faixa central ainda bem longe de centrada, a
   * conferência recusa — e nunca mais há cruzamento nenhum para avisar que
   * agora sim. A frase simplesmente não aparecia.
   *
   * Então o observador faz o que sabe fazer: dizer que o assunto está por perto,
   * sem custo de rolagem até lá. Dali em diante quem mede é um ouvinte de
   * rolagem, que morre assim que a frase toca.
   */
  let aguardando = null;

  const aoRolar = () => {
    if (!noCentro()) return;
    pararDeEsperar();
    play();
  };

  function pararDeEsperar() {
    if (!aguardando) return;
    globalThis.removeEventListener?.("scroll", aguardando);
    aguardando = null;
  }

  const observer = new IntersectionObserver((entries, currentObserver) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting || aguardando) return;
      currentObserver.unobserve(entry.target);
      if (noCentro()) {
        play();
        return;
      }
      aguardando = aoRolar;
      globalThis.addEventListener?.("scroll", aguardando, { passive: true });
    });
  }, { threshold: 0, rootMargin: "-40% 0px -40% 0px" });

  observer.observe(trigger);
}
