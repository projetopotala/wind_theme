import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getAdminAccess,
  isAdminFirstAccess,
  sendAdminPasswordRecovery,
  setAdminPassword,
  signInAsAdmin,
} from "../../outputs/js/admin/admin-auth.js";

function clientFor({
  session = null,
  sessionError = null,
  role = null,
  roleError = null,
  passwordOk = true,
} = {}) {
  const calls = { signIn: [], signOut: 0, userIds: [], rpc: [] };
  const query = {
    select() { return this; },
    eq(column, value) { calls.userIds.push([column, value]); return this; },
    async maybeSingle() {
      return {
        data: role ? { id: "user-row", email: "admin@example.com", name: "Admin", role, active: true } : null,
        error: roleError,
      };
    },
  };
  return {
    calls,
    client: {
      auth: {
        async getSession() { return { data: { session }, error: sessionError }; },
        async signInWithPassword(credentials) {
          calls.signIn.push(credentials);
          return { data: { session }, error: sessionError };
        },
        async signOut() { calls.signOut += 1; return { error: null }; },
      },
      from(table) {
        assert.equal(table, "users");
        return query;
      },
      async rpc(name, args) {
        calls.rpc.push([name, args]);
        return { data: passwordOk, error: null };
      },
    },
  };
}

test("sessão inexistente exige login sem consultar papéis", async () => {
  const { client, calls } = clientFor();
  assert.deepEqual(await getAdminAccess(client), {
    state: "signed-out",
    session: null,
    role: null,
    user: null,
  });
  assert.deepEqual(calls.userIds, []);
});

test("usuário autenticado sem registro administrativo é recusado", async () => {
  const session = { user: { id: "user-1", email: "visitante@example.com" } };
  const { client } = clientFor({ session });

  const access = await getAdminAccess(client);

  assert.equal(access.state, "forbidden");
  assert.equal(access.session, session);
  assert.equal(access.role, null);
  assert.equal(access.user, null);
});

test("owner e admin recebem acesso com o papel confirmado pelo banco", async () => {
  for (const role of ["owner", "admin"]) {
    const session = { user: { id: `user-${role}`, email: `${role}@example.com` } };
    const { client, calls } = clientFor({ session, role });
    const access = await getAdminAccess(client);

    assert.equal(access.state, "authorized");
    assert.equal(access.role, role);
    assert.equal(access.user.email, "admin@example.com");
    assert.equal(access.user.name, "Admin");
    assert.deepEqual(calls.userIds, [["id", session.user.id]]);
  }
});

test("login usa Supabase Auth e encerra sessão se o usuário não é admin", async () => {
  const session = { user: { id: "user-2", email: "sem-acesso@example.com" } };
  const { client, calls } = clientFor({ session });

  const access = await signInAsAdmin(client, {
    email: " sem-acesso@example.com ",
    password: "senha-segura",
  });

  assert.equal(access.state, "forbidden");
  assert.deepEqual(calls.rpc, [[
    "verify_portal_password",
    { p_email: "sem-acesso@example.com", p_password: "senha-segura" },
  ]]);
  assert.deepEqual(calls.signIn, [{ email: "sem-acesso@example.com", password: "senha-segura" }]);
  assert.equal(calls.signOut, 1);
});

test("senha que não confere com o hash da tabela não chega ao Auth", async () => {
  const session = { user: { id: "user-3", email: "admin@example.com" } };
  const { client, calls } = clientFor({ session, passwordOk: false });

  await assert.rejects(
    signInAsAdmin(client, { email: "admin@example.com", password: "errada" }),
    /não foi possível entrar/i,
  );
  assert.equal(calls.signIn.length, 0);
});

test("primeiro acesso define uma senha somente quando a confirmação coincide", async () => {
  const calls = [];
  const client = {
    auth: {
      async updateUser(payload) {
        calls.push(payload);
        return { data: { user: { id: "user-owner" } }, error: null };
      },
    },
  };

  await assert.rejects(
    setAdminPassword(client, { password: "senha-segura", confirmation: "outra-senha" }),
    /não coincidem/i,
  );
  assert.deepEqual(calls, []);

  const result = await setAdminPassword(client, {
    password: "senha-segura",
    confirmation: "senha-segura",
  });
  assert.equal(result.user.id, "user-owner");
  assert.deepEqual(calls, [{ password: "senha-segura" }]);
});

test("recuperação envia o link somente para o e-mail informado", async () => {
  const calls = [];
  const client = {
    auth: {
      async resetPasswordForEmail(email, options) {
        calls.push([email, options]);
        return { data: {}, error: null };
      },
    },
  };

  await sendAdminPasswordRecovery(client, {
    email: " owner@example.com ",
    redirectTo: "http://127.0.0.1:4173/admin.html",
  });
  assert.deepEqual(calls, [["owner@example.com", {
    redirectTo: "http://127.0.0.1:4173/admin.html",
  }]]);
});

test("convite e recuperação abrem a definição de senha automaticamente", () => {
  assert.equal(isAdminFirstAccess({ search: "", hash: "#type=invite" }), true);
  assert.equal(isAdminFirstAccess({ search: "", hash: "#type=recovery" }), true);
  assert.equal(isAdminFirstAccess({ search: "?code=pkce-code", hash: "" }), true);
  assert.equal(isAdminFirstAccess({ search: "", hash: "" }), false);
});

test("HTML do painel pede credenciais reais e não oferece cadastro público", async () => {
  const html = await readFile(new URL("../../outputs/admin.html", import.meta.url), "utf8");
  assert.match(html, /data-admin-auth-form/);
  assert.match(html, /type="email"/);
  assert.match(html, /type="password"/);
  assert.match(html, /data-admin-sign-out/);
  assert.match(html, /data-admin-password-form/);
  assert.match(html, /data-admin-recovery/);
  assert.doesNotMatch(html, /criar conta|cadastre-se|signUp/i);
});

/** Elemento mínimo que registra cada troca do atributo `hidden`. */
function elementoDeTeste(historico, nome) {
  return {
    nome,
    hidden: false,
    dataset: {},
    textContent: "",
    toggleAttribute(atributo, valor) {
      if (atributo !== "hidden") return;
      this.hidden = Boolean(valor);
      historico.push(`${nome}:${this.hidden ? "oculto" : "visivel"}`);
    },
    addEventListener() {},
    removeEventListener() {},
  };
}

function painelDeTeste() {
  const historico = [];
  const elementos = {
    "[data-admin-auth-form]": elementoDeTeste(historico, "form"),
    "[data-admin-auth-view]": elementoDeTeste(historico, "login"),
    "#admin-panel": elementoDeTeste(historico, "painel"),
    "[data-admin-auth-status]": elementoDeTeste(historico, "status"),
    "[data-admin-forbidden]": elementoDeTeste(historico, "negado"),
    "[data-admin-sign-out]": elementoDeTeste(historico, "sair"),
    "[data-admin-recovery]": elementoDeTeste(historico, "recuperar"),
  };
  return {
    historico,
    root: { dataset: {}, querySelector: (seletor) => elementos[seletor] || null },
  };
}

test("reconferir a sessão não faz a tela de login piscar", async () => {
  /*
   * `onAuthStateChange` dispara por motivos de rotina — renovação de token,
   * `updateUser`, o cliente Supabase do iframe da prévia. Cada um chamava
   * `refresh()`, que começava por `showState("checking")`; como "checking" não é
   * "authorized", o login reaparecia e o painel sumia por um instante. Quem
   * estava editando um bloco via a tela de login piscar.
   */
  const { createAdminAuth } = await import("../../outputs/js/admin/admin-auth.js");
  const sessao = { user: { id: "u1" } };
  const { client } = clientFor({ session: sessao, role: "owner" });

  let aoMudar = () => {};
  client.auth.onAuthStateChange = (callback) => {
    aoMudar = callback;
    return { data: { subscription: { unsubscribe() {} } } };
  };

  const { historico, root } = painelDeTeste();
  const auth = createAdminAuth({ client, root });
  await auth.ready;

  assert.equal(root.dataset.authState, "authorized");
  historico.length = 0;

  // Evento de rotina, com a MESMA sessão: nada na tela pode mudar.
  aoMudar("TOKEN_REFRESHED", sessao);
  await new Promise((resolve) => queueMicrotask(resolve));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.ok(
    !historico.includes("login:visivel"),
    `o login reapareceu durante a reconferência: ${historico.join(", ")}`,
  );
  assert.ok(
    !historico.includes("painel:oculto"),
    `o painel sumiu durante a reconferência: ${historico.join(", ")}`,
  );
  assert.equal(root.dataset.authState, "authorized");
  auth.destroy();
});
