/*
 * Executa o teste de integração da P1 (scripts/p1-inscricoes-pglite.mjs) com
 * uma instalação TEMPORÁRIA e de versão fixa do PGlite.
 *
 *   node scripts/p1-inscricoes-pglite-executar.mjs
 *
 * - Instala @electric-sql/pglite@0.2.17 numa pasta própria dentro do diretório
 *   temporário do sistema (os.tmpdir()), nunca no projeto: package.json,
 *   package-lock.json e node_modules do portal não mudam.
 * - Reaproveita a instalação se ela já estiver na versão certa.
 * - Funciona em Windows, macOS e Linux (só precisa de node e npm no PATH).
 * - P1_PGLITE_DIR=<pasta> usa outra pasta (por exemplo, sem rede, com o pacote
 *   já copiado para lá).
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const VERSAO = "0.2.17";
const pasta = process.env.P1_PGLITE_DIR || join(tmpdir(), `potala-p1-pglite-${VERSAO}`);
const pacote = join(pasta, "node_modules", "@electric-sql", "pglite", "package.json");

const instalada = existsSync(pacote) && JSON.parse(readFileSync(pacote, "utf8")).version === VERSAO;
if (!instalada) {
  mkdirSync(pasta, { recursive: true });
  if (!existsSync(join(pasta, "package.json"))) {
    writeFileSync(join(pasta, "package.json"), JSON.stringify({ name: "potala-p1-pglite", private: true }, null, 2));
  }
  console.log(`Instalando @electric-sql/pglite@${VERSAO} em ${pasta} (fora do projeto)…`);
  const npm = spawnSync("npm", ["install", "--no-audit", "--no-fund", "--save-exact", `@electric-sql/pglite@${VERSAO}`], {
    cwd: pasta, stdio: "inherit", shell: process.platform === "win32",
  });
  if (npm.status !== 0) {
    console.error("Não foi possível instalar o PGlite. Teste de integração PENDENTE.");
    process.exit(2);
  }
}

const teste = join(dirname(fileURLToPath(import.meta.url)), "p1-inscricoes-pglite.mjs");
const execucao = spawnSync(process.execPath, [teste], { stdio: "inherit", env: { ...process.env, P1_PGLITE_DIR: pasta } });
process.exit(execucao.status ?? 1);
