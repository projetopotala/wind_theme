/*
 * MP-FIX-01 — AVISOS ABERTOS E A FAIXA DE NAVEGAÇÃO NO CELULAR.
 *
 * MP-01: abrir um aviso gravava "lido" no banco (ou na demonstração), mas a
 * cópia que a SPA desenha continuava com o aviso novo. O contador das abas, a
 * lista de Notificações e o botão da conta passavam a discordar entre si.
 *
 * MP-02: a cada troca de tela o cabeçalho nasce de novo e a faixa de abas volta
 * ao começo. No celular, a aba da tela aberta ficava fora da faixa visível.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { criarAberturaDeAvisos, marcarAvisoNaLista, refletirAvisoLido } from "../../outputs/js/conta/spa/avisos.js";
import {
  contarAvisosNovos,
  conteudoDoLinkDeAvisos,
  renderizarCabecalho,
  renderizarLinkDeAvisos,
  rolagemQueRevelaAba,
} from "../../outputs/js/conta/spa/vistas/comum.js";
import { ROTAS } from "../../outputs/js/conta/spa/roteador.js";
import { criarSessao } from "../../outputs/js/conta/sessao.js";
import { criarAutenticacaoDemonstracao, criarDadosDemonstracao } from "../../outputs/js/conta/adaptadores/demonstracao.js";
import { naoLidas, notificacoesPermitidas } from "../../outputs/js/conta/leituras.js";

const AGORA = new Date("2026-10-23T14:00:00.000Z");

/* O Git no Windows entrega o arquivo com CRLF; as expressões abaixo leem linhas. */
const lerApp = async () => (await readFile(new URL("../../outputs/js/conta/spa/app.js", import.meta.url), "utf8")).replace(/\r\n/g, "\n");

function armazenamentoEmMemoria() {
  const mapa = new Map();
  return {
    getItem: (chave) => (mapa.has(chave) ? mapa.get(chave) : null),
    setItem: (chave, valor) => mapa.set(chave, String(valor)),
    removeItem: (chave) => mapa.delete(chave),
    key: (indice) => [...mapa.keys()][indice] ?? null,
    get length() {
      return mapa.size;
    },
  };
}

/* Uma visita de demonstração completa, com o armazenamento em memória no lugar do navegador. */
async function visitaDeDemonstracao(armazenamento = armazenamentoEmMemoria()) {
  const autenticacao = criarAutenticacaoDemonstracao({ armazenamento, agora: () => AGORA });
  await autenticacao.iniciarVisita();
  const sessao = criarSessao({
    autenticacao,
    dados: criarDadosDemonstracao({ armazenamento, agora: () => AGORA }),
    agora: () => AGORA,
  });
  await sessao.iniciar();
  return { sessao, armazenamento };
}

/* O que cada parte da tela mostra como "novos". */
function contadores(dados, estado) {
  const cabecalho = renderizarCabecalho({ estado, rota: ROTAS.find((rota) => rota.nome === "agenda"), dados });
  const noCabecalho = Number(cabecalho.match(/class="mp-contador">(\d+)/)?.[1] || 0);
  return { cabecalho: noCabecalho, copia: naoLidas(notificacoesPermitidas(dados.notificacoes, dados.preferencias)) };
}

/*
 * UM PALCO MÍNIMO, SEM JSDOM.
 *
 * `refletirAvisoLido` só consulta o palco por dois seletores. Este falso responde
 * a eles e guarda um formulário "pela metade", como o da Agenda no D1. Se a tela
 * fosse redesenhada, o teste veria `redesenhos` subir; se o link fosse trocado
 * por outro elemento, veria `link` diferente.
 */
function palcoFalso({ vista = "agenda", comLink = true, linkInicial = conteudoDoLinkDeAvisos(2) } = {}) {
  const link = comLink ? { innerHTML: linkInicial } : null;
  const campo = { id: "mp-comp-titulo", value: "Leitura em casa", selectionStart: 15 };
  let redesenhos = 0;
  return {
    link,
    campo,
    get redesenhos() {
      return redesenhos;
    },
    redesenhar: () => {
      redesenhos += 1;
    },
    querySelector(seletor) {
      if (seletor === ".mp-nav-avisos") return link;
      if (seletor === `[data-vista='${vista}']`) return { vista };
      if (seletor === "#mp-comp-titulo") return campo;
      return null;
    },
  };
}

const ROTA = (nome) => ROTAS.find((rota) => rota.nome === nome);

async function contagemGuardada(sessao) {
  const [avisos, preferencias] = await Promise.all([
    sessao.colecao("notificacoes").listar(),
    sessao.colecao("preferencias").listar(),
  ]);
  return naoLidas(notificacoesPermitidas(avisos, preferencias));
}

/* ------------------------------------------------------------------
 * MP-01
 * ------------------------------------------------------------------ */

test("MP-01: abrir um aviso novo deixa a cópia, o cabeçalho e o armazenamento de acordo", async () => {
  const { sessao } = await visitaDeDemonstracao();
  let dados = {
    notificacoes: await sessao.colecao("notificacoes").listar(),
    preferencias: await sessao.colecao("preferencias").listar(),
  };
  const antes = contadores(dados, sessao.obter());
  assert.equal(antes.cabecalho, 2, "a semente de demonstração começa com dois avisos novos");

  /* A pessoa já foi para a Agenda, para onde o aviso aponta. */
  const palco = palcoFalso({ vista: "agenda" });
  const abertura = criarAberturaDeAvisos({
    acharAviso: (id) => dados.notificacoes.find((item) => item.id === id),
    persistir: (id, quando) => sessao.colecao("notificacoes").marcarLida(id, quando),
    aoConfirmar: (id, quando) => {
      dados = { ...dados, notificacoes: marcarAvisoNaLista(dados.notificacoes, id, quando) };
      refletirAvisoLido({ palco, rota: ROTA("agenda"), dados, redesenhar: palco.redesenhar });
    },
    agora: () => AGORA,
  });

  assert.equal(await abertura.abrir("demo-aviso-aula"), true);
  const depois = contadores(dados, sessao.obter());
  assert.equal(depois.cabecalho, 1, "o contador das abas continuou com o valor antigo");
  assert.equal(depois.copia, 1);
  assert.equal(await contagemGuardada(sessao), 1, "o botão da conta recontaria outro número");
  assert.equal(palco.link.innerHTML, conteudoDoLinkDeAvisos(1), "o link da tela atual não mostrou a contagem nova");
  assert.equal(dados.notificacoes.find((item) => item.id === "demo-aviso-aula").lidaEm, AGORA.toISOString());
});

test("MP-01: depois de recarregar, a demonstração lembra o aviso lido", async () => {
  const armazenamento = armazenamentoEmMemoria();
  const primeira = await visitaDeDemonstracao(armazenamento);
  const lista = await primeira.sessao.colecao("notificacoes").listar();
  const abertura = criarAberturaDeAvisos({
    acharAviso: (id) => lista.find((item) => item.id === id),
    persistir: (id, quando) => primeira.sessao.colecao("notificacoes").marcarLida(id, quando),
    aoConfirmar: () => {},
    agora: () => AGORA,
  });
  await abertura.abrir("demo-aviso-aula");

  const recarregada = await visitaDeDemonstracao(armazenamento);
  assert.equal(await contagemGuardada(recarregada.sessao), 1);
  const aula = (await recarregada.sessao.colecao("notificacoes").listar()).find((item) => item.id === "demo-aviso-aula");
  assert.equal(aula.lidaEm, AGORA.toISOString());
});

test("MP-01: se a gravação falha, nada muda na tela e o aviso continua novo", async () => {
  const lista = [{ id: "a1", lidaEm: null }];
  let confirmados = 0;
  const abertura = criarAberturaDeAvisos({
    acharAviso: (id) => lista.find((item) => item.id === id),
    persistir: async () => {
      throw new Error("rede caiu");
    },
    aoConfirmar: () => {
      confirmados += 1;
    },
    agora: () => AGORA,
  });

  assert.equal(await abertura.abrir("a1"), false);
  assert.equal(confirmados, 0, "a tela marcou como lido algo que o banco recusou");
  assert.equal(lista[0].lidaEm, null);
  assert.equal(abertura.pendente("a1"), false, "uma falha não pode travar novas tentativas");

  /* E a pessoa pode tentar de novo depois. */
  let tentativas = 0;
  const segunda = criarAberturaDeAvisos({
    acharAviso: () => lista[0],
    persistir: async () => {
      tentativas += 1;
    },
    aoConfirmar: () => {},
  });
  assert.equal(await segunda.abrir("a1"), true);
  assert.equal(tentativas, 1);
});

test("MP-01: aviso já lido, inexistente ou com gravação em curso não gera outro pedido", async () => {
  const lista = [{ id: "lido", lidaEm: "2026-10-20T10:00:00.000Z" }, { id: "novo", lidaEm: null }];
  const pedidos = [];
  let liberar;
  const abertura = criarAberturaDeAvisos({
    acharAviso: (id) => lista.find((item) => item.id === id),
    persistir: (id) => {
      pedidos.push(id);
      return new Promise((pronto) => {
        liberar = pronto;
      });
    },
    aoConfirmar: () => {},
  });

  assert.equal(abertura.abrir("lido"), null);
  assert.equal(abertura.abrir("fantasma"), null);
  const primeira = abertura.abrir("novo");
  assert.equal(abertura.abrir("novo"), null, "dois toques rápidos viraram dois pedidos");
  assert.equal(abertura.pendente("novo"), true);
  liberar();
  assert.equal(await primeira, true);
  assert.deepEqual(pedidos, ["novo"]);
});

test("MP-01: a confirmação espera a troca de tela em curso terminar", async () => {
  const ordem = [];
  let terminarTroca;
  const troca = new Promise((pronto) => {
    terminarTroca = pronto;
  });
  const abertura = criarAberturaDeAvisos({
    acharAviso: () => ({ id: "a1", lidaEm: null }),
    persistir: async () => {
      ordem.push("gravou");
    },
    esperarTroca: () => troca.then(() => ordem.push("troca terminou")),
    aoConfirmar: () => {
      ordem.push("confirmou");
    },
  });

  const promessa = abertura.abrir("a1");
  await new Promise((pronto) => setTimeout(pronto, 0));
  assert.deepEqual(ordem, ["gravou"], "a cópia foi atualizada antes de a troca de tela desenhar o HTML antigo");
  terminarTroca();
  assert.equal(await promessa, true);
  assert.deepEqual(ordem, ["gravou", "troca terminou", "confirmou"]);
});

test("MP-01: um erro ao redesenhar não é confundido com falha de gravação", async () => {
  const abertura = criarAberturaDeAvisos({
    acharAviso: () => ({ id: "a1", lidaEm: null }),
    persistir: async () => {},
    aoConfirmar: () => {
      throw new Error("tela sumiu");
    },
  });
  await assert.rejects(abertura.abrir("a1"), /tela sumiu/);
  assert.equal(abertura.pendente("a1"), false);
});

test("MP-01: marcar na lista só toca o aviso pedido e não reescreve um lido", () => {
  const lista = [
    { id: "a", lidaEm: null },
    { id: "b", lidaEm: null },
    { id: "c", lidaEm: "2026-10-01T00:00:00.000Z" },
  ];
  const nova = marcarAvisoNaLista(lista, "a", "2026-10-23T14:00:00.000Z");
  assert.notEqual(nova, lista, "a lista original não pode ser alterada");
  assert.equal(lista[0].lidaEm, null);
  assert.equal(nova[0].lidaEm, "2026-10-23T14:00:00.000Z");
  assert.equal(nova[1], lista[1]);
  assert.equal(marcarAvisoNaLista(lista, "c", "2026-10-23T14:00:00.000Z")[2].lidaEm, "2026-10-01T00:00:00.000Z");
});

test("MP-01: a SPA usa a abertura confirmada, e não mais o pedido solto", async () => {
  const fonte = await lerApp();
  const acao = fonte.match(/"abrir-aviso":[\s\S]*?\n {4}},?\n/)?.[0] || "";
  assert.ok(acao, "a ação abrir-aviso sumiu");
  assert.doesNotMatch(acao, /\.catch\(\(\) => null\)/, "o resultado da gravação voltou a ser ignorado");
  assert.match(acao, /aberturaDeAvisos\.abrir\(/);
  const confirmar = fonte.match(/aoConfirmar: \(id, quando\) => \{[\s\S]*?\n {4}\},\n/)?.[0] || "";
  assert.ok(confirmar, "a confirmação sumiu");
  assert.match(confirmar, /marcarAvisoNaLista[\s\S]*?recontarAvisos\(\)[\s\S]*?refletirAvisoLido\(/);
  /* D1: o redesenho da tela inteira só pode vir de dentro de refletirAvisoLido. */
  assert.doesNotMatch(confirmar.replace(/redesenhar: \(\) => desenhar\("atualizacao"\)/, ""), /desenhar\(/, "a confirmação voltou a redesenhar a tela inteira");
});

/* ------------------------------------------------------------------
 * D1 — A CONFIRMAÇÃO NÃO APAGA O QUE A PESSOA ESTÁ ESCREVENDO
 * ------------------------------------------------------------------ */

test("D1: fora de Notificações, só o miolo do link muda — nada de redesenhar a tela", () => {
  for (const nome of ["agenda", "perfil", "inicio", "salvos", "configuracoes"]) {
    const palco = palcoFalso({ vista: nome });
    const linkAntes = palco.link;
    const feito = refletirAvisoLido({ palco, rota: ROTA(nome), dados: { notificacoes: [{ id: "x", tipo: "proxima_aula", lidaEm: null }], preferencias: [] }, redesenhar: palco.redesenhar });
    assert.equal(feito, "cabecalho", nome);
    assert.equal(palco.redesenhos, 0, `${nome} foi redesenhada por inteiro`);
    assert.equal(palco.link, linkAntes, "o link precisa continuar o mesmo elemento, para não perder o foco");
    assert.equal(palco.link.innerHTML, conteudoDoLinkDeAvisos(1));
    assert.equal(palco.campo.value, "Leitura em casa");
    assert.equal(palco.campo.selectionStart, 15);
  }
});

test("D1: em Notificações a lista é redesenhada, e o link fica para o redesenho", () => {
  const palco = palcoFalso({ vista: "notificacoes" });
  assert.equal(refletirAvisoLido({ palco, rota: ROTA("notificacoes"), dados: { notificacoes: [], preferencias: [] }, redesenhar: palco.redesenhar }), "lista");
  assert.equal(palco.redesenhos, 1);
  assert.equal(palco.link.innerHTML, conteudoDoLinkDeAvisos(2), "o link não precisa ser tocado antes do redesenho");

  /* Rota de Notificações ainda carregando, sem a lista na tela: só o link. */
  const carregando = palcoFalso({ vista: "nenhuma" });
  assert.equal(refletirAvisoLido({ palco: carregando, rota: ROTA("notificacoes"), dados: { notificacoes: [], preferencias: [] }, redesenhar: carregando.redesenhar }), "cabecalho");
  assert.equal(carregando.redesenhos, 0);
});

test("D1: sem tela de conta, sem dados ou sem link, não há o que atualizar", () => {
  const semLink = palcoFalso({ comLink: false });
  const dados = { notificacoes: [], preferencias: [] };
  assert.equal(refletirAvisoLido({ palco: semLink, rota: ROTA("agenda"), dados, redesenhar: semLink.redesenhar }), "nada");
  assert.equal(refletirAvisoLido({ palco: palcoFalso(), rota: ROTA("agenda"), dados: null, redesenhar: () => assert.fail() }), "nada", "quem saiu da conta não tem cópia a mostrar");
  assert.equal(refletirAvisoLido({ palco: palcoFalso(), rota: null, dados, redesenhar: () => assert.fail() }), "nada", "rota inexistente");
  assert.equal(semLink.redesenhos, 0);
});

test("D1: gravação lenta na Agenda — o link se atualiza no fim, e o texto digitado fica", async () => {
  const { sessao } = await visitaDeDemonstracao();
  let dados = {
    notificacoes: await sessao.colecao("notificacoes").listar(),
    preferencias: await sessao.colecao("preferencias").listar(),
  };
  const palco = palcoFalso({ vista: "agenda" });
  let soltarGravacao;
  const abertura = criarAberturaDeAvisos({
    acharAviso: (id) => dados.notificacoes.find((item) => item.id === id),
    persistir: async (id, quando) => {
      await new Promise((pronto) => {
        soltarGravacao = pronto;
      });
      await sessao.colecao("notificacoes").marcarLida(id, quando);
    },
    aoConfirmar: (id, quando) => {
      dados = { ...dados, notificacoes: marcarAvisoNaLista(dados.notificacoes, id, quando) };
      refletirAvisoLido({ palco, rota: ROTA("agenda"), dados, redesenhar: palco.redesenhar });
    },
    agora: () => AGORA,
  });

  const promessa = abertura.abrir("demo-aviso-aula");
  /* Enquanto grava, a pessoa continua escrevendo. */
  palco.campo.value = "Leitura em casa, capítulo 3";
  await new Promise((pronto) => setTimeout(pronto, 0));
  assert.equal(palco.link.innerHTML, conteudoDoLinkDeAvisos(2), "a tela mudou antes de o banco confirmar");
  soltarGravacao();
  assert.equal(await promessa, true);

  assert.equal(palco.campo.value, "Leitura em casa, capítulo 3", "D1: o texto digitado sumiu");
  assert.equal(palco.redesenhos, 0);
  assert.equal(palco.link.innerHTML, conteudoDoLinkDeAvisos(1));
  assert.equal(contarAvisosNovos(dados), await contagemGuardada(sessao));
});

test("D1: falha lenta não muda o link nem o formulário, e dá para tentar de novo", async () => {
  const { sessao } = await visitaDeDemonstracao();
  let dados = {
    notificacoes: await sessao.colecao("notificacoes").listar(),
    preferencias: await sessao.colecao("preferencias").listar(),
  };
  const palco = palcoFalso({ vista: "perfil" });
  let falhar = true;
  const abertura = criarAberturaDeAvisos({
    acharAviso: (id) => dados.notificacoes.find((item) => item.id === id),
    persistir: async (id, quando) => {
      await new Promise((pronto) => setTimeout(pronto, 5));
      if (falhar) throw new Error("rede caiu");
      await sessao.colecao("notificacoes").marcarLida(id, quando);
    },
    aoConfirmar: (id, quando) => {
      dados = { ...dados, notificacoes: marcarAvisoNaLista(dados.notificacoes, id, quando) };
      refletirAvisoLido({ palco, rota: ROTA("perfil"), dados, redesenhar: palco.redesenhar });
    },
  });

  assert.equal(await abertura.abrir("demo-aviso-aula"), false);
  assert.equal(palco.link.innerHTML, conteudoDoLinkDeAvisos(2));
  assert.equal(palco.campo.value, "Leitura em casa");
  assert.equal(await contagemGuardada(sessao), 2);

  falhar = false;
  assert.equal(await abertura.abrir("demo-aviso-aula"), true, "a segunda tentativa precisa ser possível");
  assert.equal(palco.link.innerHTML, conteudoDoLinkDeAvisos(1));
  assert.equal(await contagemGuardada(sessao), 1);
});

test("D1: o cabeçalho usa as mesmas peças do link, sem uma segunda regra de contagem", () => {
  const dados = {
    notificacoes: [
      { id: "a", tipo: "proxima_aula", lidaEm: null },
      { id: "b", tipo: "nova_turma", lidaEm: null },
      { id: "c", tipo: "novo_conteudo", lidaEm: null },
    ],
    preferencias: [],
  };
  /* novo_conteudo nasce desligado: só dois contam. */
  assert.equal(contarAvisosNovos(dados), 2);
  for (const nome of ["inicio", "agenda", "notificacoes"]) {
    const cabecalho = renderizarCabecalho({ estado: { usuario: { id: "u", email: "u@exemplo.com", nome: "Ana" }, perfil: null }, rota: ROTA(nome), dados });
    assert.ok(cabecalho.includes(renderizarLinkDeAvisos({ rota: ROTA(nome), dados })), nome);
  }
  /* O mesmo HTML de antes da extração. */
  assert.equal(conteudoDoLinkDeAvisos(0), "Notificações");
  assert.equal(conteudoDoLinkDeAvisos(1), "Notificações <span class=\"mp-contador\">1<span class=\"mp-sr\"> novo</span></span>");
  assert.equal(conteudoDoLinkDeAvisos(3), "Notificações <span class=\"mp-contador\">3<span class=\"mp-sr\"> novos</span></span>");
  assert.equal(renderizarLinkDeAvisos({ rota: ROTA("notificacoes"), dados: {} }), "<a class=\"mp-nav-avisos\" href=\"/meu-potala/notificacoes\" aria-current=\"page\">Notificações</a>");
  assert.equal(renderizarLinkDeAvisos({ rota: ROTA("agenda"), dados: {} }), "<a class=\"mp-nav-avisos\" href=\"/meu-potala/notificacoes\">Notificações</a>");
});

/* ------------------------------------------------------------------
 * MP-02
 * ------------------------------------------------------------------ */

/* Faixa de 284px com abas de 50px separadas por 16px — o caso medido em 320×568. */
const FAIXA = { visivel: 284, total: 657 };

test("MP-02: aba fora da faixa à direita é trazida para dentro, com folga para a vizinha", () => {
  const alvo = rolagemQueRevelaAba({ ...FAIXA, atual: 0, abaInicio: 404, abaFim: 456 });
  assert.ok(456 <= alvo + FAIXA.visivel, "a aba continuou cortada à direita");
  assert.equal(alvo, 456 + 24 - 284);
});

test("MP-02: aba fora da faixa à esquerda também volta", () => {
  assert.equal(rolagemQueRevelaAba({ ...FAIXA, atual: 300, abaInicio: 66, abaFim: 116 }), 66 - 24);
});

test("MP-02: aba já visível não mexe na faixa, e a rolagem nunca sai dos limites", () => {
  assert.equal(rolagemQueRevelaAba({ ...FAIXA, atual: 120, abaInicio: 200, abaFim: 250 }), 120);
  assert.equal(rolagemQueRevelaAba({ ...FAIXA, atual: 0, abaInicio: 0, abaFim: 40 }), 0);
  assert.equal(rolagemQueRevelaAba({ ...FAIXA, atual: 0, abaInicio: 620, abaFim: 657 }), FAIXA.total - FAIXA.visivel);
  /* No desktop a faixa cabe inteira: nada a rolar. */
  assert.equal(rolagemQueRevelaAba({ visivel: 900, total: 684, atual: 0, abaInicio: 600, abaFim: 684 }), 0);
  /* Medidas faltando não podem virar NaN. */
  assert.equal(rolagemQueRevelaAba({}), 0);
});

test("MP-02: a SPA reposiciona a faixa logo depois de trocar o miolo, antes de ligar a tela", async () => {
  const fonte = await lerApp();
  const aplicar = fonte.match(/const aplicar = \(\) => \{[\s\S]*?\n {4}\};/)?.[0] || "";
  assert.ok(aplicar, "a função aplicar sumiu");
  const troca = aplicar.indexOf("palco.innerHTML = html");
  const faixa = aplicar.indexOf("manterAbaAtivaVisivel(");
  assert.ok(troca >= 0 && faixa > troca, "a faixa precisa ser ajustada depois do HTML novo");
  assert.ok(aplicar.indexOf("ligarVista(") > faixa);
  /* Rolagem só dentro da faixa: nada de scrollIntoView, que também rola a página. */
  assert.doesNotMatch(fonte, /scrollIntoView/);
});
