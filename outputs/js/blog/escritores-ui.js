/*
 * CARTÕES DE ESCRITOR - o mesmo cartão na página inicial do Caderno e no diretório.
 *
 * Só mostra o que é público: nome (assinatura ou nome do perfil visível), foto SÓ quando o
 * perfil cadastrou uma imagem aceita, iniciais no lugar dela, resumo da biografia
 * quando existe e a contagem real de textos publicados. Sem biografia ou foto o escritor
 * aparece do mesmo jeito: nada é inventado. Todo texto é escapado.
 */
import { hrefDoEscritor, imagemDePerfilSegura, iniciaisDoEscritor, resumoDaBio, slugDoEscritor } from "./escritores.js";

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const e = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

export const contagemDeTextos = (n) => (n === 1 ? "1 texto publicado" : `${n} textos publicados`);

function avatar(nome, perfil) {
  const imagem = imagemDePerfilSegura(perfil?.imagem);
  return imagem
    ? `<img class="escritor-cartao__foto" src="${e(imagem)}" alt="${e(perfil.imagemAlt || "")}" width="72" height="72" loading="lazy" decoding="async">`
    : `<span class="escritor-cartao__foto escritor-cartao__foto--iniciais" aria-hidden="true">${e(iniciaisDoEscritor(nome))}</span>`;
}

/* item: { slug, nome, total, temas }; perfil: do mapa de perfis visíveis, ou undefined. */
export function cartaoDoEscritor(item, perfil = null) {
  const nome = perfil?.nome || item.nome;
  const bio = resumoDaBio(perfil?.bio);
  const href = `escritor.html?nome=${encodeURIComponent(item.slug || slugDoEscritor(nome))}`;
  return `<li class="escritor-cartao">
    ${avatar(nome, perfil)}
    <div class="escritor-cartao__corpo">
      <h3 class="escritor-cartao__nome">${e(nome)}</h3>
      <p class="escritor-cartao__conta">${e(contagemDeTextos(item.total))}</p>
      ${bio ? `<p class="escritor-cartao__bio">${e(bio)}</p>` : ""}
      <a class="escritor-cartao__acao" href="${e(href)}" aria-label="Ver publicações de ${e(nome)}">Ver publicações</a>
    </div>
  </li>`;
}

export function cartoesDosEscritores(escritores = [], perfis = new Map()) {
  return escritores.map((item) => cartaoDoEscritor(item, perfis.get?.(item.slug) || null)).join("");
}

/* Reexporta para quem só precisa do endereço. */
export { hrefDoEscritor };
