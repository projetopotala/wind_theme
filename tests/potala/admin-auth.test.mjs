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

function clientFor({ session = null, sessionError = null, role = null, roleError = null } = {}) {
  const calls = { signIn: [], signOut: 0, userIds: [] };
  const query = {
    select() { return this; },
    eq(column, value) { calls.userIds.push([column, value]); return this; },
    async maybeSingle() { return { data: role ? { role } : null, error: roleError }; },
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
        assert.equal(table, "admin_users");
        return query;
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
});

test("owner e admin recebem acesso com o papel confirmado pelo banco", async () => {
  for (const role of ["owner", "admin"]) {
    const session = { user: { id: `user-${role}`, email: `${role}@example.com` } };
    const { client, calls } = clientFor({ session, role });
    const access = await getAdminAccess(client);

    assert.equal(access.state, "authorized");
    assert.equal(access.role, role);
    assert.deepEqual(calls.userIds, [["user_id", session.user.id]]);
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
  assert.deepEqual(calls.signIn, [{ email: "sem-acesso@example.com", password: "senha-segura" }]);
  assert.equal(calls.signOut, 1);
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
