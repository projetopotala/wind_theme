import { createSceneClock } from "./scene-clock.js";
import {
  applyWorldAction,
  createWorldState,
  feedProximity,
  hitActor,
  stepWorld,
} from "./arrival-world.js";

export function createArrivalEngine({
  scene,
  nature,
  worldLayer,
  debug,
  reducedMotion = false,
  plate,
  arrival,
  visual,
  onActivate,
} = {}) {
  let worldState = createWorldState();
  let scrollProgress = 0;
  let lastScrollY = typeof window !== "undefined" ? window.scrollY : 0;
  let lastPointer = [0, 0];
  let soundEnabled = false;
  let movingDown = false;
  let layoutDirty = true;

  const viewport = () => ({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  const pushWorld = () => {
    scene?.setWorld({
      ...worldState.energies,
      windDir: worldState.windDir,
      attentionUv: worldState.attentionUv,
    });
    worldLayer?.syncState(worldState);
    debug?.setActor(worldState.attentionId);
  };

  const activate = (actor) => {
    if (!actor) return;
    worldState = applyWorldAction(worldState, actor, performance.now());
    pushWorld();
    document.dispatchEvent(new CustomEvent("potala:world-action", {
      detail: { id: actor.id, action: actor.action },
    }));
    if (actor.action === "wind") nature?.gust({ count: 7 });
    if (actor.action === "water" || actor.action === "breathe") {
      nature?.ripple({ x: actor.x, y: actor.y, strength: 0.62 });
      scene?.setRipple({ uv: [actor.x, actor.y], strength: 0.7 });
    }
    onActivate?.(actor, { soundEnabled, worldState });
  };

  const readScroll = () => {
    if (!arrival) return;
    const available = Math.max(1, arrival.offsetHeight - window.innerHeight);
    scrollProgress = Math.min(1, Math.max(0, -arrival.getBoundingClientRect().top / available));
    visual?.style.setProperty("--arrival-progress", scrollProgress.toFixed(4));
    scene?.setScrollProgress(scrollProgress);
    movingDown = window.scrollY > lastScrollY + 1;
    lastScrollY = window.scrollY;
  };

  const clock = createSceneClock({
    tick(now, elapsedMs) {
      readScroll();
      worldState = stepWorld(worldState, { elapsedMs, reducedMotion });
      pushWorld();
      if (layoutDirty) {
        worldLayer?.layout(viewport(), plate);
        layoutDirty = false;
      }
      scene?.render(now, elapsedMs);
      nature?.update(now, { world: worldState, elapsedMs });
      nature?.render(now);
      debug?.update(now);
    },
  });

  return {
    get worldState() {
      return worldState;
    },
    get scrollProgress() {
      return scrollProgress;
    },
    start() {
      if (reducedMotion) {
        readScroll();
        scene?.render(performance.now(), 16);
        worldLayer?.layout(viewport(), plate);
        worldLayer?.syncState(worldState);
        return;
      }
      clock.resetTime();
      clock.start();
    },
    stop() {
      clock.stop();
    },
    resetTime() {
      clock.resetTime();
    },
    noteScroll() {
      readScroll();
    },
    markLayout() {
      layoutDirty = true;
    },
    shouldEnterFromScroll() {
      if (!arrival) return false;
      const maxScroll = Math.max(1, arrival.offsetHeight - window.innerHeight);
      return movingDown && scrollProgress >= 0.995 && window.scrollY >= maxScroll - 8;
    },
    setSoundEnabled(enabled) {
      soundEnabled = Boolean(enabled);
    },
    pointer(event) {
      if (reducedMotion || event.pointerType === "touch") return null;
      const x = (event.clientX / window.innerWidth) * 2 - 1;
      const y = -((event.clientY / window.innerHeight) * 2 - 1);
      scene?.setPointer(x, y);
      return { x, y };
    },
    proximity(actor, pointer, uv) {
      const pointerDelta = Math.hypot(pointer.x - lastPointer[0], pointer.y - lastPointer[1]);
      lastPointer = [pointer.x, pointer.y];
      worldState = feedProximity(worldState, actor, {
        pointerDelta,
        pointer: [pointer.x, pointer.y],
      });
      if (actor && (actor.action === "water" || actor.action === "breathe") && pointerDelta > 0.04) {
        scene?.setRipple({ uv: [uv.u, uv.v], strength: 0.35 });
      }
      pushWorld();
      return actor;
    },
    hit(uv) {
      return hitActor(uv.u, uv.v, undefined, { previousId: worldState.attentionId });
    },
    activate,
    destroy() {
      clock.stop();
    },
  };
}
