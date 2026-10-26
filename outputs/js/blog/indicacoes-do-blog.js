/*
 * AS INDICAÇÕES "NO BLOG" DAS SEÇÕES.
 *
 * Os links para textos do Blog escritos no HTML nascem escondidos (CSS) e só
 * aparecem os que o banco confirma como publicados agora. Sem confirmação, a
 * lista e o rótulo "No Blog" ficam fora da página.
 */
import { lerArtigosPublicados, slugDoArtigo } from "./artigos-publicados.js";

export async function confirmarIndicacoes(documento = document, ler = () => lerArtigosPublicados()) {
  const listas = [...documento.querySelectorAll(".conexao__blog")];
  if (!listas.length) return 0;
  const publicados = await ler();
  const slugs = new Set((publicados || []).map((post) => post.slug));
  let mostrados = 0;
  for (const lista of listas) {
    let algum = false;
    for (const link of lista.querySelectorAll("a.conexao__artigo")) {
      if (!slugs.has(slugDoArtigo(link.getAttribute("href")))) continue;
      link.dataset.artigoConfirmado = "";
      algum = true;
      mostrados += 1;
    }
    if (algum) lista.dataset.blogConfirmado = "";
  }
  return mostrados;
}

if (typeof document !== "undefined") confirmarIndicacoes(document);
