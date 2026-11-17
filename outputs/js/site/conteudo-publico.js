/*
 * Conteúdo publicado do "Editar site" nas páginas públicas.
 *
 * O HTML da página continua sendo o texto de verdade (e o que buscadores e quem está sem JavaScript recebem).
 * Este módulo só busca a VERSÃO PUBLICADA — a única tabela que o público lê — e aplica por cima. Se a leitura
 * falhar, a página fica exatamente como o HTML a entregou. Dentro do editor (?editor-site=1) não faz nada: é o
 * editor que aplica o rascunho.
 */
import { criarRestPublico } from "../supabase/rest.js";
import { aplicarConteudo } from "./aplicar.js";
import { carregarManifesto } from "./paginas.js";

export async function iniciarConteudoPublico({ doc = document, localizacao = location, rest } = {}) {
  const marcador = doc.querySelector("script[data-site-pagina]");
  const slug = marcador?.getAttribute("data-site-pagina");
  if (!slug || new URLSearchParams(localizacao.search).has("editor-site")) return null;
  try {
    const cliente = rest || criarRestPublico();
    const linhas = await cliente.ler("site_pages_published", { page_slug: `eq.${slug}`, select: "version,content", limit: "1" });
    const publicado = Array.isArray(linhas) ? linhas[0] : null;
    if (!publicado?.content || !Object.keys(publicado.content).length) return null;
    const manifesto = await carregarManifesto(slug);
    aplicarConteudo(doc, manifesto, publicado.content);
    return publicado.version;
  } catch {
    return null;
  }
}

if (typeof document !== "undefined" && document.querySelector("script[data-site-pagina]")) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => void iniciarConteudoPublico(), { once: true });
  else void iniciarConteudoPublico();
}
