import { createArrivalScene, selectArrivalAssets } from "./arrival-scene.js";
import { createNatureLayer } from "./nature-motion.js";
import { enterHome } from "./transition-handoff.js";
import { mountArrivalDebug } from "./arrival-debug.js";
import { createArrivalEngine } from "./arrival-engine.js";
import {
  computeArrivalQuality,
  selectArrivalProfile,
} from "./arrival-scene-profile.js";
import { scrollCuePosition } from "../core/math.js";
import {
  imageUvFromPointer,
  mountArrivalWorld,
} from "./arrival-world.js";
import { mountWorldPoem } from "./world-poem.js";

const arrival = document.getElementById("arrival");
const visual = document.getElementById("arrival-visual");
const canvas = document.getElementById("arrival-scene");
const natureCanvas = document.getElementById("arrival-nature");
const worldRoot = document.getElementById("arrival-world");
const poemRoot = document.getElementById("world-poem");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const search = window.location.search;

if (arrival && visual && canvas) {
  const profile = selectArrivalProfile(
    { width: window.innerWidth, height: window.innerHeight },
    { search },
  );
  const sceneAssets = selectArrivalAssets(
    { width: window.innerWidth, height: window.innerHeight },
    { search },
  );
  const plate = profile.plate;
  const quality = computeArrivalQuality({
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    profile,
  });
  const debugEnabled = /(?:\?|&)arrivalDebug=1(?:&|$)/.test(search);

  const scene = createArrivalScene({
    canvas,
    ...sceneAssets,
    profile,
    reducedMotion,
    debug: debugEnabled,
  });
  const nature = natureCanvas
    ? createNatureLayer({
        canvas: natureCanvas,
        reducedMotion,
        profile,
        quality,
      })
    : null;

  document.documentElement.style.setProperty(
    "--journey-scroll-position",
    scrollCuePosition({ movable: false }),
  );

  const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });
  const uvFromEvent = (event) => imageUvFromPointer({
    clientX: event.clientX,
    clientY: event.clientY,
    viewport: viewport(),
    image: plate,
  });

  let soundEnabled = false;
  let engine;

  const poem = poemRoot ? mountWorldPoem(poemRoot, { reducedMotion }) : null;

  const onActorAction = (actor, extra = {}) => {
    if (!actor) return;

    // A energia do lugar já subiu no motor e continua correndo atrás do véu — é o
    // mundo respondendo ao toque. O que espera o fim do poema é só o que tira o
    // visitante do lugar: rolar a página ou entrar. Ler três versos e ser jogado
    // para dentro do site no meio deles não é uma pausa, é uma interrupção.
    const respond = () => {
      if (actor.action === "path") {
        const remaining = Math.max(0, arrival.offsetHeight - window.innerHeight - window.scrollY);
        window.scrollBy({ top: remaining * 0.18, behavior: reducedMotion ? "auto" : "smooth" });
      }
      if (actor.action === "enter") {
        enterHome({
          entry: extra.fromScroll ? "scroll" : "keyboard",
          soundEnabled,
        });
      }
    };

    if (poem?.show(actor, { onClose: respond })) return;
    respond();
  };

  const worldLayer = worldRoot
    ? mountArrivalWorld(worldRoot, {
        actors: profile.actors,
        onActivate: (actor) => engine?.activate(actor),
      })
    : null;

  const debug = mountArrivalDebug({
    search,
    scene,
    getMetrics: () => ({
      ...scene.getMetrics(),
      scrollProgress: engine?.scrollProgress,
    }),
  });

  engine = createArrivalEngine({
    scene,
    nature,
    worldLayer,
    debug,
    reducedMotion,
    plate,
    arrival,
    visual,
    onActivate: onActorAction,
  });

  const updatePointer = (event) => {
    if (poem?.isOpen) return;
    const pointer = engine.pointer(event);
    if (!pointer) return;
    const uv = uvFromEvent(event);
    const actor = engine.hit(uv);
    visual.style.cursor = actor ? "pointer" : "";
    engine.proximity(actor, pointer, uv);
  };

  const onVisualClick = (event) => {
    if (event.target.closest("button, a, .breathing-guide")) return;
    engine.activate(engine.hit(uvFromEvent(event)));
  };

  const onScroll = () => {
    engine.noteScroll();
    if (engine.shouldEnterFromScroll()) {
      enterHome({ entry: "scroll", soundEnabled });
    }
  };

  const onResize = () => engine.markLayout();
  const onBreathState = (event) => scene.setBreathState(event.detail?.phase || "idle");
  const onSoundState = (event) => {
    soundEnabled = Boolean(event.detail?.enabled);
    engine.setSoundEnabled(soundEnabled);
  };
  const onVisibilityChange = () => {
    if (document.hidden) {
      engine.stop();
      scene.pause();
      nature?.pause();
    } else {
      engine.resetTime();
      scene.resume();
      nature?.resume();
      engine.start();
    }
  };
  const cleanup = () => {
    engine.destroy();
    scene.destroy();
    nature?.destroy();
    worldLayer?.destroy();
    poem?.destroy();
    debug.destroy();
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("pointermove", updatePointer);
    visual.removeEventListener("click", onVisualClick);
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("pageshow", onPageShow);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    document.removeEventListener("potala:breath-state", onBreathState);
    document.removeEventListener("potala:sound-state", onSoundState);
  };
  const onPageHide = (event) => {
    if (event.persisted) {
      engine.stop();
      scene.pause();
      nature?.pause();
    } else cleanup();
  };
  const onPageShow = (event) => {
    if (!event.persisted) return;
    delete document.documentElement.dataset.transitioning;
    document.documentElement.classList.remove("is-crossing");
    document.body.classList.remove("is-arrival-transitioning");
    engine.resetTime();
    scene.resume();
    nature?.resume();
    engine.start();
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize, { passive: true });
  window.addEventListener("pointermove", updatePointer, { passive: true });
  visual.addEventListener("click", onVisualClick);
  document.addEventListener("visibilitychange", onVisibilityChange);
  document.addEventListener("potala:breath-state", onBreathState);
  document.addEventListener("potala:sound-state", onSoundState);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", onPageShow);

  scene.ready.then((ok) => {
    worldLayer?.layout(viewport(), plate);
    if (!ok) return;
    engine.start();
  });
}
