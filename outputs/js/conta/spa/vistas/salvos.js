/*
 * SALVOS.
 *
 * Tudo que a pessoa guardou, de qualquer tipo, num lugar só. O filtro fica no
 * endereço (?filtro=cursos): recarregar ou voltar pelo navegador devolve o mesmo
 * recorte. E trocar de filtro não empilha histórico — o botão Voltar leva para
 * fora de Salvos, e não para o filtro anterior.
 */

import { contarSalvosPorFiltro, filtrarSalvos } from "../../leituras.js";
import { FILTROS_DE_SALVOS, TIPOS_DE_ITEM } from "../../modelos.js";
import { caminhoDa } from "../roteador.js";
import { capa, e, secao, vazio } from "./comum.js";

const dataCurta = (valor) => new Date(valor).toLocaleDateString("pt-BR", { day: "numeric", month: "short" }).replace(".", "");

export function filtroDoEndereco(parametros) {
  const pedido = parametros?.get?.("filtro");
  return FILTROS_DE_SALVOS.some((opcao) => opcao.id === pedido) ? pedido : "tudo";
}

export default {
  renderizar({ salvos, parametros }) {
    const filtro = filtroDoEndereco(parametros);
    const contagem = contarSalvosPorFiltro(salvos);
    const itens = filtrarSalvos(salvos, filtro);
    const escolhido = FILTROS_DE_SALVOS.find((opcao) => opcao.id === filtro);

    const filtros = `<nav class="mp-filtros" aria-label="Filtrar salvos"><ul>${FILTROS_DE_SALVOS.map((opcao) => {
      const href = opcao.id === "tudo" ? caminhoDa("salvos") : `${caminhoDa("salvos")}?filtro=${opcao.id}`;
      const atual = opcao.id === filtro ? " aria-current=\"true\"" : "";
      return `<li><a id="mp-filtro-${opcao.id}" href="${href}" data-substituir${atual}>${e(opcao.rotulo)} <span class="mp-filtro-conta">${contagem[opcao.id]}<span class="mp-sr"> ${contagem[opcao.id] === 1 ? "item" : "itens"}</span></span></a></li>`;
    }).join("")}</ul></nav>`;

    const lista = itens.length
      ? `<ul class="mp-lista-cartoes">${itens.map((item) => `
        <li class="mp-cartao">
          ${capa(item.imagem, item.titulo)}
          <div class="mp-cartao-corpo">
            <p class="mp-cartao-tipo">${e(TIPOS_DE_ITEM[item.tipo])}</p>
            <h3 class="mp-cartao-titulo"><a href="${e(item.href)}">${e(item.titulo)}</a></h3>
            <p class="mp-cartao-detalhe">Salvo em ${e(dataCurta(item.salvoEm))}</p>
          </div>
          <button type="button" class="mp-link-botao" data-acao="remover-salvo" data-id="${e(item.id)}">Remover<span class="mp-sr"> “${e(item.titulo)}” dos salvos</span></button>
        </li>`).join("")}</ul>`
      : vazio(salvos.length
        ? { texto: `Nenhum item em “${escolhido.rotulo}” por enquanto.` }
        : { texto: "Toque em “Salvar” em qualquer texto, curso ou evento para encontrá-lo aqui depois.", link: { href: "/blog.html", texto: "Ler o Caderno de Travessia" } });

    return secao({
      id: "mp-salvos",
      kicker: "Salvos",
      titulo: "O que você guardou pelo caminho",
      corpo: `${filtros}<div data-foco-reserva tabindex="-1">${lista}</div>`,
    });
  },
};
