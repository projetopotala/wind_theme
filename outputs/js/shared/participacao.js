/*
 * O QUE O VISITANTE ENVIA PELAS SEÇÕES chega ao Instituto.
 *
 * Interesse num curso que ainda não existe, "Tenho interesse" numa experiência
 * cultural, o retorno da Recepção: tudo vai para public.site_interests. O
 * visitante só envia; ler o que foi enviado é da administração (RLS).
 *
 * Quem chama decide o que dizer na tela, mas nunca antes de a promessa
 * resolver: confirmação só depois que o banco aceitou.
 */
import { criarRestPublico } from "../supabase/rest.js";

export const TIPOS_DE_INTERESSE = Object.freeze(["curso", "experiencia-cultural", "retorno-recepcao"]);

let restPadrao = null;
const chavesEmMemoria = new Map();

export function montarInteresse({ kind, subject = "", details = {}, page = "" } = {}) {
  if (!TIPOS_DE_INTERESSE.includes(kind)) throw new TypeError("Tipo de interesse desconhecido.");
  return {
    kind,
    subject: String(subject || "").trim().slice(0, 160),
    details: details && typeof details === "object" && !Array.isArray(details) ? details : {},
    page: String(page || globalThis.location?.pathname || "").slice(0, 200),
  };
}

function resumoEstavel(texto) {
  let hash = 2166136261;
  for (const caractere of texto) {
    hash ^= caractere.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function chaveDeEnvio(interesse, { storage, cryptoImpl = globalThis.crypto } = {}) {
  const linha = montarInteresse(interesse);
  const assinatura = resumoEstavel(JSON.stringify(linha));
  const nome = `potala.participacao.${assinatura}`;
  if (chavesEmMemoria.has(nome)) return chavesEmMemoria.get(nome);
  let armazenamento = storage;
  if (armazenamento === undefined) {
    try { armazenamento = globalThis.sessionStorage; } catch { armazenamento = null; }
  }
  try {
    const existente = armazenamento?.getItem?.(nome);
    if (existente) { chavesEmMemoria.set(nome, existente); return existente; }
  } catch { /* armazenamento pode estar bloqueado pelo navegador */ }
  const aleatorio = cryptoImpl?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const chave = `site-${assinatura}-${aleatorio}`.slice(0, 120);
  chavesEmMemoria.set(nome, chave);
  try { armazenamento?.setItem?.(nome, chave); } catch { /* a chave ainda protege esta tentativa */ }
  return chave;
}

export async function enviarInteresse(interesse, { rest, submissionKey } = {}) {
  const linha = montarInteresse(interesse);
  const nome = `potala.participacao.${resumoEstavel(JSON.stringify(linha))}`;
  restPadrao ||= rest ? null : criarRestPublico();
  await (rest || restPadrao).rpc("submit_site_interest", {
    p_kind: linha.kind,
    p_subject: linha.subject,
    p_details: linha.details,
    p_page: linha.page,
    p_submission_key: submissionKey || chaveDeEnvio(linha),
  });
  chavesEmMemoria.delete(nome);
  try { globalThis.sessionStorage?.removeItem?.(nome); } catch { /* armazenamento indisponível */ }
  return linha;
}
