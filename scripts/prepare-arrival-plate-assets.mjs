/**
 * Deriva a placa da Chegada a partir do original.
 *
 * O PNG entregue tem 2,5 MB e era servido cru a todo visitante — é a primeira
 * coisa que a página baixa, com `fetchpriority="high"`, antes de qualquer outra.
 * Em WebP a mesma imagem cabe numa fração disso sem diferença visível na tela.
 *
 * Duas escolhas que parecem omissões e não são:
 *
 * O derivado desktop mantém a resolução NATIVA (1586×992). Subir para 2048,
 * como faz a paisagem da Home, só inventaria pixels: o original não tem
 * detalhe além disso, e o arquivo cresceria sem a imagem melhorar.
 *
 * O derivado mobile é um recorte retrato de verdade, não a mesma imagem
 * reduzida. Num telefone o quadro é vertical: a paisagem inteira encolhida
 * deixaria o caminho — que é o assunto — pequeno demais para se ler. O recorte
 * é centrado em 58% da largura, o mesmo ponto focal que o CSS já usava.
 *
 *   node scripts/prepare-arrival-plate-assets.mjs
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceFile = path.join(projectRoot, "assets-source", "chegada", "chegada-source.png");
const mediaDirectory = path.join(projectRoot, "outputs", "media");

await mkdir(mediaDirectory, { recursive: true });

const source = sharp(sourceFile, { failOn: "error" });
const { width, height } = await source.metadata();

await source.clone()
  .webp({ quality: 86, effort: 6 })
  .toFile(path.join(mediaDirectory, "chegada.webp"));

// Retrato 3:4 tirado da altura cheia, centrado no mesmo 58% do ponto focal.
const cropWidth = Math.round((height * 3) / 4);
const cropLeft = Math.min(
  width - cropWidth,
  Math.max(0, Math.round(width * 0.58 - cropWidth / 2)),
);

await source.clone()
  .extract({ left: cropLeft, top: 0, width: cropWidth, height })
  .webp({ quality: 84, effort: 6 })
  .toFile(path.join(mediaDirectory, "chegada-mobile.webp"));

console.log(`Placa da Chegada preparada: ${width}×${height} e recorte ${cropWidth}×${height}.`);
