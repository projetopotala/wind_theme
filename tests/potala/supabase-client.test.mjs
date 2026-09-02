import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import { SUPABASE_CONFIG } from "../../outputs/js/supabase/config.js";
import {
  getSupabaseClient,
  resetSupabaseClientForTests,
  validateSupabaseConfig,
} from "../../outputs/js/supabase/client.js";

test("configuração aponta para o projeto Potala com chave publicável", () => {
  assert.equal(SUPABASE_CONFIG.url, "https://gotrumwuimpoeggwamut.supabase.co");
  assert.match(SUPABASE_CONFIG.publishableKey, /^sb_publishable_/);
  assert.doesNotMatch(SUPABASE_CONFIG.publishableKey, /sb_secret_|service_role/i);
});

test("cliente Supabase é criado uma vez e persiste a sessão", () => {
  resetSupabaseClientForTests();
  const calls = [];
  const expected = { source: "supabase" };
  const sdk = {
    createClient(url, key, options) {
      calls.push({ url, key, options });
      return expected;
    },
  };
  const config = {
    url: "https://example.supabase.co",
    publishableKey: "sb_publishable_test_key",
  };

  assert.equal(getSupabaseClient({ sdk, config }), expected);
  assert.equal(getSupabaseClient({ sdk, config }), expected);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].options.auth, {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  });
});

test("configuração recusa chave privada e URL fora do Supabase", () => {
  assert.throws(() => validateSupabaseConfig({
    url: "https://example.supabase.co",
    publishableKey: "sb_secret_private",
  }), /publicável/i);
  assert.throws(() => validateSupabaseConfig({
    url: "https://example.invalid",
    publishableKey: "sb_publishable_test",
  }), /URL/i);
});

test("SDK vendorizado existe e o script copia somente o bundle público", async () => {
  await access(new URL("../../outputs/vendor/supabase.js", import.meta.url));
  const script = await readFile(new URL("../../scripts/vendor-supabase.mjs", import.meta.url), "utf8");
  for (const segment of ["@supabase", "supabase-js", "dist", "umd", "supabase.js"]) {
    assert.match(script, new RegExp(`["']${segment.replace(".", "\\.")}["']`));
  }
  assert.doesNotMatch(script, /service_role|sb_secret_/i);
});
