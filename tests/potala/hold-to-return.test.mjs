import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceHold,
  createHoldState,
  HOLD_DURATION,
  zoomForProgress,
} from "../../outputs/js/palacio/hold-to-return.js";

test("o estado começa parado", () => {
  const state = createHoldState();
  assert.equal(state.progress, 0);
  assert.equal(state.holding, false);
  assert.equal(state.completed, false);
});

test("segurar avança e completa na duração declarada", () => {
  let state = createHoldState();
  let decorrido = 0;
  while (decorrido < HOLD_DURATION && !state.completed) {
    state = advanceHold(state, { elapsedMs: 100, holding: true });
    decorrido += 100;
  }
  assert.equal(state.completed, true);
  assert.equal(state.progress, 1);
  assert.ok(decorrido >= HOLD_DURATION, `completou cedo demais: ${decorrido}ms`);
});

test("soltar antes do fim recua o progresso em vez de zerar de uma vez", () => {
  let state = createHoldState();
  state = advanceHold(state, { elapsedMs: 600, holding: true });
  const noPico = state.progress;
  assert.ok(noPico > 0.3 && noPico < 1, `progresso no pico ${noPico}`);

  state = advanceHold(state, { elapsedMs: 100, holding: false });
  assert.ok(state.progress < noPico, "o progresso precisa recuar");
  assert.ok(state.progress > 0, "o recuo não pode ser instantâneo");
  assert.equal(state.completed, false);
});

test("soltando por tempo suficiente o progresso volta a zero e não completa", () => {
  let state = createHoldState();
  state = advanceHold(state, { elapsedMs: 700, holding: true });
  for (let i = 0; i < 40; i += 1) {
    state = advanceHold(state, { elapsedMs: 100, holding: false });
  }
  assert.equal(state.progress, 0);
  assert.equal(state.completed, false);
});

test("depois de completar o estado não regride", () => {
  let state = createHoldState();
  state = advanceHold(state, { elapsedMs: HOLD_DURATION + 50, holding: true });
  assert.equal(state.completed, true);
  state = advanceHold(state, { elapsedMs: 500, holding: false });
  assert.equal(state.completed, true, "completar é definitivo, senão a navegação seria cancelada no meio");
  assert.equal(state.progress, 1);
});

test("em movimento reduzido a conclusão é imediata", () => {
  const state = advanceHold(createHoldState(), { elapsedMs: 16, holding: true, reducedMotion: true });
  assert.equal(state.completed, true);
});

test("o zoom cresce com o progresso e parte de 1", () => {
  assert.equal(zoomForProgress(0), 1);
  assert.ok(zoomForProgress(0.5) > 1);
  assert.ok(zoomForProgress(1) > zoomForProgress(0.5));
});
