import { SUPABASE_CONFIG } from "./config.js";

let cachedClient = null;
let cachedSdk = null;
let cachedConfig = null;

export function validateSupabaseConfig(config = {}) {
  let url;
  try {
    url = new URL(config.url);
  } catch {
    throw new TypeError("A URL do Supabase é inválida.");
  }

  if (url.protocol !== "https:" || !url.hostname.endsWith(".supabase.co")) {
    throw new TypeError("A URL deve apontar para um projeto Supabase por HTTPS.");
  }
  if (!String(config.publishableKey || "").startsWith("sb_publishable_")) {
    throw new TypeError("Use somente a chave publicável do Supabase no navegador.");
  }
  return config;
}

export function getSupabaseClient({
  sdk = globalThis.supabase,
  config = SUPABASE_CONFIG,
} = {}) {
  validateSupabaseConfig(config);
  if (!sdk?.createClient) throw new Error("O SDK público do Supabase não foi carregado.");

  if (cachedClient && cachedSdk === sdk && cachedConfig === config) return cachedClient;
  cachedSdk = sdk;
  cachedConfig = config;
  cachedClient = sdk.createClient(config.url, config.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return cachedClient;
}

export function resetSupabaseClientForTests() {
  cachedClient = null;
  cachedSdk = null;
  cachedConfig = null;
}
