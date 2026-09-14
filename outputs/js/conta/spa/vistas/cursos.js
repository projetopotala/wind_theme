/*
 * MEUS CURSOS.
 *
 * Cada inscrição mostra o que existir: imagem, professor, modalidade, próxima
 * aula, progresso, status e acesso ao conteúdo. O que não existir simplesmente
 * não aparece — um curso presencial não ganha uma barra de "0 de 0 aulas", e um
 * curso aguardando turma não promete uma data.
 *
 * Os concluídos ficam num grupo à parte, embaixo. Misturados, empurrariam para
 * baixo justamente os cursos que ainda pedem alguma coisa da pessoa.
 */

import { fracaoDoProgresso, quandoLegivel, textoDoProgresso } from "../../leituras.js";
import { STATUS_DE_INSCRICAO } from "../../modelos.js";
import { barraDeProgresso, capa, e, secao, vazio } from "./comum.js";

function cartaoDoCurso(inscricao, progresso, agora) {
  const detalhes = [inscricao.professor, inscricao.modalidade].filter(Boolean).join(" · ");
  return `<li class="mp-cartao mp-cartao-curso">
    ${capa(inscricao.imagem, inscricao.curso)}
    <div class="mp-cartao-corpo">
      <p class="mp-status" data-status="${e(inscricao.status)}">${e(STATUS_DE_INSCRICAO[inscricao.status])}</p>
      <h3 class="mp-cartao-titulo">${e(inscricao.curso)}</h3>
      ${detalhes ? `<p class="mp-cartao-detalhe">${e(detalhes)}</p>` : ""}
      ${inscricao.proximaAula ? `<p class="mp-cartao-detalhe">Próxima aula: <strong>${e(quandoLegivel(inscricao.proximaAula, agora))}</strong></p>` : ""}
      ${progresso?.total ? `${barraDeProgresso(fracaoDoProgresso(progresso), textoDoProgresso(progresso))}<p class="mp-cartao-detalhe">${e(textoDoProgresso(progresso))}</p>` : ""}
    </div>
    ${inscricao.conteudoHref ? `<a class="mp-botao mp-botao-pequeno mp-botao-secundario" href="${e(inscricao.conteudoHref)}">Acessar conteúdo<span class="mp-sr"> de ${e(inscricao.curso)}</span></a>` : ""}
  </li>`;
}

export default {
  renderizar({ inscricoes, progressos, agora }) {
    if (!inscricoes.length) {
      return secao({
        id: "mp-cursos",
        kicker: "Meus cursos",
        titulo: "Nenhum curso por enquanto",
        corpo: vazio({ texto: "Quando você se inscrever em um curso, ele aparece aqui com a próxima aula e o seu progresso.", link: { href: "/cursos.html", texto: "Conhecer os cursos" } }),
      });
    }

    const porInscricao = new Map(progressos.map((progresso) => [progresso.inscricaoId, progresso]));
    const ativos = inscricoes.filter((inscricao) => inscricao.status !== "concluido");
    const concluidos = inscricoes.filter((inscricao) => inscricao.status === "concluido");

    const emAndamento = ativos.length
      ? secao({
        id: "mp-cursos-ativos",
        kicker: "Em curso",
        titulo: "O que você está fazendo",
        corpo: `<ul class="mp-lista-cartoes">${ativos.map((inscricao) => cartaoDoCurso(inscricao, porInscricao.get(inscricao.id), agora)).join("")}</ul>`,
      })
      : "";

    const terminados = concluidos.length
      ? secao({
        id: "mp-cursos-concluidos",
        classe: "mp-secao-discreta",
        kicker: "Concluídos",
        titulo: "O que você já atravessou",
        corpo: `<ul class="mp-lista-cartoes">${concluidos.map((inscricao) => cartaoDoCurso(inscricao, porInscricao.get(inscricao.id), agora)).join("")}</ul>`,
      })
      : "";

    return `${emAndamento}${terminados}`;
  },
};
