const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export function createTurnstileTokenProvider({ documentRef = document, sitekey, container } = {}) {
  let loading;
  let widget;
  let pending;
  const api = () => globalThis.turnstile;
  const load = () => {
    if (api()) return Promise.resolve(api());
    if (!loading) loading = new Promise((resolve, reject) => {
      const script = documentRef.createElement("script");
      script.src = SCRIPT_URL;
      script.async = true;
      script.onload = () => api() ? resolve(api()) : reject(new Error("Verificação indisponível."));
      script.onerror = () => reject(new Error("Verificação indisponível."));
      documentRef.head.append(script);
    }).catch((error) => { loading = undefined; throw error; });
    return loading;
  };
  return async () => {
    if (!sitekey || !container) throw new Error("Verificação indisponível.");
    const turnstile = await load();
    return new Promise((resolve, reject) => {
      const fail = () => { pending = null; reject(new Error("Verificação não concluída. Tente novamente.")); };
      pending = { resolve, fail };
      try {
        if (widget === undefined) widget = turnstile.render(container, {
          sitekey, action: "appointment_request", execution: "execute", language: "pt-BR", size: "flexible",
          "response-field": false,
          callback(token) { pending?.resolve(token); pending = null; },
          "error-callback": () => { pending?.fail(); },
          "expired-callback": () => { pending?.fail(); },
          "timeout-callback": () => { pending?.fail(); },
        });
        else turnstile.reset(widget);
        turnstile.execute(widget);
      } catch { fail(); }
    });
  };
}
