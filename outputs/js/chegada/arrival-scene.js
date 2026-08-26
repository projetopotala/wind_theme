import { clamp, damp, smoothstep } from "../core/math.js";
import { loadArrivalTextures } from "./arrival-assets.js";
import { computeRiverFlowState } from "./nature-motion.js";
import {
  ARRIVAL_MOTION,
  ARRIVAL_SMOOTHING,
  computeArrivalQuality,
  selectArrivalAssets,
  selectArrivalProfile,
} from "./arrival-scene-profile.js";
import { ARRIVAL_FRAGMENT_SHADER } from "./shaders/arrival-fragment.js";
import { ARRIVAL_VERTEX_SHADER } from "./shaders/arrival-vertex.js";

export {
  computeLeafFrame,
  computePersonIdle,
  computeRippleFrame,
  computeRiverFlowState,
  computeRiverTime,
  createLeafGroup,
} from "./nature-motion.js";

export { computeArrivalQuality, selectArrivalAssets, selectArrivalProfile };

const BREATH_OFFSETS = {
  inhale: { depth: 0.06, fog: -0.07, light: 0.07 },
  hold: { depth: 0.04, fog: -0.05, light: 0.055 },
  exhale: { depth: -0.02, fog: 0.025, light: -0.025 },
  idle: { depth: 0, fog: 0, light: 0 },
  paused: { depth: 0, fog: 0, light: 0 },
};

export const UNIFORM_NAMES = [
  "uImage", "uDepth", "uWaterMask", "uWaterfallMask", "uCanopyMask", "uMistMask", "uSkyMask",
  "uPointer", "uResolution", "uImageSize",
  "uCamera", "uDepthAmount", "uFog", "uLight", "uPath", "uTime", "uRiverMotion",
  "uWind", "uWindDir", "uSun", "uMistReveal", "uAttention", "uAttentionUv",
  "uHasWaterMask", "uHasWaterfallMask", "uHasCanopyMask", "uHasMistMask", "uHasSkyMask",
  "uClouds", "uRiverPhase", "uFallPhase", "uCloudDrift",
  "uRippleUv", "uRippleTime", "uRippleStrength",
  "uOverscan", "uCameraZoom", "uFarParallax", "uNearParallax",
  "uCanopyMaxUv", "uWaterMaxUv", "uWaterfallMaxUv",
  "uDebugView", "uDebugMaskMix",
];

export function computeArrivalState({ scrollProgress = 0, phase = "idle" } = {}) {
  const eased = smoothstep(scrollProgress);
  const breath = BREATH_OFFSETS[phase] || BREATH_OFFSETS.idle;

  return {
    camera: eased,
    depth: Number(clamp(0.18 + eased * 0.12 + breath.depth, 0.12, 0.38).toFixed(3)),
    fog: Number(clamp(0.76 - eased * 0.48 + breath.fog, 0.18, 0.82).toFixed(3)),
    light: Number(clamp(0.34 + eased * 0.22 + breath.light, 0.24, 0.66).toFixed(3)),
    path: Number(clamp((eased - 0.46) / 0.54).toFixed(3)),
  };
}

export function computeCameraMotion({ scrollProgress = 0, reducedMotion = false } = {}) {
  return reducedMotion ? 0 : computeArrivalState({ scrollProgress }).camera;
}

// Velocidades em células de ruído por segundo. Só existem aqui: o shader recebe
// a fase já somada e nunca a velocidade, para não poder remultiplicar por tempo.
//
// A queda usa três camadas com frequências diferentes, então a velocidade que se
// vê na tela não é este número: o véu corre a fall/16, o fio a fall*1,62/10 e o
// respingo a fall*2,45/30 da altura por segundo. É a razão entre elas que dá a
// profundidade; mexer só aqui desacelera a queda inteira sem achatá-la.
const PHASE_RATES = { river: 0.22, fall: 1.6 };

export function createScenePhases() {
  return { river: 0, fall: 0, drift: [0, 0] };
}

/**
 * Integra as fases de correnteza, queda e nuvem quadro a quadro.
 *
 * O ponto inteiro desta função é que a fase é uma soma, não um produto. Quando o
 * visitante encosta num lugar a energia da água sobe e a velocidade muda — se o
 * shader calculasse `tempo × velocidade`, o produto saltaria de uma vez e a
 * cachoeira e as nuvens pulariam. Somando, a mudança de velocidade só altera a
 * inclinação: o valor continua contínuo e a imagem não pisca.
 */
export function advanceScenePhases(phases, {
  dt = 0,
  riverMotion = 0.65,
  cloudSpeed = ARRIVAL_MOTION.cloudSpeed,
  windDir = [0.32, 0.08],
  reducedMotion = false,
} = {}) {
  const current = phases || createScenePhases();
  const carried = { river: current.river, fall: current.fall, drift: [...current.drift] };
  if (reducedMotion || !(dt > 0)) return carried;

  const seconds = dt / 1000;
  const dirX = (windDir?.[0] ?? 0) + 0.85;
  const dirY = (windDir?.[1] ?? 0) + 0.06;
  const length = Math.max(1e-4, Math.hypot(dirX, dirY));

  return {
    river: carried.river + seconds * PHASE_RATES.river * Math.max(riverMotion, 0.4),
    fall: carried.fall + seconds * PHASE_RATES.fall * Math.max(riverMotion, 0.5),
    drift: [
      carried.drift[0] + (dirX / length) * seconds * cloudSpeed,
      carried.drift[1] + (dirY / length) * seconds * cloudSpeed,
    ],
  };
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "Falha ao compilar shader";
    gl.deleteShader(shader);
    throw new Error(message);
  }

  return shader;
}

function createProgram(gl) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, ARRIVAL_VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, ARRIVAL_FRAGMENT_SHADER);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || "Falha ao montar programa WebGL";
    gl.deleteProgram(program);
    throw new Error(message);
  }

  return program;
}

function emit(name, detail = {}) {
  if (typeof document !== "undefined") {
    document.dispatchEvent(new CustomEvent(name, { detail }));
  }
}

export function createArrivalScene({
  canvas,
  imageUrl,
  depthUrl,
  waterUrl = "",
  canopyUrl = "",
  waterMaskUrl = "",
  waterfallMaskUrl = "",
  canopyMaskUrl = "",
  mistMaskUrl = "",
  skyMaskUrl = "",
  profile,
  reducedMotion = false,
  debug = false,
} = {}) {
  if (!canvas || !imageUrl || !depthUrl) {
    throw new TypeError("canvas, imageUrl e depthUrl são obrigatórios");
  }

  const motion = profile?.motion || ARRIVAL_MOTION;
  const quality = computeArrivalQuality({
    width: typeof window !== "undefined" ? window.innerWidth : 1280,
    height: typeof window !== "undefined" ? window.innerHeight : 720,
    devicePixelRatio: typeof window !== "undefined" ? window.devicePixelRatio : 1,
    profile,
  });

  let gl;
  let program;
  let resizeObserver;
  let destroyed = false;
  let paused = Boolean(reducedMotion);
  let ready = false;
  let targetPointer = [0, 0];
  let pointer = [0, 0];
  let scrollProgress = 0;
  let breathPhase = "idle";
  let targetState = computeArrivalState();
  let state = { ...targetState };
  let imageSize = [1, 1];
  let flags = {};
  let textureCount = 0;
  let waterClock = 0;
  let phases = createScenePhases();
  const restingWorld = () => ({
    wind: 0.28,
    water: 0.65,
    sun: 0.24,
    mist: 0.14,
    path: 0.08,
    attention: 0,
    windDir: [0.32, 0.08],
    attentionUv: [0.5, 0.5],
  });
  // `worldTarget` recebe o salto do hover; `world` persegue esse alvo. O motor já
  // amortece a queda das energias, mas a subida era instantânea — era o estalo de
  // brilho que se via ao encostar num lugar.
  let worldTarget = restingWorld();
  let world = restingWorld();
  let debugView = 0;
  let debugMaskMix = 0;
  let ripple = { uv: [0.22, 0.78], time: 0, strength: 0 };
  const textures = [];

  const fallback = (reason) => {
    canvas.hidden = true;
    const visual = canvas.closest(".arrival-visual");
    visual?.classList.remove("is-scene-ready");
    visual?.classList.add("is-fallback", "is-scene-fallback");
    emit("potala:scene-fallback", { reason });
  };

  try {
    gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });

    if (!gl) throw new Error("WebGL indisponível");
    program = createProgram(gl);
  } catch (error) {
    fallback(error instanceof Error ? error.message : "WebGL indisponível");
    return {
      ready: Promise.resolve(false),
      setPointer() {},
      setScrollProgress() {},
      setBreathState() {},
      setWorld() {},
      setDebug() {},
      setRipple() {},
      render() {},
      resize() {},
      pause() {},
      resume() {},
      destroy() {},
      getMetrics() {
        return { ready: false, dpr: 1, textureCount: 0 };
      },
    };
  }

  const position = gl.getAttribLocation(program, "aPosition");
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );

  const uniforms = Object.fromEntries(
    UNIFORM_NAMES.map((name) => [name, gl.getUniformLocation(program, name)]),
  );

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, quality.maxDpr);
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  };

  const render = (now = performance.now(), elapsedMs = 16) => {
    if (destroyed || !ready) return;
    resize();

    const dt = Math.min(48, Math.max(0, elapsedMs));
    if (!reducedMotion) waterClock += dt / 1000;

    pointer[0] = damp(pointer[0], targetPointer[0], dt, ARRIVAL_SMOOTHING.pointerMs);
    pointer[1] = damp(pointer[1], targetPointer[1], dt, ARRIVAL_SMOOTHING.pointerMs);
    state.camera = damp(state.camera, targetState.camera, dt, ARRIVAL_SMOOTHING.cameraMs);
    state.depth = damp(state.depth, targetState.depth, dt, ARRIVAL_SMOOTHING.cameraMs);
    state.fog = damp(state.fog, targetState.fog, dt, ARRIVAL_SMOOTHING.lightMs);
    state.light = damp(state.light, targetState.light, dt, ARRIVAL_SMOOTHING.lightMs);
    state.path = damp(state.path, targetState.path, dt, ARRIVAL_SMOOTHING.cameraMs);
    ripple.time += dt / 1000;

    for (const key of ["wind", "water", "sun", "mist", "path", "attention"]) {
      world[key] = damp(world[key], worldTarget[key], dt, ARRIVAL_SMOOTHING.lightMs);
    }
    world.windDir = [
      damp(world.windDir[0], worldTarget.windDir[0], dt, ARRIVAL_SMOOTHING.windDirMs),
      damp(world.windDir[1], worldTarget.windDir[1], dt, ARRIVAL_SMOOTHING.windDirMs),
    ];

    const riverFlow = computeRiverFlowState({
      elapsed: waterClock,
      reducedMotion,
      energy: Math.max(world.water, 0.55),
    });
    phases = advanceScenePhases(phases, {
      dt,
      riverMotion: riverFlow.intensity,
      cloudSpeed: motion.cloudSpeed,
      windDir: world.windDir,
      reducedMotion,
    });

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1i(uniforms.uImage, 0);
    gl.uniform1i(uniforms.uDepth, 1);
    gl.uniform1i(uniforms.uWaterMask, 2);
    gl.uniform1i(uniforms.uWaterfallMask, 5);
    gl.uniform1i(uniforms.uCanopyMask, 3);
    gl.uniform1i(uniforms.uMistMask, 4);
    gl.uniform1i(uniforms.uSkyMask, 6);
    gl.uniform2f(uniforms.uPointer, pointer[0], pointer[1]);
    gl.uniform2f(uniforms.uResolution, canvas.width, canvas.height);
    gl.uniform2f(uniforms.uImageSize, imageSize[0], imageSize[1]);
    gl.uniform1f(uniforms.uCamera, reducedMotion ? 0 : state.camera);
    gl.uniform1f(uniforms.uDepthAmount, reducedMotion ? 0 : state.depth);
    gl.uniform1f(uniforms.uFog, state.fog);
    gl.uniform1f(uniforms.uLight, state.light);
    gl.uniform1f(uniforms.uPath, clamp(state.path + world.path * 0.55));
    gl.uniform1f(uniforms.uTime, reducedMotion ? 0 : waterClock);
    gl.uniform1f(uniforms.uRiverMotion, riverFlow.intensity);
    gl.uniform1f(uniforms.uWind, reducedMotion ? 0 : world.wind);
    gl.uniform2f(uniforms.uWindDir, world.windDir[0], world.windDir[1]);
    gl.uniform1f(uniforms.uSun, world.sun);
    gl.uniform1f(uniforms.uMistReveal, world.mist);
    gl.uniform1f(uniforms.uAttention, world.attention);
    gl.uniform2f(uniforms.uAttentionUv, world.attentionUv[0], world.attentionUv[1]);
    gl.uniform1f(uniforms.uHasWaterMask, flags.waterMask || 0);
    gl.uniform1f(uniforms.uHasWaterfallMask, flags.waterfallMask || 0);
    gl.uniform1f(uniforms.uHasCanopyMask, flags.canopyMask || 0);
    gl.uniform1f(uniforms.uHasMistMask, flags.mistMask || 0);
    gl.uniform1f(uniforms.uHasSkyMask, flags.skyMask || 0);
    // Sem movimento reduzido a nuvem continua desenhada, apenas parada: ela é
    // parte da composição, não um efeito que se possa simplesmente apagar.
    gl.uniform1f(uniforms.uClouds, motion.cloudAmount);
    gl.uniform1f(uniforms.uRiverPhase, phases.river);
    gl.uniform1f(uniforms.uFallPhase, phases.fall);
    gl.uniform2f(uniforms.uCloudDrift, phases.drift[0], phases.drift[1]);
    gl.uniform2f(uniforms.uRippleUv, ripple.uv[0], ripple.uv[1]);
    gl.uniform1f(uniforms.uRippleTime, ripple.time);
    gl.uniform1f(uniforms.uRippleStrength, ripple.strength);
    gl.uniform1f(uniforms.uOverscan, motion.overscan);
    gl.uniform1f(uniforms.uCameraZoom, reducedMotion ? 0 : motion.cameraZoom);
    gl.uniform1f(uniforms.uFarParallax, reducedMotion ? 0 : motion.farParallax);
    gl.uniform1f(uniforms.uNearParallax, reducedMotion ? 0 : motion.nearParallax);
    gl.uniform1f(uniforms.uCanopyMaxUv, reducedMotion ? 0 : motion.canopyMaxUv);
    gl.uniform1f(uniforms.uWaterMaxUv, reducedMotion ? 0 : motion.waterMaxUv);
    gl.uniform1f(uniforms.uWaterfallMaxUv, reducedMotion ? 0 : motion.waterfallMaxUv);
    gl.uniform1f(uniforms.uDebugView, debugView);
    gl.uniform1f(uniforms.uDebugMaskMix, debugMaskMix);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  const readyPromise = loadArrivalTextures({
    gl,
    assets: {
      imageUrl,
      depthUrl,
      waterMaskUrl: waterMaskUrl || waterUrl,
      waterfallMaskUrl,
      canopyMaskUrl: canopyMaskUrl || canopyUrl,
      mistMaskUrl,
      skyMaskUrl,
    },
    debug,
  })
    .then((loaded) => {
      if (destroyed) return false;
      textures.push(...loaded.textures);
      flags = loaded.flags;
      imageSize = loaded.imageSize;
      textureCount = loaded.textureCount;
      ready = true;
      canvas.hidden = false;
      canvas.closest(".arrival-visual")?.classList.add("is-scene-ready");
      emit("potala:scene-ready", { canvas, textureCount });
      return true;
    })
    .catch((error) => {
      fallback(error instanceof Error ? error.message : "Falha ao carregar a cena");
      return false;
    });

  resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
  resizeObserver?.observe(canvas);

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    paused = true;
    fallback("Contexto WebGL perdido");
  });

  canvas.addEventListener("webglcontextrestored", () => {
    fallback("Contexto WebGL restaurado — usando fotografia");
  });

  return {
    ready: readyPromise,
    setPointer(x = 0, y = 0) {
      targetPointer = [clamp(x, -1, 1), clamp(y, -1, 1)];
    },
    setScrollProgress(progress = 0) {
      scrollProgress = clamp(progress);
      targetState = computeArrivalState({ scrollProgress, phase: breathPhase });
    },
    setBreathState(phase = "idle") {
      breathPhase = BREATH_OFFSETS[phase] ? phase : "idle";
      targetState = computeArrivalState({ scrollProgress, phase: breathPhase });
    },
    setWorld(next = {}) {
      worldTarget = {
        wind: clamp(next.wind),
        water: clamp(next.water),
        sun: clamp(next.sun),
        mist: clamp(next.mist),
        path: clamp(next.path),
        attention: clamp(next.attention),
        windDir: [
          clamp(next.windDir?.[0] ?? 0, -1, 1),
          clamp(next.windDir?.[1] ?? 0, -1, 1),
        ],
        attentionUv: [
          clamp(next.attentionUv?.[0] ?? 0.5),
          clamp(next.attentionUv?.[1] ?? 0.5),
        ],
      };
      // A atenção salta de lugar quando o ponteiro pula de um ator para outro; ela
      // é posição, não intensidade, e interpolar entre dois pontos distantes
      // arrastaria o halo pela paisagem.
      world.attentionUv = [...worldTarget.attentionUv];
    },
    setDebug({ view = 0, maskMix = 0 } = {}) {
      debugView = Number(view) || 0;
      debugMaskMix = clamp(maskMix);
    },
    setRipple({ uv = [0.22, 0.78], strength = 0.55 } = {}) {
      ripple = { uv: [clamp(uv[0]), clamp(uv[1])], time: 0, strength: clamp(strength) };
    },
    render,
    resize,
    pause() {
      paused = true;
    },
    resume() {
      if (destroyed || reducedMotion || !paused) return;
      paused = false;
    },
    destroy() {
      destroyed = true;
      paused = true;
      resizeObserver?.disconnect();
      textures.forEach((texture) => gl.deleteTexture(texture));
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    },
    getMetrics() {
      return {
        ready,
        paused,
        dpr: Math.min(window.devicePixelRatio || 1, quality.maxDpr),
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        imageWidth: imageSize[0],
        imageHeight: imageSize[1],
        textureCount,
        pointer: [...pointer],
        camera: state.camera,
        scrollProgress,
      };
    },
  };
}
