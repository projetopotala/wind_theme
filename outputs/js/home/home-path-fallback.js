const clamp = (value) => Math.min(1, Math.max(0, Number(value) || 0));

export function createHomePathFallback(canvas) {
  const context = canvas?.getContext?.("2d");
  let progress = 0;
  let active = false;
  let paused = false;
  let destroyed = false;

  function trace(width, height) {
    context.beginPath();
    context.moveTo(width * 0.5, height * 1.08);
    context.bezierCurveTo(width * 0.46, height * 0.78, width * 0.55, height * 0.52, width * 0.49, height * 0.26);
    context.quadraticCurveTo(width * 0.47, height * 0.08, width * 0.51, -height * 0.08);
  }

  function draw() {
    if (!context || paused || destroyed) return;
    const width = canvas.clientWidth || globalThis.innerWidth || 1;
    const height = canvas.clientHeight || globalThis.innerHeight || 1;
    context.clearRect(0, 0, width, height);
    if (!active) return;
    const visibleProgress = Math.max(.075, progress);
    context.save();
    context.globalAlpha = Math.max(0.05, visibleProgress);
    context.setLineDash([Math.max(1, visibleProgress * height * 1.4), height * 2]);
    context.lineDashOffset = height * 1.15;
    trace(width, height);
    context.strokeStyle = "rgba(217, 164, 73, .26)";
    context.lineWidth = 28;
    context.shadowColor = "rgba(233, 181, 84, .78)";
    context.shadowBlur = 34;
    context.stroke();
    trace(width, height);
    context.strokeStyle = "rgba(255, 239, 189, .96)";
    context.lineWidth = 4;
    context.shadowColor = "rgba(255, 217, 126, .95)";
    context.shadowBlur = 14;
    context.stroke();
    context.restore();
  }

  function resize() {
    if (!canvas || !context || destroyed) return;
    const width = Math.max(1, canvas.clientWidth || globalThis.innerWidth || 1);
    const height = Math.max(1, canvas.clientHeight || globalThis.innerHeight || 1);
    const dpr = Math.min(globalThis.devicePixelRatio || 1, width <= 720 ? 1.25 : 1.5);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  resize();

  return {
    mode: "fallback",
    setActive(value) {
      active = Boolean(value);
      if (!active) progress = 0;
      draw();
    },
    setProgress(value) {
      progress = clamp(value);
      draw();
    },
    resize,
    pause() { paused = true; },
    resume() { paused = false; draw(); },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      context?.clearRect?.(0, 0, canvas.width || 0, canvas.height || 0);
    },
  };
}

