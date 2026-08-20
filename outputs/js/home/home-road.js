import { buildJourneyLayout, sampleSegment } from "./journey-layout.js";

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function locate(layout, progress) {
  const target = clamp(progress) * layout.totalLength;
  let covered = 0;
  for (const segment of layout.segments) {
    if (covered + segment.length >= target) {
      return sampleSegment(segment, (target - covered) / Math.max(1, segment.length));
    }
    covered += segment.length;
  }
  return layout.end;
}

function tracePath(layout) {
  const path = new Path2D();
  const first = layout.segments[0];
  if (!first) return path;
  path.moveTo(
    first.from.x - first.direction.x * layout.height * 3,
    first.from.y - first.direction.y * layout.height * 3,
  );
  for (const segment of layout.segments) {
    if (segment.kind === "curve") {
      path.quadraticCurveTo(segment.control.x, segment.control.y, segment.to.x, segment.to.y);
    } else {
      path.lineTo(segment.to.x, segment.to.y);
    }
  }
  const last = layout.segments.at(-1);
  path.lineTo(
    last.to.x + last.direction.x * layout.height * 3,
    last.to.y + last.direction.y * layout.height * 3,
  );
  return path;
}

export function createHomeRoad(canvas, { regions = [], viewport = {} } = {}) {
  if (!canvas) throw new TypeError("canvas é obrigatório para a estrada");
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return { setProgress() {}, resize() {}, destroy() {} };
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let width = Math.max(320, viewport.width || innerWidth);
  let height = Math.max(480, viewport.height || innerHeight);
  let ratio = Math.min(devicePixelRatio || 1, 1.5);
  let layout = buildJourneyLayout(regions, { width, height });
  let path = tracePath(layout);
  let progress = 0;
  let offsetX = 0;
  let offsetY = 0;
  let renderedProgress = -1;
  let renderedOffset = "";
  let frameId = 0;
  let paused = document.hidden;
  let destroyed = false;

  function configureCanvas() {
    ratio = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function draw() {
    frameId = 0;
    const offsetSignature = `${offsetX.toFixed(1)}:${offsetY.toFixed(1)}`;
    if (destroyed || paused || (renderedProgress === progress && renderedOffset === offsetSignature)) return;
    renderedProgress = progress;
    renderedOffset = offsetSignature;
    const camera = locate(layout, progress);
    const roadWidth = width < 720
      ? Math.max(88, Math.min(118, width * .27))
      : Math.max(126, Math.min(188, width * .12));

    context.clearRect(0, 0, width, height);
    context.save();
    context.translate(width * .5 + offsetX - camera.x, height * .54 + offsetY - camera.y);
    context.lineJoin = "round";
    context.lineCap = "round";

    context.strokeStyle = "#b7a58d";
    context.lineWidth = roadWidth + Math.max(8, roadWidth * .08);
    context.stroke(path);

    context.strokeStyle = "#666d6b";
    context.lineWidth = roadWidth;
    context.stroke(path);

    context.strokeStyle = "rgba(244, 246, 239, .86)";
    context.lineWidth = Math.max(2, roadWidth * .018);
    context.setLineDash([Math.max(24, roadWidth * .25), Math.max(28, roadWidth * .3)]);
    context.lineDashOffset = reducedMotion ? 0 : -progress * 80;
    context.stroke(path);
    context.restore();
  }

  function queueDraw() {
    if (!frameId && !paused && !destroyed) frameId = requestAnimationFrame(draw);
  }

  function resize(nextViewport = {}) {
    width = Math.max(320, nextViewport.width || innerWidth);
    height = Math.max(480, nextViewport.height || innerHeight);
    layout = buildJourneyLayout(regions, { width, height });
    path = tracePath(layout);
    configureCanvas();
    renderedProgress = -1;
    queueDraw();
  }

  function onVisibilityChange() {
    paused = document.hidden;
    if (paused) cancelAnimationFrame(frameId);
    else {
      renderedProgress = -1;
      queueDraw();
    }
  }

  configureCanvas();
  document.addEventListener("visibilitychange", onVisibilityChange);
  queueDraw();

  return {
    get layout() { return layout; },
    setProgress(nextProgress) {
      const next = Number(clamp(nextProgress).toFixed(4));
      if (next === progress && renderedProgress >= 0) return;
      progress = next;
      queueDraw();
    },
    setOffset(nextX = 0, nextY = 0) {
      offsetX = Number(nextX) || 0;
      offsetY = Number(nextY) || 0;
      queueDraw();
    },
    resize,
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frameId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    },
  };
}
