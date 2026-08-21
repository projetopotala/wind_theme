import { consumeHandoff } from "../core/travessia-state.js";
import { JOURNEY_DISCOVERIES, JOURNEY_REGIONS } from "./journey-data.js";
import { createHomeRoad } from "./home-road.js";
import { mountJourney, presenceForDistance } from "./home-scenes.js";
import { createLateralExploration } from "./lateral-exploration.js";
import {
  roadOffsetForPathSection,
  silenceCopyPlacementForRoadOffset,
} from "./journey-layout.js";

const clamp = (value, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));
const motionDirections = [
  [0, 1], [.7, .7], [-.7, .7], [1, 0], [1, 0], [0, 1], [-.7, .7], [0, 1],
];

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
      const local = clamp((scrollCenter - start) / Math.max(1, end - start));
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
  let dirty = true;
  let destroyed = false;

  if (handoff.entry) {
    document.documentElement.classList.add("entry-from-arrival");
    requestAnimationFrame(() => document.documentElement.classList.remove("entry-from-arrival"));
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
    mounted.silences.forEach((silence, index) => {
      const offset = roadOffsetForPathSection(index * 2 + 1, .5, checkpoints);
      silence.dataset.copySide = silenceCopyPlacementForRoadOffset(offset);
    });
  }

  function update() {
    frameId = 0;
    if (!dirty || destroyed || document.hidden) return;
    dirty = false;
    const viewportHeight = innerHeight;
    const scrollTop = scrollY;
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
    if (roadState.sectionIndex % 2 === 1) {
      const silence = mounted.silences[Math.floor(roadState.sectionIndex / 2)];
      if (silence) silence.dataset.copySide = silenceCopyPlacementForRoadOffset(roadOffset);
    }

    let activeRegion = null;
    let activePresence = 0;
    mounted.regions.forEach((region, index) => {
      const rect = region.getBoundingClientRect();
      const before = rect.top > viewportHeight * .16;
      const after = rect.bottom < viewportHeight * .84;
      const signedDistance = before
        ? rect.top - viewportHeight * .16
        : after
          ? -(viewportHeight * .84 - rect.bottom)
          : 0;
      const presence = presenceForDistance(Math.abs(signedDistance), viewportHeight);
      const movement = clamp(Math.abs(signedDistance) / viewportHeight);
      const direction = motionDirections[index % motionDirections.length];
      const sign = signedDistance >= 0 ? 1 : -1;
      const amplitude = reducedMotion ? 0 : movement * Math.min(innerWidth * .16, 210);
      region.style.setProperty("--region-presence", presence.toFixed(4));
      region.style.setProperty("--region-x", `${(direction[0] * amplitude * sign).toFixed(1)}px`);
      region.style.setProperty("--region-y", `${(direction[1] * amplitude * sign).toFixed(1)}px`);
      region.classList.toggle("is-present", presence > .08);
      if (presence > activePresence) {
        activePresence = presence;
        activeRegion = region;
      }
    });

    mounted.regions.forEach((region) => {
      const link = region.querySelector(".region-link");
      if (region === activeRegion && activePresence > .72) link?.setAttribute("aria-current", "location");
      else link?.removeAttribute("aria-current");
    });
  }

  function requestUpdate() {
    dirty = true;
    if (!frameId && !document.hidden) frameId = requestAnimationFrame(update);
  }

  function onResize() {
    road.resize();
    syncRoadSides();
    requestUpdate();
  }

  function onVisibilityChange() {
    if (!document.hidden) requestUpdate();
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
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frameId);
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
    if (event.persisted) window.dispatchEvent(new Event("resize"));
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
