import assert from "node:assert/strict";
import test from "node:test";

function createClassList() {
  const values = new Set();
  return {
    add(value) { values.add(value); },
    remove(value) { values.delete(value); },
    contains(value) { return values.has(value); },
  };
}

async function mountClosingHarness() {
  const frames = [];
  const scheduled = [];
  const listeners = new Map();
  const bodyClassList = createClassList();
  const rootClassList = createClassList();
  const veil = {
    hidden: true,
    dataset: {},
    addEventListener(type, listener) {
      const entries = listeners.get(type) || [];
      entries.push(listener);
      listeners.set(type, entries);
    },
    removeEventListener(type, listener) {
      listeners.set(type, (listeners.get(type) || []).filter((entry) => entry !== listener));
    },
    querySelector() { return null; },
  };
  const trigger = {};

  globalThis.document = {
    documentElement: { classList: rootClassList },
    body: {
      dataset: { section: "quem-somos" },
      classList: bodyClassList,
      prepend() {},
    },
    createElement() {
      return { setAttribute() {}, innerHTML: "" };
    },
    querySelectorAll() {
      return [];
    },
    querySelector(selector) {
      if (selector === "[data-about-closing-trigger]") return trigger;
      if (selector === "[data-about-closing-veil]") return veil;
      return null;
    },
  };
  globalThis.window = { matchMedia: () => ({ matches: false }) };
  globalThis.requestAnimationFrame = (callback) => {
    frames.push(callback);
    return frames.length;
  };
  globalThis.setTimeout = (callback, delay) => {
    const timer = { callback, delay, id: scheduled.length + 1 };
    scheduled.push(timer);
    return timer.id;
  };
  globalThis.clearTimeout = () => {};
  globalThis.IntersectionObserver = class {
    constructor(callback) {
      this.callback = callback;
    }

    observe(target) {
      this.callback([{ isIntersecting: true, target }], this);
    }

    unobserve() {}
  };

  const flushFrame = () => {
    const currentFrame = frames.splice(0);
    currentFrame.forEach((callback) => callback());
  };
  const emit = (type) => {
    let prevented = false;
    const event = { preventDefault() { prevented = true; } };
    (listeners.get(type) || []).forEach((listener) => listener(event));
    return { prevented };
  };
  const runTimer = (delay) => {
    const index = scheduled.findIndex((timer) => timer.delay === delay);
    assert.notEqual(index, -1, `timer de ${delay}ms deveria existir`);
    const [timer] = scheduled.splice(index, 1);
    timer.callback();
  };

  const moduleUrl = new URL(`../../outputs/js/about/about-closing-controller.js?closing=${Date.now()}-${Math.random()}`, import.meta.url);
  const { mountAboutClosing } = await import(moduleUrl);
  mountAboutClosing();
  flushFrame();
  flushFrame();

  return { bodyClassList, emit, rootClassList, runTimer, scheduled, veil };
}

function clearClosingHarness() {
  delete globalThis.document;
  delete globalThis.window;
  delete globalThis.requestAnimationFrame;
  delete globalThis.setTimeout;
  delete globalThis.clearTimeout;
  delete globalThis.IntersectionObserver;
}

test("o encerramento não fecha sozinho e só aceita scroll após 4,5 segundos", async () => {
  const harness = await mountClosingHarness();

  try {
    assert.equal(harness.veil.dataset.state, "message");
    assert.equal(harness.rootClassList.contains("is-about-closing"), true);
    assert.equal(harness.emit("wheel").prevented, true);
    assert.equal(harness.veil.dataset.state, "message");

    harness.runTimer(4500);
    assert.equal(harness.veil.dataset.state, "message");

    assert.equal(harness.emit("wheel").prevented, true);
    assert.equal(harness.veil.dataset.state, "leaving");
    harness.runTimer(800);
    assert.equal(harness.veil.hidden, true);
    assert.equal(harness.rootClassList.contains("is-about-closing"), false);
  } finally {
    clearClosingHarness();
  }
});

test("um clique fecha a frase imediatamente", async () => {
  const harness = await mountClosingHarness();

  try {
    assert.equal(harness.veil.dataset.state, "message");
    harness.emit("click");
    assert.equal(harness.veil.dataset.state, "leaving");
    harness.runTimer(800);
    assert.equal(harness.veil.hidden, true);
    assert.equal(harness.bodyClassList.contains("is-about-closing"), false);
  } finally {
    clearClosingHarness();
  }
});
