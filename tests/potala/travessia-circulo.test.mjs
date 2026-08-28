import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("a travessia fecha em círculo", async () => {
  const home = await readFile("outputs/js/home/home-controller.js", "utf8");
  const palace = await readFile("outputs/js/palacio/palace-controller.js", "utf8");

  assert.match(home, /palacio\.html/, "a Home precisa levar ao palácio");
  assert.match(palace, /transcender\.html/, "o palácio precisa voltar à Chegada");
});

test("as três passagens usam o mesmo mecanismo de véu", async () => {
  const chegada = await readFile("outputs/js/chegada/arrival-controller.js", "utf8");
  const home = await readFile("outputs/js/home/home-controller.js", "utf8");
  const palace = await readFile("outputs/js/palacio/palace-controller.js", "utf8");

  assert.match(chegada, /transition-handoff/);
  assert.match(home, /transition-handoff/);
  assert.match(palace, /transition-handoff/);
});
