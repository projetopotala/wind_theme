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
import { classificarOrigem } from "../supabase/ambiente.js";

export const TIPOS_DE_INTERESSE = Object.freeze(["curso", "experiencia-cultural", "retorno-recepcao"]);

let restPadrao = null;

export function montarInteresse({ kind, subject = "", details = {}, page = "" } = {}) {
  if (!TIPOS_DE_INTERESSE.includes(kind)) throw new TypeError("Tipo de interesse desconhecido.");
  return {
    kind,
    subject: String(subject || "").trim().slice(0, 160),
    details: details && typeof details === "object" && !Array.isArray(details) ? details : {},
    page: String(page || globalThis.location?.pathname || "").slice(0, 200),
  };
}

export async function enviarInteresse(interesse, { rest } = {}) {
  const linha = montarInteresse(interesse);
  if (!rest && classificarOrigem(globalThis.location?.origin || "") === "desconhecido") throw new Error("Envio indisponível nesta Preview.");
  restPadrao ||= rest ? null : (await import("../supabase/rest.js")).criarRestPublico();
  await (rest || restPadrao).inserir("site_interests", linha);
  return linha;
}
