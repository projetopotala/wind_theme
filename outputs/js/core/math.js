export const clamp = (value, minimum = 0, maximum = 1) =>
  Math.min(maximum, Math.max(minimum, value));

export const lerp = (from, to, progress) => from + (to - from) * progress;

export const smoothstep = (progress) => {
  const value = clamp(progress);
  return value * value * (3 - 2 * value);
};
