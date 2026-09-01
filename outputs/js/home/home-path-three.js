import * as THREE from "three";
import { buildHomePathLayout } from "./home-path-layout.js";
import { createHomePathFallback } from "./home-path-fallback.js";

const clamp = (value) => Math.min(1, Math.max(0, Number(value) || 0));

/*
 * A linha é uma FITA com o brilho calculado por pixel, não dois tubos.
 *
 * Os dois tubos aninhados que havia aqui tinham um limite de forma: o halo era
 * uma superfície sólida de opacidade constante, então terminava numa borda —
 * uma casca dourada em volta do fio, e não luz se apagando no ar. Afinar o
 * núcleo melhorava, mas não resolvia; a borda continuava lá, só menor.
 *
 * Nesta técnica (a mesma do Potala tema 7) a geometria é uma tira plana e a
 * distância ao eixo chega ao fragment shader como varying. O núcleo e o halo
 * viram duas funções dessa distância — um degrau estreito e uma gaussiana —
 * calculadas em cada pixel. A queda passa a ser contínua até sumir, que é o que
 * o olho lê como brilho, e o custo cai: uma malha em vez de duas.
 */
const RIBBON_VERTEX = `
attribute vec2 aNormal;
attribute float aSide;
attribute float aArc;
uniform float uWidth;
varying float vSide;
varying float vArc;
void main() {
  vec3 p = position;
  p.xy += aNormal * aSide * uWidth;
  vSide = aSide;
  vArc = aArc;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const RIBBON_FRAGMENT = `
precision highp float;
uniform float uReveal;
uniform float uOpacity;
uniform vec3 uGold;
varying float vSide;
varying float vArc;
void main() {
  // A revelação é um corte no comprimento do arco, não um recorte de índices:
  // a ponta acompanha a rolagem sem depender de quantos triângulos existem.
  if (vArc > uReveal) discard;

  float distance = abs(vSide) * 7.0;
  float core = 1.0 - smoothstep(0.55, 0.93, distance);
  float glow = exp(-distance * distance / 5.0) * 0.19;
  float alpha = clamp(core * 0.94 + glow, 0.0, 1.0);
  gl_FragColor = vec4(uGold, alpha * uOpacity);
}`;

/**
 * Vértices da fita a partir de uma função que devolve o ponto em t.
 *
 * Dois vértices por amostra, um de cada lado do eixo, deslocados na normal — a
 * perpendicular à tangente no plano da tela. `aArc` guarda onde cada vértice
 * está no comprimento, e é ele que a revelação corta.
 *
 * Recebe `sample` em vez da curva do Three para poder ser conferido sem GPU:
 * é aqui que um porte destes quebra em silêncio, com a normal apontando para o
 * lado errado ou o arco fora de 0..1, e nada acusa além de a linha sumir.
 */
export function buildRibbonAttributes(sample, segments = 240) {
  const total = Math.max(2, Math.trunc(segments));
  const positions = [];
  const normals = [];
  const sides = [];
  const arcs = [];
  const indices = [];

  const pontos = Array.from({ length: total + 1 }, (_, i) => sample(i / total));

  for (let i = 0; i <= total; i += 1) {
    const antes = pontos[Math.max(0, i - 1)];
    const depois = pontos[Math.min(total, i + 1)];
    let tx = depois.x - antes.x;
    let ty = depois.y - antes.y;
    const comprimento = Math.hypot(tx, ty) || 1;
    tx /= comprimento;
    ty /= comprimento;

    for (const side of [-1, 1]) {
      positions.push(pontos[i].x, pontos[i].y, pontos[i].z ?? 0);
      // Tangente girada 90°: é o que mantém a largura constante nas curvas.
      normals.push(-ty, tx);
      sides.push(side);
      arcs.push(i / total);
    }

    if (i < total) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  return { positions, normals, sides, arcs, indices };
}

export function qualityForViewport({
  width = 1440,
  devicePixelRatio = 1,
  reducedMotion = false,
} = {}) {
  if (reducedMotion) return { dpr: 1, segments: 160 };
  const mobile = width <= 720;
  return {
    dpr: Math.min(Math.max(1, devicePixelRatio), mobile ? 1.25 : 1.5),
    segments: mobile ? 220 : 320,
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
      // Alfa direto, não pré-multiplicado: o shader devolve a cor cheia e a
      // opacidade separada. Com pré-multiplicação o halo, que é quase todo
      // transparente, sairia escurecido em vez de esmaecido.
      premultipliedAlpha: false,
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

  const atributos = buildRibbonAttributes((t) => curve.getPointAt(t), quality.segments);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(atributos.positions, 3));
  geometry.setAttribute("aNormal", new THREE.Float32BufferAttribute(atributos.normals, 2));
  geometry.setAttribute("aSide", new THREE.Float32BufferAttribute(atributos.sides, 1));
  geometry.setAttribute("aArc", new THREE.Float32BufferAttribute(atributos.arcs, 1));
  geometry.setIndex(atributos.indices);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uReveal: { value: 0 },
      uOpacity: { value: 1 },
      // A meia-largura da fita em unidades do mundo. O núcleo aceso ocupa cerca
      // de 13% dela (0,93 de 7 no shader); o resto é o halo se apagando.
      uWidth: { value: 0.1 },
      uGold: { value: new THREE.Color(0xe6bd78) },
    },
    vertexShader: RIBBON_VERTEX,
    fragmentShader: RIBBON_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  });

  const ribbon = new THREE.Mesh(geometry, material);
  scene.add(ribbon);

  function render() {
    if (paused || destroyed) return;
    const point = curve.getPointAt(clamp(progress));
    camera.position.set(point.x * 0.12, point.y, 3.75);
    camera.lookAt(point.x * 0.22, point.y - 0.3, 0);
    material.uniforms.uReveal.value = clamp(progress);
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
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();
    },
  };
}
