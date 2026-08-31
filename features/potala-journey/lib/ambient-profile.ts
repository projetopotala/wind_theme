export type JourneyQuality = "high" | "medium" | "low";

export type AmbientProfile = {
  id: JourneyQuality;
  pixelRatio: number;
  dust: number;
  motes: number;
  foreground: number;
  fogLayers: number;
  shafts: number;
  parallax: boolean;
  fps: number;
};

export function selectAmbientProfile(input: { width: number; devicePixelRatio: number; cores: number; mobile: boolean; reducedMotion: boolean }): AmbientProfile {
  if (input.reducedMotion) return { id: "low", pixelRatio: 1, dust: 35, motes: 8, foreground: 2, fogLayers: 1, shafts: 1, parallax: false, fps: 0 };
  if (input.mobile || input.width < 700 || input.cores <= 2) return { id: "low", pixelRatio: 1, dust: 35, motes: 8, foreground: 2, fogLayers: 1, shafts: 1, parallax: false, fps: 30 };
  if (input.cores >= 8 && input.width >= 1280 && input.devicePixelRatio >= 1.5) return { id: "high", pixelRatio: 2, dust: 120, motes: 30, foreground: 7, fogLayers: 3, shafts: 2, parallax: true, fps: 60 };
  return { id: "medium", pixelRatio: 1.5, dust: 70, motes: 16, foreground: 4, fogLayers: 2, shafts: 1, parallax: true, fps: 45 };
}
