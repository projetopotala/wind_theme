import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("o painel usa a mesma marca Potala na entrada e na navegação", async () => {
  const html = await readFile(new URL("../../outputs/admin.html", import.meta.url), "utf8");

  const logos = html.match(/media\/potala-mark-transparent\.png/g) || [];
  assert.equal(logos.length, 2, "entrada e painel precisam compartilhar a marca");
  assert.doesNotMatch(html, /admin-brand-mark[^>]*>▲</);
});
