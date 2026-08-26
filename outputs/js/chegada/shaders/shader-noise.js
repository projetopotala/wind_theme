export const SHADER_NOISE = `
  float hash(vec2 point) {
    return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);
    float bottom = mix(hash(cell), hash(cell + vec2(1.0, 0.0)), local.x);
    float top = mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0, 1.0)), local.x);
    return mix(bottom, top, local.y);
  }

  // Cinco oitavas bastam para nuvem de amanhecer: as bordas ficam macias sem
  // pedir mais amostras do que um celular aguenta por quadro.
  float fbm(vec2 point) {
    float total = 0.0;
    float amplitude = 0.5;
    for (int octave = 0; octave < 5; octave++) {
      total += noise(point) * amplitude;
      point *= 2.02;
      amplitude *= 0.5;
    }
    return total;
  }
`;
