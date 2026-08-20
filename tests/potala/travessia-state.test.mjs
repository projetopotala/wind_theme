import assert from "node:assert/strict";
import test from "node:test";
import {
  consumeHandoff,
  readTravessiaState,
  writeTravessiaState,
} from "../../outputs/js/core/travessia-state.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("persiste apenas preferências efêmeras válidas", () => {
  const storage = memoryStorage();
  writeTravessiaState({ soundEnabled: true, entry: "scroll", unknown: 7 }, storage);
  assert.deepEqual(readTravessiaState(storage), {
    soundEnabled: true,
    entry: "scroll",
  });
});

test("consome o handoff sem apagar a preferência de som", () => {
  const storage = memoryStorage();
  writeTravessiaState({ soundEnabled: true, entry: "drag" }, storage);
  assert.deepEqual(consumeHandoff(storage), { soundEnabled: true, entry: "drag" });
  assert.deepEqual(readTravessiaState(storage), { soundEnabled: true });
});

test("falha de storage retorna estado seguro", () => {
  const storage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
    removeItem() { throw new Error("blocked"); },
  };
  assert.deepEqual(readTravessiaState(storage), {});
  assert.doesNotThrow(() => writeTravessiaState({ soundEnabled: true }, storage));
});
