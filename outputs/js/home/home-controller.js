import { consumeHandoff } from "../core/travessia-state.js";
import { damp, scrollCuePosition, scrollProgressForDocument } from "../core/math.js";
import { createBlockExpansion } from "./block-expansion.js";
import { createLocalContentRepository } from "./content-repository.js";
import { DEFAULT_HOME_BLOCKS } from "./journey-data.js";
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

export function createHomeController({
  root,
  canvas,
  blocks = DEFAULT_HOME_BLOCKS,
  pathFactory = createHomePath,
} = {}) {
  if (!root || !canvas) throw new TypeError("root e canvas são obrigatórios");

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mounted = mountJourney(root, { regions: blocks, discoveries: [] });
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
    const stage = section?.querySelector?.(".region-stage");
    if (!stage) return 0;
    const estilo = getComputedStyle(stage);
    const [esquerda, vao] = estilo.gridTemplateColumns.split(" ").map(parseFloat);
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

  const expansion = createBlockExpansion(root, {
    onChange: (entry) => {
      if (shiftFrame) cancelAnimationFrame(shiftFrame);
      shiftFrame = 0;
      // A janela cobre a transição do CSS com uma folga curta, e só ela.
      shiftUntil = performance.now() + (reducedMotion ? 0 : 820);
      followGutter(entry?.section ?? null);
    },
  });
  const presenceObserver = createPresenceObserver(mounted.regions, { reducedMotion });
  const handoff = consumeHandoff();
  const removeSound = mountSoundResume(root, handoff.soundEnabled === true);
  let frameId = 0;
  let entryTimer = 0;
  let destroyed = false;

  if (handoff.entry) entryTimer = holdEntryHandoff(document.documentElement);

  function update() {
    frameId = 0;
    if (destroyed || document.hidden) return;
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
  const blocks = await contentRepository.list({ publishedOnly: true });
  const resolvedElements = elements || {
    root: document.getElementById("journey-root"),
    canvas: document.getElementById("journey-road"),
  };
  activeController = controllerFactory({ ...resolvedElements, blocks });

  if (!lifecycle) return activeController;

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
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("pageshow", onPageShow);
    destroy();
  };
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", onPageShow);
  return activeController;
}

