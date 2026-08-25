import { clamp, smoothstep } from "../core/math.js";
import { ARRIVAL_SCENE_PROFILES } from "./arrival-scene-profile.js";

const DEFAULT_NATURE = ARRIVAL_SCENE_PROFILES.desktopV2.nature;
const TREE = DEFAULT_NATURE.treeEmitter;
const LEAF_COLORS = DEFAULT_NATURE.leafColors;

function randomAt(seed, index) {
  const value = Math.sin((seed + 1) * 12.9898 + index * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function coverLayout(viewport, image) {
  const scale = Math.max(viewport.width / image.width, viewport.height / image.height);
  const drawnWidth = image.width * scale;
  const drawnHeight = image.height * scale;
  return {
    drawnWidth,
    drawnHeight,
    offsetX: (viewport.width - drawnWidth) / 2,
    offsetY: (viewport.height - drawnHeight) / 2,
  };
}

function toScreen(u, v, layout) {
  return {
    x: layout.offsetX + u * layout.drawnWidth,
    y: layout.offsetY + v * layout.drawnHeight,
  };
}

export function createLeafGroup({
  seed = Math.random(),
  count,
  emitter = TREE,
  colors = LEAF_COLORS,
} = {}) {
  const total = clamp(
    Number.isFinite(count) ? Math.round(count) : 3 + Math.floor(randomAt(seed, 1) * 4),
    3,
    6,
  );

  return Array.from({ length: total }, (_, index) => ({
    x: emitter.x + randomAt(seed, index * 9 + 2) * emitter.w,
    y: emitter.y + randomAt(seed, index * 9 + 3) * emitter.h,
    delay: index * 0.1 + randomAt(seed, index * 9 + 4) * 0.11,
    drift: 0.03 + randomAt(seed, index * 9 + 5) * 0.07,
    fall: 0.42 + randomAt(seed, index * 9 + 6) * 0.28,
    sway: 0.016 + randomAt(seed, index * 9 + 7) * 0.028,
    spin: (randomAt(seed, index * 9 + 8) > 0.5 ? 1 : -1) * (1.6 + randomAt(seed, index * 9 + 9) * 3.4),
    phase: randomAt(seed, index * 9 + 10) * Math.PI * 2,
    size: 4.5 + randomAt(seed, index * 9 + 11) * 5.5,
    life: 6.4 + randomAt(seed, index * 9 + 12) * 2.8,
    color: colors[Math.floor(randomAt(seed, index * 9 + 13) * colors.length)],
  }));
}

export function computeLeafFrame(leaf, progress = 0) {
  const time = clamp(progress);
  const fadeIn = smoothstep(clamp(time / 0.12));
  const fadeOut = 1 - smoothstep(clamp((time - 0.76) / 0.24));
  const sway = Math.sin(leaf.phase + time * Math.PI * 3.6) * leaf.sway;

  return {
    x: leaf.x + leaf.drift * time + sway,
    y: leaf.y + leaf.fall * time,
    opacity: Number((fadeIn * fadeOut).toFixed(3)),
    rotation: leaf.phase + leaf.spin * time,
  };
}

export function computeRiverTime({ elapsed = 0, reducedMotion = false } = {}) {
  return reducedMotion ? 0 : Math.max(0, elapsed);
}

export function computeRiverFlowState({
  elapsed = 0,
  reducedMotion = false,
  energy = 1,
} = {}) {
  if (reducedMotion) return { time: 0, intensity: 0 };
  const intensity = clamp(energy, 0, 1);
  if (intensity <= 0) return { time: 0, intensity: 0 };
  return {
    time: computeRiverTime({ elapsed }),
    intensity,
  };
}

export function computeRippleFrame(ripple, time = 0) {
  const age = Math.max(0, time - ripple.born);
  const life = ripple.life || 1.8;
  const t = clamp(age / life);
  return {
    x: ripple.x,
    y: ripple.y,
    radius: ripple.start + t * ripple.spread,
    opacity: Number(((1 - t) * (ripple.strength || 0.55)).toFixed(3)),
  };
}

export function computePersonIdle(person, time = 0) {
  const phase = person.phase || 0;
  if (person.kind === "play") {
    return {
      x: person.x + Math.sin(time * 2.2 + phase) * 0.0035,
      y: person.y + Math.abs(Math.sin(time * 3.1 + phase)) * 0.0024,
    };
  }
  if (person.kind === "walk") {
    return {
      x: person.x + Math.sin(time * 1.15 + phase) * 0.0022,
      y: person.y + Math.abs(Math.sin(time * 2.3 + phase)) * 0.0016,
    };
  }
  return {
    x: person.x + Math.sin(time * 1.05 + phase) * 0.0012,
    y: person.y + Math.sin(time * 1.35 + phase) * 0.0014,
  };
}

function drawLeaf(context, leaf, frame, width) {
  const size = leaf.size * Math.min(1.18, Math.max(0.82, width / 1440));
  context.save();
  context.translate(frame.x, frame.y);
  context.rotate(frame.rotation);
  context.globalAlpha = frame.opacity * 0.78;
  context.fillStyle = leaf.color;
  context.strokeStyle = "rgba(55, 47, 28, .3)";
  context.lineWidth = Math.max(0.5, size * 0.07);
  context.beginPath();
  context.moveTo(-size, 0);
  context.quadraticCurveTo(-size * 0.18, -size * 0.72, size, 0);
  context.quadraticCurveTo(-size * 0.18, size * 0.72, -size, 0);
  context.closePath();
  context.fill();
  context.stroke();
  context.restore();
}

function drawRipple(context, frame, layout) {
  if (frame.opacity <= 0.02) return;
  const point = toScreen(frame.x, frame.y, layout);
  const radius = frame.radius * layout.drawnWidth;
  context.save();
  context.globalAlpha = frame.opacity;
  context.strokeStyle = "rgba(236, 224, 196, .7)";
  context.lineWidth = Math.max(0.8, layout.drawnWidth * 0.0014);
  context.beginPath();
  context.ellipse(point.x, point.y, radius, radius * 0.38, 0, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

export function createNatureLayer({
  canvas,
  reducedMotion = false,
  profile = ARRIVAL_SCENE_PROFILES.desktopV2,
  quality = { maxDpr: 1.5, particles: true },
} = {}) {
  if (!canvas) throw new TypeError("canvas é obrigatório para as folhas");

  const inert = {
    update() {},
    render() {},
    gust() {},
    ripple() {},
    resize() {},
    pause() {},
    resume() {},
    destroy() {},
  };

  if (reducedMotion || quality.particles === false) {
    canvas.hidden = true;
    return inert;
  }

  const context = canvas.getContext("2d", { alpha: true });
  if (!context) {
    canvas.hidden = true;
    return inert;
  }

  const nature = profile.nature || DEFAULT_NATURE;
  const plate = profile.plate || { width: 16, height: 9 };
  const maxLeaves = nature.maxLeaves || 24;
  const maxRipples = nature.maxRipples || 10;
  let resizeObserver;
  let paused = false;
  let destroyed = false;
  let nextGroupAt = 0;
  let nextRippleAt = 400;
  let seed = 0.37;
  let leaves = [];
  let ripples = [];
  let width = 1;
  let height = 1;
  let startTime = performance.now();
  let pauseStartedAt = 0;
  let elapsedMs = 0;

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, quality.maxDpr || 1.5);
    width = Math.max(1, canvas.clientWidth);
    height = Math.max(1, canvas.clientHeight);
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
  };

  const spawnGroup = (count) => {
    seed = (seed + 0.271828) % 1;
    const group = createLeafGroup({
      seed,
      count,
      emitter: nature.treeEmitter,
      colors: nature.leafColors,
    });
    leaves.push(...group.map((leaf) => ({ ...leaf, bornAt: elapsedMs + leaf.delay * 1000 })));
    if (leaves.length > maxLeaves) leaves = leaves.slice(leaves.length - maxLeaves);
  };

  canvas.hidden = false;
  resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
  resizeObserver?.observe(canvas);
  resize();

  return {
    update(now = performance.now(), state = {}) {
      if (destroyed || paused) return;
      elapsedMs = now - startTime;
      const energy = state.world?.energies || {};
      const wind = energy.wind ?? 0.28;
      const water = energy.water ?? 0.65;

      if (elapsedMs >= nextGroupAt) {
        const count = width < 720 ? 3 : 3 + Math.floor(randomAt(seed, 2) * 2);
        spawnGroup(count);
        nextGroupAt = elapsedMs + 2200 + randomAt(seed, 17) * 1800 - wind * 400;
      }
      if (elapsedMs >= nextRippleAt) {
        seed = (seed + 0.141421) % 1;
        const pool = nature.rippleArea;
        const kids = computePersonIdle({ x: pool.x, y: pool.y, kind: "play", phase: 0.2 }, elapsedMs / 1000);
        ripples.push({
          x: kids.x + (randomAt(seed, 3) - 0.5) * 0.03,
          y: kids.y + (randomAt(seed, 4) - 0.5) * 0.016,
          born: elapsedMs / 1000,
          life: 1.5 + randomAt(seed, 5) * 0.6,
          start: 0.004,
          spread: 0.018 + randomAt(seed, 6) * 0.012,
          strength: (0.32 + randomAt(seed, 7) * 0.18) * (0.55 + water * 0.45),
        });
        if (ripples.length > maxRipples) ripples = ripples.slice(ripples.length - maxRipples);
        nextRippleAt = elapsedMs + 800 + randomAt(seed, 8) * 700;
      }
    },
    render() {
      if (destroyed || paused) return;
      resize();
      const time = elapsedMs / 1000;
      const layout = coverLayout({ width, height }, plate);
      context.clearRect(0, 0, width, height);

      leaves = leaves.filter((leaf) => {
        const age = (elapsedMs - leaf.bornAt) / (leaf.life * 1000);
        if (age < 0) return true;
        if (age >= 1) return false;
        const frame = computeLeafFrame(leaf, age);
        const point = toScreen(frame.x, frame.y, layout);
        drawLeaf(context, leaf, { ...frame, x: point.x, y: point.y }, width);
        return true;
      });

      ripples = ripples.filter((ripple) => {
        const frame = computeRippleFrame(ripple, time);
        if (frame.opacity <= 0.02) return false;
        drawRipple(context, frame, layout);
        return true;
      });
    },
    gust({ count } = {}) {
      if (destroyed || paused) return;
      resize();
      const total = count ?? (width < 720 ? 3 + Math.floor(randomAt(seed, 2) * 2) : 5);
      spawnGroup(total);
    },
    ripple({ x, y, strength = 0.5 } = {}) {
      if (destroyed || paused) return;
      const pool = nature.rippleArea;
      ripples.push({
        x: Number.isFinite(x) ? x : pool.x,
        y: Number.isFinite(y) ? y : pool.y,
        born: elapsedMs / 1000,
        life: 1.6,
        start: 0.004,
        spread: 0.022,
        strength,
      });
      if (ripples.length > maxRipples) ripples = ripples.slice(ripples.length - maxRipples);
    },
    resize,
    pause() {
      if (paused || destroyed) return;
      paused = true;
      pauseStartedAt = performance.now();
    },
    resume() {
      if (!paused || destroyed) return;
      startTime += performance.now() - pauseStartedAt;
      paused = false;
    },
    destroy() {
      destroyed = true;
      paused = true;
      resizeObserver?.disconnect();
      leaves = [];
      ripples = [];
      context.clearRect(0, 0, width, height);
    },
  };
}

export function createLeafLayer(options = {}) {
  return createNatureLayer(options);
}
