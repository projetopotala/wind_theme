import type { JourneyQuality } from "./ambient-profile";

export function ambientFrame(elapsedMs: number, journeyProgress: number, quality: JourneyQuality) {
  const time = elapsedMs / 1000;
  const intensity = quality === "high" ? 1 : quality === "medium" ? 0.8 : 0.56;
  const palaceClear = smoothstep(0.84, 1, journeyProgress);
  const nature = 1 - smoothstep(0.2, 0.46, journeyProgress);
  const architecture = smoothstep(0.43, 0.72, journeyProgress) * (1 - smoothstep(0.8, 0.96, journeyProgress));
  const effectIntensity = intensity * (1 - palaceClear * 0.72);
  const windX = (Math.sin(time * 0.13) + Math.sin(time * 0.037 + 1.7) * 0.52 + Math.cos(time * 0.071 + 0.4) * 0.22) * effectIntensity;
  const windY = (Math.sin(time * 0.091 + 1.1) + Math.cos(time * 0.047)) * 0.075 * effectIntensity;
  return {
    time,
    journeyProgress,
    windX,
    windY,
    fogDrift: windX * (0.72 + nature * 0.28),
    wind: windX,
    effectIntensity,
    warmth: 0.56 + nature * 0.2 + architecture * 0.12 - palaceClear * 0.18,
    light: (0.68 + Math.sin(time * 0.52 + journeyProgress * 2.4) * 0.055 + architecture * 0.06) * effectIntensity,
    fogDensity: (0.46 + nature * 0.38 - architecture * 0.1) * effectIntensity,
    moteIntensity: (0.42 + architecture * 0.35) * effectIntensity,
  };
}

function smoothstep(start: number, end: number, value: number) {
  const amount = Math.min(1, Math.max(0, (value - start) / (end - start)));
  return amount * amount * (3 - 2 * amount);
}
