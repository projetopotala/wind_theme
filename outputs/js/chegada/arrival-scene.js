import { clamp, lerp, smoothstep } from "../core/math.js";

const BREATH_OFFSETS = {
  inhale: { depth: 0.06, fog: -0.07, light: 0.07 },
  hold: { depth: 0.04, fog: -0.05, light: 0.055 },
  exhale: { depth: -0.02, fog: 0.025, light: -0.025 },
  idle: { depth: 0, fog: 0, light: 0 },
  paused: { depth: 0, fog: 0, light: 0 },
};

const VERTEX_SHADER = `
  attribute vec2 aPosition;
  varying vec2 vUv;

  void main() {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  precision mediump float;

  varying vec2 vUv;
  uniform sampler2D uImage;
  uniform sampler2D uDepth;
  uniform vec2 uPointer;
  uniform vec2 uResolution;
  uniform vec2 uImageSize;
  uniform float uCamera;
  uniform float uDepthAmount;
  uniform float uFog;
  uniform float uLight;
  uniform float uPath;
  uniform float uTime;

  float hash(vec2 point) {
    return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);
    float bottom = mix(hash(cell), hash(cell + vec2(1.0, 0.0)), local.x);
    float top = mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0, 1.0)), local.x);
    return mix(bottom, top, local.y);
  }

  vec2 coverUv(vec2 uv) {
    float viewportAspect = uResolution.x / max(uResolution.y, 1.0);
    float imageAspect = uImageSize.x / max(uImageSize.y, 1.0);
    vec2 result = uv;

    if (viewportAspect > imageAspect) {
      result.y = (uv.y - 0.5) * (imageAspect / viewportAspect) + 0.5;
    } else {
      result.x = (uv.x - 0.5) * (viewportAspect / imageAspect) + 0.5;
    }

    return result;
  }

  void main() {
    vec2 baseUv = coverUv(vUv);
    float depth = texture2D(uDepth, baseUv).r;
    vec2 perspective = (depth - 0.5) *
      (uPointer * 0.026 + vec2(0.0, -uCamera * 0.018)) *
      uDepthAmount;
    vec2 uv = clamp(baseUv + perspective, 0.002, 0.998);
    vec3 color = texture2D(uImage, uv).rgb;

    float mistBand = sin((vUv.y + uTime * 0.006) * 14.0) * 0.5 + 0.5;
    float mistNoise = noise(vUv * vec2(7.0, 4.0) + vec2(uTime * 0.012, 0.0));
    float mist = smoothstep(0.34, 0.86, mistBand * 0.48 + mistNoise * 0.52) * uFog;
    vec3 fogColor = vec3(0.82, 0.86, 0.87);
    color = mix(color, fogColor, mist * (1.0 - depth) * 0.42);

    float pathWidth = mix(0.075, 0.22, vUv.y);
    float pathMask = 1.0 - smoothstep(pathWidth * 0.55, pathWidth, abs(vUv.x - 0.5));
    pathMask *= 1.0 - smoothstep(0.64, 0.9, vUv.y);
    color = mix(color, color + vec3(0.13, 0.095, 0.045), pathMask * uPath * 0.24);
    color *= 0.86 + uLight * 0.32;

    gl_FragColor = vec4(color, 1.0);
  }
`;

export function computeArrivalState({ scrollProgress = 0, phase = "idle" } = {}) {
  const progress = smoothstep(scrollProgress);
  const breath = BREATH_OFFSETS[phase] || BREATH_OFFSETS.idle;

  return {
    camera: progress,
    depth: Number(clamp(0.18 + progress * 0.12 + breath.depth, 0.12, 0.38).toFixed(3)),
    fog: Number(clamp(0.76 - progress * 0.48 + breath.fog, 0.18, 0.82).toFixed(3)),
    light: Number(clamp(0.34 + progress * 0.22 + breath.light, 0.24, 0.66).toFixed(3)),
    path: Number(clamp((progress - 0.46) / 0.54).toFixed(3)),
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
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
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

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Não foi possível carregar ${source}`));
    image.src = source;
  });
}

function createTexture(gl, image, unit) {
  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
  return texture;
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
  reducedMotion = false,
} = {}) {
  if (!canvas || !imageUrl || !depthUrl) {
    throw new TypeError("canvas, imageUrl e depthUrl são obrigatórios");
  }

  let gl;
  let program;
  let frameId = 0;
  let resizeObserver;
  let destroyed = false;
  let paused = Boolean(reducedMotion);
  let ready = false;
  let startTime = 0;
  let targetPointer = [0, 0];
  let pointer = [0, 0];
  let scrollProgress = 0;
  let breathPhase = "idle";
  let targetState = computeArrivalState();
  let state = { ...targetState };
  let imageSize = [1, 1];
  const textures = [];

  const fallback = (reason) => {
    canvas.hidden = true;
    canvas.closest(".arrival-visual")?.classList.add("is-fallback");
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
      pause() {},
      resume() {},
      destroy() {},
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
    ["uImage", "uDepth", "uPointer", "uResolution", "uImageSize", "uCamera", "uDepthAmount", "uFog", "uLight", "uPath", "uTime"].map(
      (name) => [name, gl.getUniformLocation(program, name)],
    ),
  );

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  };

  const draw = (now = performance.now()) => {
    if (destroyed || !ready) return;
    resize();

    pointer[0] = lerp(pointer[0], targetPointer[0], 0.065);
    pointer[1] = lerp(pointer[1], targetPointer[1], 0.065);
    state.camera = lerp(state.camera, targetState.camera, 0.055);
    state.depth = lerp(state.depth, targetState.depth, 0.045);
    state.fog = lerp(state.fog, targetState.fog, 0.045);
    state.light = lerp(state.light, targetState.light, 0.04);
    state.path = lerp(state.path, targetState.path, 0.05);

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1i(uniforms.uImage, 0);
    gl.uniform1i(uniforms.uDepth, 1);
    gl.uniform2f(uniforms.uPointer, pointer[0], pointer[1]);
    gl.uniform2f(uniforms.uResolution, canvas.width, canvas.height);
    gl.uniform2f(uniforms.uImageSize, imageSize[0], imageSize[1]);
    gl.uniform1f(uniforms.uCamera, state.camera);
    gl.uniform1f(uniforms.uDepthAmount, state.depth);
    gl.uniform1f(uniforms.uFog, state.fog);
    gl.uniform1f(uniforms.uLight, state.light);
    gl.uniform1f(uniforms.uPath, state.path);
    gl.uniform1f(uniforms.uTime, reducedMotion ? 0 : (now - startTime) / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    if (!paused) frameId = requestAnimationFrame(draw);
  };

  const requestDraw = () => {
    if (!ready || destroyed) return;
    cancelAnimationFrame(frameId);
    frameId = requestAnimationFrame(draw);
  };

  const readyPromise = Promise.all([loadImage(imageUrl), loadImage(depthUrl)])
    .then(([image, depth]) => {
      if (destroyed) return false;
      imageSize = [image.naturalWidth || image.width, image.naturalHeight || image.height];
      textures.push(createTexture(gl, image, 0), createTexture(gl, depth, 1));
      ready = true;
      startTime = performance.now();
      canvas.hidden = false;
      canvas.closest(".arrival-visual")?.classList.add("is-scene-ready");
      draw(startTime);
      emit("potala:scene-ready", { canvas });
      return true;
    })
    .catch((error) => {
      fallback(error instanceof Error ? error.message : "Falha ao carregar a cena");
      return false;
    });

  resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(requestDraw) : null;
  resizeObserver?.observe(canvas);

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    paused = true;
    fallback("Contexto WebGL perdido");
  });

  return {
    ready: readyPromise,
    setPointer(x = 0, y = 0) {
      targetPointer = [clamp(x, -1, 1), clamp(y, -1, 1)];
      if (paused) requestDraw();
    },
    setScrollProgress(progress = 0) {
      scrollProgress = clamp(progress);
      targetState = computeArrivalState({ scrollProgress, phase: breathPhase });
      if (paused) requestDraw();
    },
    setBreathState(phase = "idle") {
      breathPhase = BREATH_OFFSETS[phase] ? phase : "idle";
      targetState = computeArrivalState({ scrollProgress, phase: breathPhase });
      if (paused) requestDraw();
    },
    pause() {
      paused = true;
      cancelAnimationFrame(frameId);
    },
    resume() {
      if (destroyed || reducedMotion || !paused) return;
      paused = false;
      frameId = requestAnimationFrame(draw);
    },
    destroy() {
      destroyed = true;
      paused = true;
      cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      textures.forEach((texture) => gl.deleteTexture(texture));
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    },
  };
}
