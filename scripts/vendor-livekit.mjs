/**
 * Mantém o SDK de navegador do LiveKit junto do portal estático (sem CDN), exatamente na
 * versão travada pelo package-lock. Contém só o cliente público; chaves e segredos do
 * LiveKit nunca participam do frontend.
 */
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "node_modules", "livekit-client", "dist", "livekit-client.umd.js");
const vendorDir = path.join(root, "outputs", "vendor");
const destination = path.join(vendorDir, "livekit-client.umd.js");
const temporary = path.join(vendorDir, ".livekit-client.umd.js.tmp");

await mkdir(vendorDir, { recursive: true });
const bundle = await readFile(source);
await writeFile(temporary, bundle);
await rm(destination, { force: true });
await rename(temporary, destination);

console.log("LiveKit client copiado para outputs/vendor/livekit-client.umd.js.");
