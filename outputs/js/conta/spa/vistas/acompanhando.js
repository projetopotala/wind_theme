/*
 * ACOMPANHANDO.
 *
 * Temas, pessoas, cursos e turmas que a pessoa escolheu seguir. Não é o
 * "seguindo" de uma rede social: quem é acompanhado não fica sabendo, e não há
 * contagem de nada. É o que alimenta os avisos de novas turmas e o "Para você".
 */

import { TIPOS_DE_ACOMPANHAMENTO } from "../../modelos.js";
import { caminhoDa } from "../roteador.js";
import { e, secao, vazio } from "./comum.js";

const desde = (valor) => new Date(valor).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

export default {
  renderizar({ acompanhando }) {
    if (!acompanhando.length) {
      return secao({
        id: "mp-acompanhando",
        kicker: "Acompanhando",
        titulo: "Nada acompanhado por enquanto",
        corpo: vazio({
          texto: "Acompanhe um tema para saber quando houver algo novo — nos textos do Caderno de Travessia, o botão fica logo abaixo do título.",
          link: { href: "/blog.html", texto: "Ir ao Caderno de Travessia" },
        }),
      });
    }

    const grupos = Object.keys(TIPOS_DE_ACOMPANHAMENTO)
      .map((tipo) => ({ tipo, itens: acompanhando.filter((item) => item.tipo === tipo) }))
      .filter((grupo) => grupo.itens.length);

    const corpo = grupos.map((grupo) => `
      <section class="mp-acompanhando-grupo" aria-labelledby="mp-acomp-${grupo.tipo}">
        <h3 class="mp-grupo-titulo" id="mp-acomp-${grupo.tipo}">${e(TIPOS_DE_ACOMPANHAMENTO[grupo.tipo])}</h3>
        <ul class="mp-lista-acompanhando">${grupo.itens.map((item) => `
          <li>
            <div><p class="mp-acompanhado">${e(item.rotulo)}</p><p class="mp-cartao-detalhe">Desde ${e(desde(item.desde))}</p></div>
            <button type="button" class="mp-link-botao" data-acao="deixar-de-acompanhar" data-id="${e(item.id)}">Deixar de acompanhar<span class="mp-sr"> ${e(item.rotulo)}</span></button>
          </li>`).join("")}</ul>
      </section>`).join("");

    return secao({
      id: "mp-acompanhando",
      kicker: "Acompanhando",
      titulo: "O que você escolheu seguir",
      corpo: `<div data-foco-reserva tabindex="-1">${corpo}</div>
        <p class="mp-nota">Os avisos sobre o que você acompanha seguem as suas escolhas em <a href="${caminhoDa("notificacoes")}">Notificações</a>.</p>`,
    });
  },
};
