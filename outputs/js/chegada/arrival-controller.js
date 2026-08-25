import { createArrivalScene, selectArrivalAssets } from "./arrival-scene.js";
import { createLeafLayer } from "./nature-motion.js";
import { enterHome } from "./transition-handoff.js";
import { scrollCuePosition } from "../core/math.js";
import {
  applyWorldAction,
  createWorldState,
  feedProximity,
  hitActor,
  imageUvFromPointer,
  mountArrivalWorld,
  stepWorld,
} from "./arrival-world.js";

const arrival = document.getElementById("arrival");
const visual = document.getElementById("arrival-visual");
const canvas = document.getElementById("arrival-scene");
const natureCanvas = document.getElementById("arrival-nature");
const worldRoot = document.getElementById("arrival-world");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (arrival && visual && canvas) {
  const sceneAssets = selectArrivalAssets({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const plate = sceneAssets.waterUrl
    ? { width: 16, height: 9 }
    : { width: 9, height: 16 };
  const scene = createArrivalScene({
    canvas,
    ...sceneAssets,
    reducedMotion,
  });
  const leafLayer = natureCanvas
    ? createLeafLayer({ canvas: natureCanvas, reducedMotion })
    : null;
  document.documentElement.style.setProperty(
    "--journey-scroll-position",
    scrollCuePosition({ movable: false }),
  );

  let scrollFrame = 0;
  let worldFrame = 0;
  let lastScrollY = window.scrollY;
  let lastPointer = [0, 0];
  let lastWorldTime = 0;
  let soundEnabled = false;
  let worldState = createWorldState();

  const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });

  const pushWorld = () => {
    scene.setWorld({
      ...worldState.energies,
      windDir: worldState.windDir,
      attentionUv: worldState.attentionUv,
    });
    worldLayer?.sync(worldState, viewport(), plate);
  };

  const onActivate = (actor) => {
    worldState = applyWorldAction(worldState, actor, performance.now());
    pushWorld();
    document.dispatchEvent(new CustomEvent("potala:world-action", {
      detail: { id: actor.id, action: actor.action },
    }));
    if (actor.action === "wind") leafLayer?.gust();
    if (actor.action === "path") {
      const remaining = Math.max(0, arrival.offsetHeight - window.innerHeight - window.scrollY);
      window.scrollBy({ top: remaining * 0.18, behavior: reducedMotion ? "auto" : "smooth" });
    }
    if (actor.action === "enter") enterHome({ entry: "keyboard", soundEnabled });
    queueWorld();
  };

  const worldLayer = worldRoot && !reducedMotion
    ? mountArrivalWorld(worldRoot, { onActivate })
    : null;

  const updateScroll = () => {
    scrollFrame = 0;
    const available = Math.max(1, arrival.offsetHeight - window.innerHeight);
    const progress = Math.min(1, Math.max(0, -arrival.getBoundingClientRect().top / available));
    visual.style.setProperty("--arrival-progress", progress.toFixed(4));
    scene.setScrollProgress(progress);

    const movingDown = window.scrollY > lastScrollY + 1;
    lastScrollY = window.scrollY;
    if (progress >= .995 && movingDown) {
      enterHome({ entry: "scroll", soundEnabled });
    }
  };

  const queueScroll = () => {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll);
  };

  const stepWorldFrame = (now) => {
    worldFrame = 0;
    const elapsed = lastWorldTime ? Math.min(48, now - lastWorldTime) : 16;
    lastWorldTime = now;
    worldState = stepWorld(worldState, { elapsedMs: elapsed, reducedMotion });
    pushWorld();
    const live = Object.values(worldState.energies).some((value) => value > 0);
    if (live) worldFrame = requestAnimationFrame(stepWorldFrame);
    else lastWorldTime = 0;
  };

  const queueWorld = () => {
    if (!worldFrame) worldFrame = requestAnimationFrame(stepWorldFrame);
  };

  const updatePointer = (event) => {
    if (reducedMotion || event.pointerType === "touch") return;
    const x = (event.clientX / window.innerWidth) * 2 - 1;
    const y = -((event.clientY / window.innerHeight) * 2 - 1);
    scene.setPointer(x, y);
    const uv = imageUvFromPointer({
      clientX: event.clientX,
      clientY: event.clientY,
      viewport: viewport(),
      image: plate,
    });
    const actor = hitActor(uv.u, uv.v);
    const pointerDelta = Math.hypot(x - lastPointer[0], y - lastPointer[1]);
    lastPointer = [x, y];
    worldState = feedProximity(worldState, actor, { pointerDelta, pointer: [x, y] });
    pushWorld();
    queueWorld();
  };

  const onBreathState = (event) => scene.setBreathState(event.detail?.phase || "idle");
  const onSoundState = (event) => {
    soundEnabled = Boolean(event.detail?.enabled);
  };
  const onVisibilityChange = () => {
    if (document.hidden) {
      scene.pause();
      leafLayer?.pause();
    } else {
      scene.resume();
      leafLayer?.resume();
    }
  };
  const cleanup = () => {
    cancelAnimationFrame(scrollFrame);
    cancelAnimationFrame(worldFrame);
    scene.destroy();
    leafLayer?.destroy();
    worldLayer?.destroy();
    window.removeEventListener("scroll", queueScroll);
    window.removeEventListener("resize", queueScroll);
    window.removeEventListener("pointermove", updatePointer);
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("pageshow", onPageShow);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    document.removeEventListener("potala:breath-state", onBreathState);
    document.removeEventListener("potala:sound-state", onSoundState);
  };
  const onPageHide = (event) => {
    if (event.persisted) {
      scene.pause();
      leafLayer?.pause();
    }
    else cleanup();
  };
  const onPageShow = (event) => {
    if (!event.persisted) return;
    delete document.documentElement.dataset.transitioning;
    document.documentElement.classList.remove("is-crossing");
    document.body.classList.remove("is-arrival-transitioning");
    lastScrollY = window.scrollY;
    scene.resume();
    leafLayer?.resume();
    queueScroll();
  };

  window.addEventListener("scroll", queueScroll, { passive: true });
  window.addEventListener("resize", queueScroll, { passive: true });
  window.addEventListener("pointermove", updatePointer, { passive: true });
  document.addEventListener("visibilitychange", onVisibilityChange);
  document.addEventListener("potala:breath-state", onBreathState);
  document.addEventListener("potala:sound-state", onSoundState);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", onPageShow);
  updateScroll();
  pushWorld();
}
