export const clamp = (value, minimum = 0, maximum = 1) =>
  Math.min(maximum, Math.max(minimum, value));

export const lerp = (from, to, progress) => from + (to - from) * progress;

export const damp = (from, to, elapsedMs, responseMs = 90) => {
  if (responseMs <= 0) return to;
  const elapsed = Math.max(0, Number(elapsedMs) || 0);
  const alpha = 1 - Math.exp(-elapsed / responseMs);
  const value = lerp(from, to, alpha);
  return from <= to
    ? Math.min(to, Math.max(from, value))
    : Math.max(to, Math.min(from, value));
};

export const smoothstep = (progress) => {
  const value = clamp(progress);
  return value * value * (3 - 2 * value);
};
