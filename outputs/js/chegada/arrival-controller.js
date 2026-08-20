import { createArrivalScene } from "./arrival-scene.js";
import { createDragController } from "./drag-controller.js";
import { enterHome } from "./transition-handoff.js";

const arrival = document.getElementById("arrival");
const visual = document.getElementById("arrival-visual");
const canvas = document.getElementById("arrival-scene");
const dragButton = document.getElementById("transcend-button");
const presence = document.querySelector(".arrival-presence");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (arrival && visual && canvas && dragButton) {
  const scene = createArrivalScene({
    canvas,
    imageUrl: "media/chegada-landscape.webp",
    depthUrl: "media/chegada-depth.webp",
    reducedMotion,
  });

  let scrollFrame = 0;
  let lastScrollY = window.scrollY;
  let soundEnabled = false;

  const updateScroll = () => {
    scrollFrame = 0;
    const available = Math.max(1, arrival.offsetHeight - window.innerHeight);
    const progress = Math.min(1, Math.max(0, -arrival.getBoundingClientRect().top / available));
    visual.style.setProperty("--arrival-progress", progress.toFixed(4));
    scene.setScrollProgress(progress);

    if (presence) {
      presence.style.opacity = String(Math.max(0, 1 - progress * 2.6));
      presence.style.transform = `translate(-50%, ${Math.round(progress * -22)}px)`;
    }

    const movingDown = window.scrollY > lastScrollY + 1;
    lastScrollY = window.scrollY;
    if (progress >= .995 && movingDown) {
      enterHome({ entry: "scroll", soundEnabled });
    }
  };

  const queueScroll = () => {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll);
  };

  const updatePointer = (event) => {
    if (reducedMotion || event.pointerType === "touch") return;
    const x = (event.clientX / window.innerWidth) * 2 - 1;
    const y = -((event.clientY / window.innerHeight) * 2 - 1);
    scene.setPointer(x, y);
  };

  const drag = createDragController({
    button: dragButton,
    onComplete: ({ entry }) => enterHome({ entry, soundEnabled }),
    globalKeyboard: true,
  });

  const onBreathState = (event) => scene.setBreathState(event.detail?.phase || "idle");
  const onSoundState = (event) => {
    soundEnabled = Boolean(event.detail?.enabled);
  };
  const onVisibilityChange = () => document.hidden ? scene.pause() : scene.resume();

  window.addEventListener("scroll", queueScroll, { passive: true });
  window.addEventListener("resize", queueScroll, { passive: true });
  window.addEventListener("pointermove", updatePointer, { passive: true });
  document.addEventListener("visibilitychange", onVisibilityChange);
  document.addEventListener("potala:breath-state", onBreathState);
  document.addEventListener("potala:sound-state", onSoundState);
  updateScroll();

  window.addEventListener("pagehide", () => {
    cancelAnimationFrame(scrollFrame);
    drag.destroy();
    scene.destroy();
    window.removeEventListener("scroll", queueScroll);
    window.removeEventListener("resize", queueScroll);
    window.removeEventListener("pointermove", updatePointer);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    document.removeEventListener("potala:breath-state", onBreathState);
    document.removeEventListener("potala:sound-state", onSoundState);
  }, { once: true });
}
