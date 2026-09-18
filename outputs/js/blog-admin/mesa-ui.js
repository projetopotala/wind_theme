/*
 * AS PEÇAS DE INTERFACE DA MESA — uma de cada, usadas em todas as telas:
 * aviso (toast), confirmação, menu "⋯" e paleta de comandos.
 */
import { icone } from "../admin/icones.js";

export const esc = (valor) => String(valor ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ------------------------------------------------------------------
 * Avisos
 * ------------------------------------------------------------------ */

export function criarAvisos(raiz) {
  return {
    /* tipo: "ok" | "erro" | "info". Erro fica até ser fechado ou até a ação ser refeita. */
    mostrar(texto, { tipo = "ok", acao = null, duracao = tipo === "erro" ? 0 : 3600 } = {}) {
      if (!raiz) return () => {};
      const aviso = raiz.ownerDocument.createElement("div");
      aviso.className = `mesa-aviso mesa-aviso--${tipo}`;
      aviso.setAttribute("role", tipo === "erro" ? "alert" : "status");
      aviso.innerHTML = `${icone(tipo === "erro" ? "circle-alert" : tipo === "info" ? "clock" : "check", { classe: "mesa-icone" })}<span>${esc(texto)}</span>`
        + (acao ? `<button type="button" class="mesa-aviso__acao">${esc(acao.rotulo)}</button>` : "")
        + `<button type="button" class="mesa-aviso__fechar" aria-label="Fechar aviso">${icone("x", { classe: "mesa-icone" })}</button>`;
      const fechar = () => aviso.remove();
      aviso.querySelector(".mesa-aviso__fechar").addEventListener("click", fechar);
      aviso.querySelector(".mesa-aviso__acao")?.addEventListener("click", () => { fechar(); acao.executar(); });
      raiz.append(aviso);
      if (duracao) setTimeout(fechar, duracao);
      return fechar;
    },
  };
}

/* ------------------------------------------------------------------
 * Confirmação — só para o que não tem volta
 * ------------------------------------------------------------------ */

export function criarConfirmacao(dialogo) {
  return function confirmar({ titulo, texto, confirmar = "Confirmar", perigo = false }) {
    if (!dialogo?.showModal) return Promise.resolve(globalThis.confirm?.(`${titulo}\n\n${texto}`) ?? false);
    dialogo.innerHTML = `<form method="dialog" class="mesa-confirmar">
        <h2>${esc(titulo)}</h2>
        <p>${esc(texto)}</p>
        <footer>
          <button type="submit" value="nao" class="mesa-botao mesa-botao--contorno">Cancelar</button>
          <button type="submit" value="sim" class="mesa-botao ${perigo ? "mesa-botao--perigo" : "mesa-botao--principal"}">${esc(confirmar)}</button>
        </footer>
      </form>`;
    dialogo.returnValue = "";
    dialogo.showModal();
    dialogo.querySelector('[value="nao"]')?.focus();
    return new Promise((resolver) => {
      dialogo.addEventListener("close", () => resolver(dialogo.returnValue === "sim"), { once: true });
    });
  };
}

/* ------------------------------------------------------------------
 * Menu "⋯"
 * ------------------------------------------------------------------ */

export function criarMenu(painel) {
  let origem = null;
  let aoEscolher = null;

  function fechar({ devolverFoco = false } = {}) {
    if (!painel || painel.hidden) return;
    painel.hidden = true;
    painel.innerHTML = "";
    origem?.setAttribute("aria-expanded", "false");
    if (devolverFoco) origem?.focus();
    origem = null;
  }

  /* itens: [{ id, rotulo, icone, perigo, desativado }] ou "separador" */
  function abrir(botao, itens, escolher) {
    if (origem === botao) { fechar({ devolverFoco: true }); return; }
    fechar();
    origem = botao;
    aoEscolher = escolher;
    painel.innerHTML = itens.map((item) => (item === "separador"
      ? '<hr role="separator">'
      : `<button type="button" role="menuitem" data-mesa-menu-item="${esc(item.id)}" class="${item.perigo ? "is-perigo" : ""}" ${item.desativado ? "disabled" : ""}>${icone(item.icone, { classe: "mesa-icone" })}<span>${esc(item.rotulo)}</span></button>`)).join("");
    painel.hidden = false;
    const caixa = botao.getBoundingClientRect();
    const largura = painel.offsetWidth || 220;
    const altura = painel.offsetHeight || 260;
    const esquerda = Math.max(8, Math.min(caixa.right - largura, innerWidth - largura - 8));
    const topo = caixa.bottom + altura + 8 > innerHeight ? Math.max(8, caixa.top - altura - 6) : caixa.bottom + 6;
    painel.style.left = `${esquerda}px`;
    painel.style.top = `${topo}px`;
    botao.setAttribute("aria-expanded", "true");
    painel.querySelector("[role=menuitem]:not([disabled])")?.focus();
  }

  painel?.addEventListener("click", (evento) => {
    const item = evento.target.closest("[data-mesa-menu-item]");
    if (!item || item.disabled) return;
    const escolher = aoEscolher;
    fechar({ devolverFoco: true });
    escolher?.(item.dataset.mesaMenuItem);
  });
  painel?.addEventListener("keydown", (evento) => {
    const itens = [...painel.querySelectorAll("[role=menuitem]:not([disabled])")];
    const atual = itens.indexOf(evento.target);
    if (evento.key === "Escape") { evento.preventDefault(); fechar({ devolverFoco: true }); }
    if (evento.key === "ArrowDown") { evento.preventDefault(); itens[(atual + 1) % itens.length]?.focus(); }
    if (evento.key === "ArrowUp") { evento.preventDefault(); itens[(atual - 1 + itens.length) % itens.length]?.focus(); }
    if (evento.key === "Tab") fechar();
  });
  painel?.ownerDocument.addEventListener("click", (evento) => {
    if (painel.hidden || painel.contains(evento.target) || origem?.contains(evento.target)) return;
    fechar();
  });

  return { abrir, fechar };
}

/* ------------------------------------------------------------------
 * Paleta de comandos (Ctrl/Cmd + K)
 * ------------------------------------------------------------------ */

const normalizar = (texto) => String(texto).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function criarPaleta(dialogo) {
  let comandos = [];
  let filtrados = [];
  let ativo = 0;

  function desenhar(termo = "") {
    const alvo = normalizar(termo);
    filtrados = comandos.filter((comando) => normalizar(`${comando.rotulo} ${comando.grupo || ""}`).includes(alvo));
    ativo = Math.min(ativo, Math.max(0, filtrados.length - 1));
    const lista = dialogo.querySelector("[data-paleta-lista]");
    lista.innerHTML = filtrados.length
      ? filtrados.map((comando, indice) => `<li><button type="button" data-paleta-indice="${indice}" class="${indice === ativo ? "is-ativo" : ""}" aria-selected="${indice === ativo}">
          ${icone(comando.icone, { classe: "mesa-icone" })}<span>${esc(comando.rotulo)}</span>${comando.atalho ? `<kbd>${esc(comando.atalho)}</kbd>` : ""}</button></li>`).join("")
      : '<li class="mesa-paleta__vazio">Nada encontrado.</li>';
  }

  function executar(indice) {
    const comando = filtrados[indice];
    if (!comando) return;
    dialogo.close();
    comando.executar();
  }

  dialogo?.addEventListener("input", (evento) => { ativo = 0; desenhar(evento.target.value); });
  dialogo?.addEventListener("click", (evento) => {
    const botao = evento.target.closest("[data-paleta-indice]");
    if (botao) executar(Number(botao.dataset.paletaIndice));
  });
  dialogo?.addEventListener("keydown", (evento) => {
    if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
      evento.preventDefault();
      ativo = (ativo + (evento.key === "ArrowDown" ? 1 : -1) + filtrados.length) % Math.max(1, filtrados.length);
      desenhar(dialogo.querySelector("input").value);
    }
    if (evento.key === "Enter") { evento.preventDefault(); executar(ativo); }
  });

  return {
    abrir(lista) {
      comandos = lista;
      ativo = 0;
      dialogo.innerHTML = `<div class="mesa-paleta__caixa">
          <label class="mesa-paleta__busca">${icone("command", { classe: "mesa-icone" })}<span class="sr-only">Comando</span><input type="text" placeholder="O que você quer fazer?" autocomplete="off"></label>
          <ul class="mesa-paleta__lista" data-paleta-lista role="listbox"></ul>
          <p class="mesa-paleta__dica"><kbd>↑</kbd><kbd>↓</kbd> escolher · <kbd>Enter</kbd> executar · <kbd>Esc</kbd> fechar</p>
        </div>`;
      desenhar();
      dialogo.showModal();
      dialogo.querySelector("input").focus();
    },
  };
}
