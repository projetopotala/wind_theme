import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("a Home deixa de impor o Palácio, que continua podendo voltar à Chegada", async () => {
  const home = await readFile("outputs/js/home/home-controller.js", "utf8");
  const palace = await readFile("outputs/js/palacio/palace-controller.js", "utf8");

  assert.doesNotMatch(home, /palacio\.html/, "a Home não deve redirecionar automaticamente");
  assert.match(palace, /transcender\.html/, "o palácio precisa voltar à Chegada");
});

test("Chegada e Palácio preservam o mecanismo de véu, e a Home só consome o handoff", async () => {
  const chegada = await readFile("outputs/js/chegada/arrival-controller.js", "utf8");
  const home = await readFile("outputs/js/home/home-controller.js", "utf8");
  const palace = await readFile("outputs/js/palacio/palace-controller.js", "utf8");

  assert.match(chegada, /transition-handoff/);
  assert.match(home, /consumeHandoff/);
  assert.doesNotMatch(home, /transition-handoff/);
  assert.match(palace, /transition-handoff/);
});
