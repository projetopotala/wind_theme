import assert from "node:assert/strict";
import test from "node:test";
import * as homeRoad from "../../outputs/js/home/home-road.js";

test("o intervalo visível cobre a câmera e descarta o resto da estrada", () => {
  assert.equal(typeof homeRoad.visibleArcRange, "function");

  const layout = { totalLength: 10000 };
  const range = homeRoad.visibleArcRange({
    layout,
    cameraDistance: 5000,
    width: 1440,
    height: 900,
    margin: 200,
  });

  assert.ok(range.from < 5000 && range.to > 5000, "a câmera precisa estar dentro do intervalo");
  assert.ok(range.to - range.from < layout.totalLength, "não pode devolver a estrada inteira");
  assert.ok(range.from >= 0, "não pode pedir arco negativo");
  assert.ok(range.to <= layout.totalLength, "não pode passar do fim da estrada");
});

test("perto das pontas o intervalo encolhe em vez de sair da estrada", () => {
  const layout = { totalLength: 1000 };
  const inicio = homeRoad.visibleArcRange({ layout, cameraDistance: 0, width: 1440, height: 900, margin: 200 });
  const fim = homeRoad.visibleArcRange({ layout, cameraDistance: 1000, width: 1440, height: 900, margin: 200 });
  assert.equal(inicio.from, 0);
  assert.equal(fim.to, 1000);
});
