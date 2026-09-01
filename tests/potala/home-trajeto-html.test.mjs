import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { mountHomeJourney } from "../../outputs/js/home/home-controller.js";
import { mountJourney } from "../../outputs/js/home/home-scenes.js";

test("Home aponta o navegador para o módulo Three.js local", async () => {
  const html = await readFile(new URL("../../outputs/transcendido.html", import.meta.url), "utf8");
  assert.match(html, /type="importmap"/);
  assert.match(html, /\.\/vendor\/three\.module\.min\.js/);
});

test("fim editorial não contém subida nem destino automático", () => {
  const root = { innerHTML: "", querySelectorAll() { return []; } };
  mountJourney(root, { regions: [], discoveries: [] });
  assert.doesNotMatch(root.innerHTML, /journey-ascent|palacio\.html/i);
  assert.match(root.innerHTML, /journey-continuation/);
});

test("montagem solicita somente blocos publicados e os entrega ao controlador", async () => {
  const requested = [];
  const published = [{ id: "quem-somos", title: "Quem somos", side: "left" }];
  const root = {};
  const canvas = {};
  let received;
  const controller = { destroy() {} };

  const result = await mountHomeJourney({
    repository: {
      async list(options) {
        requested.push(options);
        return published;
      },
    },
    elements: { root, canvas },
    controllerFactory(options) {
      received = options;
      return controller;
    },
    lifecycle: false,
  });

  assert.deepEqual(requested, [{ publishedOnly: true }]);
  assert.equal(received.root, root);
  assert.equal(received.canvas, canvas);
  assert.equal(received.blocks, published);
  assert.equal(result, controller);
});

