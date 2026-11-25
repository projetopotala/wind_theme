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
import { caminhoDa } from "../roteador.js";
import { barraDeProgresso, capa, contarAvisosNovos, e, falhaDeCarregamento, leituraFalhou, secao, vazioOuFalha, verTudo } from "./comum.js";
import { ligacaoDaSala, mostraInterfaceDeCliente, papelProfissional, separarAtendimentos } from "./atendimentos.js";
import { SITUACAO_DO_PEDIDO } from "./cursos.js";
import { quandoNoFuso } from "./aulas-do-professor.js";

const MODALIDADES = Object.freeze({ presencial: "Presencial", online: "Online" });
const PERIODOS = Object.freeze({ manha: "manhã", tarde: "tarde", noite: "noite" });
const PEDIDOS_DE_CURSO_EM_ABERTO = new Set(["solicitada", "aguardando_pagamento", "pagamento_confirmado"]);
const ESTADOS_FUTUROS = new Set(["open", "too_early"]);

const instante = (valor) => {
  const ms = new Date(valor || "").valueOf();
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
};

/*
 * O PRÓXIMO COMPROMISSO, UM SÓ.
 *
 * O mais cedo entre a agenda (aulas, eventos, o que a pessoa anotou) e as
 * consultas confirmadas que ainda não terminaram. Empate fica com a consulta:
 * é ela que pode ter sala para entrar. Pedido sem confirmação nunca vira
 * compromisso — ele aparece em "Aguardando", com essa palavra.
 */
export function proximoCompromisso({ agenda = [], atendimentos = [], agora = new Date() } = {}) {
  const daAgenda = proximosCompromissos(agenda, agora, 1)[0] || null;
  const consulta = separarAtendimentos(atendimentos, agora).confirmados[0] || null;
  if (consulta && (!daAgenda || instante(consulta.inicio) <= instante(daAgenda.inicio))) return { tipo: "consulta", item: consulta };
  return daAgenda ? { tipo: "agenda", item: daAgenda } : null;
}

function cartaoDoProximo(proximo, agora, falhou = false) {
  if (!proximo && falhou) {
    return `<article class="mp-proximo mp-proximo-vazio">
      <p class="mp-proximo-rotulo">Próximo compromisso</p>
      ${falhaDeCarregamento({ texto: "Não conseguimos carregar os seus compromissos agora." })}
    </article>`;
  }
  if (!proximo) {
    return `<article class="mp-proximo mp-proximo-vazio">
      <p class="mp-proximo-rotulo">Próximo compromisso</p>
      <p class="mp-proximo-titulo">Nada marcado por enquanto.</p>
      <p class="mp-cartao-detalhe">Consultas confirmadas, aulas e eventos em que você se inscrever aparecem aqui.</p>
      <a class="mp-link" href="/programacao.html">Ver a programação <span aria-hidden="true">↗</span></a>
    </article>`;
  }
  const { tipo, item } = proximo;
  if (tipo === "consulta") {
    const sala = ligacaoDaSala(item, "confirmada", agora);
    return `<article class="mp-proximo" data-proximo="consulta">
      <p class="mp-proximo-rotulo">Próximo compromisso</p>
      <p class="mp-proximo-quando"><time datetime="${e(item.inicio)}">${e(quandoLegivel(item.inicio, agora))}</time></p>
      <h3 class="mp-proximo-titulo">${e(item.servico)}</h3>
      <p class="mp-cartao-detalhe"><span class="mp-status" data-status="encerrada">Consulta confirmada</span> ${e(MODALIDADES[item.modalidade] || "")}</p>
      ${sala || `<a class="mp-link" href="${caminhoDa("atendimentos")}#mp-atendimentos-confirmados">Ver detalhes <span aria-hidden="true">→</span></a>`}
    </article>`;
  }
  const origem = item.origem === "instituto" ? "Do Instituto" : "Anotado por você";
  return `<article class="mp-proximo" data-proximo="agenda">
    <p class="mp-proximo-rotulo">Próximo compromisso</p>
    <p class="mp-proximo-quando"><time datetime="${e(item.inicio)}">${e(quandoLegivel(item.inicio, agora))}</time></p>
    <h3 class="mp-proximo-titulo">${e(item.titulo)}</h3>
    <p class="mp-cartao-detalhe">${e([TIPOS_DE_COMPROMISSO[item.tipo], item.local, origem].filter(Boolean).join(" · "))}</p>
    <a class="mp-link" href="${caminhoDa("agenda")}">Ver na agenda <span aria-hidden="true">→</span></a>
  </article>`;
}

/* O que espera alguma coisa — da equipe, do pagamento ou da leitura da pessoa. */
export function pendencias({ atendimentos = [], inscricoesCursos = [], notificacoes = [], preferencias = [], agora = new Date() } = {}) {
  const itens = [];
  for (const pedido of separarAtendimentos(atendimentos, agora).pendentes) {
    const quando = pedido.inicio
      ? quandoLegivel(pedido.inicio, agora)
      : [pedido.dataPreferida ? new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" }).format(new Date(`${pedido.dataPreferida}T12:00:00`)).replace(/\./g, "") : "", PERIODOS[pedido.periodoPreferido] || ""].filter(Boolean).join(", ");
    itens.push({
      chave: `atendimento-${pedido.id}`,
      status: pedido.status,
      rotulo: pedido.status === "em_contato" ? "Equipe em contato" : "Aguardando a equipe",
      titulo: `Pedido de atendimento: ${pedido.servico}`,
      detalhe: [MODALIDADES[pedido.modalidade], quando ? `preferência ${quando}` : ""].filter(Boolean).join(" · "),
      href: `${caminhoDa("atendimentos")}#mp-atendimentos-pendentes`,
    });
  }
  for (const pedido of (Array.isArray(inscricoesCursos) ? inscricoesCursos : []).filter((p) => p && PEDIDOS_DE_CURSO_EM_ABERTO.has(p.status))) {
    const [rotulo, nota] = SITUACAO_DO_PEDIDO[pedido.status];
    itens.push({ chave: `curso-${pedido.id}`, status: pedido.status, rotulo, titulo: pedido.course_title || "Curso", detalhe: nota, href: `${caminhoDa("cursos")}#mp-cursos-inscricoes` });
  }
  const avisos = contarAvisosNovos({ notificacoes, preferencias });
  if (avisos) {
    itens.push({ chave: "avisos", status: "aviso", rotulo: "Notificações", titulo: avisos === 1 ? "1 notificação nova" : `${avisos} notificações novas`, detalhe: "", href: caminhoDa("notificacoes") });
  }
  return itens;
}

function listaDePendencias(itens, falhou = false) {
  if (!itens.length && falhou) return falhaDeCarregamento({ texto: "Não conseguimos conferir o que espera por você agora." });
  if (!itens.length) return "<p class=\"mp-pendencias-vazio\">Nada esperando por você agora.</p>";
  return `<ul class="mp-pendencias">${itens.map((item) => `<li data-pendencia="${e(item.chave)}">
    <p class="mp-status" data-status="${e(item.status)}">${e(item.rotulo)}</p>
    <a class="mp-pendencia-titulo" href="${e(item.href)}">${e(item.titulo)}</a>
    ${item.detalhe ? `<p class="mp-cartao-detalhe">${e(item.detalhe)}</p>` : ""}
  </li>`).join("")}</ul>`;
}

function atalhos(contexto) {
  const { atendimentoDisponivel = false } = contexto;
  const cliente = mostraInterfaceDeCliente(contexto);
  const pedir = cliente && atendimentoDisponivel
    ? `<a class="mp-botao" href="${caminhoDa("atendimentos")}#mp-atendimentos-novo" data-atalho="solicitar">Solicitar atendimento</a>`
    : cliente
      ? `<a class="mp-botao mp-botao-secundario" href="/atendimentos.html" data-atalho="conhecer-atendimentos">Conhecer os atendimentos</a>`
      : "";
  return `<nav class="mp-atalhos" aria-label="Atalhos do Meu Potala">
    ${pedir}
    <a class="mp-botao mp-botao-secundario" href="${caminhoDa("agenda")}">Abrir a agenda</a>
    <a class="mp-botao mp-botao-secundario" href="${caminhoDa("cursos")}">Meus cursos</a>
  </nav>`;
}

/* Trabalho e vida pessoal na mesma conta, mas nunca no mesmo bloco. */
function blocoProfissional({ agendaProfissional = [], perfisProfissionais = [], aulasDoProfessor = [], agora }) {
  if (!papelProfissional({ agendaProfissional, perfisProfissionais, aulasDoProfessor })) return "";
  const itens = [];
  const atende = (Array.isArray(perfisProfissionais) && perfisProfissionais.length) || (Array.isArray(agendaProfissional) && agendaProfissional.length);
  if (atende) {
    const futuras = (agendaProfissional || []).filter((c) => ESTADOS_FUTUROS.has(c.estado)).sort((a, b) => instante(a.inicio) - instante(b.inicio));
    const aberta = futuras.find((c) => c.estado === "open");
    itens.push(`<li>
      <p class="mp-status" data-status="${aberta ? "open" : "too_early"}">${aberta ? "Sala aberta agora" : "Consultas"}</p>
      <h3>${futuras.length ? `${futuras.length} ${futuras.length === 1 ? "consulta futura" : "consultas futuras"}` : "Nenhuma consulta futura"}</h3>
      ${futuras[0] ? `<p class="mp-cartao-detalhe">Próxima: ${e(quandoNoFuso(futuras[0].inicio, agora))}${futuras[0].cliente ? ` · ${e(futuras[0].cliente)}` : ""}</p>` : ""}
      <a class="mp-link" href="${caminhoDa("atendimentos")}#mp-agenda-profissional">Abrir sua agenda de atendimentos <span aria-hidden="true">→</span></a>
    </li>`);
  }
  const aulas = (Array.isArray(aulasDoProfessor) ? aulasDoProfessor : []).filter((a) => a && a.id);
  if (aulas.length) {
    const proxima = aulas.filter((a) => a.proximaAula).sort((a, b) => instante(a.proximaAula) - instante(b.proximaAula))[0];
    itens.push(`<li>
      <p class="mp-status" data-status="proximo_encontro">Aulas</p>
      <h3>${aulas.length} ${aulas.length === 1 ? "turma que você ministra" : "turmas que você ministra"}</h3>
      ${proxima ? `<p class="mp-cartao-detalhe">Próxima aula: ${e(quandoNoFuso(proxima.proximaAula, agora))} · ${e(proxima.curso)}</p>` : ""}
      <a class="mp-link" href="${caminhoDa("cursos")}#mp-aulas-do-professor">Ver suas turmas <span aria-hidden="true">→</span></a>
    </li>`);
  }
  return secao({
    id: "mp-inicio-profissional",
    classe: "mp-secao-profissional",
    kicker: "Área profissional",
    titulo: "Seu trabalho no Instituto",
    corpo: `<ul class="mp-profissional-resumo">${itens.join("")}</ul>`,
  });
}

export default {
  renderizar(contexto) {
    const { historico, inscricoes, progressos, agenda, salvos, acompanhando, agora, textosDoBlog = [], atendimentos = [], falhas = [] } = contexto;
    const continuar = continuarDeOndeParou({ historico, inscricoes, progressos }, 3);
    const porInscricao = new Map(progressos.map((progresso) => [progresso.inscricaoId, progresso]));
    const cursosAtivos = inscricoes.filter((inscricao) => inscricao.status !== "concluido").slice(0, 3);
    const destaque = proximoCompromisso({ agenda, atendimentos, agora });
    const idDestacado = destaque?.tipo === "agenda" ? destaque.item.id : null;
    const proximos = proximosCompromissos(agenda, agora, 5).filter((item) => item.id !== idDestacado).slice(0, 4);
    const ultimosSalvos = filtrarSalvos(salvos).slice(0, 3);
    const sugestao = recomendar({ catalogo: catalogoDoPortal({ textos: textosDoBlog }), salvos, historico, acompanhados: acompanhando });
    const esperando = pendencias({ ...contexto, agora });

    /* O que a pessoa abre o Meu Potala para saber: o que vem, o que espera, o que fazer. */
    const blocoAgora = `<section class="mp-agora" aria-labelledby="mp-agora-titulo">
      <h2 id="mp-agora-titulo" class="mp-sr">Agora</h2>
      <div class="mp-agora-grade">
        ${cartaoDoProximo(destaque, agora, leituraFalhou(falhas, "agenda", "atendimentos"))}
        <div class="mp-agora-pendencias">
          <p class="mp-proximo-rotulo">Aguardando${esperando.length ? ` <span class="mp-contador">${esperando.length}</span>` : ""}</p>
          ${listaDePendencias(esperando, leituraFalhou(falhas, "atendimentos", "inscricoesCursos", "notificacoes", "preferencias"))}
        </div>
      </div>
      ${atalhos(contexto)}
    </section>`;

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
        : vazioOuFalha({ falhas, colecoes: ["inscricoes"], textoDaFalha: "Não conseguimos carregar os seus cursos agora.", texto: "Você ainda não está em nenhum curso.", link: { href: "/cursos.html", texto: "Conhecer os cursos" } }),
    });

    const blocoAgenda = secao({
      id: "mp-inicio-agenda",
      kicker: "Minha agenda Potala",
      titulo: idDestacado ? "Depois disso" : "O que vem por aí",
      acao: (agenda || []).length ? verTudo("agenda") : "",
      corpo: proximos.length
        ? `<ol class="mp-linha-curta">${proximos.map((item) => `
          <li>
            <span class="mp-linha-marco" aria-hidden="true"></span>
            <p class="mp-linha-quando">${e(quandoLegivel(item.inicio, agora))}</p>
            <p class="mp-linha-titulo">${e(item.titulo)}</p>
            <p class="mp-cartao-detalhe">${e([TIPOS_DE_COMPROMISSO[item.tipo], item.local].filter(Boolean).join(" · "))}</p>
          </li>`).join("")}</ol>`
        : vazioOuFalha({ falhas, colecoes: ["agenda"], textoDaFalha: "Não conseguimos carregar a sua agenda agora.", texto: idDestacado ? "Nada mais marcado depois do próximo compromisso." : "Nenhum compromisso marcado.", link: { href: "/programacao.html", texto: "Ver a programação" } }),
    });

    const blocoSalvos = secao({
      id: "mp-inicio-salvos",
      classe: "mp-secao-discreta",
      kicker: "Salvos",
      titulo: "O que você guardou",
      acao: salvos.length ? verTudo("salvos") : "",
      corpo: ultimosSalvos.length
        ? `<ul class="mp-lista-simples">${ultimosSalvos.map((item) => `
          <li><a href="${e(item.href)}"><span class="mp-cartao-tipo">${e(TIPOS_DE_ITEM[item.tipo])}</span>${e(item.titulo)}</a></li>`).join("")}</ul>`
        : vazioOuFalha({ falhas, colecoes: ["salvos"], textoDaFalha: "Não conseguimos carregar os seus salvos agora.", texto: "Toque em “Salvar” em qualquer texto, curso ou evento para encontrá-lo aqui depois." }),
    });

    const blocoAcompanhando = acompanhando.length
      ? secao({
        id: "mp-inicio-acompanhando",
        classe: "mp-secao-discreta",
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

    return `${blocoAgora}${blocoProfissional({ ...contexto, agora })}${blocoContinuar}<div class="mp-grade-dupla">${blocoCursos}${blocoAgenda}</div><div class="mp-grade-dupla mp-biblioteca">${blocoSalvos}${blocoAcompanhando}</div>${blocoParaVoce}`;
  },
};
