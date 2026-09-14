import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

import { ESTADOS_DO_PAINEL, renderizarPainel } from "../../outputs/js/conta/painel-conta.js";
import { BASE, ROTAS, caminhoDa, deveInterceptar, resolverRota } from "../../outputs/js/conta/spa/roteador.js";
import { VALIDADE_PENDENTE, pendenteValido } from "../../outputs/js/conta/alternadores.js";
import { JANELA_DE_VISITA, deveRegistrar, itemDeclarado } from "../../outputs/js/conta/rastro.js";
import { autenticacaoPreguicosa, haSessaoGuardada, querDemonstracao } from "../../outputs/js/conta/conta.js";
import { criarAcoesComConta } from "../../outputs/js/conta/acoes-com-conta.js";
import { VISTAS } from "../../outputs/js/conta/spa/app.js";
import { renderizarCabecalho, renderizarVisitante } from "../../outputs/js/conta/spa/vistas/comum.js";
import { filtroDoEndereco } from "../../outputs/js/conta/spa/vistas/salvos.js";
import { sementeDeDemonstracao } from "../../outputs/js/conta/dados-demonstracao.js";
import {
  criarAcompanhado,
  criarCompromisso,
  criarHistorico,
  criarNotificacao,
  criarPerfil,
  criarSalvo,
  criarUsuario,
} from "../../outputs/js/conta/modelos.js";

const lerSaida = (relativo) => readFile(new URL(`../../outputs/${relativo}`, import.meta.url), "utf8");
const MALICIOSO = "\"><img src=x onerror=alert(1)>";

/* ------------------------------------------------------------------
 * O painel
 * ------------------------------------------------------------------ */

test("o painel do visitante diz o que o Potala pediu e oferece as duas portas", () => {
  const intro = renderizarPainel("intro");
  assert.match(intro, /Seu espaço no Potala/);
  assert.match(intro, /Guarde aquilo que encontra pelo caminho e continue sua jornada quando quiser\./);
  assert.match(intro, /data-conta-ir="entrar">Entrar</);
  assert.match(intro, /data-conta-ir="criar">Criar uma conta</);
  /* Não é um botão de "Login" genérico: nada de jargão de sistema. */
  assert.doesNotMatch(intro, /login|sign in/i);
});

test("entrar pede só e-mail e senha, com o autocomplete certo, e o Google só quando está ligado", () => {
  const entrar = renderizarPainel("entrar");
  assert.match(entrar, /name="email"[^>]*autocomplete="email"/);
  assert.match(entrar, /name="senha"[^>]*autocomplete="current-password"/);
  assert.match(entrar, /Esqueci minha senha/);
  assert.match(entrar, /role="alert"/);
  assert.doesNotMatch(entrar, /Continuar com Google/, "o botão do Google não pode aparecer com o provedor desligado");
  assert.match(renderizarPainel("entrar", { google: true }), /Continuar com Google/);

  /* O motivo do painel — "Entre para salvar…" — aparece, escapado. */
  const comContexto = renderizarPainel("entrar", { contexto: `Entre para salvar “${MALICIOSO}”.` });
  assert.ok(!comContexto.includes("<img src=x"), "o contexto entrou sem escapar");
});

test("criar conta pede nome, e-mail, senha e confirmação — e as duas senhas são novas", () => {
  const criar = renderizarPainel("criar");
  for (const nome of ["nome", "email", "senha", "confirmacao"]) assert.match(criar, new RegExp(`name="${nome}"`));
  assert.equal((criar.match(/autocomplete="new-password"/g) || []).length, 2);
});

test("a recuperação de senha não revela se o e-mail tem conta", () => {
  const enviada = renderizarPainel("recuperacao-enviada");
  assert.match(enviada, /Se houver uma conta/);
  assert.doesNotMatch(enviada, /não encontr|inexistente|não existe/i);
});

test("o menu de quem entrou tem os dez destinos, e o nome vem escapado", () => {
  const usuario = criarUsuario({ id: "u1", email: "ana@exemplo.com" });
  const perfil = criarPerfil({ usuarioId: "u1", nome: MALICIOSO });
  const menu = renderizarPainel("menu", { usuario, perfil, naoLidas: 2 });

  assert.ok(!menu.includes("<img src=x"), "o nome entrou sem escapar");
  for (const destino of ["Meu Potala", "Meu perfil", "Meus cursos", "Minha agenda", "Salvos", "Histórico", "Acompanhando", "Notificações", "Configurações", "Sair"]) {
    assert.ok(menu.includes(destino), `faltou ${destino} no menu`);
  }
  assert.match(menu, /href="\/meu-potala\/salvos"/);
  assert.match(menu, /conta-contador[^>]*>2</);
  assert.doesNotMatch(menu, /meu-potala.jornada/, "a Jornada foi removida do Meu Potala");
});

test("todo estado do painel desenha sem sobras de dados ausentes", () => {
  for (const estado of ESTADOS_DO_PAINEL) {
    const html = renderizarPainel(estado, { emailPendente: MALICIOSO });
    assert.doesNotMatch(html, /undefined|\[object Object\]/, estado);
    assert.ok(!html.includes("<img src=x"), `${estado} deixou passar HTML`);
  }
});

/* ------------------------------------------------------------------
 * O roteador
 * ------------------------------------------------------------------ */

test("as rotas do Meu Potala resolvem com e sem barra, com filtro, e recusam o resto", () => {
  assert.equal(BASE, "/meu-potala");
  assert.equal(resolverRota("/meu-potala").rota.nome, "inicio");
  assert.equal(resolverRota("/meu-potala/").rota.nome, "inicio");
  assert.equal(resolverRota("/meu-potala/salvos?filtro=cursos").rota.nome, "salvos");
  assert.equal(resolverRota("/meu-potala/nada").encontrada, false);
  assert.equal(resolverRota("/meu-potala/jornada").encontrada, false, "a Jornada foi removida do Meu Potala");
  assert.equal(resolverRota("/meu-potala/%E0%A4%A").encontrada, false);
  assert.equal(resolverRota("/cursos.html").fora, true);
  assert.equal(resolverRota("/meu-potala-antigo").fora, true);

  for (const rota of ROTAS) assert.equal(resolverRota(caminhoDa(rota.nome)).rota.nome, rota.nome);
  assert.throws(() => caminhoDa("painel-secreto"));
});

test("o roteador só intercepta o clique comum num link daqui", () => {
  const aqui = "http://localhost:4173/meu-potala";
  const link = (href, extra = {}) => ({ href, enderecoAtual: aqui, ...extra });

  assert.equal(deveInterceptar({}, link("/meu-potala/agenda")), true);
  assert.equal(deveInterceptar({ ctrl: true }, link("/meu-potala/agenda")), false, "Ctrl é pedido de outra aba");
  assert.equal(deveInterceptar({ meta: true }, link("/meu-potala/agenda")), false);
  assert.equal(deveInterceptar({ botao: 1 }, link("/meu-potala/agenda")), false);
  assert.equal(deveInterceptar({}, link("/meu-potala/agenda", { target: "_blank" })), false);
  assert.equal(deveInterceptar({}, link("/meu-potala/agenda", { download: true })), false);
  assert.equal(deveInterceptar({}, link("https://outro.exemplo/meu-potala")), false);
  assert.equal(deveInterceptar({}, link("#conteudo")), false, "o link de pular para o conteúdo precisa funcionar");
  assert.equal(deveInterceptar({}, link("/cursos.html")), false);
  assert.equal(deveInterceptar({ padraoImpedido: true }, link("/meu-potala/agenda")), false);
});

/* ------------------------------------------------------------------
 * Ações que pedem conta
 * ------------------------------------------------------------------ */

function sessaoFalsa(status = "visitante") {
  let estado = { status };
  const ouvintes = new Set();
  return {
    obter: () => estado,
    assinar(ouvinte) {
      ouvintes.add(ouvinte);
      return () => ouvintes.delete(ouvinte);
    },
    mudar(novo) {
      estado = { status: novo };
      for (const ouvinte of [...ouvintes]) ouvinte(estado);
    },
  };
}

function painelFalso(sessao) {
  const aoFechar = new Set();
  return {
    aberto: null,
    abrir(opcoes) {
      this.aberto = opcoes;
    },
    aoFechar(ouvinte) {
      aoFechar.add(ouvinte);
      return () => aoFechar.delete(ouvinte);
    },
    fechar() {
      this.aberto = null;
      for (const ouvinte of aoFechar) ouvinte(sessao.obter());
    },
  };
}

test("salvar sem conta abre o painel ali mesmo, e a ação acontece sozinha depois do login", async () => {
  const sessao = sessaoFalsa();
  const painel = painelFalso(sessao);
  const janela = { scrollY: 480, rolagens: [], scrollTo(opcoes) { this.rolagens.push(opcoes.top); } };
  const acoes = criarAcoesComConta({ sessao, painel, janela });
  let execucoes = 0;

  const promessa = acoes.exigir({ descricao: "salvar “Oráculo de hoje”", executar: async () => { execucoes += 1; } });
  assert.deepEqual(painel.aberto, { estado: "entrar", contexto: "Entre para salvar “Oráculo de hoje”." });
  assert.equal(execucoes, 0);

  /* O teclado do celular empurrou a página enquanto a pessoa digitava. */
  janela.scrollY = 910;
  sessao.mudar("autenticado");

  assert.equal(await promessa, true);
  assert.equal(execucoes, 1);
  assert.deepEqual(janela.rolagens, [480], "a leitura não voltou para onde estava");
});

test("quem fecha o painel sem entrar desiste da ação, e um login futuro não a executa", async () => {
  const sessao = sessaoFalsa();
  const painel = painelFalso(sessao);
  const acoes = criarAcoesComConta({ sessao, painel, janela: { scrollY: 0 } });
  let execucoes = 0;

  const promessa = acoes.exigir({ descricao: "acompanhar Meditação", executar: () => { execucoes += 1; } });
  painel.fechar();
  assert.equal(await promessa, false);

  sessao.mudar("autenticado");
  assert.equal(execucoes, 0);
});

test("com a conta aberta, a ação acontece na hora e o painel nem aparece", async () => {
  const sessao = sessaoFalsa("autenticado");
  const painel = painelFalso(sessao);
  const acoes = criarAcoesComConta({ sessao, painel, janela: { scrollY: 0 } });
  let execucoes = 0;
  assert.equal(await acoes.exigir({ descricao: "salvar", executar: () => { execucoes += 1; } }), true);
  assert.equal(execucoes, 1);
  assert.equal(painel.aberto, null);
});

test("a ação guardada para depois da confirmação vence, e só vale se for conhecida e bem formada", () => {
  const agora = Date.parse("2026-09-14T12:00:00Z");
  const item = { tipo: "blog", ref: "oraculo", titulo: "Oráculo", href: "/artigo.html?post=oraculo" };
  const bruto = (dados) => JSON.stringify(dados);

  assert.deepEqual(pendenteValido(bruto({ acao: "salvar", item, em: agora - 60_000 }), agora), { acao: "salvar", item });
  assert.equal(pendenteValido(bruto({ acao: "salvar", item, em: agora - VALIDADE_PENDENTE - 1 }), agora), null);
  assert.equal(pendenteValido(bruto({ acao: "apagar-tudo", item, em: agora }), agora), null);
  assert.equal(pendenteValido(bruto({ acao: "salvar", em: agora }), agora), null);
  assert.equal(pendenteValido("{nao e json", agora), null);
  assert.equal(pendenteValido(null, agora), null);
});

/* ------------------------------------------------------------------
 * Histórico automático
 * ------------------------------------------------------------------ */

test("voltar à mesma página em meia hora não vira outra linha no histórico", () => {
  const agora = 10_000_000;
  assert.equal(deveRegistrar({}, "u1|blog:oraculo", agora), true);
  assert.equal(deveRegistrar({ "u1|blog:oraculo": agora - 60_000 }, "u1|blog:oraculo", agora), false);
  assert.equal(deveRegistrar({ "u1|blog:oraculo": agora - JANELA_DE_VISITA - 1 }, "u1|blog:oraculo", agora), true);

  assert.equal(itemDeclarado({ dataset: {} }), null, "artigo ainda não desenhado não é visita");
  assert.deepEqual(
    itemDeclarado({ dataset: { itemTipo: "blog", itemRef: "oraculo", itemTitulo: "Oráculo", itemHref: "/artigo.html?post=oraculo" } }),
    { tipo: "blog", ref: "oraculo", titulo: "Oráculo", href: "/artigo.html?post=oraculo" },
  );
});

/* ------------------------------------------------------------------
 * Carregamento preguiçoso do SDK
 * ------------------------------------------------------------------ */

test("há sessão a restaurar só com o token do Supabase ou com o retorno de um link", () => {
  const armazenamento = (chaves) => ({ length: chaves.length, key: (indice) => chaves[indice] });
  assert.equal(haSessaoGuardada(armazenamento(["tema", "sb-gotrumwuimpoeggwamut-auth-token"]), {}), true);
  assert.equal(haSessaoGuardada(armazenamento(["tema", "potala.conta.demo.sessao"]), {}), false);
  assert.equal(haSessaoGuardada(armazenamento([]), { hash: "#access_token=abc&type=signup" }), true);
  assert.equal(haSessaoGuardada(armazenamento([]), { search: "?code=xyz" }), true);
  assert.equal(haSessaoGuardada({ get length() { throw new Error("bloqueado"); } }, {}), false);
});

test("a demonstração liga e desliga pelo endereço, e fica ligada na aba", () => {
  const guardado = new Map();
  const armazenamento = {
    getItem: (chave) => guardado.get(chave) ?? null,
    setItem: (chave, valor) => guardado.set(chave, valor),
    removeItem: (chave) => guardado.delete(chave),
  };
  assert.equal(querDemonstracao({ search: "" }, armazenamento), false);
  assert.equal(querDemonstracao({ search: "?demo=conta" }, armazenamento), true);
  assert.equal(querDemonstracao({ search: "" }, armazenamento), true);
  assert.equal(querDemonstracao({ search: "?demo=sair" }, armazenamento), false);
  assert.equal(querDemonstracao({ search: "" }, armazenamento), false);
});

test("o SDK só é fabricado quando há sessão ou alguém vai entrar, e os ouvintes antigos são ligados a ele", async () => {
  let fabricacoes = 0;
  const ouvintesReais = [];
  const real = {
    sessaoAtual: async () => ({ usuario: { id: "u1" } }),
    entrar: async () => ({ usuario: { id: "u1" } }),
    aoMudar(ouvinte) {
      ouvintesReais.push(ouvinte);
      return () => ouvintesReais.splice(ouvintesReais.indexOf(ouvinte), 1);
    },
  };
  const autenticacao = autenticacaoPreguicosa({
    fabricar: async () => {
      fabricacoes += 1;
      return real;
    },
    haSessao: () => false,
  });

  const ouvinte = () => null;
  autenticacao.aoMudar(ouvinte);
  assert.deepEqual(await autenticacao.sessaoAtual(), { usuario: null });
  assert.equal(fabricacoes, 0, "visitante sem sessão não deveria baixar o SDK");

  await autenticacao.entrar({ email: "ana@exemplo.com", senha: "12345678" });
  await autenticacao.entrar({ email: "ana@exemplo.com", senha: "12345678" });
  assert.equal(fabricacoes, 1);
  assert.deepEqual(ouvintesReais, [ouvinte]);
});

test("uma falha ao baixar o SDK não vira falha permanente", async () => {
  let tentativas = 0;
  const autenticacao = autenticacaoPreguicosa({
    fabricar: async () => {
      tentativas += 1;
      if (tentativas === 1) throw new Error("rede caiu");
      return { entrar: async () => ({ usuario: null }), aoMudar: () => () => null };
    },
    haSessao: () => true,
  });
  await assert.rejects(autenticacao.entrar({}), /rede caiu/);
  await autenticacao.entrar({});
  assert.equal(tentativas, 2);
});

/* ------------------------------------------------------------------
 * As telas do Meu Potala
 * ------------------------------------------------------------------ */

const AGORA = new Date("2026-09-14T10:00:00");
const USUARIO = criarUsuario({ id: "demo-ana", email: "ana@exemplo.com", nome: "Ana Lima", criadoEm: new Date("2026-08-01T12:00:00") });
const ESTADO = Object.freeze({
  status: "autenticado",
  usuario: USUARIO,
  perfil: criarPerfil({ usuarioId: USUARIO.id, nome: "Ana Lima", cidade: "Campinas", interesses: ["Meditação"] }),
  demonstracao: true,
  dadosEmReserva: false,
});

function contexto(extra = {}) {
  return { ...sementeDeDemonstracao({ usuarioId: USUARIO.id, agora: AGORA }), estado: ESTADO, agora: AGORA, parametros: new URLSearchParams(), ...extra };
}

test("as nove telas desenham com os dados de demonstração, sem sobras de dado ausente", () => {
  assert.deepEqual(Object.keys(VISTAS).sort(), ROTAS.map((rota) => rota.nome).sort(), "cada rota precisa de uma tela");
  for (const [nome, vista] of Object.entries(VISTAS)) {
    const html = vista.renderizar(contexto());
    assert.ok(html.trim().length > 200, `${nome} veio vazia`);
    assert.doesNotMatch(html, /undefined|NaN|\[object Object\]|>null</, nome);
  }
});

test("o começo do Meu Potala cumprimenta pelo primeiro nome e traz os blocos pedidos", () => {
  const cabecalho = renderizarCabecalho({ estado: ESTADO, rota: ROTAS[0], dados: contexto() });
  assert.match(cabecalho, /Olá, Ana\./);
  assert.match(cabecalho, /dados de demonstração/, "dado fictício precisa ser dito");
  assert.match(cabecalho, /aria-current="page">Início/);

  const inicio = VISTAS.inicio.renderizar(contexto());
  for (const bloco of ["Continue de onde parou", "Meus cursos", "Minha agenda Potala", "Salvos", "Acompanhando", "Para você"]) {
    assert.ok(inicio.includes(bloco), `faltou o bloco ${bloco}`);
  }
  /* "Para você" é caminho, não vitrine. */
  assert.doesNotMatch(inicio, /imperdível|compre|oferta|promoção|últimas vagas/i);
});

test("Meus cursos mostra o progresso por extenso e separa o que já terminou", () => {
  const html = VISTAS.cursos.renderizar(contexto());
  assert.match(html, /7 de 12 aulas concluídas/);
  assert.match(html, /role="progressbar"[^>]*aria-valuenow="58"/);
  assert.ok(html.indexOf("O que você está fazendo") < html.indexOf("O que você já atravessou"));
});

test("na agenda só sai o que a pessoa anotou; o que vem do Instituto fica", () => {
  const amanha = (hora) => new Date(2026, 8, 15, hora);
  const agenda = [
    criarCompromisso({ id: "inst-1", tipo: "aula", titulo: "Tai chi", inicio: amanha(8), origem: "instituto" }),
    criarCompromisso({ id: "pess-1", tipo: "outro", titulo: "Prática em casa", inicio: amanha(19), origem: "pessoal" }),
  ];
  const html = VISTAS.agenda.renderizar(contexto({ agenda }));
  assert.match(html, /data-acao="remover-compromisso" data-id="pess-1"/);
  assert.doesNotMatch(html, /data-id="inst-1"/);
  assert.match(html, /Amanhã/);
  assert.match(html, /data-form="compromisso"/);
});

test("os filtros de Salvos vivem no endereço e não empilham histórico", () => {
  assert.equal(filtroDoEndereco(new URLSearchParams("filtro=cursos")), "cursos");
  assert.equal(filtroDoEndereco(new URLSearchParams("filtro=javascript")), "tudo");
  assert.equal(filtroDoEndereco(null), "tudo");

  const html = VISTAS.salvos.renderizar(contexto({ parametros: new URLSearchParams("filtro=eventos") }));
  for (const rotulo of ["Tudo", "Conteúdos", "Cursos", "Profissionais", "Eventos", "Vídeos"]) assert.ok(html.includes(rotulo), rotulo);
  assert.match(html, /href="\/meu-potala\/salvos\?filtro=eventos" data-substituir aria-current="true"/);
  assert.equal((html.match(/data-substituir/g) || []).length, 6);
});

test("dois avisos nascem desligados, e o resto ligado", () => {
  const html = VISTAS.notificacoes.renderizar(contexto({ notificacoes: [], preferencias: [] }));
  assert.match(html, /data-preferencia="novo_conteudo">/);
  assert.match(html, /data-preferencia="lembrete">/);
  assert.match(html, /data-preferencia="proxima_aula" checked>/);
});

test("nenhuma tela deixa passar HTML vindo do que a pessoa guardou", () => {
  const ontem = new Date(2026, 8, 13, 20);
  const dados = contexto({
    estado: { ...ESTADO, perfil: criarPerfil({ usuarioId: USUARIO.id, nome: MALICIOSO, cidade: MALICIOSO, bio: MALICIOSO, interesses: [MALICIOSO] }) },
    salvos: [criarSalvo({ tipo: "blog", ref: "x", titulo: MALICIOSO, href: "/artigo.html?post=x", salvoEm: ontem })],
    historico: [criarHistorico({ tipo: "blog", ref: "x", titulo: MALICIOSO, href: "/artigo.html?post=x", progresso: 0.4, visitadoEm: ontem })],
    acompanhando: [criarAcompanhado({ tipo: "tema", ref: "x", rotulo: MALICIOSO, desde: ontem })],
    agenda: [criarCompromisso({ tipo: "outro", titulo: MALICIOSO, local: MALICIOSO, inicio: new Date(2026, 8, 16, 9), origem: "pessoal" })],
    notificacoes: [criarNotificacao({ tipo: "proxima_aula", titulo: MALICIOSO, corpo: MALICIOSO, criadaEm: ontem })],
  });
  for (const [nome, vista] of Object.entries(VISTAS)) {
    assert.ok(!vista.renderizar(dados).includes("<img src=x"), `${nome} deixou passar HTML`);
  }
  assert.ok(!renderizarCabecalho({ estado: dados.estado, rota: ROTAS[0], dados }).includes("<img src=x"));

  /* E um endereço perigoso nem chega a virar item. */
  assert.throws(() => criarSalvo({ tipo: "blog", ref: "x", titulo: "x", href: "javascript:alert(1)" }));
});

test("o visitante vê o convite, e quem aguarda confirmação vê o que falta", () => {
  const visitante = renderizarVisitante({ status: "visitante" });
  assert.match(visitante, /data-conta-abrir="entrar"/);
  assert.match(visitante, /data-conta-abrir="criar"/);

  const aguardando = renderizarVisitante({ status: "aguardando-confirmacao", emailPendente: MALICIOSO });
  assert.match(aguardando, /Confirme seu e-mail/);
  assert.ok(!aguardando.includes("<img src=x"));
  assert.doesNotMatch(aguardando, /data-conta-abrir="criar"/);
});

/* ------------------------------------------------------------------
 * Integração com o Portal
 * ------------------------------------------------------------------ */

test("o documento da SPA usa só caminhos absolutos e nasce com o botão da conta", async () => {
  const html = await lerSaida("meu-potala.html");
  assert.doesNotMatch(html, /(href|src)="(css|js|media)\//, "caminho relativo quebra em /meu-potala/salvos");
  assert.doesNotMatch(html, /<base\b/, "<base> quebraria o link de pular para o conteúdo");
  assert.match(html, /<link rel="stylesheet" href="\/css\/conta\.css" data-conta-css>/);
  assert.match(html, /<script type="module" src="\/js\/conta\/spa\/app\.js"><\/script>/);
  assert.match(html, /data-meu-potala/);
  assert.match(html, /data-conta-gatilho/);
  assert.match(html, /<meta name="robots" content="noindex">/);
});

test("a conta entra em todas as páginas de seção, e o artigo oferece salvar e acompanhar", async () => {
  const [secoes, artigo, controlador] = await Promise.all([
    lerSaida("js/secoes.js"),
    lerSaida("artigo.html"),
    lerSaida("js/blog/article-controller.js"),
  ]);
  assert.match(secoes, /import\("\.\/conta\/conta\.js"\)/);
  assert.match(artigo, /data-article-root data-item-visto/);
  assert.match(controlador, /data-salvar data-salvar-tipo="blog"/);
  assert.match(controlador, /data-acompanhar data-acompanhar-tipo="tema"/);
  assert.match(controlador, /potala:item-visto/);
  assert.match(controlador, /if \(preview\) return;/, "a prévia do painel editorial não pode ganhar botões de leitor");
});

test("nenhum arquivo da conta grava senha no navegador", async () => {
  const pasta = new URL("../../outputs/js/conta/", import.meta.url);
  const arquivos = (await readdir(pasta, { recursive: true })).filter((nome) => nome.endsWith(".js"));
  assert.ok(arquivos.length > 10);
  for (const nome of arquivos) {
    const texto = await readFile(new URL(nome.replaceAll("\\", "/"), pasta), "utf8");
    for (const linha of texto.split("\n").filter((trecho) => /setItem\(/.test(trecho))) {
      assert.doesNotMatch(linha, /senha|password/i, `${nome}: ${linha.trim()}`);
    }
  }
});

test("o painel e o Meu Potala respeitam quem pede menos movimento", async () => {
  const css = await lerSaida("css/conta.css");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.conta-painel,[\s\S]*?transition: none/);
  assert.match(css, /::view-transition-new\(mp-pagina\)/);
});

/* ------------------------------------------------------------------
 * A visita sem conta
 * ------------------------------------------------------------------ */

test("dá para ver o Meu Potala sem conta: o botão fica embaixo das duas portas", () => {
  const intro = renderizarPainel("intro");
  assert.ok(
    intro.indexOf("?demo=visita") > intro.indexOf("data-conta-ir=\"criar\""),
    "o botão da visita precisa ficar embaixo de Criar uma conta",
  );
  /* Sem recarregar, a SPA engoliria o clique e a demonstração não ligaria. */
  assert.match(intro, /href="\/meu-potala\?demo=visita" data-recarregar/);
  assert.doesNotMatch(intro, /login|sign in/i);

  const pagina = renderizarVisitante({ status: "visitante" });
  assert.ok(pagina.indexOf("?demo=visita") > pagina.indexOf("data-conta-abrir=\"criar\""));
  assert.match(pagina, /href="\/meu-potala\?demo=visita" data-recarregar/);

  /* Na demonstração, o aviso oferece a saída. */
  const cabecalho = renderizarCabecalho({ estado: ESTADO, rota: ROTAS[0], dados: contexto() });
  assert.match(cabecalho, /href="\/meu-potala\?demo=sair" data-recarregar>Sair da demonstração/);

  /* Conta real com banco ainda não conectado não é demonstração: não há o que desligar. */
  const semBanco = renderizarCabecalho({ estado: { ...ESTADO, demonstracao: false, dadosEmReserva: true }, rota: ROTAS[0], dados: contexto() });
  assert.match(semBanco, /dados de demonstração/);
  assert.doesNotMatch(semBanco, /Sair da demonstração/);
});

test("a visita entra como pessoa fictícia, sem senha nenhuma, e sair apaga a visita", async () => {
  const { criarAutenticacaoDemonstracao } = await import("../../outputs/js/conta/adaptadores/demonstracao.js");
  const guardado = new Map();
  const armazenamento = {
    getItem: (chave) => guardado.get(chave) ?? null,
    setItem: (chave, valor) => guardado.set(chave, valor),
    removeItem: (chave) => guardado.delete(chave),
  };
  assert.equal(querDemonstracao({ search: "?demo=visita" }, armazenamento), true, "?demo=visita precisa ligar a demonstração");

  const autenticacao = criarAutenticacaoDemonstracao({ armazenamento });
  assert.deepEqual(await autenticacao.sessaoAtual(), { usuario: null });

  const { usuario } = await autenticacao.iniciarVisita();
  assert.equal(usuario.nome, "Visitante");
  assert.match(usuario.email, /\.invalid$/, "o e-mail da visita não pode ser de ninguém");
  assert.equal((await autenticacao.sessaoAtual()).usuario.id, usuario.id);
  assert.doesNotMatch([...guardado.values()].join(" "), /senha|password/i);

  await autenticacao.sair();
  assert.deepEqual(await autenticacao.sessaoAtual(), { usuario: null });
});
