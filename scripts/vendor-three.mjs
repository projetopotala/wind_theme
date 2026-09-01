import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "node_modules", "three", "build", "three.module.min.js");
const destination = path.join(root, "outputs", "vendor", "three.module.min.js");

await stat(source);
await mkdir(path.dirname(destination), { recursive: true });
await copyFile(source, destination);

console.log("Three.js copiado para outputs/vendor/three.module.min.js.");

