import * as THREE from "../../vendor/three.module.min.js";

const VERTEX_SHADER = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  precision highp float;

  uniform float uTime;
  uniform float uAspect;
  varying vec2 vUv;

  float softLight(vec2 point, vec2 center, float radius) {
    vec2 delta = point - center;
    delta.x *= uAspect;
    return exp(-dot(delta, delta) / radius);
  }

  void main() {
    float time = uTime * 0.12;
    vec2 point = vUv;
    float upper = softLight(point, vec2(0.24 + sin(time) * 0.035, 0.72), 0.18);
    float lower = softLight(point, vec2(0.78 + cos(time * 0.82) * 0.03, 0.28), 0.22);
    float ribbonY = 0.5 + sin(point.x * 4.2 + time * 1.6) * 0.075;
    float ribbon = exp(-pow((point.y - ribbonY) / 0.22, 2.0));
    float strength = clamp(upper * 0.1 + lower * 0.085 + ribbon * 0.035, 0.0, 0.13);
    vec3 sand = vec3(0.66, 0.49, 0.29);
    vec3 gold = vec3(0.83, 0.67, 0.39);
    vec3 color = mix(sand, gold, clamp(upper + lower, 0.0, 1.0));

    gl_FragColor = vec4(color, strength);
  }
`;

function createStaticScene() {
  return {
    mode: "static",
    start() {},
    stop() {},
    destroy() {},
  };
}

export function createAboutClosingScene({
  canvas,
  reducedMotion = false,
  rendererFactory = (options) => new THREE.WebGLRenderer(options),
  requestFrame = globalThis.requestAnimationFrame,
  cancelFrame = globalThis.cancelAnimationFrame,
  viewport = () => ({
    width: canvas.clientWidth || globalThis.innerWidth || 1,
    height: canvas.clientHeight || globalThis.innerHeight || 1,
    pixelRatio: globalThis.devicePixelRatio || 1,
  }),
} = {}) {
  if (!canvas || reducedMotion || typeof requestFrame !== "function") return createStaticScene();

  let renderer;
  try {
    renderer = rendererFactory({ canvas, alpha: true, antialias: false, powerPreference: "low-power" });
  } catch {
    return createStaticScene();
  }

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const uniforms = {
    uTime: { value: 0 },
    uAspect: { value: 1 },
  };
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const plane = new THREE.Mesh(geometry, material);
  scene.add(plane);

  renderer.setClearColor(0xffffff, 0);
  if ("outputColorSpace" in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;

  let running = false;
  let frameId = 0;
  let startedAt = null;

  const resize = () => {
    const { width, height, pixelRatio } = viewport();
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    uniforms.uAspect.value = safeWidth / safeHeight;
    renderer.setPixelRatio(Math.min(1.5, Math.max(1, pixelRatio)));
    renderer.setSize(safeWidth, safeHeight, false);
  };

  const render = (time) => {
    if (!running) return;
    if (startedAt === null) startedAt = time;
    uniforms.uTime.value = (time - startedAt) / 1000;
    renderer.render(scene, camera);
    frameId = requestFrame(render);
  };

  const resizeTarget = typeof window !== "undefined" ? window : null;
  resize();
  resizeTarget?.addEventListener("resize", resize, { passive: true });

  return {
    mode: "three",
    start() {
      if (running) return;
      running = true;
      startedAt = null;
      frameId = requestFrame(render);
    },
    stop() {
      if (!running) return;
      running = false;
      if (typeof cancelFrame === "function") cancelFrame(frameId);
    },
    destroy() {
      this.stop();
      resizeTarget?.removeEventListener("resize", resize);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    },
  };
}
