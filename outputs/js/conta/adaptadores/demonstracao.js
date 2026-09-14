/*
 * O ADAPTADOR DE DEMONSTRAÇÃO.
 *
 * Cumpre os mesmos contratos do adaptador Supabase — autenticação e dados — com
 * armazenamento local. Serve a dois casos, e só a eles:
 *
 * - DADOS: a pessoa entrou de verdade pelo Supabase, mas as tabelas pessoais
 *   ainda não existem. Os salvos e a agenda vêm daqui, e a tela avisa.
 * - AUTENTICAÇÃO: a página foi aberta com ?demo=conta, para avaliar a
 *   experiência sem criar conta.
 *
 * A SENHA NUNCA É GUARDADA. Qualquer senha não vazia entra, e isso é deliberado:
 * conferir uma senha exigiria guardá-la, e guardar senha no navegador é
 * exatamente o que a demonstração não pode ensinar. O que se grava é só e-mail e
 * nome, o bastante para a sessão sobreviver a um recarregamento.
 */

import { ErroDeConta } from "../mensagens.js";
import { FABRICAS, criarPerfil, criarUsuario } from "../modelos.js";
import { sementeDeDemonstracao } from "../dados-demonstracao.js";

const CHAVE_SESSAO = "potala.conta.demo.sessao";

function lerJson(armazenamento, chave) {
  try {
    const bruto = armazenamento?.getItem(chave);
    return bruto ? JSON.parse(bruto) : null;
  } catch {
    /* Armazenamento bloqueado ou corrompido: a demonstração segue sem memória. */
    return null;
  }
}

function gravarJson(armazenamento, chave, valor) {
  try {
    if (valor === null) armazenamento?.removeItem(chave);
    else armazenamento?.setItem(chave, JSON.stringify(valor));
  } catch {
    /* Navegação privada pode recusar a escrita; a sessão vale até fechar a aba. */
  }
}

/* Um id estável por e-mail, para a mesma pessoa reencontrar os próprios salvos. */
function idDoEmail(email) {
  let hash = 0x811c9dc5;
  for (const letra of String(email).toLowerCase()) {
    hash ^= letra.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function nomeDoEmail(email) {
  const local = String(email).split("@")[0].replace(/[._-]+/g, " ").trim();
  return local ? local.replace(/\b\p{L}/gu, (letra) => letra.toLocaleUpperCase("pt-BR")) : "";
}

export function criarAutenticacaoDemonstracao({
  armazenamento = globalThis.localStorage,
  agora = () => new Date(),
} = {}) {
  const ouvintes = new Set();
  const emitir = (usuario) => {
    for (const ouvinte of [...ouvintes]) ouvinte({ evento: usuario ? "SIGNED_IN" : "SIGNED_OUT", usuario });
  };
  const usuarioPara = (email, nome) => criarUsuario({
    id: `demo-${idDoEmail(email)}`,
    email,
    nome,
    emailVerificadoEm: agora().toISOString(),
    criadoEm: new Date(agora().getTime() - 38 * 86_400_000).toISOString(),
  });
  const guardar = (usuario) => gravarJson(armazenamento, CHAVE_SESSAO, usuario ? { ...usuario } : null);

  return {
    demonstracao: true,

    async sessaoAtual() {
      const salvo = lerJson(armazenamento, CHAVE_SESSAO);
      return { usuario: salvo?.id ? criarUsuario(salvo) : null };
    },

    async entrar({ email, senha }) {
      if (!senha) throw new ErroDeConta("CAMPOS_OBRIGATORIOS");
      const usuario = usuarioPara(email, nomeDoEmail(email));
      guardar(usuario);
      emitir(usuario);
      return { usuario };
    },

    async criarConta({ nome, email }) {
      const usuario = usuarioPara(email, nome);
      guardar(usuario);
      emitir(usuario);
      return { usuario, aguardandoConfirmacao: false };
    },

    /*
     * A VISITA SEM CONTA.
     *
     * Entra direto como uma pessoa fictícia — sem formulário, sem e-mail e sem
     * senha — para quem quer conhecer o Meu Potala antes de decidir criar conta.
     * O e-mail usa o domínio reservado .invalid: não é de ninguém e não recebe
     * nada.
     */
    async iniciarVisita() {
      const usuario = usuarioPara("visitante@demonstracao.invalid", "Visitante");
      guardar(usuario);
      emitir(usuario);
      return { usuario };
    },

    async sair() {
      guardar(null);
      emitir(null);
    },

    async recuperarSenha() {
      /* Não há e-mail a enviar numa demonstração. */
    },

    async definirNovaSenha() {
      /* Não há senha guardada para trocar. */
    },

    aoMudar(ouvinte) {
      ouvintes.add(ouvinte);
      return () => ouvintes.delete(ouvinte);
    },

    async provedores() {
      return { google: false };
    },
  };
}

export function criarDadosDemonstracao({
  armazenamento = globalThis.localStorage,
  agora = () => new Date(),
  semente = sementeDeDemonstracao,
} = {}) {
  const memoria = new Map();
  const chave = (usuarioId, nome) => `potala.conta.demo.${usuarioId}.${nome}`;

  const ler = (alvo) => {
    const valor = lerJson(armazenamento, alvo);
    return valor !== null ? valor : (memoria.has(alvo) ? memoria.get(alvo) : null);
  };
  const escrever = (alvo, valor) => {
    memoria.set(alvo, valor);
    gravarJson(armazenamento, alvo, valor);
  };

  function garantirSemente(usuarioId) {
    if (ler(chave(usuarioId, "semeado"))) return;
    const inicial = semente({ usuarioId, agora: agora() });
    for (const colecao of Object.keys(FABRICAS)) escrever(chave(usuarioId, colecao), inicial[colecao] || []);
    escrever(chave(usuarioId, "semeado"), true);
  }

  const lista = (usuarioId, colecao) => {
    garantirSemente(usuarioId);
    return ler(chave(usuarioId, colecao)) || [];
  };

  const identidade = (colecao, registro) => {
    if (colecao === "progressos") return registro.inscricaoId;
    if (colecao === "preferencias") return registro.tipo;
    return registro.id;
  };

  const mesmo = (colecao, a, b) => {
    if (colecao === "salvos" || colecao === "acompanhando") {
      return a.id === b.id || (a.tipo === b.tipo && a.ref === b.ref);
    }
    return identidade(colecao, a) === identidade(colecao, b);
  };

  const fabricaDe = (colecao) => {
    const fabrica = FABRICAS[colecao];
    if (!fabrica) throw new TypeError(`Coleção desconhecida: ${colecao}`);
    return fabrica;
  };

  return {
    async perfil(usuario) {
      garantirSemente(usuario.id);
      return criarPerfil(ler(chave(usuario.id, "perfil")) || { usuarioId: usuario.id, nome: usuario.nome });
    },

    async salvarPerfil(perfil) {
      const modelo = criarPerfil(perfil);
      escrever(chave(modelo.usuarioId, "perfil"), { ...modelo, interesses: [...modelo.interesses] });
      return modelo;
    },

    async listar(colecao, usuarioId) {
      const fabrica = fabricaDe(colecao);
      return lista(usuarioId, colecao).map((registro) => fabrica(registro));
    },

    async gravar(colecao, registro, usuarioId) {
      const modelo = fabricaDe(colecao)({ ...registro, usuarioId });
      const restantes = lista(usuarioId, colecao).filter((existente) => !mesmo(colecao, existente, modelo));
      escrever(chave(usuarioId, colecao), [{ ...modelo }, ...restantes]);
      return modelo;
    },

    async remover(colecao, id, usuarioId) {
      fabricaDe(colecao);
      escrever(chave(usuarioId, colecao), lista(usuarioId, colecao).filter((registro) => identidade(colecao, registro) !== id));
    },

    async limpar(colecao, usuarioId) {
      fabricaDe(colecao);
      garantirSemente(usuarioId);
      escrever(chave(usuarioId, colecao), []);
    },

    async marcarLida(id, quando, usuarioId) {
      escrever(
        chave(usuarioId, "notificacoes"),
        lista(usuarioId, "notificacoes").map((aviso) => (aviso.id === id ? { ...aviso, lidaEm: quando } : aviso)),
      );
    },
  };
}
