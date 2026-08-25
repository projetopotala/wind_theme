import { clamp } from "../core/math.js";

export const ARRIVAL_PLATE_V2 = { width: 1024, height: 576 };

export const ARRIVAL_MOTION = {
  overscan: 0.975,
  pointerMaxUv: 0.008,
  cameraZoom: 0.025,
  cameraAdvance: 0.004,
  farParallax: 0.001,
  midParallax: 0.003,
  nearParallax: 0.007,
  canopyMaxUv: 0.002,
  waterMaxUv: 0.0018,
  waterfallMaxUv: 0.0024,
  mistDrift: 0.028,
  attentionFalloff: 42,
};

export const ARRIVAL_SMOOTHING = {
  pointerMs: 110,
  cameraMs: 180,
  lightMs: 160,
  windDirMs: 220,
};

export const DESKTOP_V2_ACTORS = [
  {
    id: "sky",
    action: "sun",
    role: "Tempo",
    label: "O céu",
    cue: "A luz muda porque você chegou.",
    x: 0.28,
    y: 0.16,
    radius: 0.14,
  },
  {
    id: "tree",
    action: "wind",
    role: "Presença",
    label: "A árvore antiga",
    cue: "O vento só existe enquanto você está aqui.",
    x: 0.13,
    y: 0.22,
    radius: 0.12,
  },
  {
    id: "stream",
    action: "water",
    role: "Fluxo",
    label: "A água da margem",
    cue: "A correnteza acorda com a sua atenção.",
    x: 0.22,
    y: 0.78,
    radius: 0.08,
  },
  {
    id: "children",
    action: "breathe",
    role: "Pausa",
    label: "Quem brinca na água",
    cue: "Eles convidam a respirar.",
    x: 0.14,
    y: 0.86,
    radius: 0.06,
  },
  {
    id: "overlook",
    action: "mist",
    role: "Horizonte",
    label: "Quem aponta o vale",
    cue: "A névoa abre para quem olha ao longe.",
    x: 0.38,
    y: 0.58,
    radius: 0.07,
  },
  {
    id: "elders",
    action: "path",
    role: "Caminho",
    label: "Quem segue a pedra",
    cue: "Um passo com eles. O resto é o seu.",
    x: 0.48,
    y: 0.7,
    radius: 0.06,
  },
  {
    id: "sitters",
    action: "listen",
    role: "Escuta",
    label: "Quem descansa junto ao templo",
    cue: "Você não precisa conhecer tudo hoje.",
    x: 0.76,
    y: 0.78,
    radius: 0.07,
  },
  {
    id: "steps",
    action: "enter",
    role: "Entrada",
    label: "A porta do templo",
    cue: "Quando quiser, o Potala continua lá dentro.",
    x: 0.84,
    y: 0.5,
    radius: 0.07,
  },
];

export const ARRIVAL_SCENE_PROFILES = {
  desktopV2: {
    id: "desktop-v2",
    plate: { ...ARRIVAL_PLATE_V2 },
    quality: { maxDpr: 1.5, particles: true, mistDetail: 2, waterfallDetail: 2 },
    assets: {
      imageUrl: "media/chegada-v2-master.webp",
      depthUrl: "media/chegada-v2-depth.webp",
      waterMaskUrl: "media/chegada-v2-water-mask.webp",
      waterfallMaskUrl: "media/chegada-v2-waterfall-mask.webp",
      canopyMaskUrl: "media/chegada-v2-canopy-mask.webp",
      mistMaskUrl: "media/chegada-v2-mist-mask.webp",
      canopyOverlayUrl: "media/chegada-v2-canopy-overlay.webp",
    },
    motion: { ...ARRIVAL_MOTION },
    nature: {
      treeEmitter: { x: 0.04, y: 0.02, w: 0.24, h: 0.2 },
      rippleArea: { x: 0.18, y: 0.82 },
      maxLeaves: 24,
      maxRipples: 10,
      leafColors: ["#6d7a4a", "#8a7a4a", "#a58a54", "#75683d", "#9a8448"],
    },
    actors: DESKTOP_V2_ACTORS,
  },
  // mobileV2: { id: "mobile-v2", plate, assets: chegada-v2-mobile-*.webp } — próxima etapa
  mobileLegacy: {
    id: "mobile-legacy",
    plate: { width: 9, height: 16 },
    quality: { maxDpr: 1.25, particles: true, mistDetail: 1, waterfallDetail: 1 },
    assets: {
      imageUrl: "media/chegada-landscape-mobile.webp",
      depthUrl: "media/chegada-depth-mobile.webp",
      waterMaskUrl: "",
      waterfallMaskUrl: "",
      canopyMaskUrl: "",
      mistMaskUrl: "",
      canopyOverlayUrl: "",
    },
    motion: {
      ...ARRIVAL_MOTION,
      pointerMaxUv: 0,
      canopyMaxUv: 0.0012,
      waterMaxUv: 0.0012,
      waterfallMaxUv: 0.0016,
    },
    nature: {
      treeEmitter: { x: 0.08, y: 0.04, w: 0.3, h: 0.18 },
      rippleArea: { x: 0.22, y: 0.8 },
      maxLeaves: 16,
      maxRipples: 6,
      leafColors: ["#6d7a4a", "#8a7a4a", "#a58a54", "#75683d"],
    },
    actors: DESKTOP_V2_ACTORS,
  },
};

export function isPortraitMobile({ width = 0, height = 0 } = {}) {
  return height > width && width <= 720;
}

export function selectArrivalProfile(viewport = {}, { search = "" } = {}) {
  const forced = String(search || "").includes("arrivalProfile=legacy");
  if (!forced && !isPortraitMobile(viewport)) return ARRIVAL_SCENE_PROFILES.desktopV2;
  return ARRIVAL_SCENE_PROFILES.mobileLegacy;
}

export function selectArrivalAssets(viewport = {}, options = {}) {
  const profile = selectArrivalProfile(viewport, options);
  return {
    ...profile.assets,
    imageUrl: profile.assets.imageUrl,
    depthUrl: profile.assets.depthUrl,
    waterUrl: profile.assets.waterMaskUrl || "",
    canopyUrl: profile.assets.canopyMaskUrl || "",
    plate: profile.plate,
    profile,
  };
}

export function computeArrivalQuality({
  width = 0,
  height = 0,
  devicePixelRatio = 1,
  profile,
} = {}) {
  const selected = profile || selectArrivalProfile({ width, height });
  const maxDpr = selected.quality?.maxDpr || (height > width ? 1.25 : 1.5);
  return {
    maxDpr,
    dpr: Math.min(Math.max(1, devicePixelRatio || 1), maxDpr),
    particles: selected.quality?.particles !== false,
    mistDetail: selected.quality?.mistDetail || 1,
    waterfallDetail: selected.quality?.waterfallDetail || 1,
  };
}

export function computeParallaxAmplitude(depth = 0.5, motion = ARRIVAL_MOTION) {
  const value = Number(depth) || 0;
  if (value >= 0.75) return motion.nearParallax;
  if (value <= 0.28) return motion.farParallax;
  return motion.farParallax + (motion.nearParallax - motion.farParallax) * clamp((value - 0.28) / 0.47);
}

export function computeCameraZoom(progress = 0, motion = ARRIVAL_MOTION) {
  return 1 - clamp(progress) * motion.cameraZoom;
}

export function computeReducedMotionEnergies() {
  return {
    wind: 0,
    water: 0,
    sun: 0,
    mist: 0,
    path: 0,
    attention: 0,
  };
}

export function isArrivalDebugEnabled(search = "") {
  return /(?:\?|&)arrivalDebug=1(?:&|$)/.test(`?${String(search).replace(/^\?/, "")}`);
}
