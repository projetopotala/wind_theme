import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import sharp from "sharp";

const budgets = [
  { file: "outputs/media/chegada-landscape.webp", maximum: 1_800_000 },
  { file: "outputs/media/chegada-depth.webp", maximum: 900_000 },
  { file: "outputs/media/chegada-landscape-mobile.webp", maximum: 1_200_000, width: 1440, height: 2160 },
  { file: "outputs/media/chegada-depth-mobile.webp", maximum: 700_000, width: 1440, height: 2160 },
  { file: "outputs/media/chegada-v2-master.webp", maximum: 2_200_000, width: 2048, height: 1152 },
  { file: "outputs/media/chegada-v2-depth.webp", maximum: 1_000_000, width: 2048, height: 1152 },
  { file: "outputs/media/chegada-v2-water-mask.webp", maximum: 700_000, width: 2048, height: 1152 },
  { file: "outputs/media/chegada-v2-waterfall-mask.webp", maximum: 700_000, width: 2048, height: 1152 },
  { file: "outputs/media/chegada-v2-canopy-mask.webp", maximum: 900_000, width: 2048, height: 1152 },
  { file: "outputs/media/chegada-v2-mist-mask.webp", maximum: 900_000, width: 2048, height: 1152 },
  { file: "outputs/media/chegada-v2-sky-mask.webp", maximum: 700_000, width: 2048, height: 1152 },
  { file: "outputs/media/chegada-v2-canopy-overlay.webp", maximum: 1_500_000, width: 2048, height: 1152 },
  { file: "outputs/media/journey-quem-somos.webp", maximum: 900_000 },
  { file: "outputs/media/journey-cuidado.webp", maximum: 900_000 },
  { file: "outputs/media/journey-cultura.webp", maximum: 900_000 },
  { file: "outputs/media/journey-inspiracao.webp", maximum: 900_000 },
  { file: "outputs/media/home-travessia.webp", maximum: 1_800_000, width: 2048, height: 1152 },
  { file: "outputs/media/home-travessia-mobile.webp", maximum: 1_300_000, width: 1080, height: 1440 },
  // Orçamento a ~2× do peso real (328.756 e 351.236 bytes): a folga anterior
  // (6,7× e 3,4×) não pegava nada — um orçamento que aceita o dobro do
  // arquivo não é orçamento.
  { file: "outputs/media/palacio-master.webp", maximum: 660_000, width: 2048, height: 1152 },
  { file: "outputs/media/palacio-depth.webp", maximum: 705_000, width: 2048, height: 1152 },
  { file: "outputs/media/palacio-light-mask.webp", maximum: 700_000, width: 2048, height: 1152 },
  // A placa da Chegada é a imagem mais pesada e mais prioritária do portal: é a
  // primeira coisa que o visitante baixa. O orçamento fica a ~1,3× do peso real
  // para que uma requalificação distraída não devolva o arquivo ao tamanho do
  // PNG original, que custava dez vezes isto.
  { file: "outputs/media/chegada.webp", maximum: 320_000, width: 1586, height: 992 },
  { file: "outputs/media/chegada-mobile.webp", maximum: 140_000, width: 744, height: 992 },
  // As vidraças da janela dos Atendimentos. As dimensões aqui são o par do
  // `aspect-ratio` em css/atendimentos.css: recortar diferente sem mudar o CSS
  // faria a imagem esticar em silêncio, e é isto que passa a acusar.
  { file: "outputs/media/atendimentos-vidraca-1.webp", maximum: 60_000, width: 520, height: 340 },
  { file: "outputs/media/atendimentos-vidraca-2.webp", maximum: 60_000, width: 520, height: 340 },
  { file: "outputs/media/atendimentos-vidraca-3.webp", maximum: 70_000, width: 520, height: 660 },
  { file: "outputs/media/atendimentos-vidraca-4.webp", maximum: 70_000, width: 520, height: 660 },
  // O ladrilho da borda repete na tela inteira: quadrado é requisito, não
  // detalhe — retangular, ele repetiria com passo diferente nos dois eixos e a
  // grade apareceria. Orçamento a ~1,4× do peso real.
  { file: "outputs/media/grama-borda.webp", maximum: 120_000, width: 512, height: 512 },
];

for (const asset of budgets) {
  const info = await stat(asset.file);
  assert.ok(info.size > 10_000, asset.file + " está vazio ou inválido");
  assert.ok(info.size <= asset.maximum, asset.file + " excede " + asset.maximum + " bytes");
  if (asset.width && asset.height) {
    const meta = await sharp(asset.file).metadata();
    assert.equal(meta.width, asset.width, asset.file + " largura inesperada");
    assert.equal(meta.height, asset.height, asset.file + " altura inesperada");
  }
}

console.log("Assets essenciais da Travessia dentro do orçamento.");
