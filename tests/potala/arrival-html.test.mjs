import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const htmlUrl = new URL("../../outputs/transcender.html", import.meta.url);

test("a Chegada usa cena progressiva, fallback e o drag preservado", async () => {
  const html = await readFile(htmlUrl, "utf8");

  assert.match(html, /id="arrival-scene"/);
  assert.match(html, /chegada-landscape\.webp/);
  assert.match(html, /id="transcend-button"/);
  assert.match(html, /js\/chegada\/arrival-controller\.js/);
  assert.doesNotMatch(html, /<video\b/i);
  assert.doesNotMatch(html, /data:image\//i);
});

test("a respiração continua opcional e carregada separadamente", async () => {
  const html = await readFile(htmlUrl, "utf8");

  assert.match(html, /respiracao\.css/);
  assert.match(html, /respiracao\.js/);
});
