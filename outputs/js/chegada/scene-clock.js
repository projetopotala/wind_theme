export function createSceneClock({ tick } = {}) {
  let frameId = 0;
  let running = false;
  let lastTime = 0;

  const loop = (now) => {
    if (!running) return;
    const elapsedMs = lastTime ? Math.min(48, now - lastTime) : 16;
    lastTime = now;
    tick?.(now, elapsedMs);
    frameId = requestAnimationFrame(loop);
  };

  return {
    get running() {
      return running;
    },
    start() {
      if (running) return;
      running = true;
      lastTime = 0;
      frameId = requestAnimationFrame(loop);
    },
    stop() {
      running = false;
      cancelAnimationFrame(frameId);
      frameId = 0;
      lastTime = 0;
    },
    resetTime() {
      lastTime = 0;
    },
  };
}
