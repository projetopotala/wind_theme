/*
 * Aplica o conteúdo editado SOBRE a página real, elemento por elemento.
 *
 * Nada aqui monta HTML a partir de texto: o texto entra por nó de texto/textContent, o link por setAttribute
 * (só depois de passar pelas mesmas regras do banco) e a imagem por src/alt/object-position. Elemento que não
 * existe mais na página é ignorado sem erro: o site nunca quebra por causa de um conteúdo antigo.
 */
import { validarLink, validarImagemUrl } from "./validar.js";

const NOS_TEXTO = 3;

function primeiroNoDeTexto(el) {
  for (const no of el.childNodes || []) if (no.nodeType === NOS_TEXTO && String(no.nodeValue || "").trim()) return no;
  return null;
}

/** Troca só o texto, preservando ícones/setas decorativas que acompanham o elemento. */
export function definirTexto(el, texto) {
  const no = primeiroNoDeTexto(el);
  if (!no) { el.textContent = texto; return; }
  const valor = String(no.nodeValue);
  const antes = valor.match(/^\s*/)[0];
  const depois = valor.match(/\s*$/)[0];
  no.nodeValue = `${antes}${texto}${depois}`;
}

export function lerTexto(el) {
  const no = primeiroNoDeTexto(el);
  return String(no ? no.nodeValue : el.textContent || "").replace(/\s+/g, " ").trim();
}

function aplicarImagem(el, valor, original) {
  if (valor.src && !validarImagemUrl(valor.src)) {
    if (el.getAttribute("src") !== valor.src) {
      el.setAttribute("src", valor.src);
      el.removeAttribute("srcset");
      el.removeAttribute("sizes");
      const pai = el.parentElement;
      if (pai?.tagName === "PICTURE") for (const fonte of [...pai.querySelectorAll("source")]) fonte.remove();
    }
  } else if (!valor.src && original.src && el.getAttribute("src") !== original.src) {
    el.setAttribute("src", original.src);
  }
  if (typeof valor.alt === "string") el.setAttribute("alt", valor.alt);
  else el.setAttribute("alt", original.alt ?? "");
  if (el.style) el.style.objectPosition = valor.pos || "";
}

/**
 * Aplica o conteúdo a todos os elementos do manifesto: os que têm alteração recebem o valor novo e os demais
 * voltam ao original. Serve igualmente para a página pública, a prévia do editor e a visualização do histórico.
 */
export function aplicarConteudo(doc, manifesto, conteudo = {}, { marcar = false, paginasConhecidas = null } = {}) {
  let aplicados = 0;
  for (const item of manifesto?.elementos || []) {
    let el;
    try { el = doc.querySelector(item.seletor); } catch { el = null; }
    if (!el) continue;
    if (marcar) {
      el.setAttribute("data-es-chave", item.chave);
      el.setAttribute("data-es-tipo", item.tipo);
    }
    const valor = (conteudo && conteudo[item.chave]) || {};
    if (item.tipo === "imagem") {
      aplicarImagem(el, valor, item.original);
    } else {
      definirTexto(el, typeof valor.text === "string" && valor.text.trim() ? valor.text : item.original.text);
      if (item.tipo === "botao") {
        const destino = typeof valor.href === "string" && !validarLink(valor.href, { paginasConhecidas }) ? valor.href : item.original.href;
        if (el.getAttribute("href") !== destino) el.setAttribute("href", destino);
        if (/^https:/i.test(destino)) el.setAttribute("rel", "noopener noreferrer");
      }
    }
    if (valor && Object.keys(valor).length) aplicados += 1;
  }
  return aplicados;
}

/** Valor efetivo de um elemento: o que está na página agora (original + alterações). */
export function valorEfetivo(item, conteudo = {}) {
  const alt = (conteudo && conteudo[item.chave]) || {};
  return { ...item.original, ...alt };
}
