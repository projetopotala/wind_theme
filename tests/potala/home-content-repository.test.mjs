import assert from "node:assert/strict";
import test from "node:test";

import { normalizeHomeBlocks } from "../../outputs/js/home/content-model.js";
import { createLocalContentRepository } from "../../outputs/js/home/content-repository.js";
import { DEFAULT_HOME_BLOCKS } from "../../outputs/js/home/journey-data.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("usa os padrões e persiste uma cópia normalizada", async () => {
  const storage = memoryStorage();
  const repository = createLocalContentRepository({
    storage,
    defaults: DEFAULT_HOME_BLOCKS,
    key: "test",
  });

  assert.equal((await repository.list({ publishedOnly: true })).length, DEFAULT_HOME_BLOCKS.length);

  await repository.replaceAll([
    { id: "novo", title: "Novo", summary: "Resumo", published: false },
  ]);

  assert.equal((await repository.list({ publishedOnly: true })).length, 0);
  assert.equal((await repository.list()).length, 1);
});

test("dados corrompidos retornam aos padrões", async () => {
  const storage = memoryStorage({ test: "{" });
  const repository = createLocalContentRepository({
    storage,
    defaults: DEFAULT_HOME_BLOCKS,
    key: "test",
  });

  assert.deepEqual(await repository.list(), normalizeHomeBlocks(DEFAULT_HOME_BLOCKS));
});

test("as listas devolvidas não permitem alterar o estado persistido", async () => {
  const repository = createLocalContentRepository({
    storage: memoryStorage(),
    defaults: DEFAULT_HOME_BLOCKS,
    key: "test",
  });

  const firstRead = await repository.list();
  firstRead[0].title = "Alterado fora do repositório";
  firstRead[0].tags.push("mutação");

  const secondRead = await repository.list();
  assert.notEqual(secondRead[0].title, "Alterado fora do repositório");
  assert.doesNotMatch(secondRead[0].tags.join(","), /mutação/);
});

