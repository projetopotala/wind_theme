import { consumeHandoff } from "../core/travessia-state.js";
import { damp, scrollCuePosition, scrollProgressForDocument } from "../core/math.js";
import { createBlockExpansion } from "./block-expansion.js";
import {
  createHomeAdminPreview,
  readAdminPreviewSnapshot,
  writeAdminPreviewSnapshot,
} from "./admin-preview.js";
import { invitationsFor, nextInvitationIndex } from "./invitations.js";
import { createLocalContentRepository } from "./content-repository.js";
import { DEFAULT_HOME_BLOCKS, JOURNEY_DISCOVERIES } from "./journey-data.js";
import { createHomePath } from "./home-path-three.js";
import { mountJourney } from "./home-scenes.js";

const clamp = (value, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));

export function holdEntryHandoff(root, {
  duration = 1800,
  schedule = setTimeout,
} = {}) {
  root.classList.add("entry-from-arrival");
  return schedule(() => {
    root.classList.remove("entry-from-arrival");
    root.classList.remove("entry-pending");
  }, duration);
}

// Mantidos como utilitários puros para páginas históricas; a nova Home usa o
// scroll nativo diretamente e não cria uma segunda posição de rolagem.
export function smoothJourneyScroll(current, target, elapsed, { reducedMotion = false } = {}) {
  return reducedMotion ? target : damp(current, target, elapsed, 150);
}

export function smoothRegionPresence(current, target, elapsed, { reducedMotion = false } = {}) {
  return reducedMotion ? target : damp(current, target, elapsed, 360);
}

export function motionOffsetForRegion({
  roadSide,
  signedDistance,
  viewportWidth,
  viewportHeight,
  reducedMotion = false,
}) {
  if (reducedMotion || signedDistance === 0) return { x: 0, y: 0 };
  const movement = clamp(Math.abs(signedDistance) / Math.max(1, viewportHeight));
  const amplitude = movement * Math.min(viewportWidth * 0.035, 48);
  if (roadSide === "left") return { x: -amplitude, y: 0 };
  if (roadSide === "right") return { x: amplitude, y: 0 };
  if (roadSide === "top") return { x: 0, y: -amplitude };
  if (roadSide === "bottom") return { x: 0, y: amplitude };
  return { x: 0, y: 0 };
}

function mountSoundResume(root, enabled) {
  if (!enabled) return () => {};
  const audio = document.createElement("audio");
  audio.src = "musica-fundo.mp3";
  audio.loop = true;
  audio.preload = "none";
  const button = document.createElement("button");
  button.className = "journey-sound";
  button.type = "button";
  button.textContent = "Retomar som";
  button.setAttribute("aria-pressed", "false");
  root.after(audio, button);

  const toggle = async () => {
    if (!audio.paused) {
      audio.pause();
      button.textContent = "Retomar som";
      button.setAttribute("aria-pressed", "false");
      return;
    }
    try {
      audio.volume = 0.24;
      await audio.play();
      button.textContent = "Silenciar";
      button.setAttribute("aria-pressed", "true");
    } catch {
      button.textContent = "Som indisponível";
    }
  };

  button.addEventListener("click", toggle);
  return () => {
    button.removeEventListener("click", toggle);
    audio.pause();
    button.remove();
    audio.remove();
  };
}

function createPresenceObserver(regions, { reducedMotion = false } = {}) {
  if (typeof IntersectionObserver === "undefined") {
    regions.forEach((region) => {
      region.style.setProperty("--region-presence", "1");
      region.classList.add("is-present");
    });
    return { disconnect() {} };
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const ratio = clamp(entry.intersectionRatio);
      const presence = reducedMotion ? (entry.isIntersecting ? 1 : 0) : ratio;
      entry.target.style.setProperty("--region-presence", presence.toFixed(4));
      entry.target.classList.toggle("is-present", entry.isIntersecting && presence > 0.08);
    });
  }, { threshold: [0, 0.15, 0.35, 0.6, 0.85] });

  regions.forEach((region) => observer.observe(region));
  return observer;
}

/**
 * Rolar o bastante para dizer "segui em frente" fecha o bloco aberto.
 *
 * O limiar existe para separar decisão de tremor: um toque no trackpad, o
 * repique de uma rolagem por inércia ou o ajuste de meia linha não podem
 * fechar o que a pessoa está lendo. Uma fração da altura da tela mede isso
 * melhor que um número fixo — a mesma distância que é um empurrão num monitor
 * é meia página num celular.
 */
export function shouldCloseOnScroll({
  openedAt = 0,
  scrollTop = 0,
  viewportHeight = 1,
  fraction = 0.18,
  minimum = 90,
} = {}) {
  const limiar = Math.max(minimum, Math.max(1, Number(viewportHeight) || 1) * fraction);
  return Math.abs(Number(scrollTop) - Number(openedAt)) > limiar;
}

export function createHomeController({
  root,
  canvas,
  blocks = DEFAULT_HOME_BLOCKS,
  pathFactory = createHomePath,
} = {}) {
  if (!root || !canvas) throw new TypeError("root e canvas são obrigatórios");

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  /*
   * As descobertas precisam CHEGAR aqui.
   *
   * A lista estava fixa em vazia, e com ela o mapa de descobertas nascia vazio:
   * os caminhos laterais e a lista de "caminhos a partir daqui" nunca tinham de
   * onde tirar título, descrição ou endereço, e simplesmente não apareciam — sem
   * erro, sem espaço vazio, sem nada que indicasse a ausência.
   */
  const mounted = mountJourney(root, { regions: blocks, discoveries: JOURNEY_DISCOVERIES });
  const path = pathFactory(canvas, { blocks, reducedMotion });
  /**
   * Quanto o vão do trajeto saiu do centro da tela, em pixels.
   *
   * A medida sai da própria grade já resolvida pelo navegador, e não de uma
   * segunda cópia da conta no JavaScript: quando a página abre para um lado,
   * as colunas mudam no CSS, e recalcular isso aqui criaria duas verdades que
   * envelhecem separadas. Basta ler as larguras usadas.
   */
  function gutterOffsetFor(section) {
    const stage = section?.closest?.(".region-stage");
    if (!stage) return 0;
    const estilo = getComputedStyle(stage);
    const colunas = estilo.gridTemplateColumns.split(" ").map(parseFloat);
    /* No telefone a grade tem duas colunas — vão e conteúdo — e o vão não sai
       do lugar ao abrir. Ler a segunda coluna ali seria medir o conteúdo, e a
       câmera andaria atrás de um deslocamento que não aconteceu. */
    if (colunas.length < 3) return 0;
    const [esquerda, vao] = colunas;
    if (!Number.isFinite(esquerda) || !Number.isFinite(vao)) return 0;
    const caixa = stage.getBoundingClientRect();
    const centroDoVao = caixa.left + parseFloat(estilo.paddingLeft) + esquerda + vao / 2;
    return centroDoVao - innerWidth / 2;
  }

  /*
   * A linha segue a ANIMAÇÃO do CSS, medindo-a a cada quadro.
   *
   * A alternativa seria repetir a curva de easing em JavaScript e animar a
   * câmera em paralelo. Duas curvas que precisam coincidir acabam divergindo —
   * basta alguém ajustar o tempo de um lado — e a divergência aparece
   * exatamente como o defeito que se quer evitar: a linha chegando antes ou
   * depois do vão que deveria ocupar.
   *
   * Lendo a grade interpolada, não há segunda curva: a linha está onde o vão
   * está, quadro a quadro, por construção. A leitura de layout por quadro é
   * limitada à duração da transição, e não ao tempo todo.
   */
  let shiftFrame = 0;
  let shiftUntil = 0;

  function followGutter(section) {
    shiftFrame = 0;
    if (destroyed) return;
    path.setLateralShift?.(section ? gutterOffsetFor(section) : 0);
    if (performance.now() < shiftUntil) shiftFrame = requestAnimationFrame(() => followGutter(section));
  }

  /*
   * De onde a rolagem começou a contar, e quando ela não deve contar.
   *
   * O menu e o convite ABREM um bloco e rolam até ele: sem a trégua, essa
   * própria rolagem fecharia o bloco que o clique acabou de trazer. Enquanto a
   * rolagem programada está em curso, a origem acompanha o movimento; ela só
   * congela quando os eventos param de chegar, e é daí em diante que o gesto
   * do visitante passa a valer.
   */
  let openScrollY = 0;
  let settleTimer = 0;
  let awaitingScroll = false;

  function armAutoClose({ programmatic = false } = {}) {
    openScrollY = scrollY;
    awaitingScroll = programmatic;
    clearTimeout(settleTimer);
    if (!programmatic) return;
    settleTimer = setTimeout(() => { awaitingScroll = false; }, 260);
  }

  const expansion = createBlockExpansion(root, {
    onChange: (entry) => {
      if (shiftFrame) cancelAnimationFrame(shiftFrame);
      shiftFrame = 0;
      // A janela cobre a transição do CSS com uma folga curta, e só ela.
      shiftUntil = performance.now() + (reducedMotion ? 0 : 820);
      followGutter(entry?.section ?? null);
      if (entry) armAutoClose();
    },
  });
  /*
   * A presença é medida no PAR, não no bloco.
   *
   * O bloco agora vive dentro de um palco fixo, então suas bordas praticamente
   * não se mexem em relação à tela — observá-lo devolveria presença constante e
   * o aparecer/desaparecer sumiria. É o par que atravessa a tela, e a
   * propriedade herda dele para os dois blocos, que assim entram e saem juntos.
   */
  const presenceObserver = createPresenceObserver(mounted.pairs, { reducedMotion });
  /*
   * O menu leva ao PAR, e abre o bloco pedido.
   *
   * Rolar até a região não funcionaria: com `display: contents` ela não tem
   * caixa própria, então não há posição para onde rolar. Quem tem geometria é
   * o par — e chegar lá mostrando os dois blocos sem dizer qual foi pedido
   * deixaria o clique pela metade, por isso o bloco também abre.
   */
  function goToSection(id) {
    const region = root.querySelector(`.journey-region[data-region-id="${CSS.escape(id)}"]`);
    const pair = region?.closest(".journey-pair");
    if (!pair) return;
    /*
     * `scrollTo` nesta janela, não `scrollIntoView` no elemento.
     *
     * `scrollIntoView` rola TODOS os contêineres ancestrais até o alvo aparecer
     * — e quando esta página roda dentro do iframe da prévia do painel, o
     * documento pai é um deles. O efeito era o painel saltar para baixo, até a
     * prévia, cada vez que um bloco era criado ou editado: a rolagem atravessava
     * a fronteira do iframe.
     *
     * `scrollTo` só move a janela em que é chamado. Na Home o resultado é o
     * mesmo; dentro da prévia, a rolagem para na borda do iframe.
     */
    const alvo = pair.getBoundingClientRect().top + scrollY;
    scrollTo({ top: alvo, behavior: reducedMotion ? "auto" : "smooth" });
    expansion.open(id);
    // A rolagem que o próprio clique disparou não pode fechar o que ele abriu.
    armAutoClose({ programmatic: true });
  }

  /*
   * O menu nasce recolhido e o ícone o traz.
   *
   * `inert` acompanha a visibilidade porque opacidade zero não tira nada da
   * ordem de tabulação: recolhido sem ele, o menu continuaria recebendo foco —
   * nove paradas invisíveis antes de qualquer coisa que se veja na tela.
   */
  const menuNav = root.querySelector(".journey-menu");
  const menuToggle = root.querySelector("[data-menu-toggle]");

  function setMenuOpen(open) {
    if (!menuNav || !menuToggle) return;
    menuToggle.setAttribute("aria-expanded", String(open));
    menuToggle.setAttribute("aria-label", open ? "Fechar o menu de seções" : "Abrir o menu de seções");
    menuNav.classList.toggle("is-open", open);
    if (open) menuNav.removeAttribute("inert");
    else menuNav.setAttribute("inert", "");
  }

  const onMenuToggle = () => {
    setMenuOpen(menuToggle?.getAttribute("aria-expanded") !== "true");
  };
  menuToggle?.addEventListener("click", onMenuToggle);

  const onMenuClick = (event) => {
    const botao = event.target.closest?.("[data-menu-target]");
    if (!botao) return;
    goToSection(botao.dataset.menuTarget);
    // Escolhida a seção, o menu sai da frente: mantê-lo aberto esconderia
    // justamente o bloco que o clique acabou de trazer.
    setMenuOpen(false);
  };
  menuNav?.addEventListener("click", onMenuClick);

  /*
   * Qual seção está sendo percorrida, para o menu dizer onde se está.
   *
   * A faixa estreita no meio da tela (as margens de -45%) é o que impede dois
   * pares de se dizerem atuais ao mesmo tempo durante a passagem de um para o
   * outro. Observador em vez de leitura por quadro: saber a seção atual não
   * justifica medir layout 60 vezes por segundo.
   */
  const currentObserver = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(
    (entradas) => {
      for (const entrada of entradas) {
        if (!entrada.isIntersecting) continue;
        const ids = [...entrada.target.querySelectorAll(".journey-region")]
          .map((region) => region.dataset.regionId);
        for (const item of mounted.menuItems) {
          const atual = ids.includes(item.dataset.menuTarget);
          item.setAttribute("aria-current", atual ? "true" : "false");
        }
      }
    },
    { rootMargin: "-45% 0px -45% 0px" },
  );
  mounted.pairs.forEach((pair) => currentObserver?.observe(pair));

  const handoff = consumeHandoff();
  const removeSound = mountSoundResume(root, handoff.soundEnabled === true);
  let frameId = 0;
  let entryTimer = 0;
  let destroyed = false;

  /*
   * O convite gira, mas para quando alguém olha.
   *
   * Texto que se troca sozinho é conteúdo em movimento: quem está lendo pode
   * ser interrompido no meio da frase. Pausar no ponteiro e no foco é o mínimo
   * — e com `prefers-reduced-motion` ele não gira de jeito nenhum, mostrando um
   * convite só. A alternativa (girar mais devagar) não resolve: continuaria
   * trocando sob os olhos de quem pediu para nada se mexer.
   */
  const invite = mounted.invite;
  const inviteTexto = invite?.querySelector?.("[data-invite-text]") ?? null;
  const convites = invitationsFor(blocks);
  let inviteIndex = 0;
  let inviteTimer = 0;
  let invitePausado = false;

  function showInvitation(index) {
    const convite = convites[index];
    if (!convite || !invite || !inviteTexto) return;
    inviteIndex = index;
    invite.dataset.inviteTarget = convite.id;
    // A troca acontece com o texto já apagado: escrever antes de sair faria a
    // frase nova aparecer por um quadro no lugar da antiga, antes da animação.
    invite.classList.add("is-swapping");
    setTimeout(() => {
      inviteTexto.textContent = convite.text;
      invite.classList.remove("is-swapping");
    }, reducedMotion ? 0 : 260);
  }

  function scheduleInvitation() {
    if (reducedMotion || convites.length < 2 || destroyed) return;
    clearTimeout(inviteTimer);
    inviteTimer = setTimeout(() => {
      if (!invitePausado) showInvitation(nextInvitationIndex(inviteIndex, convites.length));
      scheduleInvitation();
    }, 4600);
  }

  const pauseInvitation = () => { invitePausado = true; };
  const resumeInvitation = () => { invitePausado = false; };
  const onInviteClick = () => {
    if (invite?.dataset.inviteTarget) goToSection(invite.dataset.inviteTarget);
  };

  if (invite) {
    invite.addEventListener("pointerenter", pauseInvitation);
    invite.addEventListener("pointerleave", resumeInvitation);
    invite.addEventListener("focus", pauseInvitation);
    invite.addEventListener("blur", resumeInvitation);
    invite.addEventListener("click", onInviteClick);
    scheduleInvitation();
  }


  if (handoff.entry) entryTimer = holdEntryHandoff(document.documentElement);

  function update() {
    frameId = 0;
    if (destroyed || document.hidden) return;

    if (expansion.activeId) {
      if (awaitingScroll) {
        // Rolagem programada em curso: a origem anda junto e o relógio de
        // repouso recomeça a cada quadro que ainda se mexe.
        openScrollY = scrollY;
        clearTimeout(settleTimer);
        settleTimer = setTimeout(() => { awaitingScroll = false; }, 260);
      } else if (shouldCloseOnScroll({
        openedAt: openScrollY,
        scrollTop: scrollY,
        viewportHeight: innerHeight,
      })) {
        expansion.close();
      }
    }
    const progress = scrollProgressForDocument({
      scrollTop: scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: innerHeight,
    });
    document.documentElement.style.setProperty("--journey-scroll-progress", progress.toFixed(4));
    document.documentElement.style.setProperty(
      "--journey-scroll-position",
      scrollCuePosition({ progress, movable: true }),
    );
    path.setProgress(progress);
  }

  function requestUpdate() {
    if (!frameId && !destroyed && !document.hidden) frameId = requestAnimationFrame(update);
  }

  function onResize() {
    path.resize();
    requestUpdate();
  }

  function onVisibilityChange() {
    if (document.hidden) {
      path.pause();
      return;
    }
    path.resume();
    requestUpdate();
  }

  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", onResize, { passive: true });
  document.addEventListener("visibilitychange", onVisibilityChange);
  document.body.classList.add("is-ready");
  requestUpdate();

  return {
    mounted,
    path,
    goToSection,
    restore() {
      path.resume();
      path.resize();
      requestUpdate();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(entryTimer);
      presenceObserver.disconnect();
      if (shiftFrame) cancelAnimationFrame(shiftFrame);
      currentObserver?.disconnect();
      menuNav?.removeEventListener("click", onMenuClick);
      menuToggle?.removeEventListener("click", onMenuToggle);
      clearTimeout(inviteTimer);
      clearTimeout(settleTimer);
      invite?.removeEventListener("pointerenter", pauseInvitation);
      invite?.removeEventListener("pointerleave", resumeInvitation);
      invite?.removeEventListener("focus", pauseInvitation);
      invite?.removeEventListener("blur", resumeInvitation);
      invite?.removeEventListener("click", onInviteClick);
      expansion.destroy();
      path.destroy();
      removeSound();
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    },
  };
}

let activeController;

export async function mountHomeJourney({
  repository,
  elements,
  controllerFactory = createHomeController,
  lifecycle = true,
} = {}) {
  activeController?.destroy();
  const contentRepository = repository || createLocalContentRepository({ defaults: DEFAULT_HOME_BLOCKS });
  const previewMode = typeof location !== "undefined"
    && new URLSearchParams(location.search).get("admin-preview") === "1";
  const previewSnapshot = previewMode
    ? readAdminPreviewSnapshot(globalThis.sessionStorage)
    : null;
  const blocks = previewSnapshot?.blocks
    ?? await contentRepository.list({ publishedOnly: true });
  const resolvedElements = elements || {
    root: document.getElementById("journey-root"),
    canvas: document.getElementById("journey-road"),
  };
  activeController = controllerFactory({ ...resolvedElements, blocks });

  if (!lifecycle) return activeController;

  let previewChannel = null;
  if (previewMode) {
    document.documentElement.classList.add("is-admin-preview");
    previewChannel = createHomeAdminPreview({
      root: resolvedElements.root,
      initialBlocks: blocks,
      onSnapshot(payload) {
        writeAdminPreviewSnapshot(globalThis.sessionStorage, payload);
      },
      onStructureChange() {
        // Uma mudança estrutural (novo bloco, ordem, lado ou publicação) também
        // altera a curva Three.js. Um único reload reconstrói DOM e caminho;
        // as próximas teclas voltam a atualizar apenas o bloco, sem novo loop.
        globalThis.location?.reload?.();
      },
      onFocus(id) {
        activeController?.goToSection?.(id);
      },
    });
    if (previewSnapshot?.focusId) {
      const schedule = globalThis.requestAnimationFrame
        ? globalThis.requestAnimationFrame.bind(globalThis)
        : globalThis.setTimeout.bind(globalThis);
      schedule(() => activeController?.goToSection?.(previewSnapshot.focusId));
    }
  }

  const onPageHide = (event) => {
    if (!event.persisted) activeController?.destroy();
    else activeController?.path?.pause();
  };
  const onPageShow = (event) => {
    if (!event.persisted) return;
    delete document.documentElement.dataset.transitioning;
    document.documentElement.classList.remove("is-crossing");
    document.body.classList.remove("is-arrival-transitioning");
    activeController?.restore?.();
  };
  const destroy = activeController.destroy.bind(activeController);
  activeController.destroy = () => {
    previewChannel?.destroy();
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("pageshow", onPageShow);
    destroy();
  };
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", onPageShow);
  return activeController;
}
