import assert from "node:assert/strict";
import test from "node:test";
import * as homeRoad from "../../outputs/js/home/home-road.js";

test("o caminho usa pavimento medieval texturizado com profundidade", () => {
  assert.equal(typeof homeRoad.buildMedievalRoadLayers, "function");
  const texture = { kind: "stone-pattern" };
  const layers = homeRoad.buildMedievalRoadLayers(120, texture);

  assert.equal(layers.length, 4);
  assert.ok(layers.every((layer) => layer.lineDash.length === 0));
  assert.ok(layers.every((layer) => layer.composite === "source-over"));
  assert.ok(layers[0].width > layers[1].width);
  assert.ok(layers[1].width > layers[2].width);
  assert.equal(layers[2].strokeStyle, texture);
  assert.ok(layers[0].blur >= 18);
  assert.ok(layers.at(-1).width < 120);
  assert.doesNotMatch(layers.map((layer) => String(layer.strokeStyle)).join(" "), /rgba\(255, 254/);
});

test("o pavimento mantém uma cor de pedra quando a textura ainda não carregou", () => {
  const layers = homeRoad.buildMedievalRoadLayers(96, null);
  assert.match(layers[2].strokeStyle, /^#[0-9a-f]{6}$/i);
});
