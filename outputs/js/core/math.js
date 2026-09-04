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

export const scrollProgressForDocument = ({
  scrollTop = 0,
  scrollHeight = 0,
  viewportHeight = 0,
} = {}) => {
  const available = Math.max(0, Number(scrollHeight) - Number(viewportHeight));
  if (!Number.isFinite(available) || available <= 0) return 0;
  return clamp((Number(scrollTop) || 0) / available);
};

export const scrollCuePosition = ({
  progress = 0,
  movable = true,
  restingProgress = 0,
} = {}) => `${(clamp(movable ? progress : restingProgress) * 100).toFixed(2)}%`;

/*
 * O quanto a paisagem se aproxima, dado o quanto se rolou.
 *
 * A imagem de fundo não é mais parada: descer a página a aproxima do ponto de
 * fuga do caminho, e o caminho cresce na direção de quem olha. É o gesto que a
 * jornada descreve.
 *
 * O teto de 18% não é gosto. A chapa tem 3328px e o elemento pede cerca de 2750
 * numa tela de 1920; o que sobra é a folga que a aproximação pode gastar antes
 * de o navegador precisar ampliar — e ampliar é onde a nitidez desmancha, coisa
 * que este projeto já pagou caro para aprender.
 */
export const AVANCO_MAXIMO = 0.18;

export const avancoDaPaisagem = (progresso) => {
  const p = Math.min(1, Math.max(0, Number(progresso) || 0));
  return 1 + AVANCO_MAXIMO * p;
};
