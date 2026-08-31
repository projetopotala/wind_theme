import assert from "node:assert/strict";
import test from "node:test";
import { shouldUseLegacyFallback } from "../../worker/legacy-compatibility";

test("rota React vence o fallback legado", () => {
  assert.equal(shouldUseLegacyFallback("/cursos", 200), false);
  assert.equal(shouldUseLegacyFallback("/cursos", 404), true);
  assert.equal(shouldUseLegacyFallback("/rota-inexistente", 404), false);
});
