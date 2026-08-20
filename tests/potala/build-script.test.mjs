import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));

test("scripts do vinext funcionam no Windows e em ambientes Unix", () => {
  assert.equal(packageJson.scripts.dev, "node scripts/run-vinext.mjs dev");
  assert.equal(packageJson.scripts.build, "node scripts/run-vinext.mjs build");
  assert.equal(packageJson.scripts.start, "node scripts/run-vinext.mjs start");
});
