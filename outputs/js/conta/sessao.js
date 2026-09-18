/*
 * A SESSÃO: O ESTADO GLOBAL DE QUEM ESTÁ NO POTALA.
 *
 * Um único lugar sabe se a pessoa entrou, quem ela é e se os dados pessoais vêm
 * do banco ou da demonstração. O botão do canto, o painel, o "Salvar" do artigo
 * e o Meu Potala assinam este estado — nenhum deles pergunta ao Supabase por
 * conta própria, e por isso nenhum deles fica desatualizado em relação aos
 * outros quando a sessão expira no meio da leitura.
 *
 * A sessão não conhece o Supabase. Ela recebe dois colaboradores com contratos
 * simples — `autenticacao` e `dados` — e é isso que permite trocar o backend, ou
 * rodar tudo em demonstração, sem mexer em uma linha daqui.
 */

import { DadosIndisponiveis, ErroDeConta } from "./mensagens.js";
import { FABRICAS, criarPerfil, paraData } from "./modelos.js";

export const COLECOES = Object.freeze(Object.keys(FABRICAS));

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SENHA_MINIMA = 8;

export function validarEmail(email) {
  return EMAIL.test(String(email ?? "").trim());
}

/*
 * A validação acontece ANTES de falar com o servidor.
 *
 * Não por segurança — o servidor valida de novo, e é ele que vale — mas por
 * respeito: uma senha curta ou um e-mail sem domínio merecem resposta na hora,
 * sem a espera de uma ida à rede e sem gastar uma tentativa do limite do Auth.
 */
export function validarEntrada({ email, senha } = {}) {
  if (!String(email ?? "").trim() || !senha) return "CAMPOS_OBRIGATORIOS";
  if (!validarEmail(email)) return "EMAIL_INVALIDO";
  return null;
}

export function validarCadastro({ nome, email, senha, confirmacao } = {}) {
  if (!String(nome ?? "").trim()) return "NOME_OBRIGATORIO";
  if (!String(email ?? "").trim() || !senha || !confirmacao) return "CAMPOS_OBRIGATORIOS";
  if (!validarEmail(email)) return "EMAIL_INVALIDO";
  if (String(senha).length < SENHA_MINIMA) return "SENHA_CURTA";
  if (senha !== confirmacao) return "SENHAS_DIFERENTES";
  return null;
}

/*
 * OS DADOS COM RESERVA.
 *
 * O Supabase Auth já funciona, mas as tabelas pessoais dependem de uma migração
 * que ainda não foi aplicada. Sem esta costura, a pessoa conseguiria entrar e
 * encontraria o Meu Potala quebrado.
 *
 * A reserva só entra quando o banco diz que a TABELA NÃO EXISTE. Qualquer outro
 * erro — rede, permissão, dado inválido — sobe como está: cair para dados de
 * demonstração porque a rede piscou mostraria salvos que não são da pessoa, e
 * ela acreditaria neles.
 */
export function comReserva(principal, reserva, { aoCair } = {}) {
  let usandoReserva = false;
  const chamar = (metodo) => async (...argumentos) => {
    if (!usandoReserva) {
      try {
        return await principal[metodo](...argumentos);
      } catch (erro) {
        if (!(erro instanceof DadosIndisponiveis)) throw erro;
        usandoReserva = true;
        aoCair?.(erro);
      }
    }
    return reserva[metodo](...argumentos);
  };

  return {
    perfil: chamar("perfil"),
    salvarPerfil: chamar("salvarPerfil"),
    listar: chamar("listar"),
    gravar: chamar("gravar"),
    remover: chamar("remover"),
    limpar: chamar("limpar"),
    marcarLida: chamar("marcarLida"),
    get emReserva() {
      return usandoReserva;
    },
  };
}

export function criarSessao({ autenticacao, dados = null, agora = () => new Date(), aoFalhar = () => {} } = {}) {
  if (!autenticacao) throw new TypeError("A sessão precisa de um adaptador de autenticação.");

  let estado = Object.freeze({
    status: "carregando",
    usuario: null,
    perfil: null,
    emailPendente: null,
    demonstracao: Boolean(autenticacao.demonstracao),
    dadosEmReserva: false,
  });
  const ouvintes = new Set();
  let desligarAuth = null;

  function definir(parcial) {
    estado = Object.freeze({ ...estado, ...parcial });
    for (const ouvinte of [...ouvintes]) ouvinte(estado);
  }

  async function carregarPerfil(usuario) {
    if (!dados) return criarPerfil({ usuarioId: usuario.id, nome: usuario.nome });
    try {
      return await dados.perfil(usuario);
    } catch (erro) {
      /* Sem perfil a pessoa continua dentro: o nome sai do cadastro do Auth. */
      aoFalhar(erro, "perfil.carregar");
      return criarPerfil({ usuarioId: usuario.id, nome: usuario.nome });
    }
  }

  async function aplicarUsuario(usuario) {
    if (!usuario) {
      definir({ status: "visitante", usuario: null, perfil: null });
      return;
    }
    const mesmaPessoa = estado.usuario?.id === usuario.id;
    definir({ status: "autenticado", usuario, perfil: mesmaPessoa ? estado.perfil : null, emailPendente: null });
    const perfil = await carregarPerfil(usuario);
    if (estado.usuario?.id === usuario.id) {
      definir({ perfil, dadosEmReserva: Boolean(dados?.emReserva) });
    }
  }

  function exigirConta() {
    if (estado.status !== "autenticado" || !estado.usuario) throw new ErroDeConta("SEM_SESSAO");
    if (!dados) throw new ErroDeConta("SEM_SESSAO");
    return estado.usuario.id;
  }

  function aposUsarDados(resultado) {
    const emReserva = Boolean(dados?.emReserva);
    if (emReserva !== estado.dadosEmReserva) definir({ dadosEmReserva: emReserva });
    return resultado;
  }

  return {
    obter: () => estado,

    assinar(ouvinte) {
      ouvintes.add(ouvinte);
      return () => ouvintes.delete(ouvinte);
    },

    async iniciar() {
      /*
       * O ouvinte vem ANTES da leitura da sessão. Ao contrário, um login feito em
       * outra aba entre as duas chamadas passaria despercebido até recarregar.
       * Ele também é o que traduz a expiração do token em "visitante".
       */
      desligarAuth = autenticacao.aoMudar?.(({ usuario }) => {
        aplicarUsuario(usuario);
      }) || null;
      try {
        const { usuario } = await autenticacao.sessaoAtual();
        await aplicarUsuario(usuario);
      } catch (erro) {
        aoFalhar(erro, "sessao.restaurar");
        definir({ status: "visitante", usuario: null, perfil: null });
      }
      return estado;
    },

    async entrar(campos = {}) {
      const codigo = validarEntrada(campos);
      if (codigo) throw new ErroDeConta(codigo);
      const { usuario } = await autenticacao.entrar({ email: String(campos.email).trim(), senha: campos.senha });
      await aplicarUsuario(usuario);
      return estado;
    },

    /*
     * Cadastro com verificação de e-mail NÃO autentica.
     *
     * O Supabase devolve o usuário sem sessão até o link ser clicado. Tratar
     * isso como login mostraria o Meu Potala a quem ainda não provou ser dono do
     * e-mail — e a primeira ação dela falharia no banco, sem explicação.
     */
    async criarConta(campos = {}) {
      const codigo = validarCadastro(campos);
      if (codigo) throw new ErroDeConta(codigo);
      const email = String(campos.email).trim();
      const resposta = await autenticacao.criarConta({ nome: String(campos.nome).trim(), email, senha: campos.senha });
      if (resposta.aguardandoConfirmacao) {
        definir({ status: "aguardando-confirmacao", usuario: null, perfil: null, emailPendente: email });
      } else {
        await aplicarUsuario(resposta.usuario);
      }
      return estado;
    },

    async sair() {
      await autenticacao.sair();
      definir({ status: "visitante", usuario: null, perfil: null, emailPendente: null });
    },

    async recuperarSenha(email) {
      if (!validarEmail(email)) throw new ErroDeConta("EMAIL_INVALIDO");
      await autenticacao.recuperarSenha(String(email).trim());
    },

    async definirNovaSenha(senha, confirmacao) {
      if (String(senha ?? "").length < SENHA_MINIMA) throw new ErroDeConta("SENHA_CURTA");
      if (senha !== confirmacao) throw new ErroDeConta("SENHAS_DIFERENTES");
      await autenticacao.definirNovaSenha(senha);
    },

    async provedores() {
      try {
        return (await autenticacao.provedores?.()) || { google: false };
      } catch {
        return { google: false };
      }
    },

    entrarComGoogle() {
      return autenticacao.entrarComGoogle?.();
    },

    async atualizarPerfil(parcial = {}) {
      const usuarioId = exigirConta();
      const perfil = criarPerfil({
        ...(estado.perfil || { nome: estado.usuario.nome }),
        ...parcial,
        usuarioId,
        atualizadoEm: agora(),
      });
      const salvo = await dados.salvarPerfil(perfil);
      definir({ perfil: salvo || perfil, dadosEmReserva: Boolean(dados.emReserva) });
      return estado.perfil;
    },

    colecao(nome) {
      if (!COLECOES.includes(nome)) throw new TypeError(`Coleção desconhecida: ${nome}`);
      return {
        listar: async () => aposUsarDados(await dados.listar(nome, exigirConta())),
        gravar: async (registro) => aposUsarDados(await dados.gravar(nome, registro, exigirConta())),
        remover: async (id) => aposUsarDados(await dados.remover(nome, id, exigirConta())),
        limpar: async () => aposUsarDados(await dados.limpar(nome, exigirConta())),
        marcarLida: async (id, quando = agora()) => aposUsarDados(await dados.marcarLida(id, paraData(quando), exigirConta())),
      };
    },

    destroy() {
      desligarAuth?.();
      ouvintes.clear();
    },
  };
}
