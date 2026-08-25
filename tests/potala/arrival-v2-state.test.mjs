import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { computeArrivalState, computeCameraMotion } from "../../outputs/js/chegada/arrival-scene.js";
import {
  computeReducedMotionEnergies,
} from "../../outputs/js/chegada/arrival-scene-profile.js";
import { computeRiverFlowState } from "../../outputs/js/chegada/nature-motion.js";
import { WORLD_ACTORS, hitActor, stepWorld, createWorldState } from "../../outputs/js/chegada/arrival-world.js";

test("reduced motion zera correnteza, vento, câmera e partículas", () => {
  const river = computeRiverFlowState({ elapsed: 4, energy: 1, reducedMotion: true });
  const energies = computeReducedMotionEnergies();
  const world = stepWorld(createWorldState(), { elapsedMs: 16, reducedMotion: true });
  const camera = computeCameraMotion({ scrollProgress: 1, reducedMotion: true });

  assert.deepEqual(river, { time: 0, intensity: 0 });
  assert.equal(energies.wind, 0);
  assert.equal(energies.water, 0);
  assert.equal(world.energies.wind, 0);
  assert.equal(world.energies.water, 0);
  assert.equal(camera, 0);
});

test("a narrativa do scroll avança câmera, reduz névoa e revela o caminho", () => {
  const start = computeArrivalState({ scrollProgress: 0 });
  const mid = computeArrivalState({ scrollProgress: 0.6 });
  const end = computeArrivalState({ scrollProgress: 1 });
  assert.equal(start.camera, 0);
  assert.ok(mid.camera > start.camera);
  assert.ok(mid.fog < start.fog);
  assert.ok(end.path === 1);
  assert.ok(end.light > start.light);
});

test("atores usam histerese na borda do raio", () => {
  const sitters = WORLD_ACTORS.find((actor) => actor.id === "sitters");
  const edge = sitters.x + sitters.radius * 1.05;
  assert.equal(hitActor(edge, sitters.y), null);
  assert.equal(hitActor(edge, sitters.y, WORLD_ACTORS, { previousId: "sitters" })?.id, "sitters");
});

test("somente o clock da Chegada possui loop RAF contínuo", async () => {
  const [scene, nature, controller, clock, engine] = await Promise.all([
    readFile(new URL("../../outputs/js/chegada/arrival-scene.js", import.meta.url), "utf8"),
    readFile(new URL("../../outputs/js/chegada/nature-motion.js", import.meta.url), "utf8"),
    readFile(new URL("../../outputs/js/chegada/arrival-controller.js", import.meta.url), "utf8"),
    readFile(new URL("../../outputs/js/chegada/scene-clock.js", import.meta.url), "utf8"),
    readFile(new URL("../../outputs/js/chegada/arrival-engine.js", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(scene, /requestAnimationFrame/);
  assert.doesNotMatch(nature, /requestAnimationFrame/);
  assert.doesNotMatch(controller, /requestAnimationFrame/);
  assert.match(clock, /requestAnimationFrame/);
  assert.match(engine, /createSceneClock/);
  assert.equal([...clock.matchAll(/requestAnimationFrame/g)].length, 2);
});
