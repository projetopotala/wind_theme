import assert from "node:assert/strict";
import test from "node:test";

import { disposeThreeEnvironment } from "../../features/potala-journey/lib/dispose-three-environment";

test("cleanup libera geometria, material, renderer, contexto e canvas", () => {
  const calls: string[] = [];
  const canvas = { remove: () => calls.push("canvas") };
  const renderer = {
    domElement: canvas,
    dispose: () => calls.push("renderer"),
    forceContextLoss: () => calls.push("context"),
  };
  const geometry = { dispose: () => calls.push("geometry") };
  const material = { dispose: () => calls.push("material") };
  disposeThreeEnvironment({ renderer, geometry, material });
  assert.deepEqual(calls, ["geometry", "material", "renderer", "context", "canvas"]);
});
