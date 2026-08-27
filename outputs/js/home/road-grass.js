/**
 * Grama da borda da estrada.
 *
 * A estrada curva, então uma faixa de textura não acompanha a borda sem esticar
 * ou repetir de forma visível. Tufo desenhado ao longo da normal da curva
 * acompanha qualquer traçado.
 *
 * As posições saem de semente determinística por distância percorrida, e não de
 * `Math.random`, por dois motivos: a mesma estrada precisa sair igual em
 * qualquer máquina, e o intervalo visível muda a cada quadro de rolagem — se o
 * tufo dependesse do intervalo pedido, a grama andaria junto com a câmera.
 */

export const GRASS_DEFAULTS = {
  spacing: 26,
  height: [7, 17],
  lean: 0.34,
  sway: 0.5,
};

const TAU = Math.PI * 2;

/** Hash determinística: mesma entrada, mesmo número, em qualquer máquina. */
function hash(index, seed, salt) {
  const value = Math.sin(index * 12.9898 + seed * 78.233 + salt * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

export function grassTuftsForRange({
  from = 0,
  to = 0,
  spacing = GRASS_DEFAULTS.spacing,
  seed = 1,
} = {}) {
  const step = Number(spacing) || 0;
  if (!(step > 0) || !(to >= from)) return [];

  const [minHeight, maxHeight] = GRASS_DEFAULTS.height;
  const first = Math.ceil(from / step);
  const last = Math.floor(to / step);
  const tufts = [];

  for (let index = first; index <= last; index += 1) {
    const distance = index * step;
    for (const side of [-1, 1]) {
      // O índice do lado entra na hash para os dois lados não ficarem espelhados.
      const key = index * 2 + (side > 0 ? 1 : 0);
      tufts.push({
        distance,
        side,
        height: minHeight + hash(key, seed, 1) * (maxHeight - minHeight),
        lean: (hash(key, seed, 2) - 0.5) * 2 * GRASS_DEFAULTS.lean,
        phase: hash(key, seed, 3) * TAU,
      });
    }
  }
  return tufts;
}

export function grassSwayOffset(tuft, phase = 0) {
  if (!tuft) return 0;
  return Math.sin(phase + tuft.phase) * GRASS_DEFAULTS.sway * tuft.height;
}
