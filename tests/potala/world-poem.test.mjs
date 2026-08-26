import assert from "node:assert/strict";
import test from "node:test";

import { poemLinesOf, poemTimings } from "../../outputs/js/chegada/world-poem.js";
import { DESKTOP_V2_ACTORS } from "../../outputs/js/chegada/arrival-scene-profile.js";

test("todo lugar da Chegada tem um poema curto e legível", () => {
  for (const actor of DESKTOP_V2_ACTORS) {
    const lines = poemLinesOf(actor);
    assert.ok(lines.length >= 2 && lines.length <= 3, `${actor.id} tem ${lines.length} versos`);
    for (const line of lines) {
      assert.ok(line.length <= 40, `verso longo demais em ${actor.id}: ${line}`);
    }
  }
});

test("um lugar sem poema não abre a tela escura", () => {
  assert.deepEqual(poemLinesOf({ id: "sem-poema" }), []);
  assert.deepEqual(poemLinesOf(null), []);
  assert.deepEqual(poemLinesOf({ poem: ["", "   "] }), []);
});

test("o poema fica em tela tempo suficiente para ser lido até o fim", () => {
  const timing = poemTimings({ lines: 3 });

  // A permanência é contada depois do último verso aparecer, não depois do
  // primeiro: senão o terceiro verso teria menos tempo de leitura que o primeiro.
  assert.ok(timing.reveal >= timing.fadeIn);
  assert.ok(timing.hold >= 4000);
  assert.equal(timing.total, timing.reveal + timing.hold + timing.fadeOut);
  assert.ok(timing.total > timing.reveal + timing.fadeOut);
});

test("poemas maiores esperam mais, e nunca menos", () => {
  const short = poemTimings({ lines: 1 });
  const long = poemTimings({ lines: 3 });

  assert.ok(long.reveal > short.reveal);
  assert.ok(long.hold > short.hold);
  assert.ok(long.total > short.total);
});

test("com movimento reduzido o poema não escalona, mas fica mais tempo", () => {
  const reduced = poemTimings({ lines: 3, reducedMotion: true });
  const normal = poemTimings({ lines: 3 });

  assert.equal(reduced.stagger, 0);
  assert.ok(reduced.fadeIn <= 1);
  assert.equal(reduced.hold, normal.hold);
  assert.ok(reduced.total >= reduced.hold);
});
