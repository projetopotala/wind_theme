export function elasticOffset(delta, limit) {
  const safeLimit = Math.max(1, Math.abs(limit));
  const sign = Math.sign(delta);
  const magnitude = Math.abs(delta);
  return sign * safeLimit * (1 - Math.exp(-magnitude / safeLimit));
}

export function createLateralExploration(element, { limit = 300, reducedMotion = false } = {}) {
  if (!element) throw new TypeError("element é obrigatório");
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let active = false;
  let offset = 0;
  let resetTimer = 0;

  const sideLinks = {
    left: [...element.querySelectorAll('[data-lateral-side="left"] a')],
    right: [...element.querySelectorAll('[data-lateral-side="right"] a')],
  };

  function render(nextOffset, animated = false) {
    offset = nextOffset;
    element.classList.toggle("is-lateral-returning", animated && !reducedMotion);
    element.classList.toggle("is-lateral-left", offset > 6);
    element.classList.toggle("is-lateral-right", offset < -6);
    element.style.setProperty("--lateral-x", `${offset.toFixed(1)}px`);
    const expanded = Math.abs(offset) > 6;
    element.setAttribute("aria-expanded", String(expanded));
    sideLinks.left.forEach((link) => { link.tabIndex = offset > 6 ? 0 : -1; });
    sideLinks.right.forEach((link) => { link.tabIndex = offset < -6 ? 0 : -1; });
  }

  function reset() {
    clearTimeout(resetTimer);
    render(0, true);
    resetTimer = window.setTimeout(() => element.classList.remove("is-lateral-returning"), reducedMotion ? 0 : 620);
  }

  function reveal(side) {
    clearTimeout(resetTimer);
    element.classList.remove("is-lateral-returning");
    render(side === "left" ? limit * .72 : -limit * .72);
  }

  function onPointerDown(event) {
    if (event.button > 0) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    active = false;
    element.classList.remove("is-lateral-returning");
  }

  function onPointerMove(event) {
    if (event.pointerId !== pointerId) return;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    if (!active) {
      if (Math.hypot(deltaX, deltaY) < 12) return;
      if (Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) {
        pointerId = null;
        return;
      }
      active = true;
      element.setPointerCapture?.(event.pointerId);
    }
    event.preventDefault();
    render(elasticOffset(deltaX, limit));
  }

  function onPointerEnd(event) {
    if (event.pointerId !== pointerId) return;
    if (active) {
      element.releasePointerCapture?.(event.pointerId);
      reset();
    }
    pointerId = null;
    active = false;
  }

  function onKeyDown(event) {
    if (event.target !== element) return;
    if (event.key === "Escape") {
      event.preventDefault();
      reset();
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (offset > 6) reset();
      else reveal("right");
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      if (offset < -6) reset();
      else reveal("left");
    }
  }

  element.addEventListener("pointerdown", onPointerDown);
  element.addEventListener("pointermove", onPointerMove);
  element.addEventListener("pointerup", onPointerEnd);
  element.addEventListener("pointercancel", onPointerEnd);
  element.addEventListener("keydown", onKeyDown);
  render(0);

  return {
    reset,
    destroy() {
      clearTimeout(resetTimer);
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", onPointerEnd);
      element.removeEventListener("pointercancel", onPointerEnd);
      element.removeEventListener("keydown", onKeyDown);
    },
  };
}
