import assert from "node:assert/strict";
import test from "node:test";

import {
  agruparAgenda,
  agruparHistorico,
  contarSalvosPorFiltro,
  continuarDeOndeParou,
  filtrarSalvos,
  naoLidas,
  notificacoesPermitidas,
  preferenciaAtiva,
  proximosCompromissos,
  quandoLegivel,
  recomendar,
  textoDoProgresso,
} from "../../outputs/js/conta/leituras.js";
import {
  criarCompromisso,
  criarHistorico,
  criarInscricao,
  criarNotificacao,
  criarPreferencia,
  criarProgresso,
  criarSalvo,
} from "../../outputs/js/conta/modelos.js";

/* Um "agora" fixo, no fuso da maquina: as regras sao de calendario local. */
const AGORA = new Date(2026, 8, 14, 15, 0);
const dia = (deslocamento, hora, minuto = 0) => new Date(2026, 8, 14 + deslocamento, hora, minuto);

/* ------------------------------------------------------------------
 * Historico
 * ------------------------------------------------------------------ */

test("o historico se agrupa por dia do calendario, e nao por 24 horas", () => {
  /*
   * Uma visita as 23h de ontem, vista as 8h de hoje, aconteceu ha nove horas.
   * Por horas corridas seria "hoje" — e quem lembra de ter lido a noite acharia
   * o historico errado.
   */
  const visita = (id, quando) => criarHistorico({ id, tipo: "pagina", ref: id, titulo: id, href: `/${id}.html`, visitadoEm: quando });
  const grupos = agruparHistorico([
    visita("antiga", dia(-20, 10)),
    visita("hoje", dia(0, 10)),
    visita("semana", dia(-3, 9)),
    visita("ontem-a-noite", dia(-1, 23)),
  ], new Date(2026, 8, 14, 8, 0));

  assert.deepEqual(grupos.map((grupo) => grupo.id), ["hoje", "ontem", "semana", "antes"]);
  assert.deepEqual(grupos.map((grupo) => grupo.itens[0].id), ["hoje", "ontem-a-noite", "semana", "antiga"]);
});

test("grupos vazios nao aparecem", () => {
  const grupos = agruparHistorico([
    criarHistorico({ tipo: "blog", ref: "a", titulo: "A", href: "/a.html", visitadoEm: dia(0, 9) }),
  ], AGORA);
  assert.deepEqual(grupos.map((grupo) => grupo.rotulo), ["Hoje"]);
});

/* ------------------------------------------------------------------
 * Salvos
 * ------------------------------------------------------------------ */

const SALVOS = [
  criarSalvo({ tipo: "blog", ref: "a", titulo: "Artigo", href: "/a.html", salvoEm: dia(-2, 10) }),
  criarSalvo({ tipo: "curso", ref: "b", titulo: "Curso", href: "/b.html", salvoEm: dia(-1, 10) }),
  criarSalvo({ tipo: "atividade", ref: "c", titulo: "Atividade", href: "/c.html", salvoEm: dia(0, 10) }),
  criarSalvo({ tipo: "video", ref: "d", titulo: "Video", href: "/d.html", salvoEm: dia(-5, 10) }),
];

test("o filtro Cursos traz cursos e atividades, do mais recente ao mais antigo", () => {
  assert.deepEqual(filtrarSalvos(SALVOS, "cursos").map((item) => item.ref), ["c", "b"]);
});

test("um filtro desconhecido mostra tudo, em vez de uma tela vazia", () => {
  assert.equal(filtrarSalvos(SALVOS, "xilofone").length, SALVOS.length);
});

test("a contagem por filtro bate com o que o filtro mostra", () => {
  const contagem = contarSalvosPorFiltro(SALVOS);
  assert.equal(contagem.tudo, 4);
  assert.equal(contagem.cursos, 2);
  assert.equal(contagem.videos, 1);
  assert.equal(contagem.profissionais, 0);
});

/* ------------------------------------------------------------------
 * Progresso e continuar
 * ------------------------------------------------------------------ */

test("o progresso e dito em aulas, com o singular certo", () => {
  assert.equal(textoDoProgresso({ total: 12, concluidas: 7 }), "7 de 12 aulas concluídas");
  assert.equal(textoDoProgresso({ total: 1, concluidas: 1 }), "1 de 1 aula concluída");
  assert.equal(textoDoProgresso({ total: 0, concluidas: 0 }), null);
});

test("continuar traz o que foi comecado e nao terminado, sem repetir destino", () => {
  /*
   * Um curso concluido nao e convite para continuar; um curso sem conteudo
   * online nao tem para onde voltar — a proxima aula dele mora na agenda.
   */
  const inscricoes = [
    criarInscricao({ id: "i1", cursoRef: "med", curso: "Meditação", status: "em_andamento", conteudoHref: "/inspiracao.html" }),
    criarInscricao({ id: "i2", cursoRef: "esc", curso: "Escrita", status: "concluido", conteudoHref: "/workshops.html" }),
    criarInscricao({ id: "i3", cursoRef: "des", curso: "Desenho", status: "em_andamento" }),
  ];
  const progressos = [
    criarProgresso({ inscricaoId: "i1", total: 12, concluidas: 7, ultimoAcesso: dia(-1, 20) }),
    criarProgresso({ inscricaoId: "i2", total: 4, concluidas: 4, ultimoAcesso: dia(0, 9) }),
    criarProgresso({ inscricaoId: "i3", total: 10, concluidas: 2, ultimoAcesso: dia(0, 10) }),
  ];
  const historico = [
    criarHistorico({ tipo: "blog", ref: "oraculo", titulo: "Oráculo", href: "/artigo.html?post=oraculo", progresso: 0.6, visitadoEm: dia(0, 11) }),
    criarHistorico({ tipo: "blog", ref: "oraculo", titulo: "Oráculo", href: "/artigo.html?post=oraculo", progresso: 0.3, visitadoEm: dia(-2, 11) }),
    criarHistorico({ tipo: "blog", ref: "lido", titulo: "Lido", href: "/artigo.html?post=lido", progresso: 1, visitadoEm: dia(0, 12) }),
  ];

  const itens = continuarDeOndeParou({ historico, inscricoes, progressos });
  assert.deepEqual(itens.map((item) => item.titulo), ["Oráculo", "Meditação"]);
  assert.equal(itens[1].detalhe, "7 de 12 aulas concluídas");
  assert.equal(itens[0].detalhe, "60% percorrido");
});

/* ------------------------------------------------------------------
 * Agenda
 * ------------------------------------------------------------------ */

test("a agenda inclui o que esta acontecendo agora e deixa de fora o que passou", () => {
  /* Um encontro das 14h as 16h, visto as 15h, nao e passado: a pessoa pode estar procurando a sala. */
  const itens = [
    criarCompromisso({ id: "passou", tipo: "aula", titulo: "Passou", inicio: dia(0, 9), fim: dia(0, 10) }),
    criarCompromisso({ id: "agora", tipo: "aula", titulo: "Agora", inicio: dia(0, 14), fim: dia(0, 16) }),
    criarCompromisso({ id: "depois", tipo: "evento", titulo: "Depois", inicio: dia(3, 19) }),
    criarCompromisso({ id: "amanha", tipo: "palestra", titulo: "Amanhã", inicio: dia(1, 8) }),
  ];
  assert.deepEqual(proximosCompromissos(itens, AGORA).map((item) => item.id), ["agora", "amanha", "depois"]);
  assert.deepEqual(proximosCompromissos(itens, AGORA, 1).map((item) => item.id), ["agora"]);

  const grupos = agruparAgenda(itens, AGORA);
  assert.deepEqual(grupos.map((grupo) => grupo.relativo), ["Hoje", "Amanhã", null]);
  assert.match(grupos[2].rotulo, /setembro/i);
});

test("o horario e dito como se fala", () => {
  assert.equal(quandoLegivel(dia(0, 19), AGORA), "hoje, 19h");
  assert.equal(quandoLegivel(dia(1, 8, 30), AGORA), "amanhã, 8h30");
  assert.equal(quandoLegivel(dia(-1, 20), AGORA), "ontem, 20h");
  assert.match(quandoLegivel(dia(6, 10), AGORA), /· 10h$/);
  assert.equal(quandoLegivel("nao e data", AGORA), "");
});

/* ------------------------------------------------------------------
 * Para voce
 * ------------------------------------------------------------------ */

const CATALOGO = [
  { tipo: "atividade", ref: "a", titulo: "Meditação no jardim", href: "/a.html", temas: ["meditação"] },
  { tipo: "curso", ref: "b", titulo: "Desenho", href: "/b.html", temas: ["desenho"] },
  { tipo: "blog", ref: "c", titulo: "Respirar", href: "/c.html", temas: ["Meditação", "corpo"] },
  { tipo: "evento", ref: "d", titulo: "Corpo em roda", href: "/d.html", temas: ["corpo"] },
];

test("a recomendacao segue o que a pessoa acompanha, sem acento nem caixa", () => {
  const { motivo, itens } = recomendar({
    catalogo: CATALOGO,
    acompanhados: [{ rotulo: "MEDITACAO" }],
    salvos: [{ tipo: "blog", ref: "c" }],
  });
  assert.equal(motivo, "afinidade");
  /* "c" ja foi salvo e nao volta; "d" herda o tema "corpo" do salvo; "b" nao tem afinidade nenhuma. */
  assert.deepEqual(itens.map((item) => item.ref), ["a", "d"]);
});

test("sem sinal nenhum, a recomendacao admite que e descoberta", () => {
  /* A tela diz "novos caminhos", em vez de fingir que conhece a pessoa. */
  const { motivo, itens } = recomendar({ catalogo: CATALOGO, limite: 2 });
  assert.equal(motivo, "descoberta");
  assert.equal(itens.length, 2);
});

/* ------------------------------------------------------------------
 * Avisos
 * ------------------------------------------------------------------ */

test("desligar um tipo de aviso some com ele da tela, inclusive os ja recebidos", () => {
  const avisos = [
    criarNotificacao({ id: "1", tipo: "proxima_aula", titulo: "Aula", criadaEm: dia(-1, 9) }),
    criarNotificacao({ id: "2", tipo: "novo_conteudo", titulo: "Texto novo", criadaEm: dia(0, 9) }),
    criarNotificacao({ id: "3", tipo: "nova_turma", titulo: "Turma", criadaEm: dia(0, 10), lidaEm: dia(0, 11) }),
  ];
  /* novo_conteudo nasce desligado. */
  assert.deepEqual(notificacoesPermitidas(avisos).map((aviso) => aviso.id), ["3", "1"]);
  const preferencias = [criarPreferencia({ tipo: "novo_conteudo", ativa: true }), criarPreferencia({ tipo: "proxima_aula", ativa: false })];
  assert.deepEqual(notificacoesPermitidas(avisos, preferencias).map((aviso) => aviso.id), ["3", "2"]);
  assert.equal(preferenciaAtiva("tipo_que_nao_existe"), false);
  assert.equal(naoLidas(avisos), 2);
});
