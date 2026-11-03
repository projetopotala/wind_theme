/*
 * CHAT PRIVADO DA SALA.
 *
 * Todo texto entra no DOM por `textContent`, nunca como marcação. O banco
 * autoriza cada leitura e escrita; aqui só se consulta com intervalo.
 */
import { erroDeRede, mensagemDeErro } from "./estado-sala.js";

export const LIMITE_DA_MENSAGEM = 1000;

export function normalizarMensagem(texto) {
  // eslint-disable-next-line no-control-regex
  const limpo = String(texto ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  return limpo.length >= 1 && [...limpo].length <= LIMITE_DA_MENSAGEM ? limpo : null;
}

export function criarChat({ lista, formulario, campo, aviso, listar, enviar, documento = globalThis.document,
  agendar = (fn, ms) => globalThis.setTimeout(fn, ms), cancelar = (id) => globalThis.clearTimeout(id),
  intervalo = 3000, aoPerder = () => {}, aoRecuperar = () => {}, aoEncerrar = () => {} } = {}) {
  let ultimo = 0, timer = null, parado = false, offline = false;

  function desenhar(m) {
    const item = documento.createElement("li");
    item.className = `sala-msg sala-msg--${m.mine ? "minha" : "outra"}`;
    const quem = documento.createElement("span");
    quem.className = "sala-msg-autor";
    quem.textContent = m.mine ? "Você" : (m.role === "professional" ? "Profissional" : "Cliente");
    const corpo = documento.createElement("p");
    corpo.textContent = String(m.body ?? "");
    item.append(quem, corpo);
    lista.append(item);
  }

  async function rodada() {
    if (parado) return;
    try {
      const novas = await listar(ultimo);
      for (const m of Array.isArray(novas) ? novas : []) { desenhar(m); ultimo = Math.max(ultimo, Number(m.id) || 0); }
      if (offline) { offline = false; aoRecuperar(); }
    } catch (erro) {
      if (erroDeRede(erro)) { if (!offline) { offline = true; aoPerder(); } }
      else { parado = true; aviso.textContent = mensagemDeErro(erro); aoEncerrar(erro); return; }
    }
    if (!parado) timer = agendar(rodada, offline ? intervalo * 2 : intervalo);
  }

  async function agora() { cancelar(timer); await rodada(); }

  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const texto = normalizarMensagem(campo.value);
    if (!texto) { aviso.textContent = "Escreva uma mensagem de até 1000 caracteres."; return; }
    aviso.textContent = "";
    try { await enviar(texto); campo.value = ""; await agora(); }
    catch (erro) { aviso.textContent = mensagemDeErro(erro); }
  });

  return {
    iniciar() { parado = false; return rodada(); },
    parar() { parado = true; cancelar(timer); },
    get ultimo() { return ultimo; },
  };
}
