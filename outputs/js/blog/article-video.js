/*
 * O PLAYER SÓ EXISTE DEPOIS DO CLIQUE.
 *
 * A página do artigo mostra um botão no lugar do vídeo: nenhum pedido vai ao
 * YouTube ou ao Vimeo (e nenhum cookie deles é gravado) até o leitor decidir
 * assistir. O clique é a escolha explícita do leitor, e o player entra já em
 * reprodução. Quem não quiser carregar o player usa o link "Abrir no ...".
 *
 * O endereço do botão vem do HTML, então é conferido de novo aqui: só os dois
 * formatos de player que o renderizador sabe montar.
 */
const PLAYER_PERMITIDO = /^https:\/\/(?:www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{11}|player\.vimeo\.com\/video\/\d{5,12}(?:\?h=[A-Za-z0-9]{6,20})?)$/;

export const enderecoDoPlayer = (src) => (PLAYER_PERMITIDO.test(String(src || "")) ? `${src}${String(src).includes("?") ? "&" : "?"}autoplay=1` : "");

export function ativarVideos(raiz, documento = globalThis.document) {
  raiz?.addEventListener("click", (event) => {
    const botao = event.target?.closest?.("[data-video-src]");
    if (!botao || !raiz.contains(botao)) return;
    const quadro = botao.closest("[data-video-quadro]");
    const src = enderecoDoPlayer(botao.dataset.videoSrc);
    if (!quadro || !src) return;
    const player = documento.createElement("iframe");
    player.src = src;
    player.title = botao.dataset.videoTitulo || "Vídeo";
    player.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    player.referrerPolicy = "strict-origin-when-cross-origin";
    player.allowFullscreen = true;
    quadro.replaceChildren(player);
    quadro.dataset.videoAtivo = "true";
    player.focus();
  });
}
