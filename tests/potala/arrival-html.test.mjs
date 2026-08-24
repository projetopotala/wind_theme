import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const htmlUrl = new URL("../../outputs/transcender.html", import.meta.url);
const controllerUrl = new URL("../../outputs/js/chegada/arrival-controller.js", import.meta.url);

test("a Chegada usa cena progressiva e entrada somente por rolagem", async () => {
  const [html, controller] = await Promise.all([
    readFile(htmlUrl, "utf8"),
    readFile(controllerUrl, "utf8"),
  ]);

  assert.match(html, /id="arrival-scene"/);
  assert.match(html, /chegada-landscape\.webp/);
  assert.match(html, /class="arrival-scroll-cue"/);
  assert.match(html, /js\/chegada\/arrival-controller\.js/);
  assert.doesNotMatch(html, /id="transcend-button"|class="arrival-drag"/);
  assert.doesNotMatch(html, /class="arrival-identity"|class="arrival-presence"/);
  assert.doesNotMatch(controller, /drag-controller|createDragController/);
  assert.doesNotMatch(html, /<video\b/i);
  assert.doesNotMatch(html, /data:image\//i);
});

test("a respiração continua opcional e carregada separadamente", async () => {
  const html = await readFile(htmlUrl, "utf8");

  assert.match(html, /respiracao\.css/);
  assert.match(html, /respiracao\.js/);
});
