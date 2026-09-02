/**
 * Mantém o SDK público do Supabase junto do portal estático.
 *
 * O navegador não depende de CDN e a versão servida é exatamente a travada
 * pelo package-lock. Este bundle contém somente o cliente público: credenciais
 * administrativas não participam da cópia nem da configuração do frontend.
 */
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(
  root,
  "node_modules",
  "@supabase",
  "supabase-js",
  "dist",
  "umd",
  "supabase.js",
);
const vendorDir = path.join(root, "outputs", "vendor");
const destination = path.join(vendorDir, "supabase.js");
const temporary = path.join(vendorDir, ".supabase.js.tmp");

await mkdir(vendorDir, { recursive: true });
const bundle = await readFile(source);
await writeFile(temporary, bundle);
await rm(destination, { force: true });
await rename(temporary, destination);

console.log("Supabase JS copiado para outputs/vendor/supabase.js.");
