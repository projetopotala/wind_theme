import { createArrivalScene } from "./arrival-scene.js";
import { createDragController } from "./drag-controller.js";
import { writeTravessiaState } from "../core/travessia-state.js";

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
  let transitioning = false;
  let breathObserver;

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

  const enterHome = () => {
    if (transitioning) return;
    transitioning = true;
    writeTravessiaState({ entry: "drag" });
    document.body.classList.add("is-arrival-transitioning");
    window.setTimeout(() => window.location.assign("transcendido.html"), reducedMotion ? 80 : 920);
  };

  const drag = createDragController({
    button: dragButton,
    onComplete: enterHome,
    globalKeyboard: true,
  });

  const phaseFromDialog = (dialog) => {
    if (!dialog?.open || dialog.classList.contains("phase-complete")) return "idle";
    if (dialog.classList.contains("phase-inhale")) return "inhale";
    if (dialog.classList.contains("phase-hold")) return "hold";
    if (dialog.classList.contains("phase-exhale")) return "exhale";
    if (document.getElementById("breathing-stop")?.textContent === "CONTINUAR") return "paused";
    return "idle";
  };

  const connectBreathing = () => {
    const dialog = document.getElementById("breathing-dialog");
    if (!dialog) return;
    const sync = () => scene.setBreathState(phaseFromDialog(dialog));
    breathObserver = new MutationObserver(sync);
    breathObserver.observe(dialog, { attributes: true, attributeFilter: ["class", "open"] });
    sync();
  };

  const onBreathState = (event) => scene.setBreathState(event.detail?.phase || "idle");
  const onVisibilityChange = () => document.hidden ? scene.pause() : scene.resume();

  window.addEventListener("scroll", queueScroll, { passive: true });
  window.addEventListener("resize", queueScroll, { passive: true });
  window.addEventListener("pointermove", updatePointer, { passive: true });
  document.addEventListener("visibilitychange", onVisibilityChange);
  document.addEventListener("potala:breath-state", onBreathState);
  window.addEventListener("load", connectBreathing, { once: true });
  updateScroll();

  window.addEventListener("pagehide", () => {
    cancelAnimationFrame(scrollFrame);
    breathObserver?.disconnect();
    drag.destroy();
    scene.destroy();
    window.removeEventListener("scroll", queueScroll);
    window.removeEventListener("resize", queueScroll);
    window.removeEventListener("pointermove", updatePointer);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    document.removeEventListener("potala:breath-state", onBreathState);
  }, { once: true });
}
