import { consumeHandoff } from "../core/travessia-state.js";
import { damp, scrollCuePosition, scrollProgressForDocument } from "../core/math.js";
import { JOURNEY_DISCOVERIES, JOURNEY_REGIONS } from "./journey-data.js";
import { createHomeRoad } from "./home-road.js";
import { mountJourney, presenceForRegionBounds } from "./home-scenes.js";
import { createLateralExploration } from "./lateral-exploration.js";
import { roadOffsetForPathSection } from "./journey-layout.js";
import { crossTo } from "../chegada/transition-handoff.js";

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

export function smoothJourneyScroll(current, target, elapsed, {
  reducedMotion = false,
} = {}) {
  return reducedMotion ? target : damp(current, target, elapsed, 150);
}

export function smoothRegionPresence(current, target, elapsed, {
  reducedMotion = false,
} = {}) {
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
  const amplitude = movement * Math.min(viewportWidth * .035, 48);
  if (roadSide === "left") return { x: -amplitude, y: 0 };
  if (roadSide === "right") return { x: amplitude, y: 0 };
  if (roadSide === "top") return { x: 0, y: -amplitude };
  if (roadSide === "bottom") return { x: 0, y: amplitude };
  return { x: 0, y: 0 };
}

/**
 * Amacia a entrada e a saída da curva.
 *
 * Mesmo com o silêncio proporcional, a curva ainda corre um pouco mais rápido
 * que a reta, e a troca de ritmo aparecia como solavanco na virada. Um
 * `smoothstep` puro resolveria a emenda, mas zera a velocidade nas pontas: a
 * estrada pararia e voltaria a andar, trocando um defeito por outro. A mistura
 * com a rampa linear mantém velocidade nas bordas parecida com a da reta e
 * concentra a aceleração no meio da curva, que é onde ela é natural.
 */
export function easeCurveTravel(progress) {
  const t = clamp(progress);
  const smooth = t * t * (3 - 2 * t);
  return t * .65 + smooth * .35;
}

/**
 * Se a rolagem chegou ao fim da subida, com a passagem armada.
 *
 * A margem de 8px existe porque a última rolagem raramente para no pixel
 * exato: em rolagem suave e em trackpad o documento encosta no fim com sobra
 * de alguns pixels, e exigir igualdade deixaria a passagem sem disparar.
 *
 * `armed` é obrigatório — sem ele a Home fica presa num laço com o palácio.
 * O bfcache restaura a página já rolada no fim quando o visitante aperta
 * "voltar" vindo do palácio; se a passagem disparasse em repouso, ela
 * dispararia de novo assim que a página reaparecesse.
 *
 * A trava é armada por QUALQUER rolagem para baixo durante a visita, não
 * pela velocidade do quadro que cruza o limiar — de propósito. Uma versão
 * anterior exigia "descendo agora" (o quadro atual mais rápido que o
 * anterior); trackpad desacelera por inércia até parar, e o quadro que
 * cruza o fim é com frequência o próprio quadro de repouso, com delta zero.
 * Exigir velocidade instantânea ali deixava a passagem morta bem na rolagem
 * mais comum de terminar uma página longa. A trava resolve isso: uma vez
 * armada em qualquer ponto da descida, ela dispara mesmo que a inércia
 * morra exatamente no limiar. Só o `pageshow` restaurado pelo bfcache
 * desarma — é o que impede o laço voltando do palácio.
 */
export function shouldCrossToPalace({
  scrollTop = 0,
  scrollHeight = 0,
  viewportHeight = 0,
  armed = false,
} = {}) {
  const maximo = scrollHeight - viewportHeight;
  if (maximo <= 0) return false;
  return armed && scrollTop >= maximo - 8;
}

function roadStateForScroll(scrollCenter, elements, layout) {
  let covered = 0;
  for (let index = 0; index < layout.segments.length; index += 1) {
    const segment = layout.segments[index];
    const element = elements[index];
    if (!element) break;
    const start = element.offsetTop;
    const end = start + element.offsetHeight;
    if (scrollCenter < start) {
      return { progress: clamp(covered / layout.totalLength), sectionIndex: index, local: 0 };
    }
    if (scrollCenter <= end) {
      const raw = clamp((scrollCenter - start) / Math.max(1, end - start));
      const local = segment.kind === "curve" ? easeCurveTravel(raw) : raw;
      return {
        progress: clamp((covered + segment.length * local) / layout.totalLength),
        sectionIndex: index,
        local,
      };
    }
    covered += segment.length;
  }
  return { progress: 1, sectionIndex: layout.segments.length - 1, local: 1 };
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
      audio.volume = .24;
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

export function createHomeController({
  root,
  canvas,
  data = { regions: JOURNEY_REGIONS, discoveries: JOURNEY_DISCOVERIES },
} = {}) {
  if (!root || !canvas) throw new TypeError("root e canvas são obrigatórios");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mounted = mountJourney(root, data);
  const road = createHomeRoad(canvas, { regions: data.regions });
  const handoff = consumeHandoff();
  const removeSound = mountSoundResume(root, handoff.soundEnabled === true);
  const lateralControllers = data.regions.flatMap((region, index) => {
    if (!region.lateral) return [];
    const stage = mounted.regions[index]?.querySelector(".region-stage");
    return stage ? [createLateralExploration(stage, {
      limit: Math.min(340, Math.max(210, innerWidth * .24)),
      reducedMotion,
    })] : [];
  });
  let frameId = 0;
  let entryTimer = 0;
  let visualScrollTop = scrollY;
  let lastScrollTop = scrollY;
  // Trava da passagem ao palácio: arma com qualquer rolagem para baixo,
  // desarma só quando a página volta do bfcache (ver shouldCrossToPalace).
  let crossingArmed = false;
  const visualPresence = data.regions.map(() => 0);
  let lastFrameTime = 0;
  let destroyed = false;

  if (handoff.entry) {
    entryTimer = holdEntryHandoff(document.documentElement);
  }

  function syncRoadSides() {
    const checkpoints = road.layout.checkpoints;
    mounted.regions.forEach((region, index) => {
      const checkpoint = checkpoints[index];
      if (!checkpoint) return;
      region.dataset.roadSide = checkpoint.roadPlacement;
      region.style.setProperty("--road-offset-x", `${checkpoint.roadOffsetX}px`);
      region.style.setProperty("--road-offset-y", `${checkpoint.roadOffsetY}px`);
    });
  }

  function update(timestamp = performance.now()) {
    frameId = 0;
    if (destroyed || document.hidden) return;
    const viewportHeight = innerHeight;
    const targetScrollTop = scrollY;
    // Arma a passagem ao palácio com qualquer avanço real (> 1px, para
    // ignorar o ruído de rolagem que alguns dispositivos reportam em
    // repouso). Não desarma sozinha — só o retorno do bfcache desarma.
    if (targetScrollTop > lastScrollTop + 1) crossingArmed = true;
    lastScrollTop = targetScrollTop;
    const scrollProgress = scrollProgressForDocument({
      scrollTop: targetScrollTop,
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight,
    });
    document.documentElement.style.setProperty(
      "--journey-scroll-progress",
      scrollProgress.toFixed(4),
    );
    document.documentElement.style.setProperty(
      "--journey-scroll-position",
      scrollCuePosition({ progress: scrollProgress, movable: true }),
    );
    const elapsed = lastFrameTime ? Math.min(64, Math.max(1, timestamp - lastFrameTime)) : 16;
    lastFrameTime = timestamp;
    visualScrollTop = smoothJourneyScroll(
      visualScrollTop,
      targetScrollTop,
      elapsed,
      { reducedMotion },
    );
    if (Math.abs(targetScrollTop - visualScrollTop) < .35) visualScrollTop = targetScrollTop;
    const scrollTop = visualScrollTop;
    const roadState = roadStateForScroll(
      scrollTop + viewportHeight * .5,
      mounted.pathSections,
      road.layout,
    );
    road.setProgress(roadState.progress);
    const roadOffset = roadOffsetForPathSection(
      roadState.sectionIndex,
      roadState.local,
      road.layout.checkpoints,
    );
    road.setOffset(roadOffset.x, roadOffset.y);
    if (shouldCrossToPalace({
      scrollTop: document.scrollingElement.scrollTop,
      scrollHeight: document.scrollingElement.scrollHeight,
      viewportHeight,
      armed: crossingArmed,
    })) {
      crossTo({ destination: "palacio.html" });
    }
    let activeRegion = null;
    let activePresence = 0;
    let presenceSettling = false;
    mounted.regions.forEach((region, index) => {
      const actualRect = region.getBoundingClientRect();
      const top = actualRect.top + scrollY - scrollTop;
      const bottom = top + actualRect.height;
      const before = top > viewportHeight * .16;
      const after = bottom < viewportHeight * .84;
      const signedDistance = before
        ? top - viewportHeight * .16
        : after
          ? -(viewportHeight * .84 - bottom)
          : 0;
      const targetPresence = presenceForRegionBounds({ top, bottom, viewportHeight });
      const presence = smoothRegionPresence(
        visualPresence[index],
        targetPresence,
        elapsed,
        { reducedMotion },
      );
      visualPresence[index] = presence;
      if (Math.abs(targetPresence - presence) >= .01) presenceSettling = true;
      const offset = motionOffsetForRegion({
        roadSide: region.dataset.roadSide,
        signedDistance,
        viewportWidth: innerWidth,
        viewportHeight,
        reducedMotion,
      });
      region.style.setProperty("--region-presence", presence.toFixed(4));
      region.style.setProperty("--region-x", `${offset.x.toFixed(1)}px`);
      region.style.setProperty("--region-y", `${offset.y.toFixed(1)}px`);
      region.classList.toggle("is-present", presence > .08);
      if (presence > activePresence) {
        activePresence = presence;
        activeRegion = region;
      }
    });

    mounted.regions.forEach((region) => {
      const link = region.querySelector(".region-content");
      if (region === activeRegion && activePresence > .72) link?.setAttribute("aria-current", "location");
      else link?.removeAttribute("aria-current");
    });

    if (!reducedMotion && (
      Math.abs(targetScrollTop - visualScrollTop) >= .35
      || presenceSettling
    )) {
      frameId = requestAnimationFrame(update);
    } else {
      lastFrameTime = 0;
    }
  }

  function requestUpdate() {
    if (!frameId && !document.hidden) frameId = requestAnimationFrame(update);
  }

  function onResize() {
    road.resize();
    syncRoadSides();
    requestUpdate();
  }

  function onVisibilityChange() {
    if (!document.hidden) {
      lastFrameTime = 0;
      visualScrollTop = scrollY;
      requestUpdate();
    }
  }

  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", onResize, { passive: true });
  document.addEventListener("visibilitychange", onVisibilityChange);
  syncRoadSides();
  document.body.classList.add("is-ready");
  requestUpdate();

  return {
    mounted,
    road,
    // Desarma a passagem ao palácio. Chamado pelo `pageshow` do bfcache —
    // sem isso, restaurar a Home já rolada no fim dispara a passagem de
    // novo sozinha (a trava continuaria armada da visita anterior).
    disarmCrossing() {
      crossingArmed = false;
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(entryTimer);
      road.destroy();
      lateralControllers.forEach((controller) => controller.destroy());
      removeSound();
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    },
  };
}

let activeController;

export function mountHomeJourney() {
  activeController?.destroy();
  const root = document.getElementById("journey-root");
  const canvas = document.getElementById("journey-road");
  activeController = createHomeController({ root, canvas });
  const onPageHide = (event) => {
    if (!event.persisted) activeController?.destroy();
  };
  const onPageShow = (event) => {
    if (!event.persisted) return;
    // Espelha a limpeza da Chegada (`arrival-controller.js`): se o bfcache
    // devolve a página com o véu já fechado (`crossTo` chamado antes de sair
    // para o palácio), esses marcadores ficam presos para sempre e `crossTo`
    // passa a recusar qualquer nova travessia nesta sessão sem recarregar.
    delete document.documentElement.dataset.transitioning;
    document.documentElement.classList.remove("is-crossing");
    document.body.classList.remove("is-arrival-transitioning");
    activeController?.disarmCrossing();
    window.dispatchEvent(new Event("resize"));
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
