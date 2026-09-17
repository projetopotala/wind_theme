/*
 * REGRAS PURAS DA AGENDA — geometria do calendário, conflitos, busca e sugestões.
 *
 * Nada aqui toca DOM nem servidor: recebe o estado da operação e devolve
 * números, listas e textos. É o que permite testar "a Yoga ocupa 60 minutos a
 * partir das 18h" sem abrir navegador, e o que garante que o bloco desenhado
 * e o conflito anunciado venham da mesma conta.
 *
 * Horário: o Instituto vive em São Paulo (UTC−3, sem horário de verão desde
 * 2019), a mesma convenção de schedule.js e views.js.
 */

const MINUTO = 60000;
const DIA = 86400000;
const FUSO = -3 * 3600000;

/* 07:00–23:00: cobre a abertura das salas (07:00) e o fechamento (22:30) com folga. */
export const JANELA = Object.freeze({ inicio: 7 * 60, fim: 23 * 60 });

export const FAMILIAS = Object.freeze({
  atendimento: { rotulo: "Atendimento", icone: "heart-handshake" },
  curso: { rotulo: "Curso", icone: "graduation-cap" },
  atividade: { rotulo: "Atividade", icone: "activity" },
  evento: { rotulo: "Evento", icone: "ticket" },
  locacao: { rotulo: "Locação", icone: "key-round" },
  online: { rotulo: "Online", icone: "video" },
});

export const SITUACOES = Object.freeze({
  agendada: "Agendada",
  andamento: "Em andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
  pendente: "Pendente",
});

const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const DIAS_LONGOS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/* ------------------------------------------------------------------ datas */

export const dataHoraLocal = (valor) => new Date(Date.parse(valor) + FUSO).toISOString().slice(0, 16);
export const diaDe = (valor) => dataHoraLocal(valor).slice(0, 10);
export const horaDe = (valor) => dataHoraLocal(valor).slice(11, 16);
export const minutosDoDia = (valor) => {
  const texto = dataHoraLocal(valor);
  return Number(texto.slice(11, 13)) * 60 + Number(texto.slice(14, 16));
};
export const somarDias = (dia, n) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * DIA).toISOString().slice(0, 10);
export const diaDaSemana = (dia) => new Date(`${dia}T12:00:00Z`).getUTCDay();
export const hojeLocal = (agora = Date.now()) => dataHoraLocal(new Date(agora).toISOString()).slice(0, 10);

/* "2026-09-17T19:00" (campo datetime-local) ou ISO completo → milissegundos. */
export function instante(valor) {
  const texto = String(valor || "");
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(texto)) return Date.parse(`${texto}:00-03:00`);
  return Date.parse(texto);
}

export function inicioDaSemana(dia) {
  const semana = diaDaSemana(dia);
  return somarDias(dia, semana === 0 ? -6 : 1 - semana);
}

export const semanaDe = (dia) => Array.from({ length: 7 }, (_, indice) => somarDias(inicioDaSemana(dia), indice));

export function somarMeses(dia, n) {
  const [ano, mes, dd] = dia.split("-").map(Number);
  const alvo = new Date(Date.UTC(ano, mes - 1 + n, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(dd, ultimo));
  return alvo.toISOString().slice(0, 10);
}

/*
 * A grade do mês começa na segunda da semana do dia 1 e termina no domingo da
 * semana do último dia. A grade antiga começava sempre no dia 1, e setembro de
 * 2026 — que começa numa terça — aparecia com o dia 1 na coluna de domingo.
 */
export function gradeDoMes(dia) {
  const primeiro = `${dia.slice(0, 7)}-01`;
  const ultimo = somarDias(somarMeses(primeiro, 1), -1);
  const fim = somarDias(inicioDaSemana(ultimo), 6);
  const semanas = [];
  for (let atual = inicioDaSemana(primeiro); atual <= fim; atual = somarDias(atual, 7)) {
    semanas.push(Array.from({ length: 7 }, (_, indice) => {
      const data = somarDias(atual, indice);
      return { dia: data, doMes: data.slice(0, 7) === primeiro.slice(0, 7) };
    }));
  }
  return semanas;
}

export function periodoDaVisao(visao, dia) {
  if (visao === "week") {
    const inicio = inicioDaSemana(dia);
    return { inicio, fim: somarDias(inicio, 7) };
  }
  if (visao === "month") {
    const grade = gradeDoMes(dia);
    return { inicio: grade[0][0].dia, fim: somarDias(grade.at(-1).at(-1).dia, 1) };
  }
  if (visao === "list") return { inicio: dia, fim: null };
  return { inicio: dia, fim: somarDias(dia, 1) };
}

/* Quanto "anterior" e "próximo" andam em cada visualização. */
export function deslocarData(visao, dia, direcao) {
  if (visao === "week") return somarDias(dia, 7 * direcao);
  if (visao === "month") return somarMeses(dia, direcao);
  return somarDias(dia, direcao);
}

const partes = (dia) => {
  const [ano, mes, dd] = dia.split("-").map(Number);
  return { ano, mes: mes - 1, dd };
};

export function rotuloDoPeriodo(visao, dia) {
  const d = partes(dia);
  if (visao === "month") return `${MESES_LONGOS[d.mes]} de ${d.ano}`;
  if (visao === "week") {
    const semana = semanaDe(dia);
    const a = partes(semana[0]);
    const b = partes(semana[6]);
    if (a.ano !== b.ano) return `${a.dd} ${MESES_CURTOS[a.mes]} ${a.ano} – ${b.dd} ${MESES_CURTOS[b.mes]} ${b.ano}`;
    if (a.mes !== b.mes) return `${a.dd} ${MESES_CURTOS[a.mes]} – ${b.dd} ${MESES_CURTOS[b.mes]} ${b.ano}`;
    return `${a.dd} – ${b.dd} ${MESES_CURTOS[b.mes]} ${b.ano}`;
  }
  return `${DIAS_CURTOS[diaDaSemana(dia)]}, ${d.dd} ${MESES_CURTOS[d.mes]} ${d.ano}`;
}

export function dataPorExtenso(dia) {
  const d = partes(dia);
  const semana = DIAS_LONGOS[diaDaSemana(dia)].replace("-feira", "");
  return `${semana.charAt(0).toUpperCase()}${semana.slice(1)}, ${d.dd} de ${MESES_LONGOS[d.mes]} de ${d.ano}`;
}

export const diaCurto = (dia) => DIAS_CURTOS[diaDaSemana(dia)];
export const diaLongo = (dia) => DIAS_LONGOS[diaDaSemana(dia)];
export const mesCurto = (dia) => MESES_CURTOS[partes(dia).mes];

/* ------------------------------------------------------------------ tipo e situação */

const FAMILIA_DO_TIPO = {
  appointment: "atendimento", course: "curso", activity: "atividade", group: "atividade",
  workshop: "evento", lecture: "evento", event: "evento", cultural: "evento", rental: "locacao",
};

export function familiaDe(item) {
  if (item?.mode === "online") return "online";
  return FAMILIA_DO_TIPO[item?.kind] || "atividade";
}

/*
 * "Pendente" é o que já passou do horário e ninguém concluiu nem cancelou: é a
 * pendência real da recepção. Uma reserva futura é "Agendada".
 */
export function situacaoDe(item, agora = Date.now()) {
  if (item.status === "cancelled") return "cancelada";
  if (item.status === "completed") return "concluida";
  const inicio = Date.parse(item.starts_at);
  const fim = Date.parse(item.ends_at);
  if (agora >= inicio && agora < fim) return "andamento";
  if (agora >= fim) return "pendente";
  return "agendada";
}

/* ------------------------------------------------------------------ geometria */

const faixaReal = (item) => {
  const inicio = minutosDoDia(item.starts_at);
  const duracao = Math.round((Date.parse(item.ends_at) - Date.parse(item.starts_at)) / MINUTO);
  return [inicio, Math.min(24 * 60, inicio + duracao)];
};

/*
 * Posição vertical de cada evento de UM dia e divisão em colunas quando há
 * sobreposição. Encostar (um termina quando o outro começa) não é sobrepor.
 */
export function distribuir(itens, janela = JANELA) {
  const blocos = itens
    .map((item) => {
      const [inicio, fim] = faixaReal(item);
      const topo = Math.max(inicio, janela.inicio);
      const base = Math.min(fim, janela.fim);
      return { item, inicio, fim, topo: topo - janela.inicio, altura: base - topo };
    })
    .filter((bloco) => bloco.altura > 0)
    .sort((a, b) => a.inicio - b.inicio || b.fim - a.fim);

  let grupo = [];
  let fimDoGrupo = -1;
  const fecharGrupo = () => {
    const faixas = [];
    for (const bloco of grupo) {
      let faixa = faixas.findIndex((fim) => fim <= bloco.inicio);
      if (faixa < 0) {
        faixa = faixas.length;
        faixas.push(0);
      }
      faixas[faixa] = bloco.fim;
      bloco.faixa = faixa;
    }
    for (const bloco of grupo) bloco.faixas = faixas.length;
    grupo = [];
  };
  for (const bloco of blocos) {
    if (grupo.length && bloco.inicio >= fimDoGrupo) fecharGrupo();
    grupo.push(bloco);
    fimDoGrupo = Math.max(fimDoGrupo, bloco.fim);
  }
  if (grupo.length) fecharGrupo();
  return blocos.map(({ item, topo, altura, faixa, faixas }) => ({ item, topo, altura, faixa, faixas }));
}

/* Posição horizontal na linha do tempo por sala, em porcentagem da janela. */
export function posicaoNaLinha(item, janela = JANELA) {
  const total = janela.fim - janela.inicio;
  const [inicio, fim] = faixaReal(item);
  const a = Math.max(inicio, janela.inicio);
  const b = Math.min(fim, janela.fim);
  return {
    esquerda: ((a - janela.inicio) / total) * 100,
    largura: (Math.max(0, b - a) / total) * 100,
    preparo: ((item.setup_minutes || 0) / total) * 100,
    desmontagem: ((item.teardown_minutes || 0) / total) * 100,
  };
}

/*
 * Bloco curto demais para o título ganha o título do lado de fora, na trilha
 * livre — o jeito de um gráfico de Gantt continuar legível. Só quando há espaço:
 * três horas livres depois do bloco (o bastante para "Kung Fu · fundamentos · 32/60"
 * numa tela de 1366px). Senão, o título fica dentro, quebrando linha.
 */
export function rotuloExterno(item, itensDaSala, janela = JANELA) {
  const [inicio, fim] = faixaReal(item);
  if (fim - inicio > 90) return false;
  const proximos = itensDaSala
    .filter((outro) => outro.id !== item.id && outro.status !== "cancelled")
    .map((outro) => faixaReal(outro)[0])
    .filter((comeco) => comeco >= inicio);
  const limite = proximos.length ? Math.min(...proximos) : janela.fim;
  return limite - fim >= 180;
}

/* ------------------------------------------------------------------ conflitos */

const faixaComPreparo = (item) => [
  Date.parse(item.starts_at) - Number(item.setup_minutes || 0) * MINUTO,
  Date.parse(item.ends_at) + Number(item.teardown_minutes || 0) * MINUTO,
];
const sobrepoe = (a, b) => a[0] < b[1] && b[0] < a[1];
const usaSala = (item) => item.mode !== "online" && Boolean(item.room_id);

/* Mapa id → Set("sala" | "profissional"). Mesma regra do servidor (schedule.js). */
export function conflitos(itens) {
  const ativos = itens
    .filter((item) => item.status !== "cancelled")
    .map((item) => ({ item, faixa: faixaComPreparo(item) }))
    .sort((a, b) => a.faixa[0] - b.faixa[0]);
  const mapa = new Map();
  const marcar = (item, tipo) => {
    if (!mapa.has(item.id)) mapa.set(item.id, new Set());
    mapa.get(item.id).add(tipo);
  };
  for (let i = 0; i < ativos.length; i += 1) {
    const a = ativos[i];
    for (let j = i + 1; j < ativos.length && ativos[j].faixa[0] < a.faixa[1]; j += 1) {
      const b = ativos[j];
      if (!sobrepoe(a.faixa, b.faixa)) continue;
      if (usaSala(a.item) && usaSala(b.item) && a.item.room_id === b.item.room_id) {
        marcar(a.item, "sala");
        marcar(b.item, "sala");
      }
      if (a.item.professional_id && a.item.professional_id === b.item.professional_id) {
        marcar(a.item, "profissional");
        marcar(b.item, "profissional");
      }
    }
  }
  return mapa;
}

/* ------------------------------------------------------------------ busca */

export const normalizar = (texto) => String(texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR");

function textoPesquisavel(s, item) {
  const pessoa = (id) => (s.profiles || []).find((row) => row.id === id)?.display_name || "";
  const oferta = (s.activity_offerings || []).find((row) => row.id === item.offering_id);
  const definicao = (s.activity_definitions || []).find((row) => row.id === (oferta?.definition_id || item.definition_id));
  const participantes = (s.schedule_participants || [])
    .filter((row) => row.schedule_id === item.id && row.status !== "cancelled")
    .map((row) => pessoa(row.profile_id));
  return normalizar([
    item.title, FAMILIAS[familiaDe(item)].rotulo, pessoa(item.professional_id), pessoa(item.client_id),
    ...participantes, (s.rooms || []).find((row) => row.id === item.room_id)?.name, oferta?.title, definicao?.title,
  ].filter(Boolean).join(" "));
}

export function filtrarAgenda(s, itens, { sala = "", familia = "", situacao = "", profissional = "", busca = "", agora = Date.now() } = {}) {
  const termos = normalizar(busca).split(/\s+/).filter(Boolean);
  return itens
    .filter((item) => !sala || item.room_id === sala)
    .filter((item) => !familia || familiaDe(item) === familia)
    .filter((item) => !situacao || situacaoDe(item, agora) === situacao)
    .filter((item) => !profissional || item.professional_id === profissional)
    .filter((item) => {
      if (!termos.length) return true;
      const texto = textoPesquisavel(s, item);
      return termos.every((termo) => texto.includes(termo));
    })
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

/* ------------------------------------------------------------------ reserva e sugestões */

const hm = (ms) => dataHoraLocal(new Date(ms).toISOString()).slice(11, 16);
const localDe = (ms) => dataHoraLocal(new Date(ms).toISOString());
const relogio = (texto) => (/^\d{2}:\d{2}$/.test(texto || "") ? Number(texto.slice(0, 2)) * 60 + Number(texto.slice(3)) : null);

function salaAtende(s, sala, faixa, participantes) {
  if (sala.status !== "available" || !sala.capacity || sala.capacity < participantes) return false;
  if ((s.maintenance_orders || []).some((ordem) => ordem.room_id === sala.id && ordem.status === "open")) return false;
  const abre = relogio(sala.opens_at);
  const fecha = relogio(sala.closes_at);
  if (abre == null || fecha == null) return false;
  const dia = diaDe(new Date(faixa[0]).toISOString());
  if (diaDe(new Date(faixa[1] - 1).toISOString()) !== dia) return false;
  const inicio = minutosDoDia(new Date(faixa[0]).toISOString());
  const fim = inicio + Math.round((faixa[1] - faixa[0]) / MINUTO);
  return inicio >= abre && fim <= fecha;
}

/*
 * "A Sala Lótus já está ocupada", "O Salão Celeiro já está ocupado": o artigo
 * segue a primeira palavra do nome, que é como a recepção fala do espaço.
 */
export function salaOcupada(nome = "sala") {
  const feminino = /a$/i.test(String(nome).trim().split(" ")[0]);
  return `${feminino ? "A" : "O"} ${nome} já está ${feminino ? "ocupada" : "ocupado"}`;
}

/*
 * O que impede esta reserva, dito como a recepção falaria, e o que a desbloqueia.
 * A validação que vale é a do servidor; esta existe para avisar ENQUANTO a
 * pessoa preenche, em vez de só depois de clicar em Salvar.
 */
export function verificarReserva(s, rascunho, { limite = 2 } = {}) {
  const inicio = instante(rascunho.starts_at);
  const fim = instante(rascunho.ends_at);
  const vazio = { mensagens: [], sugestoes: [] };
  if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim <= inicio) return vazio;

  const preparo = Number(rascunho.setup_minutes || 0) * MINUTO;
  const desmontagem = Number(rascunho.teardown_minutes || 0) * MINUTO;
  const participantes = Math.max(1, Number(rascunho.participants || 1));
  const presencial = rascunho.mode !== "online" && Boolean(rascunho.room_id);
  const outros = (s.schedule_items || []).filter((item) => item.id !== rascunho.id && item.status !== "cancelled");
  const faixaDe = (a, b) => [a - preparo, b + desmontagem];
  const choques = (faixa, salaId, profissional) => outros.filter((item) => sobrepoe(faixa, faixaComPreparo(item)) && (
    (salaId && usaSala(item) && item.room_id === salaId) || (profissional && item.professional_id === profissional)
  ));

  const faixa = faixaDe(inicio, fim);
  const deSala = presencial ? outros.filter((item) => usaSala(item) && item.room_id === rascunho.room_id && sobrepoe(faixa, faixaComPreparo(item))) : [];
  const deProfissional = rascunho.professional_id ? outros.filter((item) => item.professional_id === rascunho.professional_id && sobrepoe(faixa, faixaComPreparo(item))) : [];
  if (!deSala.length && !deProfissional.length) return vazio;

  const sala = (s.rooms || []).find((row) => row.id === rascunho.room_id);
  const pessoa = (s.profiles || []).find((row) => row.id === rascunho.professional_id);
  const mensagens = [
    ...deSala.map((item) => `${salaOcupada(sala?.name)} entre ${hm(Date.parse(item.starts_at))} e ${hm(Date.parse(item.ends_at))} (“${item.title}”).`),
    ...deProfissional.map((item) => `${pessoa?.display_name || "O profissional"} já tem “${item.title}” entre ${hm(Date.parse(item.starts_at))} e ${hm(Date.parse(item.ends_at))}.`),
  ];

  const sugestoes = [];
  const duracao = fim - inicio;
  if (deSala.length && sala) {
    const livreDepois = Math.max(...deSala.map((item) => faixaComPreparo(item)[1])) + preparo;
    let candidato = Math.ceil(livreDepois / (30 * MINUTO)) * 30 * MINUTO;
    for (let tentativas = 0; tentativas < 48 && sugestoes.length < limite; tentativas += 1, candidato += 30 * MINUTO) {
      const alvo = faixaDe(candidato, candidato + duracao);
      if (!salaAtende(s, sala, [candidato, candidato + duracao], participantes)) break;
      if (!choques(alvo, sala.id, rascunho.professional_id).length) {
        sugestoes.push({ tipo: "horario", inicio: localDe(candidato), fim: localDe(candidato + duracao) });
        break;
      }
    }
    const alternativas = (s.rooms || [])
      .filter((row) => row.id !== sala.id && salaAtende(s, row, [inicio, fim], participantes) && !choques(faixa, row.id, null).length)
      .sort((a, b) => a.capacity - b.capacity)
      .slice(0, limite);
    for (const row of alternativas) sugestoes.push({ tipo: "sala", sala: row });
  }
  return { mensagens, sugestoes, motivo: deSala.length ? "sala" : "profissional" };
}

/* ------------------------------------------------------------------ ocupação */

function minutosOcupados(intervalos) {
  const ordenados = intervalos.filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  let total = 0;
  let ate = -Infinity;
  for (const [a, b] of ordenados) {
    total += Math.max(0, b - Math.max(a, ate));
    ate = Math.max(ate, b);
  }
  return total;
}

export function mapaDeCalor(s, dia, horas = Array.from({ length: 16 }, (_, indice) => indice + 7)) {
  return (s.rooms || []).map((sala) => {
    const itens = (s.schedule_items || []).filter((item) => item.room_id === sala.id && usaSala(item) && item.status !== "cancelled" && diaDe(item.starts_at) === dia);
    return {
      sala,
      horas: horas.map((hora) => {
        const inicio = hora * 60;
        const fim = inicio + 60;
        const intervalos = itens.map((item) => {
          const [a, b] = faixaReal(item);
          return [Math.max(a, inicio), Math.min(b, fim)];
        });
        return { hora, fracao: minutosOcupados(intervalos) / 60 };
      }),
    };
  });
}

/* A hora com mais salas ocupadas ao mesmo tempo (soma das frações). */
export function horarioDePico(mapa) {
  const somas = new Map();
  for (const linha of mapa) for (const { hora, fracao } of linha.horas) somas.set(hora, (somas.get(hora) || 0) + fracao);
  let melhor = null;
  for (const [hora, soma] of somas) if (soma > 0 && (!melhor || soma > melhor.soma)) melhor = { hora, soma };
  return melhor;
}
