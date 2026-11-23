import { analyticsAllowed } from "./privacy-consent.js";

let providerLoaded = false;

export function activateApprovedAnalytics({ documentRef = globalThis.document, config = globalThis.POTALA_ANALYTICS, isAllowed = analyticsAllowed } = {}) {
  if (providerLoaded || !isAllowed() || !config?.approved || !config?.src) return false;
  const script = documentRef.createElement("script");
  script.src = config.src;
  script.async = true;
  script.dataset.potalaAnalytics = "approved";
  documentRef.head.append(script);
  providerLoaded = true;
  return true;
}

globalThis.addEventListener?.("potala:consentchange", event => {
  if (event.detail?.analytics === true) activateApprovedAnalytics();
});

if (globalThis.document) activateApprovedAnalytics();
