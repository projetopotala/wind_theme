import assert from "node:assert/strict";
import test from "node:test";

import { COLECOES, comReserva, criarSessao, validarCadastro, validarEntrada } from "../../outputs/js/conta/sessao.js";
import { DadosIndisponiveis, ErroDeConta } from "../../outputs/js/conta/mensagens.js";
import { FABRICAS, criarPerfil, criarUsuario } from "../../outputs/js/conta/modelos.js";

const pausa = () => new Promise((pronto) => setTimeout(pronto, 0));

function autenticacaoFalsa({ usuarioInicial = null, aguardando = false } = {}) {
  let ouvinte = null;
  const chamadas = { entrar: 0, criarConta: 0, sair: 0 };
  return {
    chamadas,
    demonstracao: false,
    async sessaoAtual() {
      return { usuario: usuarioInicial };
    },
    async entrar({ email }) {
      chamadas.entrar += 1;
      return { usuario: criarUsuario({ id: "u1", email, nome: "Gustavo Ishibashi" }) };
    },
    async criarConta({ nome, email }) {
      chamadas.criarConta += 1;
      return aguardando
        ? { usuario: null, aguardandoConfirmacao: true }
        : { usuario: criarUsuario({ id: "u2", email, nome }), aguardandoConfirmacao: false };
    },
    async sair() {
      chamadas.sair += 1;
    },
    async recuperarSenha() {},
    aoMudar(fn) {
      ouvinte = fn;
      return () => {
        ouvinte = null;
      };
    },
    emitir(usuario) {
      ouvinte?.({ evento: "TESTE", usuario });
    },
  };
}

function dadosFalsos(extras = {}) {
  return {
    async perfil(usuario) {
      return criarPerfil({ usuarioId: usuario.id, nome: `${usuario.nome} (perfil)` });
    },
    async salvarPerfil(perfil) {
      return perfil;
    },
    async listar() {
      return [];
    },
    async gravar(_colecao, registro) {
      return registro;
    },
    async remover() {},
    async limpar() {},
    async marcarLida() {},
    ...extras,
  };
}

/* ------------------------------------------------------------------
 * Estados
 * ------------------------------------------------------------------ */

test("a sessao comeca carregando e vira visitante sem conta", async () => {
  const sessao = criarSessao({ autenticacao: autenticacaoFalsa(), dados: dadosFalsos() });
  assert.equal(sessao.obter().status, "carregando");
  await sessao.iniciar();
  assert.equal(sessao.obter().status, "visitante");
});

test("entrar leva a autenticado, traz o perfil e avisa quem escuta", async () => {
  const sessao = criarSessao({ autenticacao: autenticacaoFalsa(), dados: dadosFalsos() });
  await sessao.iniciar();
  const vistos = [];
  sessao.assinar((estado) => vistos.push(estado.status));

  await sessao.entrar({ email: "gustavo@exemplo.com", senha: "segredo-longo" });

  assert.equal(sessao.obter().status, "autenticado");
  assert.equal(sessao.obter().usuario.email, "gustavo@exemplo.com");
  assert.equal(sessao.obter().perfil.nome, "Gustavo Ishibashi (perfil)");
  assert.ok(vistos.includes("autenticado"));
});

test("a validacao acontece antes de gastar uma ida ao servidor", async () => {
  /* Nao por seguranca — o servidor valida de novo — mas para responder na hora e nao consumir o limite de tentativas. */
  const autenticacao = autenticacaoFalsa();
  const sessao = criarSessao({ autenticacao, dados: dadosFalsos() });
  await sessao.iniciar();

  await assert.rejects(sessao.entrar({ email: "gustavo@exemplo.com", senha: "" }), (erro) => erro.codigo === "CAMPOS_OBRIGATORIOS");
  await assert.rejects(sessao.entrar({ email: "sem-arroba", senha: "x" }), (erro) => erro.codigo === "EMAIL_INVALIDO");
  await assert.rejects(sessao.criarConta({ nome: "Ana", email: "ana@exemplo.com", senha: "curta", confirmacao: "curta" }), (erro) => erro.codigo === "SENHA_CURTA");
  assert.equal(autenticacao.chamadas.entrar, 0);
  assert.equal(autenticacao.chamadas.criarConta, 0);
});

test("os codigos de validacao seguem a ordem em que a pessoa preenche", () => {
  assert.equal(validarEntrada({ email: "a@exemplo.com", senha: "x" }), null);
  assert.equal(validarCadastro({ nome: "", email: "a@exemplo.com", senha: "12345678", confirmacao: "12345678" }), "NOME_OBRIGATORIO");
  assert.equal(validarCadastro({ nome: "Ana", email: "a@exemplo.com", senha: "12345678", confirmacao: "" }), "CAMPOS_OBRIGATORIOS");
  assert.equal(validarCadastro({ nome: "Ana", email: "a@exemplo", senha: "12345678", confirmacao: "12345678" }), "EMAIL_INVALIDO");
  assert.equal(validarCadastro({ nome: "Ana", email: "a@exemplo.com", senha: "12345678", confirmacao: "87654321" }), "SENHAS_DIFERENTES");
  assert.equal(validarCadastro({ nome: "Ana", email: "a@exemplo.com", senha: "12345678", confirmacao: "12345678" }), null);
});

test("cadastro com confirmacao de e-mail NAO autentica", async () => {
  /*
   * O Supabase devolve o usuario sem sessao ate o link ser clicado. Tratar como
   * login mostraria o Meu Potala a quem ainda nao provou ser dono do e-mail.
   */
  const sessao = criarSessao({ autenticacao: autenticacaoFalsa({ aguardando: true }), dados: dadosFalsos() });
  await sessao.iniciar();
  await sessao.criarConta({ nome: "Ana", email: "ana@exemplo.com", senha: "segredo-longo", confirmacao: "segredo-longo" });

  assert.equal(sessao.obter().status, "aguardando-confirmacao");
  assert.equal(sessao.obter().usuario, null);
  assert.equal(sessao.obter().emailPendente, "ana@exemplo.com");
});

test("sair, ou a sessao expirar, volta a visitante", async () => {
  const autenticacao = autenticacaoFalsa();
  const sessao = criarSessao({ autenticacao, dados: dadosFalsos() });
  await sessao.iniciar();
  await sessao.entrar({ email: "gustavo@exemplo.com", senha: "segredo-longo" });

  /* A expiracao chega pelo ouvinte do Auth, sem ninguem clicar em nada. */
  autenticacao.emitir(null);
  await pausa();
  assert.equal(sessao.obter().status, "visitante");

  await sessao.entrar({ email: "gustavo@exemplo.com", senha: "segredo-longo" });
  await sessao.sair();
  assert.equal(sessao.obter().status, "visitante");
  assert.equal(autenticacao.chamadas.sair, 1);
});

test("sem conta, nenhuma colecao responde", async () => {
  const sessao = criarSessao({ autenticacao: autenticacaoFalsa(), dados: dadosFalsos() });
  await sessao.iniciar();
  await assert.rejects(sessao.colecao("salvos").listar(), (erro) => erro instanceof ErroDeConta && erro.codigo === "SEM_SESSAO");
  assert.throws(() => sessao.colecao("xilofones"), /Coleção desconhecida/);
});

test("um perfil que nao carrega nao expulsa a pessoa", async () => {
  const falhas = [];
  const sessao = criarSessao({
    autenticacao: autenticacaoFalsa(),
    dados: dadosFalsos({ async perfil() { throw new Error("rede"); } }),
    aoFalhar: (erro, contexto) => falhas.push({ erro, contexto }),
  });
  await sessao.iniciar();
  await sessao.entrar({ email: "gustavo@exemplo.com", senha: "segredo-longo" });
  assert.equal(sessao.obter().status, "autenticado");
  assert.equal(sessao.obter().perfil.nome, "Gustavo Ishibashi");
  assert.equal(falhas.length, 1);
  assert.equal(falhas[0].contexto, "perfil.carregar");
  assert.match(falhas[0].erro.message, /rede/);
});

test("falha ao recuperar a sessão inicial é observável", async () => {
  const falhas = [];
  const autenticacao = autenticacaoFalsa();
  autenticacao.sessaoAtual = async () => { throw new Error("auth offline"); };
  const sessao = criarSessao({ autenticacao, dados: dadosFalsos(), aoFalhar: (erro, contexto) => falhas.push({ erro, contexto }) });

  await sessao.iniciar();

  assert.equal(sessao.obter().status, "visitante", "a tela continua utilizável como visitante");
  assert.equal(falhas.length, 1);
  assert.equal(falhas[0].contexto, "sessao.restaurar");
});

/* ------------------------------------------------------------------
 * Reserva de dados
 * ------------------------------------------------------------------ */

test("a reserva so entra quando o banco nao tem as tabelas", async () => {
  /*
   * Cair para a demonstracao porque a rede piscou mostraria salvos que nao sao
   * da pessoa, e ela acreditaria neles. So a tabela ausente autoriza a troca.
   */
  let caiu = 0;
  const reserva = dadosFalsos({ async listar() { return ["da reserva"]; } });

  const semTabela = comReserva(
    dadosFalsos({ async listar() { throw new DadosIndisponiveis({ code: "PGRST205" }); } }),
    reserva,
    { aoCair: () => { caiu += 1; } },
  );
  assert.deepEqual(await semTabela.listar("salvos", "u1"), ["da reserva"]);
  assert.equal(semTabela.emReserva, true);
  await semTabela.listar("salvos", "u1");
  assert.equal(caiu, 1, "a troca acontece uma vez, e fica");

  const semRede = comReserva(dadosFalsos({ async listar() { throw new Error("rede caiu"); } }), reserva);
  await assert.rejects(semRede.listar("salvos", "u1"), /rede caiu/);
  assert.equal(semRede.emReserva, false);
});

test("o estado da sessao conta quando os dados sao de demonstracao", async () => {
  const dados = comReserva(
    dadosFalsos({ async perfil() { throw new DadosIndisponiveis(); } }),
    dadosFalsos(),
  );
  const sessao = criarSessao({ autenticacao: autenticacaoFalsa(), dados });
  await sessao.iniciar();
  await sessao.entrar({ email: "gustavo@exemplo.com", senha: "segredo-longo" });
  assert.equal(sessao.obter().dadosEmReserva, true);
});

test("toda colecao da sessao tem fabrica de modelo", () => {
  assert.deepEqual([...COLECOES].sort(), Object.keys(FABRICAS).sort());
});
