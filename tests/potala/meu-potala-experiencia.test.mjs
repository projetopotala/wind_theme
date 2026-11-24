/*
 * MEU POTALA — EXPERIÊNCIA.
 *
 * O Início diz o que vem (um compromisso só), o que espera (pedidos e
 * notificações) e o que fazer (pedir atendimento). A navegação separa o que a
 * pessoa vem fazer da biblioteca, sem perder nenhum endereço. Trabalho e vida
 * pessoal ficam em blocos diferentes. Nada aqui muda dado ou permissão.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { ROTAS, ROTAS_DA_NAVEGACAO, ROTAS_PRINCIPAIS, ROTAS_DA_BIBLIOTECA, ROTAS_DA_CONTA, resolverRota } = await import("../../outputs/js/conta/spa/roteador.js");
const { renderizarCabecalho, renderizarCarregando, renderizarMenu, vazio } = await import("../../outputs/js/conta/spa/vistas/comum.js");
const inicio = (await import("../../outputs/js/conta/spa/vistas/inicio.js")).default;
const { proximoCompromisso, pendencias } = await import("../../outputs/js/conta/spa/vistas/inicio.js");
const atendimentos = (await import("../../outputs/js/conta/spa/vistas/atendimentos.js")).default;
const { mostraInterfaceDeCliente, papelProfissional, separarAtendimentos } = await import("../../outputs/js/conta/spa/vistas/atendimentos.js");

const AGORA = new Date("2026-11-23T15:00:00Z");
const ESTADO = { usuario: { id: "u", email: "ana@exemplo.com", nome: "Ana Souza" }, perfil: null };
const rota = (nome) => ROTAS.find((r) => r.nome === nome);
const base = (extra = {}) => ({
  historico: [], inscricoes: [], progressos: [], agenda: [], salvos: [], acompanhando: [], notificacoes: [], preferencias: [],
  textosDoBlog: [], atendimentos: [], inscricoesCursos: [], opcoesAtendimento: [], horariosAtendimento: [],
  agendaProfissional: [], perfisProfissionais: [], aulasDoProfessor: [], atendimentoDisponivel: true,
  parametros: new URLSearchParams(), agora: AGORA, ...extra,
});
const pendente = { id: "a1", servico: "Acupuntura", modalidade: "presencial", status: "recebida", dataPreferida: "2026-11-28", periodoPreferido: "tarde" };
const confirmada = { id: "c3d1a4f2-0000-4000-8000-000000000001", servico: "Psicoterapia", modalidade: "online", status: "encerrada", reservaId: "r1", inicio: "2026-11-24T18:00:00Z", fim: "2026-11-24T19:00:00Z" };
const aula = { id: "g1", tipo: "aula", titulo: "Meditação — aula 8", inicio: "2026-11-25T22:00:00Z", fim: "2026-11-25T23:00:00Z", local: "Online", origem: "instituto" };

test("navegação: quatro abas principais, biblioteca e conta no 'Mais', nenhuma rota perdida", () => {
  assert.deepEqual([...ROTAS_PRINCIPAIS], ["inicio", "atendimentos", "cursos", "agenda"]);
  assert.deepEqual([...ROTAS_DA_BIBLIOTECA], ["salvos", "historico", "acompanhando"]);
  assert.deepEqual([...ROTAS_DA_CONTA], ["perfil", "notificacoes", "configuracoes"]);
  assert.deepEqual([...ROTAS_PRINCIPAIS, ...ROTAS_DA_BIBLIOTECA, "perfil"].sort(), [...ROTAS_DA_NAVEGACAO].sort());
  for (const nome of ["inicio", "perfil", "cursos", "agenda", "atendimentos", "salvos", "historico", "acompanhando", "notificacoes", "configuracoes"]) {
    const caminho = nome === "inicio" ? "/meu-potala" : `/meu-potala/${nome}`;
    assert.equal(resolverRota(caminho).rota?.nome, nome, caminho);
  }
  const html = renderizarCabecalho({ estado: ESTADO, rota: rota("salvos"), dados: base() });
  const principal = html.match(/<ul class="mp-nav-principal">([\s\S]*?)<\/ul>/)[1];
  const biblioteca = html.match(/<ul class="mp-nav-biblioteca"[^>]*>([\s\S]*?)<\/ul>/)[1];
  const conta = html.match(/<ul class="mp-nav-conta"[^>]*>([\s\S]*?)<\/ul>/)[1];
  assert.equal((principal.match(/<li>/g) || []).length, 4);
  assert.match(biblioteca, /href="\/meu-potala\/salvos" aria-current="page">Salvos/);
  assert.match(biblioteca, /href="\/meu-potala\/historico">Histórico/);
  assert.match(biblioteca, /href="\/meu-potala\/acompanhando">Acompanhando/);
  assert.match(conta, /href="\/meu-potala\/perfil">Perfil/);
  assert.match(conta, /class="mp-nav-avisos" href="\/meu-potala\/notificacoes"/);
  assert.match(conta, /href="\/meu-potala\/configuracoes">Configurações/);
  assert.ok(html.indexOf("mp-nav-principal") < html.indexOf("mp-nav-biblioteca"));
  assert.doesNotMatch(principal, /aria-current/);
});

test("menu: botão Mais controla a lista e fica ativo nas rotas da biblioteca e da conta", () => {
  const html = renderizarMenu({ estado: ESTADO, rota: rota("perfil"), dados: base() });
  assert.match(html, /<button type="button" class="mp-nav-mais"[^>]*data-acao="menu-mais"[^>]*aria-expanded="false" aria-controls="mp-nav-extra"[^>]*data-ativo/);
  assert.match(html, /id="mp-nav-extra"/);
  assert.doesNotMatch(renderizarMenu({ estado: ESTADO, rota: rota("agenda"), dados: base() }), /data-ativo/);
  assert.doesNotMatch(html, /Área profissional/);
});

test("menu: conta com vínculo profissional ganha grupo próprio com links âncora", () => {
  const html = renderizarMenu({ estado: ESTADO, rota: rota("inicio"), dados: base({ perfisProfissionais: [{ id: "p1", nome: "Dra. Lia" }], aulasDoProfessor: [{ id: "t1" }] }) });
  assert.match(html, /Área profissional/);
  assert.match(html, /href="\/meu-potala\/atendimentos#mp-agenda-profissional">Consultas que atendo/);
  assert.match(html, /href="\/meu-potala\/cursos#mp-aulas-do-professor">Turmas que ministro/);
});

test("estado vazio: ícone decorativo, título opcional e atalho como botão", () => {
  const html = vazio({ texto: "Nada aqui.", titulo: "Vazio", link: { href: "/meu-potala/cursos", texto: "Ver cursos" } });
  assert.match(html, /mp-vazio-icone" aria-hidden="true"/);
  assert.match(html, /Vazio[\s\S]*Nada aqui\./);
  assert.match(html, /mp-botao-secundario[^>]*>Ver cursos|Ver cursos<\/a>/);
});

test("dado de exemplo tem selo no alto; conta real não tem", () => {
  assert.match(renderizarCabecalho({ estado: { ...ESTADO, demonstracao: true }, rota: rota("inicio"), dados: base() }), /mp-selo-demo">Demonstração/);
  assert.match(renderizarCabecalho({ estado: { ...ESTADO, dadosEmReserva: true }, rota: rota("inicio"), dados: base() }), /mp-selo-demo">Dados de exemplo/);
  assert.doesNotMatch(renderizarCabecalho({ estado: ESTADO, rota: rota("inicio"), dados: base() }), /mp-selo-demo/);
});

test("carregando anuncia o estado e não promete dado", () => {
  const html = renderizarCarregando();
  assert.match(html, /role="status" aria-busy="true"/);
  assert.match(html, /Abrindo seu espaço/);
});

test("cliente sem compromissos: Início vazio honesto e atalho para pedir atendimento", () => {
  const html = inicio.renderizar(base());
  assert.match(html, /Próximo compromisso[\s\S]*Nada marcado por enquanto/);
  assert.match(html, /Nada esperando por você agora/);
  assert.match(html, /href="\/meu-potala\/atendimentos#mp-atendimentos-novo" data-atalho="solicitar">Solicitar atendimento/);
  assert.doesNotMatch(html, /mp-inicio-profissional/);
  for (const bloco of ["Meus cursos", "Minha agenda Potala", "Salvos"]) assert.ok(html.includes(bloco), bloco);
});

test("pedido pendente aparece como espera, nunca como compromisso", () => {
  const html = inicio.renderizar(base({ atendimentos: [pendente] }));
  assert.match(html, /Nada marcado por enquanto/);
  assert.match(html, /Aguardando a equipe[\s\S]*Pedido de atendimento: Acupuntura/);
  assert.match(html, /href="\/meu-potala\/atendimentos#mp-atendimentos-pendentes"/);
  assert.equal(proximoCompromisso({ atendimentos: [pendente], agora: AGORA }), null);
});

test("consulta confirmada é o próximo compromisso quando vem antes da agenda", () => {
  const proximo = proximoCompromisso({ agenda: [aula], atendimentos: [confirmada], agora: AGORA });
  assert.equal(proximo.tipo, "consulta");
  const html = inicio.renderizar(base({ agenda: [aula], atendimentos: [confirmada] }));
  assert.match(html, /data-proximo="consulta"[\s\S]*Psicoterapia[\s\S]*Consulta confirmada/);
  /* Antes da janela, diz quando a sala abre; o link de entrada só existe dentro dela. */
  assert.match(html, /A sala abre/);
  assert.doesNotMatch(html, /Entrar na sala/);
  /* A aula continua na agenda resumida. */
  assert.match(html, /Meditação — aula 8/);
});

test("aluno com matrícula: aula da agenda é o próximo compromisso e não se repete logo abaixo", () => {
  const html = inicio.renderizar(base({
    agenda: [aula],
    inscricoes: [{ id: "i1", curso: "Meditação para iniciantes", professor: "Monja Clara", modalidade: "Online", status: "em_andamento", proximaAula: aula.inicio }],
  }));
  assert.match(html, /data-proximo="agenda"[\s\S]*Meditação — aula 8/);
  assert.equal((html.match(/Meditação — aula 8/g) || []).length, 1);
  assert.match(html, /Depois disso/);
  assert.match(html, /Meditação para iniciantes/);
});

test("pedidos de inscrição e notificações novas entram em Aguardando", () => {
  const itens = pendencias({
    inscricoesCursos: [{ id: "ic1", status: "aguardando_pagamento", course_title: "Tai chi" }, { id: "ic2", status: "matriculada", course_title: "Yoga" }],
    notificacoes: [{ id: "n1", tipo: "proxima_aula", lidaEm: null }],
    agora: AGORA,
  });
  assert.deepEqual(itens.map((i) => i.chave), ["curso-ic1", "avisos"]);
  assert.equal(itens[1].titulo, "1 notificação nova");
});

test("profissional: trabalho em bloco próprio, sem oferecer pedido que a tela não mostraria", () => {
  const prof = {
    perfisProfissionais: [{ id: "p1", nome: "Lia" }],
    agendaProfissional: [{ id: "c1", estado: "too_early", modalidade: "online", servico: "Acupuntura", inicio: "2026-11-24T13:00:00Z", cliente: "Marcos" }],
    aulasDoProfessor: [{ id: "t1", curso: "Tai chi", modalidade: "Presencial", alunos: 8, proximaAula: "2026-11-25T11:00:00Z" }],
  };
  assert.equal(papelProfissional(prof), true);
  assert.equal(mostraInterfaceDeCliente(prof), false);
  const html = inicio.renderizar(base(prof));
  assert.match(html, /id="mp-inicio-profissional"[\s\S]*1 consulta futura[\s\S]*Marcos/);
  assert.match(html, /1 turma que você ministra/);
  assert.doesNotMatch(html, /data-atalho="solicitar"/);
  /* A consulta de trabalho não vira o "próximo compromisso" pessoal. */
  assert.match(html, /Nada marcado por enquanto/);

  const ambos = { ...prof, atendimentos: [pendente] };
  assert.equal(mostraInterfaceDeCliente(ambos), true);
  const tela = atendimentos.renderizar(base(ambos));
  assert.ok(tela.indexOf("mp-agenda-profissional") < tela.indexOf("mp-papel"));
  assert.ok(tela.indexOf("mp-papel") < tela.indexOf("mp-atendimentos-resumo"));
  assert.match(tela, /class="mp-secao mp-secao-profissional"/);
});

test("atendimentos: o que está vivo vem antes; histórico recolhido sem perder seções", () => {
  const vazio = atendimentos.renderizar(base({ opcoesAtendimento: [{ id: "o1", service: "Acupuntura", professional: "Lia", modality: "presencial" }] }));
  /* Sem nenhum pedido: convite acolhedor com botão e formulário; nada de quatro zeros nem de seções vazias. */
  assert.match(vazio, /data-sem-atendimentos/);
  assert.match(vazio, /Você ainda não pediu nenhum atendimento/);
  assert.match(vazio, /href="#mp-atendimentos-novo">Solicitar atendimento/);
  assert.ok(vazio.indexOf("data-sem-atendimentos") < vazio.indexOf('id="mp-atendimentos-novo"'), "convite antes do formulário");
  assert.doesNotMatch(vazio, /mp-atendimentos-resumo|id="mp-atendimentos-pendentes"|id="mp-atendimentos-confirmados"/);
  const desativado = atendimentos.renderizar(base({ atendimentoDisponivel: false }));
  assert.match(desativado, /data-sem-atendimentos/);
  assert.doesNotMatch(desativado, /Solicitar atendimento<\/a>|mp-atendimentos-resumo/);
  assert.match(desativado, /continuam desativadas/);
  /* Com histórico (mesmo só cancelado), os indicadores voltam. */
  const soCancelado = atendimentos.renderizar(base({ atendimentos: [{ ...pendente, id: "x", status: "cancelada" }] }));
  assert.match(soCancelado, /mp-atendimentos-resumo/);
  assert.doesNotMatch(soCancelado, /data-sem-atendimentos/);

  const cheio = atendimentos.renderizar(base({ atendimentos: [pendente, confirmada], opcoesAtendimento: [{ id: "o1", service: "A", professional: "L", modality: "presencial" }] }));
  const ordem = ['class="mp-atalho"', 'id="mp-atendimentos-confirmados"', 'id="mp-atendimentos-pendentes"', 'id="mp-atendimentos-novo"', 'class="mp-recolhido"'].map((marca) => cheio.indexOf(marca));
  assert.ok(ordem.every((i) => i >= 0), `faltou algo: ${ordem}`);
  assert.deepEqual([...ordem].sort((a, b) => a - b), ordem, `ordem ${ordem}`);
  assert.match(cheio, /href="#mp-atendimentos-novo">Solicitar outro atendimento/);
  for (const id of ["mp-atendimentos-historico", "mp-atendimentos-cancelados"]) assert.match(cheio, new RegExp(`id="${id}"`));

  const grupos = separarAtendimentos([pendente, confirmada, { ...pendente, id: "x", status: "cancelada" }], AGORA);
  assert.deepEqual(Object.fromEntries(Object.entries(grupos).map(([k, v]) => [k, v.length])), { pendentes: 1, confirmados: 1, anteriores: 0, cancelados: 1 });
});

test("âncoras: o roteador leva o #trecho e a SPA abre o recolhido sem rolar pela faixa", () => {
  const roteador = readFileSync(new URL("../../outputs/js/conta/spa/roteador.js", import.meta.url), "utf8");
  assert.match(roteador, /navegar\(`\$\{destino\.pathname\}\$\{destino\.search\}\$\{destino\.hash\}`/);
  const app = readFileSync(new URL("../../outputs/js/conta/spa/app.js", import.meta.url), "utf8");
  assert.match(app, /function revelarAncora\(/);
  assert.match(app, /\/\^\[A-Za-z\]\[\\w-\]\*\$\//, "só ids simples viram alvo");
  assert.match(app, /recolhido\.open = true/);
  assert.match(app, /addEventListener\?\.\("hashchange"/);
  assert.match(app, /removeEventListener\?\.\("hashchange"/);
});
