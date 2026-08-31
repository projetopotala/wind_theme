export function checkpointMotionState({ active, reducedMotion }: { active: boolean; reducedMotion: boolean }) {
  return active && !reducedMotion ? "live" : "static";
}
