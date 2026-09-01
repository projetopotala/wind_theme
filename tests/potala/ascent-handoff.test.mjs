import assert from "node:assert/strict";
import test from "node:test";

import { mountJourney } from "../../outputs/js/home/home-scenes.js";

test("a Home termina em conteúdo legível sem uma subida automática", () => {
  const root = { innerHTML: "", querySelectorAll() { return []; } };
  mountJourney(root, { regions: [], discoveries: [] });

  assert.match(root.innerHTML, /Há sempre outro caminho/);
  assert.doesNotMatch(root.innerHTML, /journey-ascent|palacio\.html/);
});

