/*
 * MEU POTALA — O COMEÇO.
 *
 * Um resumo de cada parte, e não a parte inteira: três cursos, os próximos
 * compromissos, os últimos salvos. Cada bloco termina num "Ver tudo" que leva à
 * tela própria. Quem abre a área pessoal quer saber o que tem para agora, e
 * uma página com tudo de todas as partes esconderia exatamente isso.
 */

import { catalogoDoPortal } from "../../catalogo.js";
import {
  continuarDeOndeParou,
  filtrarSalvos,
  fracaoDoProgresso,
  proximosCompromissos,
  quandoLegivel,
  recomendar,
  textoDoProgresso,
} from "../../leituras.js";
import { STATUS_DE_INSCRICAO, TIPOS_DE_ACOMPANHAMENTO, TIPOS_DE_COMPROMISSO, TIPOS_DE_ITEM } from "../../modelos.js";
import { barraDeProgresso, capa, e, secao, vazio, verTudo } from "./comum.js";

export default {
  renderizar({ historico, inscricoes, progressos, agenda, salvos, acompanhando, agora }) {
    const continuar = continuarDeOndeParou({ historico, inscricoes, progressos }, 3);
    const porInscricao = new Map(progressos.map((progresso) => [progresso.inscricaoId, progresso]));
    const cursosAtivos = inscricoes.filter((inscricao) => inscricao.status !== "concluido").slice(0, 3);
    const proximos = proximosCompromissos(agenda, agora, 4);
    const ultimosSalvos = filtrarSalvos(salvos).slice(0, 3);
    const sugestao = recomendar({ catalogo: catalogoDoPortal(), salvos, historico, acompanhados: acompanhando });

    const blocoContinuar = continuar.length
      ? secao({
        id: "mp-continuar",
        kicker: "Continue de onde parou",
        titulo: "O que ficou pela metade",
        corpo: `<ul class="mp-lista-cartoes">${continuar.map((item) => `
          <li class="mp-cartao mp-cartao-continuar">
            ${capa(item.imagem, item.titulo)}
            <div class="mp-cartao-corpo">
              <p class="mp-cartao-tipo">${e(TIPOS_DE_ITEM[item.tipo] || "Curso")}</p>
              <h3 class="mp-cartao-titulo">${e(item.titulo)}</h3>
              ${barraDeProgresso(item.progresso, item.detalhe)}
              <p class="mp-cartao-detalhe">${e(item.detalhe)}</p>
            </div>
            <a class="mp-botao mp-botao-pequeno" href="${e(item.href)}">Continuar<span class="mp-sr"> ${e(item.titulo)}</span></a>
          </li>`).join("")}</ul>`,
      })
      : "";

    const blocoCursos = secao({
      id: "mp-inicio-cursos",
      kicker: "Meus cursos",
      titulo: "Em que você está inscrito",
      acao: inscricoes.length ? verTudo("cursos") : "",
      corpo: cursosAtivos.length
        ? `<ul class="mp-lista-cursos">${cursosAtivos.map((inscricao) => {
          const progresso = porInscricao.get(inscricao.id);
          return `<li class="mp-curso-resumo">
            <p class="mp-status" data-status="${e(inscricao.status)}">${e(STATUS_DE_INSCRICAO[inscricao.status])}</p>
            <h3>${e(inscricao.curso)}</h3>
            <p class="mp-cartao-detalhe">${e([inscricao.professor, inscricao.modalidade].filter(Boolean).join(" · "))}</p>
            ${inscricao.proximaAula ? `<p class="mp-cartao-detalhe">Próxima aula: ${e(quandoLegivel(inscricao.proximaAula, agora))}</p>` : ""}
            ${progresso?.total ? barraDeProgresso(fracaoDoProgresso(progresso), textoDoProgresso(progresso)) : ""}
          </li>`;
        }).join("")}</ul>`
        : vazio({ texto: "Você ainda não está em nenhum curso.", link: { href: "/cursos.html", texto: "Conhecer os cursos" } }),
    });

    const blocoAgenda = secao({
      id: "mp-inicio-agenda",
      kicker: "Minha agenda Potala",
      titulo: "O que vem por aí",
      acao: proximos.length ? verTudo("agenda") : "",
      corpo: proximos.length
        ? `<ol class="mp-linha-curta">${proximos.map((item) => `
          <li>
            <span class="mp-linha-marco" aria-hidden="true"></span>
            <p class="mp-linha-quando">${e(quandoLegivel(item.inicio, agora))}</p>
            <p class="mp-linha-titulo">${e(item.titulo)}</p>
            <p class="mp-cartao-detalhe">${e([TIPOS_DE_COMPROMISSO[item.tipo], item.local].filter(Boolean).join(" · "))}</p>
          </li>`).join("")}</ol>`
        : vazio({ texto: "Nenhum compromisso marcado.", link: { href: "/programacao.html", texto: "Ver a programação" } }),
    });

    const blocoSalvos = secao({
      id: "mp-inicio-salvos",
      kicker: "Salvos",
      titulo: "O que você guardou",
      acao: salvos.length ? verTudo("salvos") : "",
      corpo: ultimosSalvos.length
        ? `<ul class="mp-lista-simples">${ultimosSalvos.map((item) => `
          <li><a href="${e(item.href)}"><span class="mp-cartao-tipo">${e(TIPOS_DE_ITEM[item.tipo])}</span>${e(item.titulo)}</a></li>`).join("")}</ul>`
        : vazio({ texto: "Toque em “Salvar” em qualquer texto, curso ou evento para encontrá-lo aqui depois." }),
    });

    const blocoAcompanhando = acompanhando.length
      ? secao({
        id: "mp-inicio-acompanhando",
        kicker: "Acompanhando",
        titulo: "Assuntos que você segue",
        acao: verTudo("acompanhando"),
        corpo: `<ul class="mp-pastilhas">${acompanhando.map((item) => `<li><span class="mp-pastilha"><small>${e(TIPOS_DE_ACOMPANHAMENTO[item.tipo])}</small> ${e(item.rotulo)}</span></li>`).join("")}</ul>`,
      })
      : "";

    /* Linguagem de caminho, não de vitrine: nada de "imperdível" ou "compre". */
    const blocoParaVoce = sugestao.itens.length
      ? secao({
        id: "mp-para-voce",
        classe: "mp-secao-discreta",
        kicker: "Para você",
        titulo: sugestao.motivo === "afinidade" ? "Relacionado ao que você tem explorado" : "Novos caminhos para você",
        corpo: `<ul class="mp-lista-simples">${sugestao.itens.map((item) => `
          <li><a href="${e(item.href)}"><span class="mp-cartao-tipo">${e(TIPOS_DE_ITEM[item.tipo])}</span>${e(item.titulo)}</a></li>`).join("")}</ul>`,
      })
      : "";

    return `${blocoContinuar}<div class="mp-grade-dupla">${blocoCursos}${blocoAgenda}</div><div class="mp-grade-dupla">${blocoSalvos}${blocoAcompanhando}</div>${blocoParaVoce}`;
  },
};
