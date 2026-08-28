import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("o palácio tem canvas, fallback e botão acessível", async () => {
  const page = await readFile("outputs/palacio.html", "utf8");

  assert.match(page, /id="palace-scene"[^>]*aria-hidden="true"/);
  // Fallback obrigatório: se o WebGL falhar, a cena não pode virar tela preta.
  assert.match(page, /palacio-master\.webp/);
  assert.match(page, /<button[^>]*id="palace-return"/);
  assert.match(page, /palacio\.css/);
  assert.doesNotMatch(page, /<audio[^>]*autoplay/i);
});

test("o botão anuncia o gesto e o destino em texto, não só em animação", async () => {
  const page = await readFile("outputs/palacio.html", "utf8");
  assert.match(page, /aria-describedby="palace-return-hint"/);
  assert.match(page, /id="palace-return-hint"/);
});

test("o controlador reaproveita o motor da Chegada em vez de duplicar", async () => {
  const controller = await readFile("outputs/js/palacio/palace-controller.js", "utf8");
  assert.match(controller, /createArrivalScene/);
  assert.match(controller, /from "\.\.\/chegada\/arrival-scene\.js"/);
});
