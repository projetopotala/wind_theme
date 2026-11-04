import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ARRIVAL_MOTION, ARRIVAL_SCENE_PROFILES } from "../../outputs/js/chegada/arrival-scene-profile.js";

const raiz = new URL("../../outputs/", import.meta.url);
const ler = (nome) => readFileSync(new URL(nome, raiz), "utf8");

test("a deriva ambiente da paisagem existe e cabe na margem do overscan", () => {
  const m = ARRIVAL_MOTION;
  assert.ok(m.ambientNear > m.ambientFar && m.ambientFar > 0, "perto anda mais que longe");
  assert.ok(m.ambientPeriod >= 15 && m.ambientPeriod <= 60, "ciclo lento e contemplativo");
  const margem = (1 - m.overscan) / 2;
  const pior = m.ambientNear + m.canopyMaxUv + m.pointerMaxUv * 0.35;
  assert.ok(pior <= margem + 1e-9, `deslocamento ${pior} deve caber na margem ${margem}`);
});

test("amplitudes de agua, queda e copa sao perceptiveis e ainda discretas", () => {
  const m = ARRIVAL_MOTION;
  assert.ok(m.waterMaxUv >= 0.004 && m.waterMaxUv <= 0.012);
  assert.ok(m.waterfallMaxUv >= 0.006 && m.waterfallMaxUv <= 0.016);
  assert.ok(m.canopyMaxUv >= 0.004 && m.canopyMaxUv <= 0.012);
  assert.ok(m.cloudSpeed >= 0.2 && m.cloudSpeed <= 0.6);
});

test("o perfil mobile tambem recebe a deriva ambiente", () => {
  const mobile = ARRIVAL_SCENE_PROFILES.mobileLegacy.motion;
  assert.ok(mobile.ambientNear > 0 && mobile.ambientFar > 0);
});

test("o shader soma a deriva ambiente por profundidade e a cena envia os uniforms", () => {
  const frag = ler("js/chegada/shaders/arrival-fragment.js");
  assert.match(frag, /uniform vec2 uAmbient;/);
  assert.match(frag, /uAmbient \* mix\(uAmbientFar, uAmbientNear, nearFactor\)/);
  const cena = ler("js/chegada/arrival-scene.js");
  for (const nome of ["uAmbient", "uAmbientFar", "uAmbientNear"]) assert.ok(cena.includes(`"${nome}"`), nome);
  assert.match(cena, /reducedMotion \? 0 : Math\.sin\(turn\)/, "sem deriva com movimento reduzido");
});

test("movimento reduzido do sistema continua estatico por padrao; so o botao liga o movimento", () => {
  const css = ler("css/chegada-scene.css");
  assert.match(css, /html:not\(\.chegada-movimento\) \.arrival-canvas\s*\{\s*display:\s*none/);
  assert.match(css, /html:not\(\.chegada-movimento\) \.arrival-nature-canvas\s*\{\s*display:\s*none/);
  const js = ler("js/chegada/arrival-controller.js");
  assert.match(js, /const reducedMotion = systemReducesMotion && !motionOptIn;/);
  assert.match(js, /localStorage\.getItem\(MOTION_KEY\) === "on"/);
  assert.match(js, /try \{[^}]*localStorage/, "armazenamento sempre em try/catch");
  const html = ler("transcender.html");
  assert.match(html, /id="arrival-motion"[^>]*hidden/);
  for (const id of ["breath-launcher", "ambient-sound"]) assert.ok(html.includes(`id="${id}"`), id);
});

test("sem bibliotecas novas e sem ouvinte de scroll extra na deriva", () => {
  const cena = ler("js/chegada/arrival-scene.js");
  assert.doesNotMatch(cena, /import .*(three|gsap)/i);
  assert.doesNotMatch(cena, /addEventListener\(\s*["']scroll/);
});
