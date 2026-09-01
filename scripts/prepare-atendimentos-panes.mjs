/**
 * Vidraças da janela dos Atendimentos.
 *
 * A composição segue a referência que o cliente trouxe: uma janela emoldurada
 * cujas vidraças mostram coisas diferentes. Aqui cada vidraça é uma porta de
 * entrada da seção — "é minha primeira visita", "procuro um oráculo" — e por
 * isso cada uma precisa de uma imagem PRÓPRIA. Quatro recortes da mesma
 * paisagem leriam como uma imagem quebrada por barras, que é o oposto de uma
 * janela com vistas distintas.
 *
 * A fila de cima é baixa e a de baixo é alta, como na referência: é a diferença
 * de proporção que faz a grade ler como janela e não como galeria de cartões.
 *
 * A posição do recorte só aparece quando NÃO é o centro: escrever "centre" nas
 * quatro esconderia, no meio do ruído, as duas em que a escolha importa —
 * centralizar corta o horizonte ao meio numa paisagem apertada, e o que sobra é
 * céu sem chão.
 *
 * O ajuste de tom é assado NO ARQUIVO, não aplicado por `filter` no navegador:
 * as duas coisas dão a mesma imagem, mas filtrar meio milhão de pixels a cada
 * pintura custa, e assar não custa nada em runtime.
 *
 *   node scripts/prepare-atendimentos-panes.mjs
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const raiz = path.resolve(import.meta.dirname, "..");
const midia = path.join(raiz, "outputs", "media");

const LARGURA = 520;

/* As alturas repetem o `aspect-ratio` de css/atendimentos.css: quem mudar a
   proporção de uma fileira precisa mudar nos dois lugares. */
const VIDRACAS = [
  { origem: "journey-quem-somos", destino: "atendimentos-vidraca-1", altura: 340, posicao: "top" },
  { origem: "journey-inspiracao", destino: "atendimentos-vidraca-2", altura: 340 },
  { origem: "journey-cuidado", destino: "atendimentos-vidraca-3", altura: 660 },
  { origem: "journey-cultura", destino: "atendimentos-vidraca-4", altura: 660, posicao: "bottom" },
];

await mkdir(midia, { recursive: true });

for (const { origem, destino, altura, posicao } of VIDRACAS) {
  await sharp(path.join(midia, `${origem}.webp`), { failOn: "error" })
    .resize(LARGURA, altura, { fit: "cover", position: posicao ?? "centre" })
    // Toque leve, só para as quatro lerem como uma janela só e não como quatro
    // fotografias de origens diferentes. O escurecimento forte que havia aqui
    // existia para o rótulo sobreviver por cima da imagem; sem rótulo, ele só
    // apagaria a vista.
    .modulate({ saturation: .94, brightness: .96 })
    .webp({ quality: 82, effort: 5 })
    .toFile(path.join(midia, `${destino}.webp`));
}

console.log(`Vidraças preparadas: ${VIDRACAS.map((v) => v.destino).join(", ")}.`);
