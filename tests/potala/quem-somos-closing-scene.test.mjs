import assert from "node:assert/strict";
import test from "node:test";

const sceneModuleUrl = new URL("../../outputs/js/about/about-closing-scene.js", import.meta.url);

test("a cena Three renderiza somente enquanto o véu está visível", async () => {
  const { createAboutClosingScene } = await import(sceneModuleUrl);
  const frames = [];
  const cancelled = [];
  const renders = [];
  const renderer = {
    domElement: {},
    setClearColor() {},
    setPixelRatio() {},
    setSize() {},
    render(scene, camera) { renders.push({ scene, camera }); },
    dispose() {},
  };

  const closingScene = createAboutClosingScene({
    canvas: {},
    rendererFactory: () => renderer,
    requestFrame(callback) {
      frames.push(callback);
      return frames.length;
    },
    cancelFrame(id) { cancelled.push(id); },
    viewport: () => ({ width: 1280, height: 720, pixelRatio: 2 }),
  });

  assert.equal(closingScene.mode, "three");
  closingScene.start();
  assert.equal(frames.length, 1);
  frames.shift()(1000);
  assert.equal(renders.length, 1);

  closingScene.stop();
  assert.equal(cancelled.length, 1);
  closingScene.destroy();
});

test("movimento reduzido preserva o fundo estático sem criar WebGL", async () => {
  const { createAboutClosingScene } = await import(sceneModuleUrl);
  let rendererCreated = false;

  const closingScene = createAboutClosingScene({
    canvas: {},
    reducedMotion: true,
    rendererFactory() {
      rendererCreated = true;
      return {};
    },
  });

  assert.equal(closingScene.mode, "static");
  assert.equal(rendererCreated, false);
});
