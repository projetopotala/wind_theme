/*
 * AGENDA DO INSTITUTO — as telas.
 *
 * A agenda antiga era uma tabela com sete nomes: "Dia" e "Hoje" desenhavam a
 * mesma tabela, a "Semana" eram sete cartões de texto sem horas e "Por sala"
 * empilhava dez tabelas. Aqui cada modo é uma visualização de verdade:
 *
 *   Dia / Semana   grade de horas; a altura do bloco é a duração
 *   Mês            grade de segunda a domingo, com "+N"
 *   Lista          continua tabela — é o único modo em que tabela é a forma certa
 *   Por sala       linha do tempo, uma trilha por sala
 *   Ocupação       números do dia, ranking de salas e mapa de calor
 *
 * Tudo que é conta (posição, sobreposição, conflito, busca) vem de
 * agenda-layout.js. Este arquivo só transforma o resultado em HTML, sempre
 * escapado: títulos e nomes são digitados por pessoas.
 */

import { icone } from "../icones.js";
import { esc, translate } from "./comum.js";
import { occupancy } from "./schedule.js";
import {
  FAMILIAS, JANELA, SITUACOES, conflitos, dataPorExtenso, diaCurto, diaDe, diaLongo, distribuir, familiaDe,
  filtrarAgenda, gradeDoMes, hojeLocal, horaDe, horarioDePico, mapaDeCalor, mesCurto, minutosDoDia,
  periodoDaVisao, posicaoNaLinha, rotuloDoPeriodo, rotuloExterno, semanaDe, situacaoDe,
} from "./agenda-layout.js";

export const VISOES = Object.freeze([
  ["day", "Dia"], ["week", "Semana"], ["month", "Mês"], ["list", "Lista"], ["room", "Por sala"], ["occupancy", "Ocupação"],
]);

/* No telefone não se espreme uma semana: Semana, Por sala e Ocupação abrem como Dia. */
const SO_TELA_LARGA = new Set(["week", "room", "occupancy"]);
export const visaoEfetiva = (visao, estreito) => {
  if (visao === "today") return "day";
  if (estreito && SO_TELA_LARGA.has(visao)) return "day";
  return VISOES.some(([chave]) => chave === visao) ? visao : "week";
};

const horaInteira = (h) => `${String(h).padStart(2, "0")}:00`;
const pessoa = (s, id) => (s.profiles || []).find((row) => row.id === id)?.display_name || "";
const salaDe = (s, id) => (s.rooms || []).find((row) => row.id === id);
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

function capacidadeDe(s, item) {
  if (item.mode === "online") return null;
  const oferta = (s.activity_offerings || []).find((row) => row.id === item.offering_id);
  return salaDe(s, item.room_id)?.capacity || oferta?.capacity || null;
}

const lotacao = (s, item) => {
  const capacidade = capacidadeDe(s, item);
  return capacidade ? `${item.participants}/${capacidade}` : plural(item.participants || 0, "participante", "participantes");
};

const localDe = (s, item) => (item.mode === "online" ? "Online" : salaDe(s, item.room_id)?.name || "Sala a definir");

export const situacaoBadge = (situacao) => `<span class="ag-situacao" data-situacao="${esc(situacao)}">${esc(SITUACOES[situacao])}</span>`;

const marcadorDeTipo = (item) => {
  const familia = familiaDe(item);
  return `<span class="ag-tipo">${icone(FAMILIAS[familia].icone, { classe: "ag-tipo-icone" })}<span>${esc(translate(item.kind))}</span></span>`;
};

function descricaoAcessivel(s, item, situacao, conflito) {
  return [
    item.title,
    `${diaLongo(diaDe(item.starts_at))}, ${horaDe(item.starts_at)} a ${horaDe(item.ends_at)}`,
    FAMILIAS[familiaDe(item)].rotulo,
    localDe(s, item),
    pessoa(s, item.professional_id),
    SITUACOES[situacao],
    conflito?.has("sala") ? "conflito de sala" : "",
    conflito?.has("profissional") ? "conflito de profissional" : "",
  ].filter(Boolean).join(", ");
}

const botaoMais = (item) => `<button type="button" class="ag-mais" data-op-menu="${esc(item.id)}" aria-haspopup="menu" aria-expanded="false" aria-label="Mais ações para ${esc(item.title)}" data-dica="Mais ações">${icone("ellipsis")}</button>`;

const chipConflito = (conflito) => {
  if (!conflito?.size) return "";
  const texto = conflito.has("sala") ? "Conflito de sala" : "Conflito de profissional";
  return `<span class="ag-conflito-chip">${icone("triangle-alert")}${texto}</span>`;
};

/* ------------------------------------------------------------------ cabeçalho e barra */

function cabecalho(o) {
  return `<header class="ag-cabecalho">
    <div class="ag-titulo"><h2 tabindex="-1">Agenda</h2><p>${esc(dataPorExtenso(o.date))}</p></div>
    <button type="button" class="ag-primario" data-op-action="novo-agendamento">${icone("plus")}<span>Novo agendamento</span></button>
  </header>`;
}

function barra(s, o, visao) {
  const nomes = { day: "dia", week: "semana", month: "mês", list: "dia", room: "dia", occupancy: "dia" };
  const filtrosAtivos = [o.familia, o.situacao, o.profissional].filter(Boolean).length;
  const profissionais = (s.profiles || []).filter((row) => row.roles?.some((role) => ["professional", "profissional"].includes(role)));
  const opcao = (valor, texto, atual) => `<option value="${esc(valor)}" ${valor === atual ? "selected" : ""}>${esc(texto)}</option>`;
  return `<div class="ag-barra" role="toolbar" aria-label="Navegação da agenda">
    <div class="ag-navegar">
      <button type="button" class="ag-botao" data-op-agenda="hoje">Hoje</button>
      <button type="button" class="ag-icone-botao" data-op-agenda="anterior" aria-label="${esc(nomes[visao] === "mês" ? "Mês anterior" : nomes[visao] === "semana" ? "Semana anterior" : "Dia anterior")}" data-dica="Anterior">${icone("chevron-left")}</button>
      <button type="button" class="ag-icone-botao" data-op-agenda="proximo" aria-label="${esc(nomes[visao] === "mês" ? "Próximo mês" : nomes[visao] === "semana" ? "Próxima semana" : "Próximo dia")}" data-dica="Próximo">${icone("chevron-right")}</button>
      <span class="ag-data">
        <button type="button" class="ag-botao ag-data-botao" data-op-agenda="calendario" aria-label="Escolher data: ${esc(rotuloDoPeriodo(visao, o.date))}">${icone("calendar")}<span>${esc(rotuloDoPeriodo(visao, o.date))}</span></button>
        <input class="ag-data-campo" type="date" data-op-filter="date" value="${esc(o.date)}" tabindex="-1" aria-hidden="true">
      </span>
    </div>
    <div class="ag-modos" role="group" aria-label="Visualização">${VISOES.map(([chave, nome]) => `<button type="button" data-op-calendar-view="${chave}" aria-pressed="${chave === visao}" ${SO_TELA_LARGA.has(chave) ? "data-so-larga" : ""}>${nome}</button>`).join("")}</div>
    <label class="ag-sala-filtro"><span class="ag-sr">Sala</span><select data-op-filter="room">${opcao("", "Sala: Todas", o.room || "")}${(s.rooms || []).map((row) => opcao(row.id, row.name, o.room || "")).join("")}</select></label>
    <label class="ag-busca">${icone("search")}<span class="ag-sr">Buscar na agenda</span><input type="search" data-op-filter="search" value="${esc(o.search || "")}" placeholder="Buscar na agenda" autocomplete="off"></label>
    <details class="ag-filtros">
      <summary class="ag-botao">${icone("sliders-horizontal")}<span>Filtros</span>${filtrosAtivos ? `<span class="ag-contador" aria-label="${filtrosAtivos} ativos">${filtrosAtivos}</span>` : ""}</summary>
      <div class="ag-filtros-painel">
        <label>Tipo<select data-op-filter="familia">${opcao("", "Todos", o.familia || "")}${Object.entries(FAMILIAS).map(([chave, { rotulo }]) => opcao(chave, rotulo, o.familia || "")).join("")}</select></label>
        <label>Situação<select data-op-filter="situacao">${opcao("", "Todas", o.situacao || "")}${Object.entries(SITUACOES).map(([chave, rotulo]) => opcao(chave, rotulo, o.situacao || "")).join("")}</select></label>
        <label>Profissional<select data-op-filter="profissional">${opcao("", "Todos", o.profissional || "")}${profissionais.map((row) => opcao(row.id, row.display_name, o.profissional || "")).join("")}</select></label>
        ${filtrosAtivos ? `<button type="button" class="ag-botao" data-op-agenda="limpar-filtros">Limpar filtros</button>` : ""}
      </div>
    </details>
  </div>`;
}

/* ------------------------------------------------------------------ grade de horas (Dia e Semana) */

function faixaDeFuncionamento(s) {
  const salas = (s.rooms || []).filter((row) => row.status === "available" && row.opens_at && row.closes_at);
  const minutos = (texto) => Number(texto.slice(0, 2)) * 60 + Number(texto.slice(3, 5));
  if (!salas.length) return { abre: JANELA.inicio, fecha: JANELA.fim };
  return { abre: Math.min(...salas.map((row) => minutos(row.opens_at))), fecha: Math.max(...salas.map((row) => minutos(row.closes_at))) };
}

function eventoNaGrade(s, bloco, contexto) {
  const { item } = bloco;
  const situacao = situacaoDe(item, contexto.agora);
  const conflito = contexto.conflitos.get(item.id);
  const detalhe = [localDe(s, item), pessoa(s, item.professional_id)].filter(Boolean).join(" · ");
  return `<article class="ag-evento${contexto.selecionado === item.id ? " is-selecionado" : ""}" data-familia="${familiaDe(item)}" data-situacao="${situacao}" ${conflito?.size ? `data-conflito="${[...conflito].join(" ")}"` : ""} style="--topo:${bloco.topo};--altura:${bloco.altura};--faixa:${bloco.faixa};--faixas:${bloco.faixas}">
    <button type="button" class="ag-evento-abrir" data-op-action="detalhes" data-id="${esc(item.id)}" aria-label="${esc(descricaoAcessivel(s, item, situacao, conflito))}">
      <span class="ag-evento-topo">${icone(FAMILIAS[familiaDe(item)].icone, { classe: "ag-tipo-icone" })}<strong class="ag-evento-titulo">${esc(item.title)}</strong><time class="ag-evento-inicio">${esc(horaDe(item.starts_at))}</time></span>
      <span class="ag-evento-hora">${esc(horaDe(item.starts_at))}–${esc(horaDe(item.ends_at))}</span>
      <span class="ag-evento-local">${esc(detalhe)}</span>
      <span class="ag-evento-rodape"><span class="ag-evento-pessoas">${esc(lotacao(s, item))}</span>${situacao !== "agendada" ? situacaoBadge(situacao) : ""}</span>
    </button>
    ${chipConflito(conflito)}
    ${botaoMais(item)}
  </article>`;
}

function gradeDeHoras(s, dias, itens, contexto) {
  const horas = Array.from({ length: (JANELA.fim - JANELA.inicio) / 60 }, (_, indice) => JANELA.inicio / 60 + indice);
  const { abre, fecha } = faixaDeFuncionamento(s);
  const hoje = hojeLocal(contexto.agora);
  const agoraMin = minutosDoDia(new Date(contexto.agora).toISOString());
  const zonasFechadas = [
    abre > JANELA.inicio ? { topo: 0, altura: abre - JANELA.inicio } : null,
    fecha < JANELA.fim ? { topo: fecha - JANELA.inicio, altura: JANELA.fim - fecha } : null,
  ].filter(Boolean);

  const cabecalhos = dias.map((dia) => {
    const quantidade = itens.filter((item) => diaDe(item.starts_at) === dia && item.status !== "cancelled").length;
    const eHoje = dia === hoje;
    return `<button type="button" class="ag-dia-cab${eHoje ? " is-hoje" : ""}" data-op-day="${dia}" ${eHoje ? 'aria-current="date"' : ""} aria-label="Abrir ${esc(diaLongo(dia))}, ${Number(dia.slice(8))} de ${esc(mesCurto(dia))}: ${plural(quantidade, "atividade", "atividades")}">
      <span class="ag-dia-nome">${esc(diaCurto(dia))}</span><strong>${Number(dia.slice(8))}</strong><small>${quantidade ? plural(quantidade, "atividade", "atividades") : "livre"}</small>
    </button>`;
  }).join("");

  const colunas = dias.map((dia) => {
    const doDia = itens.filter((item) => diaDe(item.starts_at) === dia);
    const blocos = distribuir(doDia);
    const linhaAgora = dia === hoje && agoraMin >= JANELA.inicio && agoraMin <= JANELA.fim
      ? `<div class="ag-agora" data-agenda-agora style="--topo:${agoraMin - JANELA.inicio}"><span>${esc(horaDe(new Date(contexto.agora).toISOString()))}</span></div>`
      : "";
    return `<div class="ag-coluna${dia === hoje ? " is-hoje" : ""}" data-op-coluna="${dia}" role="group" aria-label="${esc(`${diaLongo(dia)}, ${Number(dia.slice(8))} de ${mesCurto(dia)}`)}">
      ${zonasFechadas.map((zona) => `<div class="ag-fechado" style="--topo:${zona.topo};--altura:${zona.altura}" aria-hidden="true"><span>Fechado</span></div>`).join("")}
      ${blocos.map((bloco) => eventoNaGrade(s, bloco, contexto)).join("")}
      ${linhaAgora}
    </div>`;
  }).join("");

  return `<div class="ag-grade" data-dias="${dias.length}" style="--linhas:${horas.length};--dias:${dias.length}">
    <div class="ag-grade-cab"><span class="ag-grade-canto" aria-hidden="true"></span>${cabecalhos}</div>
    <div class="ag-grade-corpo">
      <div class="ag-horas" aria-hidden="true">${horas.map((h) => `<span style="--topo:${h * 60 - JANELA.inicio}">${horaInteira(h)}</span>`).join("")}</div>
      ${colunas}
    </div>
  </div>`;
}

function faixaDaSemana(s, dia, itens, contexto) {
  const hoje = hojeLocal(contexto.agora);
  return `<div class="ag-faixa-semana" role="group" aria-label="Dias da semana">${semanaDe(dia).map((data) => {
    const quantidade = itens.filter((item) => diaDe(item.starts_at) === data && item.status !== "cancelled").length;
    return `<button type="button" data-op-day="${data}" ${data === dia ? 'aria-pressed="true"' : 'aria-pressed="false"'} class="${data === hoje ? "is-hoje" : ""}"><span>${esc(diaCurto(data))}</span><strong>${Number(data.slice(8))}</strong>${quantidade ? `<small aria-label="${plural(quantidade, "atividade", "atividades")}">${quantidade}</small>` : ""}</button>`;
  }).join("")}</div>`;
}

/* ------------------------------------------------------------------ mês */

function mes(s, o, itens, contexto) {
  const hoje = hojeLocal(contexto.agora);
  const celulas = gradeDoMes(o.date).flat().map(({ dia, doMes }) => {
    const doDia = itens.filter((item) => diaDe(item.starts_at) === dia && item.status !== "cancelled");
    const mostrar = doDia.slice(0, 3);
    return `<div class="ag-mes-dia${doMes ? "" : " is-fora"}${dia === hoje ? " is-hoje" : ""}">
      <div class="ag-mes-topo">
        <button type="button" class="ag-mes-numero" data-op-day="${dia}" aria-label="Abrir ${esc(diaLongo(dia))}, ${Number(dia.slice(8))} de ${esc(mesCurto(dia))}: ${plural(doDia.length, "atividade", "atividades")}">${Number(dia.slice(8))}</button>
        ${doDia.length ? `<small class="ag-mes-conta">${plural(doDia.length, "atividade", "atividades")}</small>` : ""}
      </div>
      <ul class="ag-mes-lista">${mostrar.map((item) => `<li><button type="button" class="ag-mes-evento" data-familia="${familiaDe(item)}" data-op-action="detalhes" data-id="${esc(item.id)}" ${contexto.conflitos.get(item.id)?.size ? "data-conflito" : ""}><time>${esc(horaDe(item.starts_at))}</time> ${esc(item.title)}</button></li>`).join("")}</ul>
      ${doDia.length > 3 ? `<button type="button" class="ag-mes-mais" data-op-day="${dia}" aria-label="Ver mais ${doDia.length - 3} atividades em ${Number(dia.slice(8))} de ${esc(mesCurto(dia))}">+${doDia.length - 3}</button>` : ""}
    </div>`;
  }).join("");
  return `<div class="ag-mes">
    <div class="ag-mes-cab" aria-hidden="true">${["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].map((nome) => `<span>${nome}</span>`).join("")}</div>
    <div class="ag-mes-grade">${celulas}</div>
  </div>`;
}

/* ------------------------------------------------------------------ lista */

export function tabelaDaAgenda(s, itens, { agora = Date.now(), vazio = "Nenhuma atividade neste período." } = {}) {
  const mapa = conflitos(s.schedule_items || []);
  if (!itens.length) return `<p class="ag-vazio">${esc(vazio)}</p>`;
  const linhas = itens.map((item) => {
    const situacao = situacaoDe(item, agora);
    const dia = diaDe(item.starts_at);
    return `<tr data-familia="${familiaDe(item)}">
      <td class="ag-lista-quando"><strong>${esc(horaDe(item.starts_at))}–${esc(horaDe(item.ends_at))}</strong><small>${esc(diaCurto(dia))}, ${Number(dia.slice(8))} ${esc(mesCurto(dia))}</small></td>
      <td><button type="button" class="ag-lista-abrir" data-op-action="detalhes" data-id="${esc(item.id)}">${marcadorDeTipo(item)}<strong>${esc(item.title)}</strong></button>${chipConflito(mapa.get(item.id))}</td>
      <td>${esc(localDe(s, item))}<small>${esc(pessoa(s, item.professional_id) || "—")}</small></td>
      <td>${esc(lotacao(s, item))}</td>
      <td>${situacaoBadge(situacao)}</td>
      <td class="ag-lista-mais">${botaoMais(item)}</td>
    </tr>`;
  });
  return `<div class="ag-lista-rolagem"><table class="ag-lista">
    <thead><tr><th scope="col">Quando</th><th scope="col">Atividade</th><th scope="col">Local e responsável</th><th scope="col">Participantes</th><th scope="col">Situação</th><th scope="col"><span class="ag-sr">Ações</span></th></tr></thead>
    <tbody>${linhas.join("")}</tbody>
  </table></div>`;
}

/* ------------------------------------------------------------------ por sala */

function resumoDoDia(s, dia, itensDoDia, contexto) {
  const agora = contexto.agora;
  const disponiveis = (s.rooms || []).filter((row) => row.status === "available" && !(s.maintenance_orders || []).some((ordem) => ordem.room_id === row.id && ordem.status === "open"));
  const ocupadas = new Set(itensDoDia.filter((item) => item.status !== "cancelled" && item.room_id && Date.parse(item.starts_at) <= agora && Date.parse(item.ends_at) > agora).map((item) => item.room_id));
  const proximo = itensDoDia.filter((item) => item.status !== "cancelled" && Date.parse(item.starts_at) > agora).sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
  const medidas = occupancy(s, { from: `${dia}T00:00:00-03:00`, to: `${dia}T23:59:59-03:00` }).filter((row) => row.rate != null);
  const media = medidas.length ? Math.round((medidas.reduce((soma, row) => soma + row.reserved_minutes, 0) / medidas.reduce((soma, row) => soma + row.available_minutes, 0)) * 100) : null;
  const emConflito = itensDoDia.filter((item) => contexto.conflitos.get(item.id)?.has("sala")).length;
  const livres = disponiveis.filter((row) => !ocupadas.has(row.id)).length;
  return {
    livres, total: disponiveis.length, proximo, media, emConflito,
    medidas: new Map(medidas.map((row) => [row.room_id, Math.round(row.rate * 100)])),
  };
}

function reservaNaTrilha(s, item, itensDaSala, contexto) {
  const pos = posicaoNaLinha(item, JANELA);
  const situacao = situacaoDe(item, contexto.agora);
  const conflito = contexto.conflitos.get(item.id);
  const fora = rotuloExterno(item, itensDaSala, JANELA);
  const lot = lotacao(s, item);
  return `<article class="ag-reserva${fora ? " is-estreita" : ""}${pos.esquerda > 60 ? " is-direita" : ""}${contexto.selecionado === item.id ? " is-selecionado" : ""}" data-familia="${familiaDe(item)}" data-situacao="${situacao}" ${conflito?.size ? `data-conflito="${[...conflito].join(" ")}"` : ""} style="--esq:${pos.esquerda.toFixed(3)}%;--larg:${pos.largura.toFixed(3)}%;--prep:${pos.preparo.toFixed(3)}%;--desm:${pos.desmontagem.toFixed(3)}%">
    <button type="button" class="ag-reserva-abrir" data-op-action="detalhes" data-id="${esc(item.id)}" aria-label="${esc(descricaoAcessivel(s, item, situacao, conflito))}" aria-describedby="cartao-${esc(item.id)}">
      <span class="ag-reserva-linha">${icone(FAMILIAS[familiaDe(item)].icone, { classe: "ag-tipo-icone" })}<strong>${esc(item.title)}</strong></span>
      <span class="ag-reserva-hora">${esc(horaDe(item.starts_at))}${fora ? "" : ` · ${esc(lot)}`}</span>
    </button>
    ${fora ? `<span class="ag-reserva-rotulo" aria-hidden="true">${esc(item.title)}${capacidadeDe(s, item) ? ` · ${esc(lot)}` : ""}</span>` : ""}
    <div class="ag-cartao" id="cartao-${esc(item.id)}" role="tooltip">
      <strong>${esc(item.title)}</strong>
      <span>${esc(horaDe(item.starts_at))}–${esc(horaDe(item.ends_at))}</span>
      ${pessoa(s, item.professional_id) ? `<span>${esc(pessoa(s, item.professional_id))}</span>` : ""}
      <span>${esc(lot)} ${situacaoBadge(situacao)}</span>
      ${conflito?.size ? chipConflito(conflito) : ""}
      <small>Clique para ver detalhes</small>
    </div>
  </article>`;
}

function porSala(s, o, itens, contexto) {
  const dia = o.date;
  const itensDoDia = itens.filter((item) => diaDe(item.starts_at) === dia);
  const resumo = resumoDoDia(s, dia, (s.schedule_items || []).filter((item) => diaDe(item.starts_at) === dia), contexto);
  const total = JANELA.fim - JANELA.inicio;
  const pct = (minutos) => (((minutos - JANELA.inicio) / total) * 100).toFixed(3);
  const hoje = hojeLocal(contexto.agora);
  const agoraMin = minutosDoDia(new Date(contexto.agora).toISOString());
  const horas = Array.from({ length: total / 60 + 1 }, (_, indice) => JANELA.inicio / 60 + indice);
  const minutos = (texto) => (texto ? Number(texto.slice(0, 2)) * 60 + Number(texto.slice(3, 5)) : null);
  const linhaAgora = dia === hoje && agoraMin > JANELA.inicio && agoraMin < JANELA.fim
    ? `<span class="ag-trilha-agora" style="--pos:${pct(agoraMin)}%" aria-hidden="true"></span>` : "";

  const salas = (s.rooms || []).filter((row) => !o.room || row.id === o.room);
  const linhas = salas.map((sala) => {
    const daSala = itensDoDia.filter((item) => item.room_id === sala.id && item.mode !== "online");
    const emManutencao = (s.maintenance_orders || []).some((ordem) => ordem.room_id === sala.id && ordem.status === "open");
    const bloqueada = sala.status !== "available" || emManutencao;
    const abre = minutos(sala.opens_at);
    const fecha = minutos(sala.closes_at);
    const fechado = [
      abre != null && abre > JANELA.inicio ? `<span class="ag-trilha-fechado" style="--esq:0%;--larg:${pct(abre)}%" aria-hidden="true"></span>` : "",
      fecha != null && fecha < JANELA.fim ? `<span class="ag-trilha-fechado" style="--esq:${pct(fecha)}%;--larg:${(100 - Number(pct(fecha))).toFixed(3)}%" aria-hidden="true"><span>fechado</span></span>` : "",
    ].join("");
    const taxa = resumo.medidas.get(sala.id);
    const ocupacao = taxa == null ? "—" : `${taxa}%`;
    return `<div class="ag-sala${bloqueada ? " is-bloqueada" : ""}">
      <div class="ag-sala-nome">
        <strong>${esc(sala.name)}</strong>
        <small>${sala.capacity ? plural(sala.capacity, "lugar", "lugares") : "capacidade a confirmar"}</small>
        <span class="ag-sala-ocupacao"><span class="ag-medidor" aria-hidden="true"><span style="width:${taxa || 0}%"></span></span><small>${ocupacao}</small></span>
      </div>
      <div class="ag-trilha" data-op-trilha="${esc(sala.id)}" data-dia="${dia}" ${bloqueada ? "" : 'data-reservavel'} role="group" aria-label="${esc(`${sala.name}, ocupação hoje ${ocupacao}`)}">
        ${bloqueada ? `<span class="ag-trilha-bloqueio">${esc(emManutencao ? "Em manutenção" : translate(sala.status))}</span>` : fechado}
        ${daSala.map((item) => reservaNaTrilha(s, item, daSala, contexto)).join("")}
        ${linhaAgora}
      </div>
      ${bloqueada ? "" : `<button type="button" class="ag-sr ag-reservar" data-op-action="novo-agendamento" data-room="${esc(sala.id)}">Reservar na ${esc(sala.name)}</button>`}
    </div>`;
  }).join("");

  const online = itensDoDia.filter((item) => item.mode === "online");
  const linhaOnline = online.length || !o.room ? `<div class="ag-sala is-online">
      <div class="ag-sala-nome"><strong>${icone("video", { classe: "ag-tipo-icone" })} Online</strong><small>sem sala</small></div>
      <div class="ag-trilha" role="group" aria-label="Atendimentos online">${online.map((item) => reservaNaTrilha(s, item, online, contexto)).join("")}${linhaAgora}</div>
    </div>` : "";

  const proximo = resumo.proximo;
  return `<p class="ag-resumo">
      <span><strong>${resumo.livres} de ${resumo.total}</strong> salas livres agora</span>
      ${proximo ? `<span>Próximo: <strong>${esc(proximo.title)}</strong> às ${esc(horaDe(proximo.starts_at))} · ${esc(localDe(s, proximo))}</span>` : "<span>Nenhuma atividade até o fim do dia</span>"}
      <span>Ocupação hoje <strong>${resumo.media == null ? "—" : `${resumo.media}%`}</strong></span>
      ${resumo.emConflito ? `<span class="ag-resumo-conflito">${icone("triangle-alert")}<strong>${plural(resumo.emConflito, "evento", "eventos")}</strong> em conflito</span>` : ""}
    </p>
    <div class="ag-salas">
      <div class="ag-salas-eixo" aria-hidden="true"><span></span><div class="ag-eixo">${horas.map((h) => `<span style="--pos:${pct(h * 60)}%">${String(h).padStart(2, "0")}h</span>`).join("")}</div></div>
      ${linhas}
      ${linhaOnline}
    </div>`;
}

/* ------------------------------------------------------------------ ocupação */

function ocupacao(s, o, contexto) {
  const dia = o.date;
  const doDia = (s.schedule_items || []).filter((item) => diaDe(item.starts_at) === dia);
  const resumo = resumoDoDia(s, dia, doDia, contexto);
  const horas = Array.from({ length: (JANELA.fim - JANELA.inicio) / 60 }, (_, indice) => JANELA.inicio / 60 + indice);
  const mapa = mapaDeCalor(s, dia, horas).filter((linha) => !o.room || linha.sala.id === o.room);
  const pico = horarioDePico(mapa);
  const ranking = (s.rooms || [])
    .filter((row) => !o.room || row.id === o.room)
    .map((row) => ({ sala: row, taxa: resumo.medidas.get(row.id) }))
    .sort((a, b) => (b.taxa ?? -1) - (a.taxa ?? -1));
  const emConflito = doDia.filter((item) => contexto.conflitos.get(item.id)?.size);

  return `<div class="ag-ocupacao">
    <div class="ag-numeros">
      <p><strong>${resumo.livres} de ${resumo.total}</strong><small>salas livres agora</small></p>
      <p><strong>${resumo.media == null ? "—" : `${resumo.media}%`}</strong><small>ocupação média hoje</small></p>
      <p><strong>${pico ? `${String(pico.hora).padStart(2, "0")}h–${String(pico.hora + 1).padStart(2, "0")}h` : "—"}</strong><small>horário mais disputado</small></p>
      <p${emConflito.length ? ' class="is-alerta"' : ""}><strong>${emConflito.length}</strong><small>${emConflito.length === 1 ? "evento em conflito" : "eventos em conflito"}</small></p>
    </div>
    <div class="ag-ocupacao-colunas">
      <section class="ag-ranking" aria-labelledby="ag-ranking-titulo">
        <h3 id="ag-ranking-titulo">Salas, da mais à menos ocupada</h3>
        <ol>${ranking.map(({ sala, taxa }) => `<li><span>${esc(sala.name)}</span><span class="ag-medidor" aria-hidden="true"><span style="width:${taxa || 0}%"></span></span><strong>${taxa == null ? esc(translate(sala.status)) : `${taxa}%`}</strong></li>`).join("")}</ol>
      </section>
      <section class="ag-calor" aria-labelledby="ag-calor-titulo">
        <h3 id="ag-calor-titulo">Mapa do dia</h3>
        <div class="ag-calor-grade" style="--horas:${horas.length}">
          <span></span>${horas.map((h) => `<span class="ag-calor-hora">${String(h).padStart(2, "0")}h</span>`).join("")}
          ${mapa.map((linha) => `<span class="ag-calor-sala">${esc(linha.sala.name)}</span>${linha.horas.map(({ hora, fracao }) => `<span class="ag-calor-celula" style="--nivel:${fracao}" title="${esc(`${linha.sala.name}, ${String(hora).padStart(2, "0")}h: ${Math.round(fracao * 100)}% ocupada`)}"></span>`).join("")}`).join("")}
        </div>
        <p class="ag-legenda"><span class="ag-calor-celula" style="--nivel:0"></span> livre <span class="ag-calor-celula" style="--nivel:.5"></span> meia hora <span class="ag-calor-celula" style="--nivel:1"></span> hora cheia</p>
      </section>
    </div>
    ${emConflito.length ? `<section class="ag-conflitos" aria-labelledby="ag-conflitos-titulo"><h3 id="ag-conflitos-titulo">${icone("triangle-alert")} Conflitos do dia</h3><ul>${emConflito.map((item) => `<li><button type="button" data-op-action="detalhes" data-id="${esc(item.id)}"><strong>${esc(item.title)}</strong> · ${esc(horaDe(item.starts_at))}–${esc(horaDe(item.ends_at))} · ${esc(localDe(s, item))}</button></li>`).join("")}</ul></section>` : ""}
  </div>`;
}

/* ------------------------------------------------------------------ montagem */

export function renderAgenda(s, o = {}) {
  const agora = o.agora ?? Date.now();
  const visao = visaoEfetiva(o.view, o.estreito);
  const periodo = periodoDaVisao(visao, o.date);
  const noPeriodo = (s.schedule_items || []).filter((item) => {
    const dia = diaDe(item.starts_at);
    return dia >= periodo.inicio && (!periodo.fim || dia < periodo.fim);
  });
  const itens = filtrarAgenda(s, noPeriodo, {
    sala: visao === "room" || visao === "occupancy" ? "" : o.room, familia: o.familia, situacao: o.situacao,
    profissional: o.profissional, busca: o.search, agora,
  });
  const contexto = { agora, conflitos: conflitos(s.schedule_items || []), selecionado: o.selecionado || "" };
  const filtrosDaTrilha = visao === "room" ? filtrarAgenda(s, noPeriodo, { familia: o.familia, situacao: o.situacao, profissional: o.profissional, busca: o.search, agora }) : itens;

  let conteudo;
  if (visao === "week") conteudo = gradeDeHoras(s, semanaDe(o.date), itens, contexto);
  else if (visao === "day") conteudo = faixaDaSemana(s, o.date, filtrarAgenda(s, (s.schedule_items || []).filter((item) => semanaDe(o.date).includes(diaDe(item.starts_at))), { sala: o.room, busca: o.search, agora }), contexto) + gradeDeHoras(s, [o.date], itens, contexto);
  else if (visao === "month") conteudo = mes(s, o, itens, contexto);
  else if (visao === "room") conteudo = porSala(s, o, filtrosDaTrilha, contexto);
  else if (visao === "occupancy") conteudo = ocupacao(s, o, contexto);
  else conteudo = tabelaDaAgenda(s, itens.slice(0, 300), { agora, vazio: o.search ? "Nada encontrado com essa busca." : "Nenhuma atividade a partir desta data." });

  const semResultado = o.search && !itens.length && visao !== "list" && visao !== "occupancy"
    ? `<p class="ag-aviso-busca" role="status">Nenhuma atividade encontrada para “${esc(o.search)}” neste período.</p>` : "";

  return `<div class="ag" data-visao="${visao}">${cabecalho(o)}${barra(s, o, visao)}${semResultado}<div class="ag-conteudo">${conteudo}</div></div>`;
}

/* ------------------------------------------------------------------ detalhes, menu e assistente */

const REGRAS = { daily: () => "Todos os dias", weekly: (dia) => `Toda ${diaLongo(dia)}`, fortnightly: () => "A cada 15 dias", monthly: () => "Todo mês", custom: () => "Repete" };

export function renderDetalhes(s, id, { agora = Date.now() } = {}) {
  const item = (s.schedule_items || []).find((row) => row.id === id);
  if (!item) return "";
  const situacao = situacaoDe(item, agora);
  const familia = familiaDe(item);
  const dia = diaDe(item.starts_at);
  const sala = salaDe(s, item.room_id);
  const capacidade = capacidadeDe(s, item);
  const serie = (s.schedule_series || []).find((row) => row.id === item.series_id);
  const regra = serie?.rule?.frequency ? REGRAS[serie.rule.frequency]?.(dia) : "";
  const choques = [...(conflitos(s.schedule_items || []).get(item.id) || [])];
  const outros = (s.schedule_items || []).filter((row) => row.id !== item.id && row.status !== "cancelled"
    && Date.parse(row.starts_at) < Date.parse(item.ends_at) && Date.parse(item.starts_at) < Date.parse(row.ends_at)
    && ((choques.includes("sala") && row.room_id && row.room_id === item.room_id) || (choques.includes("profissional") && row.professional_id && row.professional_id === item.professional_id)));
  const agendada = item.status === "booked";
  const dado = (rotulo, valor) => (valor ? `<div><dt>${esc(rotulo)}</dt><dd>${valor}</dd></div>` : "");

  return `<div class="ag-detalhe" data-familia="${familia}">
    <header class="ag-detalhe-topo">
      <p class="ag-detalhe-tipo">${icone(FAMILIAS[familia].icone, { classe: "ag-tipo-icone" })}${esc(FAMILIAS[familia].rotulo)}${translate(item.kind) !== FAMILIAS[familia].rotulo && familia !== "online" ? ` · ${esc(translate(item.kind))}` : ""}</p>
      <button type="button" class="ag-icone-botao" data-op-drawer-fechar aria-label="Fechar detalhes" data-dica="Fechar">${icone("x")}</button>
    </header>
    <h2 id="op-drawer-titulo" tabindex="-1">${esc(item.title)}</h2>
    <p class="ag-detalhe-quando">${esc(`${diaLongo(dia).charAt(0).toUpperCase()}${diaLongo(dia).slice(1)}, ${Number(dia.slice(8))} ${mesCurto(dia)}`)} · <time>${esc(horaDe(item.starts_at))}–${esc(horaDe(item.ends_at))}</time></p>
    ${regra ? `<p class="ag-detalhe-serie">${icone("repeat")}${esc(regra)}</p>` : ""}
    ${outros.length ? `<p class="ag-alerta">${icone("triangle-alert")}<span>${choques.includes("sala") ? "Conflito de sala" : "Conflito de profissional"} com ${outros.map((row) => `“${esc(row.title)}” (${esc(horaDe(row.starts_at))}–${esc(horaDe(row.ends_at))})`).join(", ")}.</span></p>` : ""}
    <dl class="ag-detalhe-dados">
      ${item.mode === "online" ? dado("Modalidade", `Online${item.online_url ? ` · <a href="${esc(item.online_url)}" target="_blank" rel="noopener noreferrer">abrir link</a>` : ""}`) : dado("Sala", sala ? `${esc(sala.name)}${sala.capacity ? ` <small>(${plural(sala.capacity, "lugar", "lugares")})</small>` : ""}` : "A definir")}
      ${dado("Profissional", esc(pessoa(s, item.professional_id)))}
      ${dado("Cliente", esc(pessoa(s, item.client_id)))}
      ${dado("Participantes", `${capacidade ? `${item.participants} de ${capacidade}` : esc(plural(item.participants || 0, "participante", "participantes"))}${capacidade ? `<span class="ag-medidor" aria-hidden="true"><span style="width:${Math.min(100, Math.round((item.participants / capacidade) * 100))}%"></span></span>` : ""}`)}
      ${dado("Situação", situacaoBadge(situacao))}
      ${item.cancel_reason ? dado("Motivo do cancelamento", esc(item.cancel_reason)) : ""}
      ${item.notes ? dado("Observações", esc(item.notes)) : ""}
    </dl>
    <footer class="ag-detalhe-acoes">
      ${agendada ? `<button type="button" class="ag-botao" data-op-action="schedule" data-id="${esc(item.id)}">Editar</button><button type="button" class="ag-primario" data-op-action="complete" data-id="${esc(item.id)}">${icone("check")}<span>Concluir</span></button>` : `<p class="ag-detalhe-historico">${situacao === "concluida" ? "Atividade concluída: o registro fica como histórico." : "Atividade cancelada: o registro fica como histórico."}</p>`}
      ${botaoMais(item)}
    </footer>
  </div>`;
}

export function renderMenuDeAcoes(s, id) {
  const item = (s.schedule_items || []).find((row) => row.id === id);
  if (!item) return "";
  const agendada = item.status === "booked";
  const opcao = (acao, rotulo, nomeIcone, extra = "") => `<button type="button" role="menuitem" data-op-action="${acao}" data-id="${esc(item.id)}" ${extra}>${icone(nomeIcone)}<span>${rotulo}</span></button>`;
  return [
    opcao("schedule", "Editar", "pen-line", agendada ? "" : "disabled"),
    opcao("complete", "Concluir", "check", agendada ? "" : "disabled"),
    opcao("reagendar", "Reagendar", "clock", agendada ? "" : "disabled"),
    opcao("cancel", "Cancelar", "x", agendada ? 'class="is-perigo"' : 'class="is-perigo" disabled'),
    opcao("duplicar", "Duplicar", "plus"),
  ].join("");
}

export const DESCRICOES_DE_TIPO = Object.freeze({
  atendimento: "Sessão com profissional e cliente, em uma sala",
  curso: "Aula de uma turma, com sala e professor",
  atividade: "Prática em grupo: yoga, dança, meditação",
  evento: "Workshop, palestra ou encontro aberto",
  locacao: "Espaço reservado para terceiros",
  online: "Atendimento à distância, com link",
});

export function renderEscolhaDeTipo() {
  return `<div class="op-span ag-assistente">
    <p class="ag-assistente-pergunta" id="ag-assistente-pergunta">O que deseja agendar?</p>
    <div class="ag-tipos" role="group" aria-labelledby="ag-assistente-pergunta">${Object.entries(FAMILIAS).map(([chave, { rotulo, icone: nome }]) => `<button type="button" class="ag-tipo-opcao" data-op-novo-tipo="${chave}" data-familia="${chave}">${icone(nome)}<strong>${rotulo}</strong><small>${esc(DESCRICOES_DE_TIPO[chave])}</small></button>`).join("")}</div>
  </div>`;
}

/* Campos que cada tipo mostra no formulário. O resto fica em "Mostrar todos os campos". */
export const CAMPOS_POR_FAMILIA = Object.freeze({
  atendimento: ["title", "room_id", "professional_id", "client_id", "starts_at", "ends_at", "price_reais", "notes", "recorrencia"],
  online: ["title", "professional_id", "client_id", "starts_at", "ends_at", "online_url", "price_reais", "notes", "recorrencia"],
  curso: ["title", "offering_id", "room_id", "professional_id", "starts_at", "ends_at", "participants", "price_reais", "recursos", "recorrencia", "notes"],
  atividade: ["title", "offering_id", "room_id", "professional_id", "starts_at", "ends_at", "participants", "price_reais", "recursos", "recorrencia", "notes"],
  evento: ["title", "kind", "room_id", "professional_id", "starts_at", "ends_at", "participants", "price_reais", "setup_minutes", "teardown_minutes", "recursos", "extras", "notes"],
  locacao: ["title", "room_id", "client_id", "starts_at", "ends_at", "participants", "price_reais", "setup_minutes", "teardown_minutes", "recursos", "extras", "notes"],
});

export const PREDEFINICOES = Object.freeze({
  atendimento: { kind: "appointment", mode: "presencial" },
  online: { kind: "appointment", mode: "online" },
  curso: { kind: "course", mode: "presencial" },
  atividade: { kind: "activity", mode: "presencial" },
  evento: { kind: "event", mode: "presencial" },
  locacao: { kind: "rental", mode: "presencial" },
});

export function renderConflito({ mensagens, sugestoes, motivo }) {
  if (!mensagens.length) return "";
  const botoes = sugestoes.map((sugestao) => sugestao.tipo === "horario"
    ? `<button type="button" class="ag-botao" data-op-sugestao="horario" data-inicio="${esc(sugestao.inicio)}" data-fim="${esc(sugestao.fim)}">Usar ${esc(sugestao.inicio.slice(11, 16))}–${esc(sugestao.fim.slice(11, 16))}</button>`
    : `<button type="button" class="ag-botao" data-op-sugestao="sala" data-sala="${esc(sugestao.sala.id)}">Usar ${esc(sugestao.sala.name)} <small>(${plural(sugestao.sala.capacity, "lugar", "lugares")})</small></button>`).join("");
  return `<p class="ag-alerta">${icone("triangle-alert")}<span><strong>${motivo === "sala" ? "Sala ocupada." : "Profissional ocupado."}</strong> ${mensagens.map(esc).join(" ")}</span></p>${botoes ? `<div class="ag-sugestoes"><small>Sugestões:</small>${botoes}</div>` : ""}`;
}
