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
  assert.match(app, /criarGuardaDeDestino\(/);
  assert.match(ler("js/conta/spa/destino-admin.js"), /sessao\.perfisProfissionais\(\)/);
  assert.doesNotMatch(app, /admin_link_professional|admin_set_/);
  const entrada = ler("js/admin/admin-entry.js");
  assert.match(entrada, /my_appointment_professional_profiles/);
  assert.match(entrada, /access\.role === "owner"[\s\S]{0,80}rpc\("my_appointment_professional_profiles"\)/);
});

test("F6: o link da Central está escondido por padrão", () => {
  assert.match(ler("admin.html"), /data-admin-minha-area\s+hidden/);
});

/* ---- Comportamento do guarda ligado na sessão do Meu Potala ---- */
import { criarGuardaDeDestino } from "../../outputs/js/conta/spa/destino-admin.js";

const montar = ({ papel, perfis, id = "u1" }) => {
  const destinos = [];
  const sessao = { perfisProfissionais: async () => { if (perfis instanceof Error) throw perfis; return perfis; }, obter: () => ({ usuario: { id } }) };
  const janela = { location: { assign: (d) => destinos.push(d) } };
  const guarda = criarGuardaDeDestino({ sessao, janela });
  const estado = { papelPortal: papel, usuario: { id } };
  return { destinos, guarda, estado };
};
const espera = () => new Promise((r) => setTimeout(r, 5));

test("guarda: Owner COM vínculo fica e a tela é desenhada (sem ir à Central)", async () => {
  const { destinos, guarda, estado } = montar({ papel: "owner", perfis: com });
  assert.equal(guarda(estado), false);
  await espera();
  assert.deepEqual(destinos, []);
});

test("guarda: Owner SEM vínculo (ou leitura com erro) vai para a Central", async () => {
  for (const perfis of [[], new Error("rpc")]) {
    const { destinos, guarda, estado } = montar({ papel: "owner", perfis });
    assert.equal(guarda(estado), false);
    await espera();
    assert.deepEqual(destinos, ["/admin/"]);
  }
});

test("guarda: admin e editor/escritor do Blog vão para a Central de imediato, mesmo com vínculo", async () => {
  for (const papel of ["admin", "blog_editor"]) {
    const { destinos, guarda, estado } = montar({ papel, perfis: com });
    assert.equal(guarda(estado), true, "não desenha a tela");
    await espera();
    assert.deepEqual(destinos, ["/admin/"]);
  }
});

test("guarda: profissional comum e cliente (sem papel administrativo) nunca são redirecionados", async () => {
  for (const papel of [null, undefined]) {
    const { destinos, guarda, estado } = montar({ papel, perfis: com });
    assert.equal(guarda(estado), false);
    await espera();
    assert.deepEqual(destinos, []);
  }
});

test("guarda: consulta o vínculo uma vez por conta e não redireciona quem já trocou de sessão", async () => {
  let chamadas = 0;
  const destinos = [];
  let atual = "u1";
  const sessao = { perfisProfissionais: async () => { chamadas += 1; return []; }, obter: () => ({ usuario: { id: atual } }) };
  const guarda = criarGuardaDeDestino({ sessao, janela: { location: { assign: (d) => destinos.push(d) } } });
  guarda({ papelPortal: "owner", usuario: { id: "u1" } });
  guarda({ papelPortal: "owner", usuario: { id: "u1" } });
  atual = "u2"; /* saiu antes da resposta */
  await espera();
  assert.equal(chamadas, 1);
  assert.deepEqual(destinos, []);
});

test("Owner volta à Central pelo painel da conta (link existe só para papéis administrativos)", () => {
  const painel = ler("js/conta/painel-conta.js");
  assert.match(painel, /\["owner", "admin", "blog_editor"\]\.includes\(papelPortal\)[\s\S]{0,120}href="\/admin\/"/);
  const html = ler("meu-potala.html");
  assert.match(html, /data-conta-gatilho/);
});