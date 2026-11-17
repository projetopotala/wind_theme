/*
 * Regras de conteúdo do "Editar site", as mesmas que o banco aplica (site_validate_content).
 *
 * Sem DOM e sem rede, de propósito: é o que decide se um texto, link ou imagem pode ir para o ar, e o navegador
 * só adianta o aviso — quem recusa de verdade é o banco. Texto nunca vira HTML: o site aplica com textContent.
 */

export const LIMITE_TEXTO = 2000;
export const LIMITE_ALT = 300;
export const LIMITE_IMAGEM_BYTES = 5 * 1024 * 1024;
export const TIPOS_IMAGEM = Object.freeze({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" });
export const CAMPOS = Object.freeze(["text", "href", "src", "alt", "pos"]);

const CONTROLE = /\p{Cc}/u;
const HREF_HTTPS = /^https:\/\/[^\s"<>]+$/i;
const HREF_PAGINA = /^[a-z0-9][a-z0-9._/-]*\.html(?:[?#][^\s"<>]*)?$/i;
const HREF_ANCORA = /^#[a-z0-9_-]+$/i;
const SRC_HTTPS = /^https:\/\/[^\s"<>]+$/i;
const SRC_LOCAL = /^[a-z0-9][a-z0-9._/-]*\.(?:avif|jpe?g|png|webp)$/i;
const POS = /^\d{1,3}% \d{1,3}%$/;
const CHAVE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const POSICOES = Object.freeze([
  ["0% 0%", "Canto superior esquerdo"], ["50% 0%", "Parte de cima"], ["100% 0%", "Canto superior direito"],
  ["0% 50%", "Lado esquerdo"], ["50% 50%", "Centro"], ["100% 50%", "Lado direito"],
  ["0% 100%", "Canto inferior esquerdo"], ["50% 100%", "Parte de baixo"], ["100% 100%", "Canto inferior direito"],
]);

export function validarTexto(valor) {
  const texto = String(valor ?? "");
  if (!texto.trim()) return "Escreva um texto. O campo não pode ficar vazio.";
  if (texto.length > LIMITE_TEXTO) return `O texto passa de ${LIMITE_TEXTO} caracteres.`;
  if (CONTROLE.test(texto)) return "O texto tem caracteres que não podem ser usados.";
  return "";
}

/** @param {Iterable<string>} paginasConhecidas arquivos .html que existem no Portal */
export function validarLink(valor, { paginasConhecidas = null } = {}) {
  const link = String(valor ?? "").trim();
  if (!link) return "Informe o endereço do link.";
  if (link.length > 500 || CONTROLE.test(link)) return "Esse endereço não é válido.";
  if (HREF_HTTPS.test(link)) {
    try { new URL(link); } catch { return "Esse endereço não é válido."; }
    return "";
  }
  if (HREF_ANCORA.test(link)) return "";
  if (HREF_PAGINA.test(link)) {
    if (paginasConhecidas) {
      const arquivo = link.split(/[?#]/)[0];
      if (![...paginasConhecidas].includes(arquivo)) return "Essa página não existe no Portal. Confira o endereço.";
    }
    return "";
  }
  return "Use um endereço que comece com https://, uma página do Portal (exemplo: travessia.html) ou um trecho da página (exemplo: #historia).";
}

export function descreverDestino(valor, { rotulos = {} } = {}) {
  const link = String(valor ?? "").trim();
  if (HREF_ANCORA.test(link)) return `Trecho desta página (${link})`;
  if (HREF_PAGINA.test(link)) {
    const arquivo = link.split(/[?#]/)[0];
    return `Página do Portal: ${rotulos[arquivo] || arquivo}`;
  }
  if (HREF_HTTPS.test(link)) { try { return `Site externo: ${new URL(link).hostname}`; } catch { /* já validado antes */ } }
  return "";
}

export function validarImagemUrl(valor) {
  const src = String(valor ?? "").trim();
  if (!src || src.length > 500 || CONTROLE.test(src)) return "Imagem inválida.";
  if (src.split("/").includes("..")) return "Imagem inválida.";
  if (SRC_HTTPS.test(src) || SRC_LOCAL.test(src)) return "";
  return "Imagem inválida.";
}

export function validarArquivoImagem(arquivo) {
  if (!arquivo) return "Escolha uma imagem.";
  if (!TIPOS_IMAGEM[arquivo.type]) return "Use uma imagem JPG, PNG, WebP ou AVIF.";
  if (arquivo.size > LIMITE_IMAGEM_BYTES) return "A imagem passa de 5 MB. Reduza o tamanho e tente de novo.";
  if (arquivo.size <= 0) return "O arquivo está vazio.";
  return "";
}

export function validarAlt(valor) {
  const alt = String(valor ?? "");
  if (alt.length > LIMITE_ALT) return `O texto alternativo passa de ${LIMITE_ALT} caracteres.`;
  if (CONTROLE.test(alt)) return "O texto alternativo tem caracteres que não podem ser usados.";
  return "";
}

/** Erro de um conjunto de campos de UM elemento ("" quando está tudo certo). */
export function validarCampos(campos = {}, opcoes = {}) {
  for (const campo of Object.keys(campos)) {
    if (!CAMPOS.includes(campo)) return "Campo não permitido.";
    if (typeof campos[campo] !== "string") return "Valor inválido.";
  }
  if ("text" in campos) { const erro = validarTexto(campos.text); if (erro) return erro; }
  if ("href" in campos) { const erro = validarLink(campos.href, opcoes); if (erro) return erro; }
  if ("src" in campos) { const erro = validarImagemUrl(campos.src); if (erro) return erro; }
  if ("alt" in campos) { const erro = validarAlt(campos.alt); if (erro) return erro; }
  if ("pos" in campos && !POS.test(campos.pos)) return "Enquadramento inválido.";
  return "";
}

/** Conteúdo inteiro (chave -> campos); devolve a lista de erros por chave. */
export function validarConteudo(conteudo, opcoes = {}) {
  const erros = [];
  if (!conteudo || typeof conteudo !== "object" || Array.isArray(conteudo)) return [{ chave: "", erro: "Conteúdo inválido." }];
  const chaves = Object.keys(conteudo);
  if (chaves.length > 150) erros.push({ chave: "", erro: "Alterações demais em uma página." });
  for (const chave of chaves) {
    if (!CHAVE.test(chave) || !conteudo[chave] || typeof conteudo[chave] !== "object" || Array.isArray(conteudo[chave])) {
      erros.push({ chave, erro: "Elemento inválido." });
      continue;
    }
    const erro = validarCampos(conteudo[chave], opcoes);
    if (erro) erros.push({ chave, erro });
  }
  return erros;
}
