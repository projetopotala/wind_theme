import assert from "node:assert/strict";
import test from "node:test";
import { createTurnstileTokenProvider } from "../../outputs/js/appointments/turnstile.js";

test("sem sitekey pública não carrega script nem obtém token", async () => {
  let appended = 0;
  const challenge = createTurnstileTokenProvider({ sitekey: "", container: {},
    documentRef: { head: { append() { appended++; } } } });
  await assert.rejects(challenge(), /indisponível/);
  assert.equal(appended, 0);
});

test("cada tentativa executa novo desafio, mantendo o widget e a chave da proposta separada", async () => {
  const original = globalThis.turnstile;
  let callbacks;
  let renders = 0;
  let resets = 0;
  let executions = 0;
  globalThis.turnstile = {
    render(container, options) {
      assert.equal(container.id, "challenge");
      assert.equal(options.action, "appointment_request");
      assert.equal(options.execution, "execute");
      assert.equal(options.sitekey, "sitekey-ficticia");
      callbacks = options; renders++;
      return "widget-ficticio";
    },
    reset(id) { assert.equal(id, "widget-ficticio"); resets++; },
    execute(id) { assert.equal(id, "widget-ficticio"); callbacks.callback(`token-${++executions}`); },
  };
  try {
    const challenge = createTurnstileTokenProvider({ sitekey: "sitekey-ficticia", container: { id: "challenge" }, documentRef: {} });
    assert.equal(await challenge(), "token-1");
    assert.equal(await challenge(), "token-2");
    assert.equal(renders, 1);
    assert.equal(resets, 1);
  } finally { globalThis.turnstile = original; }
});
