export type AmbientClock = {
  elapsedMs: number;
  lastTimestamp: number | null;
};

export function createAmbientClock(): AmbientClock {
  return { elapsedMs: 0, lastTimestamp: null };
}

export function advanceAmbientClock(clock: AmbientClock, timestamp: number): AmbientClock {
  if (clock.lastTimestamp === null) return { ...clock, lastTimestamp: timestamp };
  return {
    elapsedMs: clock.elapsedMs + Math.max(0, timestamp - clock.lastTimestamp),
    lastTimestamp: timestamp,
  };
}

export function suspendAmbientClock(clock: AmbientClock): AmbientClock {
  return { ...clock, lastTimestamp: null };
}
