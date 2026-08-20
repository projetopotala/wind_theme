import assert from "node:assert/strict";
import test from "node:test";
import { resolveRequestPath } from "../../scripts/serve-outputs.mjs";

test("mapeia a raiz para a Chegada", () => {
  assert.match(resolveRequestPath("/").replaceAll("\\", "/"), /outputs\/transcender\.html$/);
});

test("bloqueia caminhos que escapam de outputs", () => {
  assert.equal(resolveRequestPath("/../package.json"), null);
  assert.equal(resolveRequestPath("/%2e%2e/package.json"), null);
});
