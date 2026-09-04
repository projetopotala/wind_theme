import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceFile = path.join(projectRoot, "assets-source", "home-travessia", "home-travessia-source.png");
const mediaDirectory = path.join(projectRoot, "outputs", "media");
const desktopFile = path.join(mediaDirectory, "home-travessia.webp");
const mobileFile = path.join(mediaDirectory, "home-travessia-mobile.webp");

await mkdir(mediaDirectory, { recursive: true });

const source = sharp(sourceFile, { failOn: "error" });
await source.metadata();

await source.clone()
  .resize(2048, 1152, { fit: "cover", position: "centre" })
  .webp({ quality: 86, effort: 5 })
  .toFile(desktopFile);

await source.clone()
  .resize(1080, 1440, { fit: "cover", position: "centre" })
  .webp({ quality: 84, effort: 5 })
  .toFile(mobileFile);

/*
 * O CÉU QUE FICA ATRÁS DA CENA 3D.
 *
 * O modelo da paisagem é um talhão de campo: não tem montanha, nuvem nem
 * horizonte, e acaba num corte reto. Sem nada atrás, a névoa tinha de fazer
 * todo o trabalho de esconder essa borda, e o preço era não enxergar longe.
 *
 * A imagem vem da PRÓPRIA arte do site — a faixa superior do vale que era o
 * fundo antes. Não é economia: é o que garante que o céu por trás do campo
 * pertença ao mesmo lugar que o resto da home, coisa que uma imagem avulsa não
 * teria como prometer.
 *
 * O recorte para nos 46% de cima, onde estão céu e serra. Abaixo disso começa o
 * primeiro plano do vale, que brigaria com o chão do modelo.
 */
const { width: larguraFonte, height: alturaFonte } = await source.metadata();
const alturaFaixa = Math.round(alturaFonte * 0.46);

/*
 * Um reforço DISCRETO de contraste, e ele tem uma razão específica.
 *
 * Na arte original esta faixa é fundo distante, e a serra foi pintada pálida de
 * propósito. Recortada e posta atrás de uma cena 3D, ela fica pálida demais: as
 * montanhas somem no céu, e o que se pediu foi justamente vê-las.
 *
 * A dose é pequena porque o céu não pode competir com o campo em primeiro
 * plano nem com os cards — ele é fundo, e continua sendo.
 */
const faixa = await source.clone()
  .extract({ left: 0, top: 0, width: larguraFonte, height: alturaFaixa })
  .linear(1.18, -14)
  .toBuffer();

/*
 * O CÉU É ESTICADO PARA CIMA, e não é capricho.
 *
 * O recorte acaba onde a arte original acaba, e ali já é o alto do quadro. Mas o
 * plano que carrega esta imagem na cena 3D precisa cobrir a tela INTEIRA, e a
 * altura do recorte não dá conta — sobraria uma emenda entre o topo da imagem e
 * a cor de fundo.
 *
 * A faixa acrescentada repete a primeira linha do próprio céu, então não há
 * transição: é a mesma cor continuando para cima. Também é o que permite manter
 * a proporção da imagem no plano, sem esticar as montanhas.
 */
const alturaCeu = Math.round(alturaFaixa * 1.9);
const topo = await sharp(faixa)
  .extract({ left: 0, top: 0, width: larguraFonte, height: 1 })
  .resize(larguraFonte, alturaCeu - alturaFaixa, { fit: "fill" })
  .toBuffer();

await sharp({
  create: { width: larguraFonte, height: alturaCeu, channels: 3, background: "#ffffff" },
})
  .composite([{ input: topo, top: 0, left: 0 }, { input: faixa, top: alturaCeu - alturaFaixa, left: 0 }])
  .webp({ quality: 86, effort: 5 })
  .toFile(path.join(mediaDirectory, "home-travessia-ceu.webp"));

console.log("Paisagem da Home preparada em versões desktop e mobile.");

