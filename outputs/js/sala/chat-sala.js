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

// Hora local da mensagem (HH:MM); data inválida não mostra nada.
export function horaDaMensagem(valor) {
  const data = new Date(valor);
  if (!valor || Number.isNaN(data.getTime())) return null;
  return { iso: data.toISOString(), texto: data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) };
}

export function criarChat({ lista, formulario, campo, aviso, listar, enviar, vazio = null, botao = null, documento = globalThis.document,
  agendar = (fn, ms) => globalThis.setTimeout(fn, ms), cancelar = (id) => globalThis.clearTimeout(id),
  intervalo = 3000, aoPerder = () => {}, aoRecuperar = () => {}, aoEncerrar = () => {} } = {}) {
  let ultimo = 0, timer = null, parado = false, offline = false, enviando = false;
  if (vazio) vazio.hidden = false;

  function desenhar(m) {
    const item = documento.createElement("li");
    item.className = `sala-msg sala-msg--${m.mine ? "minha" : "outra"}`;
    const quem = documento.createElement("span");
    quem.className = "sala-msg-autor";
    quem.textContent = m.mine ? "Você" : (m.role === "professional" ? "Profissional" : "Cliente");
    const corpo = documento.createElement("p");
    corpo.textContent = String(m.body ?? "");
    item.append(quem, corpo);
    const hora = horaDaMensagem(m.created_at);
    if (hora) {
      const marca = documento.createElement("time");
      marca.className = "sala-msg-hora";
      marca.setAttribute("datetime", hora.iso);
      marca.textContent = hora.texto;
      item.append(marca);
    }
    // Só rola para o fim se a pessoa já estava lendo o fim (ou se a mensagem é dela).
    const noFim = typeof lista.scrollHeight !== "number" || lista.scrollHeight - lista.scrollTop - lista.clientHeight < 80;
    lista.append(item);
    if (vazio) vazio.hidden = true;
    if ((noFim || m.mine) && typeof lista.scrollHeight === "number") lista.scrollTop = lista.scrollHeight;
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

  const marcarEnvio = (ativo) => {
    enviando = ativo;
    if (!botao) return;
    botao.disabled = ativo;
    botao.setAttribute("aria-busy", String(ativo));
    if (botao.rotulo) botao.rotulo.textContent = ativo ? "Enviando…" : "Enviar";
  };
  async function submeter(evento) {
    evento?.preventDefault?.();
    if (enviando) return;
    const texto = normalizarMensagem(campo.value);
    if (!texto) { aviso.textContent = "Escreva uma mensagem de até 1000 caracteres."; return; }
    aviso.textContent = "";
    marcarEnvio(true);
    try { await enviar(texto); campo.value = ""; await agora(); }
    catch (erro) { aviso.textContent = `Não enviada. ${mensagemDeErro(erro)}`; } // o texto continua no campo
    finally { marcarEnvio(false); }
  }
  formulario.addEventListener("submit", submeter);
  // Enter envia; Shift+Enter quebra a linha (e a composição de teclado IME não envia).
  campo.addEventListener?.("keydown", (evento) => {
    if (evento.key === "Enter" && !evento.shiftKey && !evento.isComposing) { evento.preventDefault(); submeter(); }
  });

  return {
    iniciar() { parado = false; return rodada(); },
    parar() { parado = true; cancelar(timer); },
    get ultimo() { return ultimo; },
  };
}
