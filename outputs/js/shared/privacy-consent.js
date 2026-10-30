const STORAGE_KEY = "potala:privacy-consent:v1";
const VERSION = 1;
let volatileConsent = null;

export function readConsent(storage = globalThis.localStorage) {
  try {
    const value = JSON.parse(storage?.getItem(STORAGE_KEY) || "null");
    return value?.version === VERSION && typeof value.analytics === "boolean" ? value : volatileConsent;
  } catch { return volatileConsent; }
}

export function saveConsent({ analytics }, storage = globalThis.localStorage, now = () => new Date().toISOString()) {
  const value = { version: VERSION, essential: true, analytics: analytics === true, decidedAt: now() };
  try { storage?.setItem(STORAGE_KEY, JSON.stringify(value)); }
  catch { volatileConsent = value; }
  globalThis.dispatchEvent?.(new CustomEvent("potala:consentchange", { detail: value }));
  return value;
}

export function analyticsAllowed(storage = globalThis.localStorage) {
  return readConsent(storage)?.analytics === true;
}

function legalNav() {
  return `<nav class="potala-legal-nav" aria-label="Informações legais">
    <a href="/termos-de-uso">Termos de Uso</a>
    <a href="/politica-de-privacidade">Privacidade</a>
    <a href="/politica-de-cookies">Cookies</a>
    <a href="/politica-de-compra-troca-cancelamento">Compra, troca e cancelamento</a>
    <button type="button" data-consent-manage-inline>Preferências de cookies</button>
  </nav>`;
}

export function mountConsent(documentRef = document) {
  if (!documentRef?.body || documentRef.querySelector("[data-potala-consent]")) return;
  let footer = documentRef.querySelector("footer");
  if (!footer) {
    documentRef.body.insertAdjacentHTML("beforeend", `<footer class="potala-global-legal-footer"></footer>`);
    footer = documentRef.querySelector(".potala-global-legal-footer");
  }
  if (!footer.querySelector(".potala-legal-nav")) footer.insertAdjacentHTML("beforeend", legalNav());

  documentRef.body.insertAdjacentHTML("beforeend", `<aside class="potala-consent" data-potala-consent hidden aria-labelledby="potala-consent-title">
    <h2 id="potala-consent-title">Sua privacidade, sua escolha</h2>
    <p>Usamos apenas o necessário para o Portal funcionar. Métricas opcionais só serão ativadas com sua permissão. <a href="/politica-de-cookies">Entenda os cookies</a>.</p>
    <div class="potala-consent__actions">
      <button type="button" data-consent-reject>Recusar opcionais</button>
      <button type="button" data-consent-customize>Personalizar</button>
      <button type="button" data-consent-accept>Aceitar métricas</button>
    </div>
  </aside>
  <dialog class="potala-consent-settings" data-consent-settings aria-labelledby="potala-settings-title">
    <form method="dialog"><h2 id="potala-settings-title">Preferências de privacidade</h2>
      <label><input type="checkbox" checked disabled> <span><strong>Essenciais</strong><br>Necessários para segurança, sessão e funcionamento do Portal.</span></label>
      <label><input type="checkbox" name="analytics"> <span><strong>Métricas opcionais</strong><br>Ajudam o Instituto a entender o uso do Portal. Permanecem desligadas sem consentimento.</span></label>
      <menu><button value="cancel">Cancelar</button><button value="save" data-consent-save>Salvar preferências</button></menu>
    </form>
  </dialog>
  <button type="button" class="potala-consent-manage" data-consent-manage>Privacidade</button>`);

  const banner = documentRef.querySelector("[data-potala-consent]");
  const dialog = documentRef.querySelector("[data-consent-settings]");
  const analytics = dialog.querySelector("[name=analytics]");
  let dialogOpener = null;
  const current = readConsent();
  banner.hidden = current !== null;
  analytics.checked = current?.analytics === true;

  const decide = allowed => { saveConsent({ analytics: allowed }); banner.hidden = true; };
  banner.querySelector("[data-consent-reject]").addEventListener("click", () => decide(false));
  banner.querySelector("[data-consent-accept]").addEventListener("click", () => decide(true));
  const openSettings = opener => {
    dialogOpener = opener;
    analytics.checked = readConsent()?.analytics === true;
    dialog.showModal();
  };
  banner.querySelector("[data-consent-customize]").addEventListener("click", event => openSettings(event.currentTarget));
  documentRef.querySelectorAll("[data-consent-manage],[data-consent-manage-inline]").forEach(button => button.addEventListener("click", () => {
    openSettings(button);
  }));
  dialog.addEventListener("close", () => {
    if (dialog.returnValue === "save") decide(analytics.checked);
    dialogOpener?.focus?.();
    dialogOpener = null;
  });
}

if (typeof document !== "undefined") mountConsent(document);
