import { CATEGORIAS, dataLegivel } from "./blog-data.js";
import { normalizePost, normalizePosts } from "./blog-model.js";
import { marcarTextoEmLinha } from "../shared/markdown.js";
import { enderecoSeguro, imagemSegura, normalizarVideo } from "./blog-conteudo.js";
import { hrefDoEscritor } from "./escritores.js";

const escapeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function findPostBySlug(posts, slug, { preview = false } = {}) {
  return normalizePosts(posts).find((post) => post.slug === String(slug || "")
    && (preview || post.status === "published")) || null;
}

/*
 * O endereço de vídeo vira player só para YouTube e Vimeo, montado a partir do
 * identificador (blog-conteudo.js). Qualquer outro endereço vira, no máximo, um
 * link comum http(s): um iframe com URL arbitrária carregaria qualquer página
 * dentro do Caderno.
 */
export const enderecoDoVideo = normalizarVideo;

const legenda = (caption) => (caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : "");

const COM_TEXTO = new Set(["paragraph", "heading", "quote", "callout"]);

export function renderArticleBlock(block = {}) {
  /* Bloco vazio não vira buraco na página: o editor pode ter deixado um para depois. */
  if (COM_TEXTO.has(block.type) && !String(block.text ?? "").trim()) return "";
  const inline = marcarTextoEmLinha(block.text);
  if (block.type === "paragraph") {
    const classes = ["article-paragraph", block.align === "center" ? "article-paragraph--centro" : "", block.size === "lead" ? "article-paragraph--abertura" : ""].filter(Boolean).join(" ");
    return `<p class="${classes}">${inline}</p>`;
  }
  if (block.type === "heading") {
    return Number(block.level) === 3 ? `<h3 class="article-subheading">${escapeHtml(block.text)}</h3>` : `<h2 class="article-heading">${escapeHtml(block.text)}</h2>`;
  }
  if (block.type === "quote") return `<blockquote class="article-quote"><p>${inline}</p>${block.cite ? `<cite>${escapeHtml(block.cite)}</cite>` : ""}</blockquote>`;
  if (block.type === "callout") return `<aside class="article-destaque article-destaque--${escapeHtml(block.tone || "nota")}"><p>${inline}</p></aside>`;
  if (block.type === "image" && (!block.src || !imagemSegura(block.src))) return "";
  if (block.type === "image") return `<figure class="article-figure${block.width === "full" ? " article-figure--total" : ""}"><img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.alt)}" loading="lazy" decoding="async">${legenda(block.caption)}</figure>`;
  if (block.type === "gallery") {
    const imagens = (block.images || []).filter((image) => imagemSegura(image.src)).map((image) => `<img src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt)}" loading="lazy" decoding="async">`).join("");
    return imagens ? `<figure class="article-galeria"><div class="article-galeria__grade">${imagens}</div>${legenda(block.caption)}</figure>` : "";
  }
  if (block.type === "video") {
    const video = normalizarVideo(block.url);
    if (!video) {
      const href = /^https?:\/\//i.test(String(block.url || "")) && enderecoSeguro(block.url) ? block.url : "";
      return href ? `<p class="article-paragraph"><a href="${escapeHtml(href)}" rel="noopener noreferrer">Assistir ao vídeo</a></p>` : "";
    }
    /*
     * Nenhum pedido ao provedor até o leitor pedir: o botão só vira player ao
     * clicar (article-video.js). Sem script, o link "Abrir no ..." continua.
     */
    const titulo = block.caption || "Vídeo";
    return `<figure class="article-video" data-video-tipo="${video.tipo}"><div class="article-video__quadro" data-video-quadro><button type="button" class="article-video__abrir" data-video-src="${escapeHtml(video.src)}" data-video-titulo="${escapeHtml(titulo)}" aria-label="Assistir ao vídeo: ${escapeHtml(titulo)}. Carrega o player do ${video.rotulo}."><span class="article-video__play" aria-hidden="true"></span><span class="article-video__texto">Assistir ao vídeo</span><small>Carrega o player do ${video.rotulo}</small></button></div>${legenda(block.caption)}<p class="article-video__aviso">O player do ${video.rotulo} só é carregado quando você clica em assistir, e pode usar cookies. <a href="${escapeHtml(video.abrir)}" target="_blank" rel="noopener noreferrer">Abrir no ${video.rotulo}</a>. Se o vídeo não aparecer, ele pode estar privado ou não permitir incorporação.</p></figure>`;
  }
  if (block.type === "list") {
    const tag = block.ordered ? "ol" : "ul";
    if (!(block.items || []).some((item) => String(item).trim())) return "";
    return `<${tag} class="article-list${block.ordered ? " article-list--numerada" : ""}">${(block.items || []).map((item) => `<li>${marcarTextoEmLinha(item)}</li>`).join("")}</${tag}>`;
  }
  if (block.type === "divider") return '<hr class="article-divider">';
  return "";
}

/* O rótulo vem das categorias do banco quando a página já as carregou; senão, da lista empacotada. */
let categoriasConhecidas = CATEGORIAS;
export function definirCategorias(lista) {
  if (Array.isArray(lista) && lista.length) categoriasConhecidas = lista;
}

export function rotuloDaCategoria(id) {
  return categoriasConhecidas.find((item) => item.id === id)?.rotulo
    || CATEGORIAS.find((item) => item.id === id)?.rotulo
    || String(id || "");
}

/* "Também no Portal": só endereços de páginas do próprio site. */
function portalRelacionado(links = []) {
  const seguros = links.filter((link) => /^[a-z0-9-]+\.html(?:[?#][\w=&%#-]*)?$/i.test(link.href));
  if (!seguros.length) return "";
  return `<nav class="article-portal" aria-label="Também no Portal"><p class="article-portal__titulo">Também no Portal</p>${seguros.map((link) => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.titulo)}</a>`).join("")}</nav>`;
}

export function renderArticle(post) {
  if (!post) return "";
  const item = normalizePost(post);
  const date = dataLegivel(item.publishedAt);
  /* A assinatura leva à página pública do escritor (P2A). */
  const autor = item.author ? `<span>Por <a class="article-autor" href="${escapeHtml(hrefDoEscritor(item.author))}">${escapeHtml(item.author)}</a></span>` : "";
  return `<header class="article-hero">
    <img src="${escapeHtml(imagemSegura(item.cover) ? item.cover : "")}" alt="${escapeHtml(item.coverAlt)}">
    <div class="article-hero__veil" aria-hidden="true"></div>
    <div class="article-hero__copy">
      <p>${escapeHtml(rotuloDaCategoria(item.category))}</p>
      <h1>${escapeHtml(item.title)}</h1>
      <p class="article-subtitle">${escapeHtml(item.subtitle || item.excerpt)}</p>
      <p class="article-meta">${autor}<time datetime="${escapeHtml(date.iso)}">${escapeHtml(date.texto)}</time><span>${item.readingMinutes} min de leitura</span></p>
    </div>
  </header>
  <div class="article-content">${item.content.map(renderArticleBlock).join("")}${portalRelacionado(item.relatedPortal)}</div>
  <div class="article-fecho" aria-hidden="true"><img src="media/potala-mark-transparent.png" alt="" width="86" height="70" loading="lazy"></div>`;
}
