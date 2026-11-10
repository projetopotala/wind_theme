/*
 * O QUE UM TEXTO DO BLOG PODE CONTER.
 *
 * Uma regra só, escrita uma vez, para três lugares: o editor (avisa antes de
 * publicar), a página pública (nunca imprime o que não reconhece) e o banco
 * (supabase/migrations/202611100001_blog_validacao_de_conteudo.sql, o ponto
 * confiável de gravação, que repete estas mesmas regras em SQL; os testes
 * rodam os dois lado a lado com os mesmos casos).
 *
 * O Blog guarda dados, nunca HTML. Vídeo é um endereço de YouTube ou Vimeo que
 * vira player a partir do identificador; não existe campo para iframe.
 */

/* ---------- vídeo ---------- */

/*
 * Só estes provedores, só estes formatos de endereço. Os identificadores são
 * conferidos por inteiro (11 caracteres no YouTube, dígitos no Vimeo), e o
 * endereço precisa começar no provedor: "youtube.com.exemplo.com" não passa e
 * um endereço com usuário ou senha na frente também não.
 */
const YOUTUBE = /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^#\s]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/|youtube-nocookie\.com\/embed\/)([A-Za-z0-9_-]{11})(?:[&?#/]\S*)?$/;
const VIMEO = /^(?:https?:\/\/)?(?:(?:www\.)?vimeo\.com\/(\d{5,12})(?:\/([A-Za-z0-9]{6,20}))?|player\.vimeo\.com\/video\/(\d{5,12}))(?:[?#]\S*)?$/;
const HASH_DO_PLAYER = /[?&]h=([A-Za-z0-9]{6,20})(?:&|#|$)/;

export const PROVEDORES_DE_VIDEO = Object.freeze({ youtube: "YouTube", vimeo: "Vimeo" });

/** O vídeo reconhecido ({ tipo, id, src do player, endereço para abrir, rótulo }) ou null. */
export function normalizarVideo(url) {
  const texto = String(url ?? "").trim();
  if (!texto || texto.length > 300) return null;
  const youtube = YOUTUBE.exec(texto);
  if (youtube) {
    const id = youtube[1];
    return { tipo: "youtube", id, src: `https://www.youtube-nocookie.com/embed/${id}`, abrir: `https://www.youtube.com/watch?v=${id}`, rotulo: "YouTube" };
  }
  const vimeo = VIMEO.exec(texto);
  if (vimeo) {
    const id = vimeo[1] || vimeo[3];
    const hash = vimeo[2] || HASH_DO_PLAYER.exec(texto)?.[1] || "";
    return {
      tipo: "vimeo", id, src: `https://player.vimeo.com/video/${id}${hash ? `?h=${hash}` : ""}`,
      abrir: `https://vimeo.com/${id}${hash ? `/${hash}` : ""}`, rotulo: "Vimeo",
    };
  }
  return null;
}

/* ---------- endereços ---------- */

/*
 * Link: http(s) ou caminho do próprio site. Esquema executável (javascript:,
 * data:, vbscript:, blob:), "//" (outro site sem esquema), espaço, aspas e
 * sinais de tag não passam.
 */
export function enderecoSeguro(valor) {
  const texto = String(valor ?? "");
  if (!texto) return true;
  if (/[\s<>"\\]/.test(texto)) return false;
  if (/^https?:\/\/\S+$/i.test(texto)) return true;
  return !/^[^/?#]*:/.test(texto) && !texto.startsWith("//");
}

/* Imagem: https ou arquivo do próprio site (media/..., /media/...). Nunca http solto, data: ou javascript:. */
export function imagemSegura(valor) {
  const texto = String(valor ?? "");
  if (!texto) return true;
  if (/^https:\/\/\S+$/i.test(texto) && !/[<>"\\]/.test(texto)) return true;
  return enderecoSeguro(texto) && !/^https?:/i.test(texto) && !texto.startsWith("#");
}

/* ---------- o documento ---------- */

/* Campo de imagem: texto (ou ausente) e endereço seguro. Número, objeto e afins não passam. */
const imagemValida = (valor) => (valor === undefined || valor === null || typeof valor === "string") && imagemSegura(valor);

export const TIPOS_DE_BLOCO_PERMITIDOS = Object.freeze(["paragraph", "heading", "image", "gallery", "quote", "callout", "video", "list", "divider"]);
export const LIMITES_DO_CONTEUDO = Object.freeze({ blocos: 300, texto: 20000, itens: 40, fotos: 12 });

const TAG_PERIGOSA = /<\s*\/?\s*(?:script|iframe|object|embed|style|link|meta|svg|math|form|base)\b/i;
const LINK_NA_MARCA = /\]\(((?:[^()\s]|\([^()\s]*\))*)\)/g;
const CAMPOS_DE_TEXTO = ["text", "caption", "cite", "alt"];

function problemaNoTexto(valor, onde) {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== "string") return `${onde}: o conteúdo precisa ser texto.`;
  if (valor.length > LIMITES_DO_CONTEUDO.texto) return `${onde}: texto longo demais.`;
  if (TAG_PERIGOSA.test(valor)) return `${onde}: o editor não aceita HTML. Escreva só o texto.`;
  for (const [, alvo] of valor.matchAll(LINK_NA_MARCA)) {
    if (!enderecoSeguro(alvo)) return `${onde}: há um link que não é um endereço http(s) ou do próprio site.`;
  }
  return null;
}

/**
 * Lista de problemas do texto (vazia = pode gravar). Com `publicacao`, vale
 * também o que o leitor vai ver: o vídeo precisa ser de um provedor permitido.
 * Rascunho e revisão aceitam um endereço de vídeo ainda não reconhecido (o
 * editor avisa), mas nunca um endereço executável.
 */
export function validarDocumento(documento, { publicacao = false } = {}) {
  if (documento === undefined || documento === null) return [];
  if (typeof documento !== "object" || Array.isArray(documento)) return ["Texto inválido."];
  const problemas = [];
  const anota = (mensagem) => { if (mensagem) problemas.push(mensagem); };
  if (!imagemValida(documento.cover)) anota("A capa precisa ser uma imagem https ou um arquivo do próprio site.");
  const blocos = documento.content;
  if (blocos === undefined || blocos === null) return problemas;
  if (!Array.isArray(blocos)) return [...problemas, "O conteúdo do texto está em formato inválido."];
  if (blocos.length > LIMITES_DO_CONTEUDO.blocos) return [...problemas, "O texto tem blocos demais."];
  blocos.forEach((bloco, indice) => {
    const onde = `Bloco ${indice + 1}`;
    if (!bloco || typeof bloco !== "object" || Array.isArray(bloco)) { anota(`${onde}: formato inválido.`); return; }
    if (!TIPOS_DE_BLOCO_PERMITIDOS.includes(bloco.type)) { anota(`${onde}: tipo de bloco desconhecido.`); return; }
    for (const campo of CAMPOS_DE_TEXTO) anota(problemaNoTexto(bloco[campo], onde));
    if (bloco.type === "image" && !imagemValida(bloco.src)) anota(`${onde}: a imagem precisa ser https ou um arquivo do próprio site.`);
    if (bloco.type === "gallery") {
      const fotos = bloco.images ?? [];
      if (!Array.isArray(fotos) || fotos.length > LIMITES_DO_CONTEUDO.fotos) anota(`${onde}: a galeria aceita até ${LIMITES_DO_CONTEUDO.fotos} fotos.`);
      else fotos.forEach((foto) => {
        if (!foto || typeof foto !== "object" || !imagemValida(foto.src)) anota(`${onde}: uma foto da galeria não é https nem arquivo do próprio site.`);
        else anota(problemaNoTexto(foto.alt, onde));
      });
    }
    if (bloco.type === "list") {
      const itens = bloco.items ?? [];
      if (!Array.isArray(itens) || itens.length > LIMITES_DO_CONTEUDO.itens) anota(`${onde}: a lista aceita até ${LIMITES_DO_CONTEUDO.itens} itens.`);
      else itens.forEach((item) => anota(problemaNoTexto(item, onde)));
    }
    if (bloco.type === "video") {
      const url = bloco.url ?? "";
      if (typeof url !== "string" || !enderecoSeguro(url)) anota(`${onde}: o endereço do vídeo não é seguro.`);
      else if (publicacao && url.trim() && !normalizarVideo(url)) anota(`${onde}: o vídeo precisa ser um link do YouTube ou do Vimeo.`);
    }
  });
  return problemas;
}
