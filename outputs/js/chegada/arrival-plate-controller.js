import { scrollCuePosition } from "../core/math.js";
import { enterHome } from "./transition-handoff.js";

const clamp = (value, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));

export function arrivalProgress({ scrollTop = 0, travel = 1 } = {}) {
  return clamp(Number(scrollTop) / Math.max(1, Number(travel)));
}

export function pointerOffset({ clientX = 0, clientY = 0, width = 1, height = 1 } = {}) {
  const x = clamp((Number(clientX) / Math.max(1, Number(width))) * 2 - 1, -1, 1) * 6;
  const y = clamp((Number(clientY) / Math.max(1, Number(height))) * 2 - 1, -1, 1) * 6;
  return { x, y };
}

export function shouldEnterHome({ progress = 0, entered = false } = {}) {
  return !entered && progress >= .985;
}

export function mountArrivalPlate({
  arrival,
  visual,
  enter = enterHome,
  windowRef = window,
  documentRef = document,
  schedule = windowRef.requestAnimationFrame.bind(windowRef),
  cancel = windowRef.cancelAnimationFrame.bind(windowRef),
} = {}) {
  if (!arrival || !visual) throw new TypeError("arrival e visual são obrigatórios");

  const root = documentRef.documentElement;
  let frame = 0;
  let entered = false;
  let soundEnabled = false;

  root.style.setProperty("--journey-scroll-position", scrollCuePosition({ movable: false }));

  const measure = () => arrivalProgress({
    scrollTop: windowRef.scrollY,
    travel: arrival.offsetHeight - windowRef.innerHeight,
  });

  const paint = () => {
    frame = 0;
    const progress = measure();
    root.style.setProperty("--arrival-progress", progress.toFixed(4));
    visual.style.setProperty("--arrival-progress", progress.toFixed(4));

    if (progress < .8) entered = false;
    if (!shouldEnterHome({ progress, entered })) return;
    entered = true;
    enter({ entry: "scroll", soundEnabled });
  };

  const requestPaint = () => {
    if (frame) return;
    frame = schedule(paint);
  };

  const onPointerMove = (event) => {
    const offset = pointerOffset({
      clientX: event.clientX,
      clientY: event.clientY,
      width: windowRef.innerWidth,
      height: windowRef.innerHeight,
    });
    visual.style.setProperty("--arrival-pointer-x", `${offset.x.toFixed(2)}px`);
    visual.style.setProperty("--arrival-pointer-y", `${offset.y.toFixed(2)}px`);
  };

  const onSoundState = (event) => {
    soundEnabled = Boolean(event.detail?.enabled);
  };

  const onBreathState = (event) => {
    visual.dataset.breathPhase = event.detail?.phase || "idle";
  };

  const clearTransition = () => {
    delete root.dataset.transitioning;
    root.classList.remove("is-crossing", "entry-pending", "entry-from-palace");
    documentRef.body.classList.remove("is-arrival-transitioning");
  };

  const onPageShow = (event) => {
    if (event.persisted) clearTransition();
    entered = measure() >= .8;
    requestPaint();
  };

  /*
   * Saída definitiva desmonta; saída para o bfcache, não.
   *
   * A distinção importa nos dois sentidos. Descartar os ouvintes numa saída
   * persistida deixaria a página voltar do cache viva mas surda: o scroll não
   * pintaria mais nada e a passagem para a Home nunca dispararia. Não descartar
   * numa saída definitiva deixa ouvintes de `window` presos a este documento,
   * que é o vazamento que o `destroy()` existe para evitar.
   */
  const onPageHide = (event) => {
    if (!event.persisted) controller.destroy();
  };

  const openEntryVeil = () => {
    if (!root.classList.contains("entry-pending")) return;
    root.classList.add("entry-from-palace");
    const finish = () => root.classList.remove("entry-pending", "entry-from-palace");
    documentRef.querySelector(".arrival-transition")?.addEventListener("animationend", finish, { once: true });
    windowRef.setTimeout(finish, 1800);
  };

  windowRef.addEventListener("scroll", requestPaint, { passive: true });
  windowRef.addEventListener("resize", requestPaint, { passive: true });
  windowRef.addEventListener("pointermove", onPointerMove, { passive: true });
  windowRef.addEventListener("pageshow", onPageShow);
  windowRef.addEventListener("pagehide", onPageHide);
  documentRef.addEventListener("potala:sound-state", onSoundState);
  documentRef.addEventListener("potala:breath-state", onBreathState);

  requestPaint();
  openEntryVeil();

  const controller = {
    update: requestPaint,
    destroy() {
      if (frame) cancel(frame);
      frame = 0;
      windowRef.removeEventListener("scroll", requestPaint);
      windowRef.removeEventListener("resize", requestPaint);
      windowRef.removeEventListener("pointermove", onPointerMove);
      windowRef.removeEventListener("pageshow", onPageShow);
      windowRef.removeEventListener("pagehide", onPageHide);
      documentRef.removeEventListener("potala:sound-state", onSoundState);
      documentRef.removeEventListener("potala:breath-state", onBreathState);
    },
  };

  return controller;
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  const arrival = document.getElementById("arrival");
  const visual = document.getElementById("arrival-visual");
  if (arrival && visual) mountArrivalPlate({ arrival, visual });
}
