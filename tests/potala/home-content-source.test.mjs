import assert from "node:assert/strict";
import test from "node:test";

import { createHomeContentSource } from "../../outputs/js/home/content-source.js";

test("falha de leitura remota usa snapshot e informa a causa", async () => {
  const failure = new Error("offline");
  const reported = [];
  const source = createHomeContentSource({
    remote: {
      async list() { throw failure; },
      async replaceAll() { throw failure; },
      async reset() { throw failure; },
    },
    fallback: { async list(options) { return [{ id: "fallback", options }]; } },
    onRemoteError(error) { reported.push(error); },
  });

  const result = await source.list({ publishedOnly: true });

  assert.equal(result[0].id, "fallback");
  assert.equal(result[0].options.publishedOnly, true);
  assert.deepEqual(reported, [failure]);
});

test("falha de escrita nunca é convertida em sucesso local", async () => {
  const failure = new Error("RLS denied");
  let fallbackWrites = 0;
  const source = createHomeContentSource({
    remote: {
      async list() { return []; },
      async replaceAll() { throw failure; },
      async reset() { throw failure; },
    },
    fallback: {
      async list() { return []; },
      async replaceAll() { fallbackWrites += 1; },
      async reset() { fallbackWrites += 1; },
    },
  });

  await assert.rejects(() => source.replaceAll([]), /RLS denied/);
  await assert.rejects(() => source.reset(), /RLS denied/);
  assert.equal(fallbackWrites, 0);
});
