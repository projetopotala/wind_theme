const WALK_START = 0.055;

export function walkMotionForProgress(progress, { reducedMotion = false } = {}) {
  if (reducedMotion) return { progress: 0, mobileShift: 0, mobileScale: 1 };
  const normalized = Math.min(1, Math.max(0, (Number(progress) - WALK_START) / (1 - WALK_START)));
  return {
    progress: normalized,
    mobileShift: Math.round(normalized * 14),
    mobileScale: 1 + normalized * 0.035,
  };
}
