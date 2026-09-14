/*
 * ESCAPAR TUDO QUE VEM DE FORA ANTES DE VIRAR HTML.
 *
 * O painel e o Meu Potala montam a tela com strings. Nome, título de salvo,
 * cidade e bio vêm da própria pessoa — ou do banco, que pode ter recebido
 * qualquer coisa. Sem escapar, um nome como <img onerror=...> executaria código
 * na área pessoal de quem o cadastrou, e em qualquer lugar onde ele aparecer.
 */

const ENTIDADES = Object.freeze({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" });

export function escaparHtml(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (letra) => ENTIDADES[letra]);
}
