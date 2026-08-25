import assert from "node:assert/strict";
import test from "node:test";
import {
  WORLD_ACTORS,
  AMBIENT_ENERGY,
  applyWorldAction,
  createWorldState,
  feedProximity,
  hitActor,
  stepWorld,
} from "../../outputs/js/chegada/arrival-world.js";

test("cada lugar da Chegada tem uma função e nenhum ator se repete", () => {
  const actions = WORLD_ACTORS.map((actor) => actor.action);
  assert.equal(WORLD_ACTORS.length, 8);
  assert.deepEqual(new Set(actions).size, actions.length);
  assert.ok(WORLD_ACTORS.every((actor) => actor.role && actor.cue && actor.radius > 0));
});

test("o ponteiro acerta o ator mais próximo dentro do raio", () => {
  const tree = WORLD_ACTORS.find((actor) => actor.id === "tree");
  assert.equal(hitActor(tree.x, tree.y)?.id, "tree");
  assert.equal(hitActor(0.92, 0.08), null);
});

test("uma ação acorda o lugar uma vez e injeta energia, sem repetir o id", () => {
  const children = WORLD_ACTORS.find((actor) => actor.id === "children");
  const first = applyWorldAction(createWorldState(), children, 10);
  const second = applyWorldAction(first, children, 20);
  assert.deepEqual(first.awakened, ["children"]);
  assert.deepEqual(second.awakened, ["children"]);
  assert.equal(first.lastAction.action, "breathe");
  assert.ok(first.energies.water > 0.8);
  assert.equal(first.prompt, children.cue);
});

test("a energia volta ao ambiente vivo, não ao silêncio", () => {
  const tree = WORLD_ACTORS.find((actor) => actor.id === "tree");
  let state = applyWorldAction(createWorldState(), tree, 0);
  const peak = state.energies.wind;
  state = stepWorld(state, { elapsedMs: 400 });
  assert.ok(state.energies.wind < peak);
  state = stepWorld(state, { elapsedMs: 8000 });
  assert.equal(state.energies.wind, AMBIENT_ENERGY.wind);
  assert.equal(state.energies.water, AMBIENT_ENERGY.water);
});

test("proximidade alimenta o vento só enquanto o ponteiro está na árvore", () => {
  const tree = WORLD_ACTORS.find((actor) => actor.id === "tree");
  const near = feedProximity(createWorldState(), tree, { pointerDelta: 0.4, pointer: [0.6, 0.1] });
  assert.ok(near.energies.wind > 0.2);
  assert.equal(near.attentionId, "tree");
  const away = feedProximity(near, null);
  assert.equal(away.attentionId, null);
});
