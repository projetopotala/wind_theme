import * as THREE from "three";
import { buildHomePathLayout } from "./home-path-layout.js";
import { createHomePathFallback } from "./home-path-fallback.js";

const clamp = (value) => Math.min(1, Math.max(0, Number(value) || 0));

export function drawRangeForProgress(progress, indexCount) {
  const available = Math.max(0, Math.trunc(Number(indexCount) || 0));
  return Math.min(available, Math.max(0, Math.round(clamp(progress) * available)));
}

export function qualityForViewport({
  width = 1440,
  devicePixelRatio = 1,
  reducedMotion = false,
} = {}) {
  if (reducedMotion) return { dpr: 1, tubularSegments: 160, radialSegments: 6 };
  const mobile = width <= 720;
  return {
    dpr: Math.min(Math.max(1, devicePixelRatio), mobile ? 1.25 : 1.5),
    tubularSegments: mobile ? 220 : 320,
    radialSegments: mobile ? 6 : 8,
  };
}

export function createHomePath(canvas, {
  blocks = [],
  reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false,
  fallbackFactory = createHomePathFallback,
} = {}) {
  if (!canvas) throw new TypeError("canvas é obrigatório para montar o trajeto");

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: !reducedMotion,
      powerPreference: "high-performance",
      premultipliedAlpha: true,
    });
  } catch {
    return fallbackFactory(canvas);
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 30);
  const layout = buildHomePathLayout(blocks);
  const points = layout.points.map(({ x, y, z }) => new THREE.Vector3(x, y, z));
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal", 0.35);
  let quality = qualityForViewport({
    width: canvas.clientWidth || globalThis.innerWidth,
    devicePixelRatio: globalThis.devicePixelRatio,
    reducedMotion,
  });
  let progress = 0;
  let paused = false;
  let destroyed = false;

  const coreGeometry = new THREE.TubeGeometry(curve, quality.tubularSegments, 0.028, quality.radialSegments, false);
  const haloGeometry = new THREE.TubeGeometry(curve, quality.tubularSegments, 0.095, quality.radialSegments, false);
  const coreMaterial = new THREE.MeshBasicMaterial({
    color: 0xffedb4,
    transparent: true,
    opacity: 0.98,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const haloMaterial = new THREE.MeshBasicMaterial({
    color: 0xdca34f,
    transparent: true,
    opacity: 0.24,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const core = new THREE.Mesh(coreGeometry, coreMaterial);
  const halo = new THREE.Mesh(haloGeometry, haloMaterial);
  scene.add(halo, core);

  function render() {
    if (paused || destroyed) return;
    const point = curve.getPointAt(clamp(progress));
    camera.position.set(point.x * 0.12, point.y, 3.75);
    camera.lookAt(point.x * 0.22, point.y - 0.3, 0);
    coreGeometry.setDrawRange(0, drawRangeForProgress(progress, coreGeometry.index?.count));
    haloGeometry.setDrawRange(0, drawRangeForProgress(progress, haloGeometry.index?.count));
    renderer.render(scene, camera);
  }

  function resize() {
    if (destroyed) return;
    const width = Math.max(1, canvas.clientWidth || globalThis.innerWidth || 1);
    const height = Math.max(1, canvas.clientHeight || globalThis.innerHeight || 1);
    quality = qualityForViewport({ width, devicePixelRatio: globalThis.devicePixelRatio, reducedMotion });
    renderer.setPixelRatio(quality.dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    render();
  }

  resize();

  return {
    mode: "three",
    layout,
    setProgress(value) {
      progress = clamp(value);
      render();
    },
    resize,
    pause() { paused = true; },
    resume() { paused = false; render(); },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      coreGeometry.dispose();
      haloGeometry.dispose();
      coreMaterial.dispose();
      haloMaterial.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();
    },
  };
}

