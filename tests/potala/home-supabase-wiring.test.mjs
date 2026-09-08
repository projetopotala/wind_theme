import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("Home carrega o SDK público antes do módulo de entrada", async () => {
  const html = await read("outputs/transcendido.html");
  const sdkIndex = html.indexOf('src="vendor/supabase.js"');
  const entryIndex = html.indexOf('src="js/secoes.js"');

  assert.ok(sdkIndex >= 0, "Home precisa carregar o SDK vendorizado");
  assert.ok(entryIndex > sdkIndex, "SDK precisa existir antes do entrypoint da Home");
});

test("entrypoint monta repositório Supabase com fallback empacotado", async () => {
  const entry = await read("outputs/js/secoes.js");
  assert.match(entry, /createSupabaseContentRepository/);
  assert.match(entry, /createHomeContentSource/);
  assert.match(entry, /createLocalContentRepository/);
  assert.match(entry, /mountHomeJourney\s*\(\s*\{\s*repository/i);
});

test("painel usa o mesmo repositório somente depois da autorização", async () => {
  const entry = await read("outputs/js/admin/admin-entry.js");
  const authIndex = entry.indexOf("createAdminAuth");
  const controllerIndex = entry.indexOf("createAdminController");

  assert.ok(authIndex >= 0);
  assert.ok(controllerIndex > authIndex);
  assert.match(entry, /onAuthorized/);
  assert.match(entry, /createSupabaseContentRepository/);
});

test("falha de escrita no painel é anunciada sem apagar o rascunho", async () => {
  const controller = await read("outputs/js/admin/admin-controller.js");
  assert.match(controller, /Não foi possível salvar/);
  assert.match(controller, /return false/);
});
