import { clamp } from "../core/math.js";

export function dragProgress(startProgress, startX, currentX, travel) {
  if (arguments.length <= 2) {
    return startX > 0 ? clamp(startProgress / startX) : 0;
  }
  return clamp(startProgress + (currentX - startX) / Math.max(1, travel));
}

export function createDragController(elementOrOptions = {}, controllerOptions = {}) {
  const options = elementOrOptions instanceof HTMLElement
    ? { ...controllerOptions, button: elementOrOptions }
    : elementOrOptions;
  const {
    button,
    thumb = button?.querySelector(".drag-thumb"),
    onComplete = () => {},
    completionThreshold = 0.985,
    globalKeyboard = false,
  } = options;
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

  const complete = (entry = "drag") => {
    if (completed) return;
    completed = true;
    button.classList.add("is-complete");
    render(1);
    button.setAttribute("aria-disabled", "true");
    document.dispatchEvent(new CustomEvent("potala:arrival-complete"));
    onComplete({ entry });
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
  };

  const onPointerMove = (event) => {
    if (event.pointerId !== pointerId || completed) return;
    render(dragProgress(startProgress, startX, event.clientX, availableDistance()));
    event.preventDefault();
  };

  const onPointerUp = (event) => {
    if (event.pointerId !== pointerId) return;
    button.releasePointerCapture?.(pointerId);
    release();
  };

  const onKeyDown = (event) => {
    if (completed) return;
    const step = event.key === "ArrowRight" ? .1 : event.key === "ArrowLeft" ? -.1 : 0;
    if (step) {
      event.preventDefault();
      render(progress + step);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      render(event.key === "End" ? 1 : 0);
      if (event.key === "End") complete("keyboard");
      return;
    }
    if (event.code === "Space" || event.code === "Enter") {
      event.preventDefault();
      button.classList.add("is-key-active");
    }
  };

  const onKeyUp = (event) => {
    if (completed || (event.code !== "Space" && event.code !== "Enter")) return;
    event.preventDefault();
    button.classList.remove("is-key-active");
    complete("keyboard");
  };

  const canUseGlobalKeyboard = (event) => {
    const target = event.target;
    const optionalExperienceOpen = document.querySelector('[aria-expanded="true"]');
    const editable = target instanceof HTMLElement && (
      target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName)
    );
    return !optionalExperienceOpen && !editable;
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
