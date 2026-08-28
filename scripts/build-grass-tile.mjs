/**
 * Gera o ladrilho de grama da borda da estrada.
 *
 * A borda curva, então a textura entra como padrão repetido em espaço de tela
 * (`createPattern`), e não como faixa esticada ao longo do traçado — esticar
 * ao longo de uma curva deforma a folha e denuncia a repetição. Padrão repetido
 * só funciona se o ladrilho fechar nos quatro lados: por isso cada folha que
 * cruza uma margem é escrita de volta pela margem oposta (`% size`), e não
 * cortada.
 *
 * Desenhado aqui em vez de fotografado porque uma foto de gramado repetida a
 * cada 512px cria um carimbo reconhecível — o olho acha o mesmo tufo três
 * vezes na mesma curva. Folhas geradas sem eixo dominante não deixam esse
 * rastro.
 *
 *   node scripts/build-grass-tile.mjs
 */
import sharp from "sharp";

const SIZE = 512;
const BLADES = 3600;

// Semente fixa: o mesmo ladrilho em qualquer máquina, como o resto da estrada.
let semente = 20260828;
function aleatorio() {
  semente = (semente * 1664525 + 1013904223) % 4294967296;
  return semente / 4294967296;
}
const entre = (min, max) => min + aleatorio() * (max - min);

const pixels = new Float32Array(SIZE * SIZE * 3);

/** Terra sombreada por baixo: é ela que aparece nas frestas entre as folhas. */
for (let i = 0; i < SIZE * SIZE; i += 1) {
  const escuro = entre(0, 1) * 0.05;
  pixels[i * 3] = 0.045 + escuro;
  pixels[i * 3 + 1] = 0.075 + escuro * 1.3;
  pixels[i * 3 + 2] = 0.030 + escuro * 0.5;
}

function pintar(x, y, r, g, b, cobertura) {
  if (cobertura <= 0) return;
  // O módulo é o que fecha o ladrilho: o que sai por uma margem entra pela outra.
  const px = ((Math.round(x) % SIZE) + SIZE) % SIZE;
  const py = ((Math.round(y) % SIZE) + SIZE) % SIZE;
  const base = (py * SIZE + px) * 3;
  const a = Math.min(1, cobertura);
  pixels[base] += (r - pixels[base]) * a;
  pixels[base + 1] += (g - pixels[base + 1]) * a;
  pixels[base + 2] += (b - pixels[base + 2]) * a;
}

/**
 * Uma folha: nasce larga, afina até a ponta e entorta para um lado.
 *
 * As folhas mais escuras são desenhadas antes das claras (ver a ordenação
 * abaixo) para que as claras fiquem por cima — é o que dá a sensação de camada
 * e profundidade que um gramado tem visto de perto.
 */
function folha({ x0, y0, angulo, comprimento, largura, curva, r, g, b }) {
  const passos = Math.ceil(comprimento * 1.5);
  for (let passo = 0; passo <= passos; passo += 1) {
    const t = passo / passos;
    const anguloAqui = angulo + curva * t * t;
    const dist = comprimento * t;
    const cx = x0 + Math.cos(anguloAqui) * dist;
    const cy = y0 + Math.sin(anguloAqui) * dist;
    // Afina até virar ponta: folha de largura constante lê como fita.
    const meia = (largura * 0.5) * (1 - t * t * 0.92);
    // A ponta pega mais luz que a base, que fica na sombra do próprio tufo.
    const luz = 0.72 + t * 0.42;
    const nx = -Math.sin(anguloAqui);
    const ny = Math.cos(anguloAqui);
    const alcance = Math.ceil(meia + 1);
    for (let d = -alcance; d <= alcance; d += 1) {
      // Borda suave: sem isto cada folha vira um retângulo serrilhado.
      const cobertura = Math.min(1, Math.max(0, meia - Math.abs(d) + 0.5));
      pintar(cx + nx * d, cy + ny * d, r * luz, g * luz, b * luz, cobertura * 0.95);
    }
  }
}

const folhas = [];
for (let i = 0; i < BLADES; i += 1) {
  const tom = entre(0, 1);
  folhas.push({
    x0: entre(0, SIZE),
    y0: entre(0, SIZE),
    angulo: entre(0, Math.PI * 2),
    comprimento: entre(30, 104),
    // Folha fina e longa, não fita larga: na largura anterior (até 8,6px) o
    // ladrilho lia como grama grossa de brinquedo mesmo depois de reduzido pelo
    // padrão. Mais folhas compensam a densidade que a largura deixou de dar.
    largura: entre(2.0, 5.0),
    curva: entre(-0.5, 0.5),
    tom,
    // Do verde profundo da sombra ao verde-limão de quem pegou sol de frente.
    // Verde puxado para o oliva, não para o esmeralda: a estrada e o vale são
    // uma paleta terrosa e quente, e um verde saturado ao lado da pedra sépia
    // lia como grama sintética colada na cena.
    r: 0.10 + tom * 0.30,
    g: 0.20 + tom * 0.38,
    b: 0.05 + tom * 0.14,
  });
}
// Escuras primeiro, claras por cima: as folhas iluminadas são as que estão na
// frente, e é essa ordem que produz a profundidade do gramado.
folhas.sort((a, b) => a.tom - b.tom);
for (const f of folhas) folha(f);

/*
 * Sombra de baixa frequência por cima de tudo.
 *
 * Sem ela o ladrilho tem densidade uniforme e lê como carpete: um gramado real
 * tem partes que pegam sol e partes na sombra de algo maior. As frequências são
 * múltiplos inteiros de 2π/SIZE justamente para não quebrar a emenda que o
 * resto do ladrilho tomou o cuidado de fechar.
 */
const k = (Math.PI * 2) / SIZE;
for (let y = 0; y < SIZE; y += 1) {
  for (let x = 0; x < SIZE; x += 1) {
    const manchas =
      Math.sin(x * k * 2 + 0.7) * Math.cos(y * k * 3 - 1.1) * 0.5 +
      Math.sin(x * k * 5 - 2.2) * Math.cos(y * k * 2 + 0.4) * 0.3 +
      Math.sin((x + y) * k * 3 + 1.6) * 0.2;
    const luz = 0.80 + (manchas + 1) * 0.21;
    const base = (y * SIZE + x) * 3;
    pixels[base] *= luz;
    pixels[base + 1] *= luz;
    pixels[base + 2] *= luz;
  }
}

const saida = Buffer.alloc(SIZE * SIZE * 3);
for (let i = 0; i < SIZE * SIZE * 3; i += 1) {
  saida[i] = Math.round(Math.min(1, Math.max(0, pixels[i])) * 255);
}

await sharp(saida, { raw: { width: SIZE, height: SIZE, channels: 3 } })
  .webp({ quality: 82 })
  .toFile("outputs/media/grama-borda.webp");

console.log(`Ladrilho de grama gerado: ${SIZE}x${SIZE}, ${BLADES} folhas.`);
