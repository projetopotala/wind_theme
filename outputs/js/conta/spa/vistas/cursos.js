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
import { aulasDoProfessor as secaoAulasDoProfessor, avisoDeSala } from "./aulas-do-professor.js";

/*
 * Entrada na aula online. O botao so existe quando o backend entregou um link https valido para
 * esta inscricao (ativa, turma online, proxima aula online). Sem link, mas com aula marcada,
 * avisa em vez de esconder o problema. Presencial, espera e concluido nao mostram nada.
 */
function acessoAAula(inscricao, agora) {
  if (String(inscricao.modalidade).toLowerCase() !== "online") return "";
  if (inscricao.status === "concluido" || inscricao.status === "aguardando_turma") return "";
  if (inscricao.linkAula) {
    return `<a class="mp-botao mp-botao-pequeno mp-botao-aula" href="${e(inscricao.linkAula)}" target="_blank" rel="noopener noreferrer">Entrar na aula online<span class="mp-sr"> de ${e(inscricao.curso)} (abre em nova aba)</span></a>`;
  }
  return avisoDeSala(inscricao, agora);
}

function cartaoDoCurso(inscricao, progresso, agora) {
  const detalhes = [inscricao.professor, inscricao.modalidade].filter(Boolean).join(" · ");
  return `<li class="mp-cartao mp-cartao-curso">
    ${capa(inscricao.imagem, inscricao.curso)}
    <div class="mp-cartao-corpo">
      <p class="mp-status" data-status="${e(inscricao.status)}">${e(STATUS_DE_INSCRICAO[inscricao.status])}</p>
      <h3 class="mp-cartao-titulo">${e(inscricao.curso)}</h3>
      ${detalhes ? `<p class="mp-cartao-detalhe">${e(detalhes)}</p>` : ""}
      ${inscricao.proximaAula ? `<p class="mp-cartao-detalhe">Próxima aula: <strong>${e(quandoLegivel(inscricao.proximaAula, agora))}</strong></p>` : ""}
      ${acessoAAula(inscricao, agora)}
      ${progresso?.total ? `${barraDeProgresso(fracaoDoProgresso(progresso), textoDoProgresso(progresso))}<p class="mp-cartao-detalhe">${e(textoDoProgresso(progresso))}</p>` : ""}
    </div>
    ${inscricao.conteudoHref ? `<a class="mp-botao mp-botao-pequeno mp-botao-secundario" href="${e(inscricao.conteudoHref)}">Acessar conteúdo<span class="mp-sr"> de ${e(inscricao.curso)}</span></a>` : ""}
  </li>`;
}

/* Pedidos de inscricao feitos pelo proprio aluno (PR B). "Matriculada" so depois da aprovacao e, se pago, do pagamento real. */
export const SITUACAO_DO_PEDIDO = Object.freeze({
  solicitada: ["Inscrição solicitada", "O Instituto vai analisar seu pedido."],
  aguardando_pagamento: ["Aguardando pagamento", "Inscrição aprovada. O pagamento online ainda não está disponível; o Instituto entra em contato."],
  pagamento_confirmado: ["Pagamento confirmado", "Pagamento recebido. A matrícula está sendo concluída."],
  matriculada: ["Matriculado", "Sua vaga está garantida."],
  recusada: ["Inscrição não aprovada", "Fale com o Instituto se tiver dúvidas."],
  cancelada: ["Inscrição cancelada", ""],
});
const reais = (c) => (Number.isInteger(c) ? (c === 0 ? "Gratuito" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c / 100)) : "");
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

export function pedidosDeInscricao(pedidos = []) {
  const lista = (Array.isArray(pedidos) ? pedidos : []).filter((p) => p && SITUACAO_DO_PEDIDO[p.status]);
  if (!lista.length) return "";
  return secao({
    id: "mp-cursos-inscricoes",
    kicker: "Inscrições",
    titulo: "Seus pedidos de inscrição",
    corpo: `<ul class="mp-lista-cartoes">${lista.map((p) => {
      const [rotulo, nota] = SITUACAO_DO_PEDIDO[p.status];
      const pode = ["solicitada", "aguardando_pagamento"].includes(p.status);
      return `<li class="mp-cartao mp-cartao-curso" data-inscricao-curso="${esc(p.id)}">
        <div class="mp-cartao-corpo">
          <p class="mp-status" data-status="${esc(p.status)}">${esc(rotulo)}</p>
          <h3 class="mp-cartao-titulo">${esc(p.course_title || "Curso")}</h3>
          <p class="mp-cartao-detalhe">${esc([p.mode === "online" ? "Online" : "Presencial", reais(p.price_cents)].filter(Boolean).join(" · "))}</p>
          ${nota ? `<p class="mp-cartao-detalhe">${esc(nota)}</p>` : ""}
          ${pode ? `<form class="mp-form" data-form="cancelar-inscricao-curso" data-inscricao="${esc(p.id)}"><p class="mp-form-status" data-form-status role="alert"></p><button class="mp-botao mp-botao-pequeno mp-botao-secundario" type="submit">Cancelar inscrição</button></form>` : ""}
        </div>
      </li>`;
    }).join("")}</ul>`,
  });
}

export default {
  renderizar({ inscricoes, progressos, agora, inscricoesCursos = [], aulasDoProfessor = [] }) {
    /* Turmas que a pessoa ministra vêm primeiro; não dependem de inscrição nem de pagamento. */
    const pedidos = `${secaoAulasDoProfessor(aulasDoProfessor, agora)}${pedidosDeInscricao(inscricoesCursos)}`;
    if (!inscricoes.length && pedidos) return pedidos;
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

    return `${pedidos}${emAndamento}${terminados}`;
  },
};
