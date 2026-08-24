export function planSoundToggle({ enabled = false, paused = true } = {}) {
  if (enabled && !paused) {
    return { action: "disable", startVolume: 0, targetVolume: 0 };
  }
  return { action: "enable", startVolume: .12, targetVolume: .28 };
}
