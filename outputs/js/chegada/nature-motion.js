import { clamp, smoothstep } from "../core/math.js";

const LEAF_COLORS = ["#a58a54", "#75683d", "#b49a62", "#817246", "#c0a36a"];

function randomAt(seed, index) {
  const value = Math.sin((seed + 1) * 12.9898 + index * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

export function createLeafGroup({ seed = Math.random(), count } = {}) {
  const total = clamp(
    Number.isFinite(count) ? Math.round(count) : 3 + Math.floor(randomAt(seed, 1) * 4),
    3,
    6,
  );

  return Array.from({ length: total }, (_, index) => ({
    x: 0.04 + randomAt(seed, index * 9 + 2) * 0.42,
    y: -0.08 + randomAt(seed, index * 9 + 3) * 0.28,
    delay: index * 0.1 + randomAt(seed, index * 9 + 4) * 0.11,
    drift: 0.055 + randomAt(seed, index * 9 + 5) * 0.105,
    fall: 0.7 + randomAt(seed, index * 9 + 6) * 0.24,
    sway: 0.018 + randomAt(seed, index * 9 + 7) * 0.038,
    spin: (randomAt(seed, index * 9 + 8) > 0.5 ? 1 : -1) * (1.8 + randomAt(seed, index * 9 + 9) * 4.2),
    phase: randomAt(seed, index * 9 + 10) * Math.PI * 2,
    size: 5.5 + randomAt(seed, index * 9 + 11) * 6.5,
    life: 5.8 + randomAt(seed, index * 9 + 12) * 2.4,
    color: LEAF_COLORS[Math.floor(randomAt(seed, index * 9 + 13) * LEAF_COLORS.length)],
  }));
}

export function computeLeafFrame(leaf, progress = 0) {
  const time = clamp(progress);
  const fadeIn = smoothstep(clamp(time / 0.12));
  const fadeOut = 1 - smoothstep(clamp((time - 0.76) / 0.24));
  const sway = Math.sin(leaf.phase + time * Math.PI * 4.2) * leaf.sway;

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

export function computeRiverFlowState({ elapsed = 0, reducedMotion = false } = {}) {
  if (reducedMotion) return { time: 0, intensity: 0 };
  return {
    time: computeRiverTime({ elapsed }),
    intensity: 1,
  };
}

function drawLeaf(context, leaf, frame, width, height) {
  const size = leaf.size * Math.min(1.18, Math.max(0.82, width / 1440));
  context.save();
  context.translate(frame.x * width, frame.y * height);
  context.rotate(frame.rotation);
  context.globalAlpha = frame.opacity * 0.82;
  context.fillStyle = leaf.color;
  context.strokeStyle = "rgba(55, 47, 28, .34)";
  context.lineWidth = Math.max(0.6, size * 0.075);
  context.beginPath();
  context.moveTo(-size, 0);
  context.quadraticCurveTo(-size * 0.18, -size * 0.72, size, 0);
  context.quadraticCurveTo(-size * 0.18, size * 0.72, -size, 0);
  context.closePath();
  context.fill();
  context.stroke();
  context.beginPath();
  context.moveTo(-size * 0.72, 0);
  context.lineTo(size * 0.72, 0);
  context.strokeStyle = "rgba(232, 215, 169, .28)";
  context.lineWidth = Math.max(0.45, size * 0.045);
  context.stroke();
  context.restore();
}

export function createLeafLayer({ canvas, reducedMotion = false } = {}) {
  if (!canvas) throw new TypeError("canvas é obrigatório para as folhas");

  if (reducedMotion) {
    canvas.hidden = true;
    return { pause() {}, resume() {}, destroy() {} };
  }

  const context = canvas.getContext("2d", { alpha: true });
  if (!context) {
    canvas.hidden = true;
    return { pause() {}, resume() {}, destroy() {} };
  }

  let frameId = 0;
  let resizeObserver;
  let paused = false;
  let destroyed = false;
  let nextGroupAt = 520;
  let seed = 0.37;
  let leaves = [];
  let width = 1;
  let height = 1;
  let startTime = performance.now();
  let pauseStartedAt = 0;

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
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

  const spawnGroup = (elapsed) => {
    seed = (seed + 0.271828) % 1;
    const count = width < 720 ? 3 + Math.floor(randomAt(seed, 2) * 2) : undefined;
    const group = createLeafGroup({ seed, count });
    leaves.push(...group.map((leaf) => ({ ...leaf, bornAt: elapsed + leaf.delay * 1000 })));
    nextGroupAt = elapsed + 2700 + randomAt(seed, 17) * 2100;
  };

  const draw = (now) => {
    if (destroyed || paused) return;
    resize();
    const elapsed = now - startTime;
    if (elapsed >= nextGroupAt) spawnGroup(elapsed);

    context.clearRect(0, 0, width, height);
    leaves = leaves.filter((leaf) => {
      const age = (elapsed - leaf.bornAt) / (leaf.life * 1000);
      if (age < 0) return true;
      if (age >= 1) return false;
      drawLeaf(context, leaf, computeLeafFrame(leaf, age), width, height);
      return true;
    });

    frameId = requestAnimationFrame(draw);
  };

  canvas.hidden = false;
  resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
  resizeObserver?.observe(canvas);
  frameId = requestAnimationFrame(draw);

  return {
    pause() {
      if (paused || destroyed) return;
      paused = true;
      pauseStartedAt = performance.now();
      cancelAnimationFrame(frameId);
    },
    resume() {
      if (!paused || destroyed) return;
      startTime += performance.now() - pauseStartedAt;
      paused = false;
      frameId = requestAnimationFrame(draw);
    },
    destroy() {
      destroyed = true;
      paused = true;
      cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      leaves = [];
      context.clearRect(0, 0, width, height);
    },
  };
}
