/**
 * O botão de segurar que fecha a travessia.
 *
 * Segurar por 1,5s completa; soltar antes faz o progresso recuar, e o zoom
 * recua junto porque é função dele. O recuo não é enfeite: é o que ensina o
 * gesto. O visitante pressiona, vê a cena começar a avançar, entende o que o
 * botão faz, e aí completa — sem precisar de instrução escrita.
 *
 * Estado puro, fora do navegador, para o comportamento poder ser testado sem
 * simular ponteiro nem tempo real.
 */

export const HOLD_DURATION = 1500;
const RELEASE_FACTOR = 1.8; // recua mais rápido do que avança
const MAX_ZOOM = 1.85;

// Somar `elapsedMs / HOLD_DURATION` passo a passo acumula erro de ponto
// flutuante: 15 incrementos de 100/1500 fecham em 0,9999999999999999, não em 1,
// e sem a tolerância a conclusão nunca dispara no frame exato em que deveria.
const EPSILON = 1e-9;
const clamp = (value, minimum = 0, maximum = 1) => {
  if (value > maximum - EPSILON) return maximum;
  if (value < minimum + EPSILON) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
};

export function createHoldState() {
  return { progress: 0, holding: false, completed: false };
}

export function advanceHold(state, { elapsedMs = 0, holding = false, reducedMotion = false } = {}) {
  const current = state || createHoldState();
  // Completar é definitivo: sem isso, soltar durante a navegação cancelaria uma
  // troca de documento já disparada.
  if (current.completed) return { ...current, holding, progress: 1 };

  if (holding && reducedMotion) {
    return { progress: 1, holding: true, completed: true };
  }

  const delta = Math.max(0, Number(elapsedMs) || 0) / HOLD_DURATION;
  const progress = holding
    ? clamp(current.progress + delta)
    : clamp(current.progress - delta * RELEASE_FACTOR);

  return { progress, holding, completed: progress >= 1 };
}

export function zoomForProgress(progress) {
  const t = clamp(progress);
  // Aceleração no fim: o avanço parece ganhar velocidade ao entrar na luz.
  return 1 + (MAX_ZOOM - 1) * t * t;
}
