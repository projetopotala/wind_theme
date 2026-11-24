import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { destinoDoPapel, PAPEIS_ADMINISTRATIVOS } from "../../outputs/js/conta/spa/destino-admin.js";

const ler = (c) => readFileSync(new URL(`../../outputs/${c}`, import.meta.url), "utf8");
const com = [{ id: "p1", nome: "Ana" }];

test("F6: owner com vínculo profissional ativo fica no Meu Potala", async () => {
  assert.equal(await destinoDoPapel({ papelPortal: "owner", perfisProfissionais: async () => com }), "ficar");
});

test("F6: owner sem vínculo (ou com falha de leitura) segue para a Central", async () => {
  assert.equal(await destinoDoPapel({ papelPortal: "owner", perfisProfissionais: async () => [] }), "admin");
  assert.equal(await destinoDoPapel({ papelPortal: "owner", perfisProfissionais: async () => { throw new Error("rpc"); } }), "admin");
  assert.equal(await destinoDoPapel({ papelPortal: "owner", perfisProfissionais: async () => null }), "admin");
  assert.equal(await destinoDoPapel({ papelPortal: "owner" }), "admin");
  assert.equal(await destinoDoPapel({ papelPortal: "owner", perfisProfissionais: async () => com, habilitado: false }), "admin");
});

test("F6: admin e editor do Blog continuam indo para a Central, mesmo com vínculo", async () => {
  for (const papel of ["admin", "blog_editor"]) {
    assert.equal(await destinoDoPapel({ papelPortal: papel, perfisProfissionais: async () => com }), "admin");
  }
});

test("F6: cliente e profissional (sem papel administrativo) não são redirecionados", async () => {
  assert.equal(await destinoDoPapel({ papelPortal: null, perfisProfissionais: async () => com }), "ficar");
  assert.equal(await destinoDoPapel({ papelPortal: undefined }), "ficar");
  assert.deepEqual([...PAPEIS_ADMINISTRATIVOS], ["owner", "admin", "blog_editor"]);
});

test("F6: o app consulta o destino e só o RPC já existente de leitura; nada novo no banco", () => {
  const app = ler("js/conta/spa/app.js");
  assert.match(app, /destinoDoPapel\(/);
  assert.match(app, /sessao\.perfisProfissionais\(\)/);
  assert.doesNotMatch(app, /admin_link_professional|admin_set_/);
  const entrada = ler("js/admin/admin-entry.js");
  assert.match(entrada, /my_appointment_professional_profiles/);
  assert.match(entrada, /access\.role === "owner"[\s\S]{0,80}rpc\("my_appointment_professional_profiles"\)/);
});

test("F6: o link da Central está escondido por padrão", () => {
  assert.match(ler("admin.html"), /data-admin-minha-area\s+hidden/);
});
