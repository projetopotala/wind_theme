/*
 * O BOTÃO DA CONTA.
 *
 * Um só desenho para os três lugares onde ele aparece: o canto da Travessia (no
 * lugar da antiga lupa), a barra das páginas da comunidade e o topo do Meu
 * Potala. Todos carregam `data-conta-gatilho`, e é por esse atributo — e não
 * por classe — que o painel os encontra. Assim a Home pode redesenhar a jornada
 * inteira sem que o botão perca o clique.
 */

import { escaparHtml } from "./html.js";

export const ICONE_DA_CONTA = "<svg class=\"conta-icone\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M12 12.2a4.1 4.1 0 1 0 0-8.2 4.1 4.1 0 0 0 0 8.2Zm0 1.8c-3.6 0-7.4 1.8-7.4 4.6V20h14.8v-1.4c0-2.8-3.8-4.6-7.4-4.6Z\"/></svg>";

export function marcacaoDoGatilho({ classe = "conta-gatilho" } = {}) {
  return `<button class="${escaparHtml(classe)}" type="button" data-conta-gatilho data-keeps-expansion
    aria-haspopup="dialog" aria-expanded="false" aria-label="Seu espaço no Potala">${ICONE_DA_CONTA}<span class="conta-iniciais" aria-hidden="true"></span></button>`;
}

/*
 * Garante que a página tenha um botão.
 *
 * A Home e o Meu Potala trazem o seu na marcação. Nas páginas da comunidade ele
 * entra na barra do topo, ao lado dos destinos. Nas demais seções, que não têm
 * barra, fica flutuando no canto superior direito — do lado oposto ao que a
 * Travessia usa, porque ali as seções costumam abrir com o título.
 */
export function garantirGatilho(documento = document) {
  const existente = documento.querySelector("[data-conta-gatilho]");
  if (existente) return existente;
  /* Na Home o botão chega com a jornada, desenhada depois da conta: criar um aqui daria dois. */
  if (documento.body?.dataset?.storyPage === "true") return null;
  const molde = documento.createElement("template");
  const barra = documento.querySelector(".site-nav");
  molde.innerHTML = marcacaoDoGatilho({
    classe: barra ? "conta-gatilho conta-gatilho-barra" : "conta-gatilho conta-gatilho-flutuante",
  }).trim();
  const botao = molde.content.firstElementChild;
  (barra || documento.body).append(botao);
  return botao;
}

export function atualizarGatilhos(documento, estado, { iniciais = "", nome = "", avatarUrl = null, naoLidas = 0 } = {}) {
  const autenticado = estado.status === "autenticado";
  for (const botao of documento.querySelectorAll("[data-conta-gatilho]")) {
    botao.dataset.contaEstado = estado.status;
    botao.setAttribute(
      "aria-label",
      autenticado
        ? `Seu espaço no Potala — ${nome}${naoLidas ? `, ${naoLidas} ${naoLidas === 1 ? "aviso novo" : "avisos novos"}` : ""}`
        : "Seu espaço no Potala",
    );
    if (naoLidas && autenticado) botao.dataset.contaAvisos = String(naoLidas);
    else delete botao.dataset.contaAvisos;

    const espaco = botao.querySelector(".conta-iniciais");
    if (!espaco) continue;
    /*
     * A foto entra como imagem decorativa: o nome já está no aria-label do
     * botão, e repetir no alt faria o leitor de tela dizer o nome duas vezes.
     */
    if (autenticado && avatarUrl) {
      espaco.innerHTML = `<img src="${escaparHtml(avatarUrl)}" alt="" decoding="async">`;
    } else {
      espaco.textContent = autenticado ? iniciais : "";
    }
  }
}
