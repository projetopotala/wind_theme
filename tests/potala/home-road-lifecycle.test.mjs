import assert from "node:assert/strict";
import test from "node:test";
import { createHomeRoad } from "../../outputs/js/home/home-road.js";
import { JOURNEY_REGIONS } from "../../outputs/js/home/journey-data.js";

// Só as fronteiras do navegador são substituídas: o desenho da estrada, a
// composição das duas texturas e a geometria/animação da grama são reais.
function recordingCanvas() {
  const commands = [];
  const stack = [];
  const context = {
    clearRect() { commands.length = 0; },
    setTransform() {},
    translate() {},
    setLineDash() {},
    beginPath() {},
    moveTo() {},
    save() {
      stack.push({ strokeStyle: this.strokeStyle, fillStyle: this.fillStyle });
    },
    restore() { Object.assign(this, stack.pop()); },
    createPattern(image, repetition) { return { src: image.src, repetition }; },
    stroke() { commands.push({ type: "stroke", style: this.strokeStyle }); },
    fillRect() { commands.push({ type: "fill", style: this.fillStyle }); },
    quadraticCurveTo(...points) { commands.push({ type: "blade", points }); },
    drawImage(source) { commands.push({ type: "layer", commands: [...source.commands] }); },
  };
  return {
    commands,
    style: {},
    getContext() { return context; },
    // Redimensionar um canvas apaga seu conteúdo, inclusive no pageshow.
    set width(value) { this.pixelWidth = value; commands.length = 0; },
    get width() { return this.pixelWidth; },
    set height(value) { this.pixelHeight = value; commands.length = 0; },
    get height() { return this.pixelHeight; },
  };
}

function mountRoad(t, { width = 1265, height = 720, reducedMotion = false } = {}) {
  const frames = new Map();
  const images = [];
  const document = new EventTarget();
  document.hidden = false;
  document.createElement = () => recordingCanvas();
  let nextId = 0;
  let clock = 100;
  const globals = {
    document,
    innerWidth: width,
    innerHeight: height,
    devicePixelRatio: 1,
    matchMedia: () => ({ matches: reducedMotion }),
    Image: class { constructor() { images.push(this); } },
    Path2D: class {
      moveTo() {}
      lineTo() {}
      quadraticCurveTo() {}
      bezierCurveTo() {}
    },
    requestAnimationFrame(callback) { frames.set(++nextId, callback); return nextId; },
    cancelAnimationFrame(id) { frames.delete(id); },
  };
  const originals = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  let road;
  t.after(() => {
    road?.destroy();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  t.mock.method(performance, "now", () => clock);
  const canvas = recordingCanvas();
  road = createHomeRoad(canvas, { regions: JOURNEY_REGIONS });
  return {
    canvas, road, frames,
    loadImages() { images.forEach((image) => image.onload?.()); },
    setHidden(hidden) {
      document.hidden = hidden;
      document.dispatchEvent(new Event("visibilitychange"));
    },
    elapse(ms) { clock += ms; },
    step() {
      clock += 16;
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(clock));
    },
  };
}

function assertRoadAndGrassPainted(canvas) {
  const layers = canvas.commands.filter((command) => command.type === "layer");
  assert.ok(layers.some((layer) => layer.commands.some((command) => (
    command.type === "stroke" && command.style?.src?.endsWith("/medieval-road-stones.webp")
  ))), "a textura da estrada precisa voltar ao canvas visível");
  assert.ok(layers.some((layer) => layer.commands.some((command) => (
    command.type === "fill" && command.style?.src?.endsWith("/grama-borda.webp")
  ))), "a faixa de grama precisa voltar junto com a estrada");
  assert.ok(canvas.commands.some((command) => command.type === "blade"), "as lâminas de grama também precisam reaparecer");
}

for (const viewport of [
  { name: "desktop", width: 1265, height: 720, reducedMotion: false },
  { name: "mobile", width: 390, height: 844, reducedMotion: false },
  { name: "movimento reduzido", width: 1265, height: 720, reducedMotion: true },
]) {
  test(`estrada e grama reaparecem ao voltar de uma seção (${viewport.name})`, (t) => {
    const scene = mountRoad(t, viewport);
    scene.loadImages();
    scene.road.setProgress(.12);
    if (!viewport.reducedMotion) scene.step();

    for (let visit = 0; visit < 3; visit += 1) {
      const previousBlades = scene.canvas.commands.filter((command) => command.type === "blade");
      scene.setHidden(true);
      assert.equal(scene.frames.size, 0, "a página oculta não deve manter animações rodando");
      scene.elapse(5000);
      scene.setHidden(false);
      // mountHomeJourney dispara resize ao restaurar a página pelo bfcache.
      scene.road.resize();
      scene.step();
      assertRoadAndGrassPainted(scene.canvas);
      if (previousBlades.length) {
        assert.deepEqual(scene.canvas.commands.filter((command) => command.type === "blade"), previousBlades,
          "a grama não deve saltar de fase pelo tempo em que a página ficou oculta");
      }
      const restoredBlades = scene.canvas.commands.filter((command) => command.type === "blade");
      scene.step();
      if (viewport.reducedMotion) {
        assert.equal(scene.frames.size, 0, "movimento reduzido deve continuar sem animação contínua");
      } else {
        assert.notDeepEqual(scene.canvas.commands.filter((command) => command.type === "blade"), restoredBlades,
          "o movimento da grama deve continuar depois do retorno");
        assert.equal(scene.frames.size, 1, "o retorno não deve duplicar o loop de animação");
      }
    }

    scene.road.destroy();
    scene.setHidden(true);
    scene.setHidden(false);
    assert.equal(scene.frames.size, 0, "uma cena destruída não pode reiniciar");
  });
}

test("texturas carregadas enquanto a Home está oculta aparecem ao retornar", (t) => {
  const scene = mountRoad(t);
  scene.setHidden(true);
  scene.loadImages();
  scene.step();
  assert.equal(scene.canvas.commands.length, 0);
  scene.setHidden(false);
  scene.road.resize();
  scene.step();
  assertRoadAndGrassPainted(scene.canvas);
});
