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
      if (segment.control1 && segment.control2) {
        path.bezierCurveTo(
          segment.control1.x,
          segment.control1.y,
          segment.control2.x,
          segment.control2.y,
          segment.to.x,
          segment.to.y,
        );
      } else {
        path.quadraticCurveTo(segment.control.x, segment.control.y, segment.to.x, segment.to.y);
      }
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

const ROAD_TEXTURE_URL = new URL("../../media/medieval-road-stones.webp", import.meta.url).href;

export function buildMedievalRoadLayers(baseWidth, texturePattern = null) {
  const width = Math.max(72, Number(baseWidth) || 72);
  return [
    {
      width: width * 1.24,
      strokeStyle: "rgba(49, 39, 29, .28)",
      shadowColor: "rgba(37, 29, 22, .34)",
      blur: 22,
      shadowOffsetY: 10,
      composite: "source-over",
      lineDash: [],
    },
    {
      width: width * 1.12,
      strokeStyle: "#8f765d",
      shadowColor: "rgba(77, 58, 40, .24)",
      blur: 7,
      shadowOffsetY: 3,
      composite: "source-over",
      lineDash: [],
    },
    {
      width,
      strokeStyle: texturePattern || "#b7a487",
      shadowColor: "transparent",
      blur: 0,
      shadowOffsetY: 0,
      composite: "source-over",
      lineDash: [],
    },
    {
      width: width * .96,
      strokeStyle: "rgba(236, 221, 191, .08)",
      shadowColor: "rgba(248, 231, 195, .12)",
      blur: 3,
      shadowOffsetY: -1,
      composite: "source-over",
      lineDash: [],
    },
  ];
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
  let roadTexture = null;
  const textureImage = new Image();

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
      ? Math.max(76, Math.min(106, width * .22))
      : Math.max(116, Math.min(164, width * .09));

    context.clearRect(0, 0, width, height);
    context.save();
    context.translate(width * .5 + offsetX - camera.x, height * .54 + offsetY - camera.y);
    context.lineJoin = "round";
    context.lineCap = "round";
    for (const layer of buildMedievalRoadLayers(roadWidth, roadTexture)) {
      context.globalCompositeOperation = layer.composite;
      context.strokeStyle = layer.strokeStyle;
      context.lineWidth = layer.width;
      context.setLineDash(layer.lineDash);
      context.shadowColor = layer.shadowColor;
      context.shadowBlur = reducedMotion ? layer.blur * .45 : layer.blur;
      context.shadowOffsetX = 0;
      context.shadowOffsetY = layer.shadowOffsetY || 0;
      context.stroke(path);
    }

    context.shadowBlur = 0;
    context.shadowOffsetY = 0;
    context.globalCompositeOperation = "source-over";
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
  textureImage.decoding = "async";
  textureImage.onload = () => {
    if (destroyed) return;
    roadTexture = context.createPattern(textureImage, "repeat");
    if (roadTexture?.setTransform && typeof DOMMatrix === "function") {
      roadTexture.setTransform(new DOMMatrix().scale(.64));
    }
    renderedProgress = -1;
    queueDraw();
  };
  textureImage.src = ROAD_TEXTURE_URL;
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
      textureImage.onload = null;
      cancelAnimationFrame(frameId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    },
  };
}
