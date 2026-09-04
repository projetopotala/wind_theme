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

console.log("Paisagem da Home preparada em versões desktop e mobile.");

