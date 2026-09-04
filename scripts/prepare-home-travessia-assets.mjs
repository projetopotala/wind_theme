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
 * A CHAPA QUE AVANÇA COM A ROLAGEM.
 *
 * A paisagem não é mais uma imagem parada: descer a página aproxima a cena do
 * ponto de fuga do caminho. Aproximar amplia — e ampliar em cima de uma imagem
 * já esticada é onde a nitidez desmancha, coisa que este projeto já pagou caro
 * para aprender.
 *
 * Daí uma versão própria, mais larga que a do fundo estático: 3328px cobrem os
 * ~2750 que o elemento pede numa tela de 1920 MAIS os 18% de aproximação, sem o
 * navegador precisar ampliar nada em nenhum momento do percurso.
 */
await source.clone()
  .resize(3328, 2080, { fit: "cover", position: "centre", kernel: "lanczos3" })
  .webp({ quality: 82, effort: 6 })
  .toFile(path.join(mediaDirectory, "home-travessia-chapa.webp"));
