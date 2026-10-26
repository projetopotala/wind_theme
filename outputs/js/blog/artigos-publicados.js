/*
 * CARTÕES QUE REPRESENTAM TEXTOS DO BLOG, FORA DO BLOG.
 *
 * A Home (novidades), o Meu Potala ("Para você") e as indicações "No Blog" das
 * outras seções mostram títulos de textos do Blog. Quem decide se um texto
 * está no ar é o banco: um cartão de artigo só aparece se o banco confirmar
 * que ele está publicado agora. Retirado do ar, arquivado, agendado para o
 * futuro, inexistente — ou o banco sem responder — e o cartão some. Cartões
 * que não levam a um artigo (seções, páginas) não passam por aqui.
 */
import { criarBlogPublico } from "./blog-remoto.js";
import { criarRestPublico } from "../supabase/rest.js";

/* O endereço do texto em artigo.html?post=<slug>, ou "" se o link não é de artigo. */
export function slugDoArtigo(href) {
  try {
    const url = new URL(String(href ?? ""), "https://potala.invalid/");
    if (!/(^|\/)artigo\.html$/.test(url.pathname)) return "";
    return url.searchParams.get("post") || "";
  } catch {
    return "";
  }
}

/*
 * Mantém os itens que não são artigo e os artigos confirmados. Sem
 * confirmação (publicados === null), nenhum artigo passa.
 */
export function soArtigosConfirmados(itens, publicados, hrefDe = (item) => item?.href) {
  const slugs = Array.isArray(publicados) ? new Set(publicados.map((post) => post.slug)) : null;
  return (Array.isArray(itens) ? itens : []).filter((item) => {
    const slug = slugDoArtigo(hrefDe(item));
    return !slug || Boolean(slugs?.has(slug));
  });
}

export const ESPERA_DA_CONFIRMACAO = 6000;
let emCurso = null;

/*
 * Os textos publicados, uma leitura por página. Devolve null quando não foi
 * possível confirmar (falha ou demora): quem chama esconde os artigos.
 */
export function lerArtigosPublicados({ blog, espera = ESPERA_DA_CONFIRMACAO, novaLeitura = false } = {}) {
  if (emCurso && !novaLeitura && !blog) return emCurso;
  const fonte = blog || criarBlogPublico({ rest: criarRestPublico(), aoFalhar: (erro) => console.warn("Não foi possível confirmar os textos publicados do Blog.", erro) });
  let relogio;
  const prazo = new Promise((resolver) => { relogio = setTimeout(() => resolver(null), espera); });
  const leitura = Promise.race([fonte.listarPublicados().catch(() => null), prazo]).finally(() => clearTimeout(relogio));
  if (!blog) emCurso = leitura;
  return leitura;
}

/* Um repositório da Home cuja leitura só devolve artigos confirmados. */
export function comArtigosConfirmados(repositorio, ler = () => lerArtigosPublicados()) {
  return {
    ...repositorio,
    async list(opcoes) {
      const [blocos, publicados] = await Promise.all([repositorio.list(opcoes), ler()]);
      return soArtigosConfirmados(blocos, publicados);
    },
  };
}
