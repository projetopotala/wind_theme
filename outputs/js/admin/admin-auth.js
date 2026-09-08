export class AdminAuthError extends Error {
  constructor(operation, cause = {}) {
    super(cause.message || `Falha de autenticação durante ${operation}.`);
    this.name = "AdminAuthError";
    this.operation = operation;
    this.code = cause.code || "ADMIN_AUTH_ERROR";
    this.cause = cause;
  }
}

export function isAdminFirstAccess(locationLike = {}) {
  const search = new URLSearchParams(String(locationLike.search || ""));
  const hash = new URLSearchParams(String(locationLike.hash || "").replace(/^#/, ""));
  return search.has("code") || ["invite", "recovery"].includes(hash.get("type"));
}

export async function getAdminAccess(client) {
  if (!client?.auth?.getSession || !client?.from) {
    throw new TypeError("Um cliente Supabase Auth válido é obrigatório.");
  }

  const { data, error } = await client.auth.getSession();
  if (error) throw new AdminAuthError("getSession", error);
  const session = data?.session || null;
  if (!session?.user?.id) return { state: "signed-out", session: null, role: null, user: null };

  const { data: user, error: membershipError } = await client
    .from("users")
    .select("id, email, name, role, active")
    .eq("id", session.user.id)
    .maybeSingle();
  if (membershipError) throw new AdminAuthError("getRole", membershipError);

  const role = user?.active === true && ["owner", "admin"].includes(user.role)
    ? user.role
    : null;
  return {
    state: role ? "authorized" : "forbidden",
    session,
    role,
    user: role ? user : null,
  };
}

export async function signInAsAdmin(client, { email, password } = {}) {
  const credentials = {
    email: String(email || "").trim(),
    password: String(password || ""),
  };
  if (!credentials.email || !credentials.password) {
    throw new AdminAuthError("signIn", { code: "INVALID_CREDENTIALS", message: "Informe e-mail e senha." });
  }

  const { data: passwordOk, error: passwordError } = await client.rpc("verify_portal_password", {
    p_email: credentials.email,
    p_password: credentials.password,
  });
  if (passwordError || passwordOk !== true) {
    throw new AdminAuthError("signIn", passwordError || {
      code: "INVALID_CREDENTIALS",
      message: "Não foi possível entrar. Confira o e-mail e a senha.",
    });
  }

  const { error } = await client.auth.signInWithPassword(credentials);
  if (error) throw new AdminAuthError("signIn", error);
  const access = await getAdminAccess(client);
  if (access.state === "forbidden") await client.auth.signOut();
  return access;
}

export async function setAdminPassword(client, { password, confirmation } = {}) {
  if (!client?.auth?.updateUser) {
    throw new TypeError("Um cliente Supabase Auth válido é obrigatório.");
  }
  const nextPassword = String(password || "");
  if (nextPassword.length < 8) {
    throw new AdminAuthError("updatePassword", {
      code: "PASSWORD_TOO_SHORT",
      message: "Use pelo menos 8 caracteres.",
    });
  }
  if (nextPassword !== String(confirmation || "")) {
    throw new AdminAuthError("updatePassword", {
      code: "PASSWORD_MISMATCH",
      message: "As senhas não coincidem.",
    });
  }

  const { data, error } = await client.auth.updateUser({ password: nextPassword });
  if (error) throw new AdminAuthError("updatePassword", error);
  return data;
}

export async function sendAdminPasswordRecovery(client, { email, redirectTo } = {}) {
  if (!client?.auth?.resetPasswordForEmail) {
    throw new TypeError("Um cliente Supabase Auth válido é obrigatório.");
  }
  const normalizedEmail = String(email || "").trim();
  if (!normalizedEmail) {
    throw new AdminAuthError("recoverPassword", {
      code: "EMAIL_REQUIRED",
      message: "Informe o e-mail administrativo.",
    });
  }

  const { data, error } = await client.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo: String(redirectTo || ""),
  });
  if (error) throw new AdminAuthError("recoverPassword", error);
  return data;
}

export function createAdminPasswordSetup({ client, root, firstAccess = false } = {}) {
  const disclosure = root?.querySelector("[data-admin-password-setup]");
  const form = root?.querySelector("[data-admin-password-form]");
  const status = root?.querySelector("[data-admin-password-status]");
  if (!disclosure || !form) return { destroy() {} };
  if (firstAccess) disclosure.open = true;

  const onSubmit = async (event) => {
    event.preventDefault();
    const submit = form.querySelector("button[type='submit']");
    const values = new FormData(form);
    submit?.setAttribute("disabled", "");
    if (status) status.textContent = "Salvando senha…";
    try {
      await setAdminPassword(client, {
        password: values.get("password"),
        confirmation: values.get("confirmation"),
      });
      form.reset();
      disclosure.dataset.passwordState = "saved";
      if (status) status.textContent = "Senha definida. Seu próximo acesso poderá usar e-mail e senha.";
    } catch (error) {
      disclosure.dataset.passwordState = "error";
      if (status) status.textContent = error.message || "Não foi possível definir a senha.";
    } finally {
      submit?.removeAttribute("disabled");
    }
  };

  form.addEventListener("submit", onSubmit);
  return {
    destroy() {
      form.removeEventListener("submit", onSubmit);
    },
  };
}

function authMessage(state, error = null) {
  if (error?.operation === "signIn") return "Não foi possível entrar. Confira o e-mail e a senha.";
  if (state === "checking") return "Verificando acesso…";
  if (state === "forbidden") return "Esta conta não possui acesso administrativo ao Portal Potala.";
  if (state === "error") return "Não foi possível verificar o acesso agora. Tente novamente.";
  return "";
}

export function createAdminAuth({ client, root, onAuthorized = () => {}, onState = () => {}, managePanel = true } = {}) {
  if (!root) throw new TypeError("root é obrigatório para autenticação administrativa.");
  const form = root.querySelector("[data-admin-auth-form]");
  const loginView = root.querySelector("[data-admin-auth-view]");
  const panel = root.querySelector("#admin-panel");
  const status = root.querySelector("[data-admin-auth-status]");
  const forbidden = root.querySelector("[data-admin-forbidden]");
  const signOutButton = root.querySelector("[data-admin-sign-out]");
  const recoveryButton = root.querySelector("[data-admin-recovery]");
  let authorizedUserId = null;
  let destroyed = false;

  function showState(state, error = null) {
    root.dataset.authState = state;
    if (managePanel) {
      const allowed = state === "authorized";
      loginView?.toggleAttribute("hidden", allowed);
      panel?.toggleAttribute("hidden", !allowed);
    }
    form?.toggleAttribute("hidden", state === "checking" || state === "forbidden" || (!managePanel && state === "authorized"));
    forbidden?.toggleAttribute("hidden", state !== "forbidden");
    if (status) status.textContent = authMessage(state, error);
    onState(state, error);
  }

  async function applyAccess(access) {
    if (destroyed) return access;
    showState(access.state);
    const userId = access.session?.user?.id || null;
    if (access.state === "authorized" && authorizedUserId !== userId) {
      authorizedUserId = userId;
      await onAuthorized(access);
    }
    if (access.state !== "authorized") authorizedUserId = null;
    return access;
  }

  /*
   * Reconferir a sessão NÃO pode mostrar o login de novo.
   *
   * `showState("checking")` esconde o painel e revela o login, porque "checking"
   * não é "authorized". Isso está certo na primeira carga, quando ainda não se
   * sabe quem é o visitante. Mas `onAuthStateChange` dispara por vários motivos
   * de rotina — renovação de token, `updateUser`, o cliente Supabase do iframe
   * da prévia — e cada um chamava `refresh()`. Quem estava editando via a tela
   * de login aparecer e sumir a cada um desses eventos.
   *
   * Com uma sessão já autorizada, a reconferência acontece em silêncio: a tela
   * só muda se o resultado for diferente, que é o único caso em que mudar
   * ajuda.
   */
  async function refresh({ silencioso = authorizedUserId !== null } = {}) {
    if (!silencioso) showState("checking");
    try {
      return await applyAccess(await getAdminAccess(client));
    } catch (error) {
      showState("error", error);
      return { state: "error", session: null, role: null, error };
    }
  }

  const onSubmit = async (event) => {
    event.preventDefault();
    showState("checking");
    const values = new FormData(form);
    try {
      await applyAccess(await signInAsAdmin(client, {
        email: values.get("email"),
        password: values.get("password"),
      }));
      form.elements.password.value = "";
    } catch (error) {
      showState(error.code === "ADMIN_REQUIRED" ? "forbidden" : "signed-out", error);
    }
  };

  const onSignOut = async () => {
    await client.auth.signOut();
    authorizedUserId = null;
    showState("signed-out");
    form?.elements?.email?.focus();
  };

  const onRecovery = async () => {
    const email = form?.elements?.email?.value;
    if (status) status.textContent = "Enviando link de acesso…";
    try {
      await sendAdminPasswordRecovery(client, {
        email,
        redirectTo: new URL("/admin", window.location.origin).href,
      });
      if (status) status.textContent = "Link enviado. Abra o e-mail neste dispositivo para definir sua senha.";
    } catch (error) {
      if (status) status.textContent = error.message || "Não foi possível enviar o link.";
    }
  };

  form?.addEventListener("submit", onSubmit);
  signOutButton?.addEventListener("click", onSignOut);
  recoveryButton?.addEventListener("click", onRecovery);
  const subscription = client.auth.onAuthStateChange?.(() => {
    queueMicrotask(refresh);
  });
  const ready = refresh();

  return {
    ready,
    refresh,
    destroy() {
      destroyed = true;
      form?.removeEventListener("submit", onSubmit);
      signOutButton?.removeEventListener("click", onSignOut);
      recoveryButton?.removeEventListener("click", onRecovery);
      subscription?.data?.subscription?.unsubscribe?.();
    },
  };
}
