import assert from "node:assert/strict";
import test from "node:test";

import * as arrivalScene from "../../outputs/js/chegada/arrival-scene.js";

const { computeArrivalState } = arrivalScene;

test("a Chegada começa contemplativa, com névoa e caminho oculto", () => {
  assert.deepEqual(computeArrivalState({}), {
    camera: 0,
    depth: 0.18,
    fog: 0.76,
    light: 0.34,
    path: 0,
  });
});

test("o avanço abre a paisagem e revela completamente o caminho", () => {
  const state = computeArrivalState({ scrollProgress: 1 });

  assert.ok(state.camera > 0.85);
  assert.ok(state.fog < 0.35);
  assert.equal(state.path, 1);
});

test("a paisagem respira com intensidade discreta", () => {
  const inhale = computeArrivalState({ scrollProgress: 0.35, phase: "inhale" });
  const exhale = computeArrivalState({ scrollProgress: 0.35, phase: "exhale" });

  assert.ok(inhale.light > exhale.light);
  assert.ok(inhale.depth > exhale.depth);
  assert.ok(inhale.light - exhale.light < 0.2);
});

test("as folhas caem em pequenos grupos a partir da copa", () => {
  const leaves = arrivalScene.createLeafGroup?.({ seed: 0.42, count: 4 });

  assert.equal(leaves?.length, 4);
  for (const leaf of leaves) {
    assert.ok(leaf.x >= 0.04 && leaf.x <= 0.46);
    assert.ok(leaf.y >= -0.08 && leaf.y <= 0.2);
    assert.ok(leaf.delay >= 0 && leaf.delay <= 0.72);
  }
});

test("cada folha desce, oscila e desaparece sem saltos", () => {
  const leaf = {
    x: 0.24,
    y: 0.08,
    drift: 0.1,
    fall: 0.72,
    sway: 0.035,
    spin: 2.4,
    phase: 0.7,
    delay: 0,
  };

  const start = arrivalScene.computeLeafFrame?.(leaf, 0);
  const middle = arrivalScene.computeLeafFrame?.(leaf, 0.5);
  const end = arrivalScene.computeLeafFrame?.(leaf, 1);

  assert.equal(start?.opacity, 0);
  assert.ok(middle?.y > start?.y);
  assert.ok(Math.abs(middle?.x - start?.x) < 0.18);
  assert.ok(middle?.opacity > 0.7);
  assert.ok(end?.y > middle?.y);
  assert.equal(end?.opacity, 0);
  assert.notEqual(middle?.rotation, start?.rotation);
});

test("a correnteza avança somente quando movimento está permitido", () => {
  assert.equal(arrivalScene.computeRiverTime?.({ elapsed: 2.5 }), 2.5);
  assert.equal(arrivalScene.computeRiverTime?.({ elapsed: 2.5, reducedMotion: true }), 0);
  assert.equal(arrivalScene.computeRiverTime?.({ elapsed: -1 }), 0);
});

test("a correnteza fornece movimento contínuo e zera com movimento reduzido", () => {
  assert.equal(typeof arrivalScene.computeRiverFlowState, "function");

  const moving = arrivalScene.computeRiverFlowState({ elapsed: 2.5 });
  const reduced = arrivalScene.computeRiverFlowState({
    elapsed: 2.5,
    reducedMotion: true,
  });

  assert.ok(moving.time > 0);
  assert.ok(moving.intensity > 0);
  assert.deepEqual(reduced, { time: 0, intensity: 0 });
});

test("a cena vertical carrega a paisagem e a profundidade mobile", () => {
  const mobile = arrivalScene.selectArrivalAssets?.({ width: 390, height: 844 });
  const desktop = arrivalScene.selectArrivalAssets?.({ width: 1280, height: 720 });

  assert.deepEqual(mobile, {
    imageUrl: "media/chegada-landscape-people-mobile.webp",
    depthUrl: "media/chegada-depth-mobile.webp",
    effectMaskUrl: "media/chegada-effects-mobile.png",
    cloudTextureUrl: "media/chegada-clouds.png",
  });

  assert.deepEqual(desktop, {
    imageUrl: "media/chegada-landscape-people.webp",
    depthUrl: "media/chegada-depth.webp",
    effectMaskUrl: "media/chegada-effects.png",
    cloudTextureUrl: "media/chegada-clouds.png",
  });
});

test("a cena exige a textura fotográfica de nuvens", () => {
  assert.throws(
    () => arrivalScene.createArrivalScene({
      canvas: {},
      imageUrl: "paisagem.webp",
      depthUrl: "profundidade.webp",
      effectMaskUrl: "efeitos.png",
    }),
    /cloudTextureUrl/,
  );
});

test("a máscara da correnteza inclui água e exclui pedras, grama e caminho", () => {
  assert.equal(typeof arrivalScene.isArrivalRiverPoint, "function");

  const desktopWater = [
    [0.38, 0.82],
    [0.45, 0.75],
  ];
  const desktopDry = [
    [0.3, 0.9],
    [0.56, 0.8],
    [0.6, 0.9],
  ];
  const mobileWater = [
    [0.3, 0.66],
    [0.43, 0.61],
  ];
  const mobileDry = [
    [0.18, 0.73],
    [0.48, 0.73],
    [0.55, 0.78],
  ];

  for (const [x, y] of desktopWater) {
    assert.equal(arrivalScene.isArrivalRiverPoint({ x, y }), true, `desktop água ${x},${y}`);
  }
  for (const [x, y] of desktopDry) {
    assert.equal(arrivalScene.isArrivalRiverPoint({ x, y }), false, `desktop margem ${x},${y}`);
  }
  for (const [x, y] of mobileWater) {
    assert.equal(arrivalScene.isArrivalRiverPoint({ x, y, portrait: true }), true, `mobile água ${x},${y}`);
  }
  for (const [x, y] of mobileDry) {
    assert.equal(arrivalScene.isArrivalRiverPoint({ x, y, portrait: true }), false, `mobile margem ${x},${y}`);
  }
});

test("a proteção do parallax cobre somente os três viajantes do caminho", () => {
  assert.equal(typeof arrivalScene.isArrivalTravelerPoint, "function");

  const desktopTravelers = [
    [0.554, 0.73],
    [0.554, 0.67],
    [0.554, 0.82],
    [0.592, 0.715],
    [0.597, 0.68],
    [0.597, 0.81],
    [0.613, 0.72],
    [0.618, 0.69],
    [0.618, 0.76],
  ];
  const desktopUnprotected = [
    [0.855, 0.46],
    [0.5, 0.72],
    [0.7, 0.72],
  ];
  const mobileTravelers = [
    [0.627, 0.625],
    [0.512, 0.58],
    [0.557, 0.585],
    [0.543, 0.58],
    [0.543, 0.545],
    [0.543, 0.61],
    [0.58, 0.58],
    [0.58, 0.545],
    [0.58, 0.61],
    [0.638, 0.555],
    [0.638, 0.68],
  ];
  const mobileUnprotected = [
    [0.87, 0.53],
    [0.42, 0.6],
    [0.72, 0.63],
  ];

  for (const [x, y] of desktopTravelers) {
    assert.equal(arrivalScene.isArrivalTravelerPoint({ x, y }), true, `desktop viajante ${x},${y}`);
  }
  for (const [x, y] of desktopUnprotected) {
    assert.equal(arrivalScene.isArrivalTravelerPoint({ x, y }), false, `desktop fora ${x},${y}`);
  }
  for (const [x, y] of mobileTravelers) {
    assert.equal(arrivalScene.isArrivalTravelerPoint({ x, y, portrait: true }), true, `mobile viajante ${x},${y}`);
  }
  for (const [x, y] of mobileUnprotected) {
    assert.equal(arrivalScene.isArrivalTravelerPoint({ x, y, portrait: true }), false, `mobile fora ${x},${y}`);
  }
});

test("as nuvens se movem somente no céu e param com movimento reduzido", () => {
  assert.equal(typeof arrivalScene.isArrivalCloudPoint, "function");
  assert.equal(typeof arrivalScene.computeCloudMotionState, "function");

  assert.equal(arrivalScene.isArrivalCloudPoint({ x: 0.66, y: 0.32 }), true);
  assert.equal(arrivalScene.isArrivalCloudPoint({ x: 0.15, y: 0.12 }), false);
  assert.equal(arrivalScene.isArrivalCloudPoint({ x: 0.86, y: 0.25 }), false);
  assert.equal(arrivalScene.isArrivalCloudPoint({ x: 0.65, y: 0.3, portrait: true }), true);
  assert.equal(arrivalScene.isArrivalCloudPoint({ x: 0.2, y: 0.2, portrait: true }), false);

  const moving = arrivalScene.computeCloudMotionState({ elapsed: 12 });
  const reduced = arrivalScene.computeCloudMotionState({ elapsed: 12, reducedMotion: true });
  assert.ok(Math.abs(moving.nearOffset) > 0);
  assert.ok(Math.abs(moving.farOffset) > 0);
  assert.notEqual(moving.nearOffset, moving.farOffset);
  assert.ok(moving.nearOffset >= 0 && moving.nearOffset < 1);
  assert.ok(moving.farOffset >= 0 && moving.farOffset < 1);
  assert.deepEqual(reduced, { nearOffset: 0, farOffset: 0, intensity: 0 });
});

test("as nuvens percorrem uma distância perceptível sem acelerar demais", () => {
  const start = arrivalScene.computeCloudMotionState({ elapsed: 1 });
  const later = arrivalScene.computeCloudMotionState({ elapsed: 9 });
  const nearTravel = Math.abs(later.nearOffset - start.nearOffset);
  const farTravel = Math.abs(later.farOffset - start.farOffset);

  assert.ok(nearTravel >= 0.045, `camada próxima moveu apenas ${nearTravel}`);
  assert.ok(farTravel >= 0.014, `camada distante moveu apenas ${farTravel}`);
  assert.ok(nearTravel <= 0.085, `camada próxima moveu rápido demais: ${nearTravel}`);
});

test("a camada de nuvens cobre céu e sol, mas exclui montanha, templo e árvore", () => {
  const desktopSky = [
    [0.31, 0.48],
    [0.56, 0.24],
  ];
  const desktopForeground = [
    [0.18, 0.24],
    [0.67, 0.4],
    [0.82, 0.22],
  ];
  const mobileSky = [
    [0.23, 0.43],
    [0.68, 0.2],
  ];
  const mobileForeground = [
    [0.16, 0.22],
    [0.68, 0.43],
    [0.9, 0.3],
  ];

  for (const [x, y] of desktopSky) {
    assert.equal(arrivalScene.isArrivalCloudPoint({ x, y }), true, `desktop céu ${x},${y}`);
  }
  for (const [x, y] of desktopForeground) {
    assert.equal(arrivalScene.isArrivalCloudPoint({ x, y }), false, `desktop primeiro plano ${x},${y}`);
  }
  for (const [x, y] of mobileSky) {
    assert.equal(arrivalScene.isArrivalCloudPoint({ x, y, portrait: true }), true, `mobile céu ${x},${y}`);
  }
  for (const [x, y] of mobileForeground) {
    assert.equal(arrivalScene.isArrivalCloudPoint({ x, y, portrait: true }), false, `mobile primeiro plano ${x},${y}`);
  }
});

test("o deslocamento das nuvens completa um loop contínuo de dois minutos", () => {
  const start = arrivalScene.computeCloudMotionState({ elapsed: 0 });
  const middle = arrivalScene.computeCloudMotionState({ elapsed: 60 });
  const end = arrivalScene.computeCloudMotionState({ elapsed: 120 });

  assert.deepEqual(end, start);
  assert.notDeepEqual(middle, start);
});
