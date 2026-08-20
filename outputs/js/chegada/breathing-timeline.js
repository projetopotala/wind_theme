const PHASE_DURATION = 3_000;
const PHASES = ["inhale", "hold", "exhale"];

export function getBreathFrame(elapsedMs, totalCycles = 8) {
  const safeCycles = Math.max(1, Math.floor(totalCycles));
  const totalDuration = PHASE_DURATION * PHASES.length * safeCycles;
  const elapsed = Math.max(0, Math.min(Number(elapsedMs) || 0, totalDuration));
  const complete = elapsed >= totalDuration;

  if (complete) {
    return {
      phase: "complete",
      cycle: safeCycles,
      totalCycles: safeCycles,
      remainingSeconds: 0,
      phaseProgress: 1,
      progress: 1,
      elapsed,
      complete: true,
    };
  }

  const absolutePhase = Math.floor(elapsed / PHASE_DURATION);
  const phaseElapsed = elapsed % PHASE_DURATION;

  return {
    phase: PHASES[absolutePhase % PHASES.length],
    cycle: Math.floor(absolutePhase / PHASES.length) + 1,
    totalCycles: safeCycles,
    remainingSeconds: Math.max(1, Math.ceil((PHASE_DURATION - phaseElapsed) / 1_000)),
    phaseProgress: phaseElapsed / PHASE_DURATION,
    progress: elapsed / totalDuration,
    elapsed,
    complete: false,
  };
}

export const BREATH_DURATION = PHASE_DURATION * PHASES.length * 8;
