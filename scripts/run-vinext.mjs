import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const [mode, ...forwardedArgs] = process.argv.slice(2);
const allowedModes = new Set(["dev", "build", "start"]);

if (!allowedModes.has(mode)) {
  console.error("Uso: node scripts/run-vinext.mjs <dev|build|start>");
  process.exit(1);
}

const vinextCli = fileURLToPath(new URL("../node_modules/vinext/dist/cli.js", import.meta.url));
const result = spawnSync(process.execPath, [vinextCli, mode, ...forwardedArgs], {
  env: {
    ...process.env,
    WRANGLER_LOG_PATH: process.env.WRANGLER_LOG_PATH || ".wrangler/wrangler.log",
  },
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
