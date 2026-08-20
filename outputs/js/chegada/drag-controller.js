import { clamp } from "../core/math.js";

export const dragProgress = (distance, availableDistance) =>
  availableDistance > 0 ? clamp(distance / availableDistance) : 0;

export function createDragController({
  button,
  thumb = button?.querySelector(".drag-thumb"),
  onComplete = () => {},
  completionThreshold = 0.92,
  globalKeyboard = false,
} = {}) {
  if (!button || !thumb) {
    throw new TypeError("button e thumb são obrigatórios para o drag");
  }

  let progress = 0;
  let startProgress = 0;
  let startX = 0;
  let pointerId = null;
  let completed = false;

  const availableDistance = () =>
    Math.max(0, button.clientWidth - thumb.offsetWidth - 12);

  const render = (nextProgress, animated = false) => {
    progress = clamp(nextProgress);
    button.classList.toggle("is-returning", animated);
    button.style.setProperty("--drag-progress", progress.toFixed(4));
    button.setAttribute("aria-valuenow", String(Math.round(progress * 100)));
  };

  const complete = () => {
    if (completed) return;
    completed = true;
    button.classList.add("is-complete");
    render(1);
    button.setAttribute("aria-disabled", "true");
    document.dispatchEvent(new CustomEvent("potala:arrival-complete"));
    onComplete();
  };

  const release = () => {
    button.classList.remove("is-dragging");
    if (progress >= completionThreshold) {
      complete();
    } else if (!completed) {
      render(0, true);
    }
    pointerId = null;
  };

  const onPointerDown = (event) => {
    if (completed || event.button > 0) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startProgress = progress;
    button.classList.remove("is-returning");
    button.classList.add("is-dragging");
    button.setPointerCapture?.(pointerId);
    event.preventDefault();
  };

  const onPointerMove = (event) => {
    if (event.pointerId !== pointerId || completed) return;
    const distance = startProgress * availableDistance() + event.clientX - startX;
    render(dragProgress(distance, availableDistance()));
    event.preventDefault();
  };

  const onPointerUp = (event) => {
    if (event.pointerId !== pointerId) return;
    button.releasePointerCapture?.(pointerId);
    release();
  };

  const onKeyDown = (event) => {
    if (completed || (event.code !== "Space" && event.code !== "Enter")) return;
    event.preventDefault();
    button.classList.add("is-key-active");
  };

  const onKeyUp = (event) => {
    if (completed || (event.code !== "Space" && event.code !== "Enter")) return;
    event.preventDefault();
    button.classList.remove("is-key-active");
    complete();
  };

  const canUseGlobalKeyboard = (event) => {
    const target = event.target;
    const dialogOpen = document.querySelector("dialog[open]");
    const editable = target instanceof HTMLElement && (
      target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName)
    );
    return !dialogOpen && !editable;
  };

  const onGlobalKeyDown = (event) => {
    if (!canUseGlobalKeyboard(event)) return;
    onKeyDown(event);
  };

  const onGlobalKeyUp = (event) => {
    if (!canUseGlobalKeyboard(event)) return;
    onKeyUp(event);
  };

  button.addEventListener("pointerdown", onPointerDown);
  button.addEventListener("pointermove", onPointerMove);
  button.addEventListener("pointerup", onPointerUp);
  button.addEventListener("pointercancel", onPointerUp);
  button.addEventListener("keydown", onKeyDown);
  button.addEventListener("keyup", onKeyUp);
  if (globalKeyboard) {
    window.addEventListener("keydown", onGlobalKeyDown);
    window.addEventListener("keyup", onGlobalKeyUp);
  }
  render(0);

  return {
    get progress() {
      return progress;
    },
    reset() {
      completed = false;
      button.classList.remove("is-complete", "is-key-active", "is-dragging");
      button.removeAttribute("aria-disabled");
      render(0, true);
    },
    destroy() {
      button.removeEventListener("pointerdown", onPointerDown);
      button.removeEventListener("pointermove", onPointerMove);
      button.removeEventListener("pointerup", onPointerUp);
      button.removeEventListener("pointercancel", onPointerUp);
      button.removeEventListener("keydown", onKeyDown);
      button.removeEventListener("keyup", onKeyUp);
      if (globalKeyboard) {
        window.removeEventListener("keydown", onGlobalKeyDown);
        window.removeEventListener("keyup", onGlobalKeyUp);
      }
    },
  };
}
