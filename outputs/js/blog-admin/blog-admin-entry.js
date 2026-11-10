import { createAdminAuth } from "../admin/admin-auth.js";
import { getSupabaseClient } from "../supabase/client.js";
import { AMBIENTE_SUPABASE } from "../supabase/config.js";
import { criarBlogAdministrativo, criarBlogDeDemonstracao } from "../blog/blog-remoto.js";
import { createBlogRepository } from "../blog/blog-repository.js";
import { readBlogSettings, saveBlogSettings } from "../blog/blog-settings.js";
import { criarMesa } from "./mesa-app.js";
import { assinaturaDaSessao, entradaAoAutorizar, permissoesDaSessao } from "./mesa-modelo.js";
import { identidadeDaSessao, identidadeMudou } from "./mesa-sessao.js";
import { CHAVE_ANTIGA, CHAVE_DA_DEMONSTRACAO, TEXTOS_DE_DEMONSTRACAO, demonstracaoPermitida } from "./demonstracao.js";

const root = document.getElementById("blog-admin-app");
const loginView = root?.querySelector("[data-admin-auth-view]");
const panel = document.getElementById("admin-panel");
const continueButton = root?.querySelector("[data-blog-continue]");

/*
 * Duas mesas, um repositório só para as telas.
 *
 * Com login, textos, imagens e configuração vão ao banco do Portal. O "acesso
 * de teste" continua no navegador: sem conta o banco recusaria a escrita, e a
 * demonstração não pode mexer no Blog que os visitantes leem. A mesa é criada
 * uma vez; o que troca é para onde este objeto aponta.
 */
try { globalThis.localStorage?.removeItem(CHAVE_ANTIGA); } catch { /* sem armazenamento, nada a limpar */ }
const demonstracao = criarBlogDeDemonstracao({
  local: createBlogRepository({ defaults: TEXTOS_DE_DEMONSTRACAO, key: CHAVE_DA_DEMONSTRACAO }),
  lerConfiguracao: () => readBlogSettings(),
  salvarConfiguracao: (configuracao) => saveBlogSettings(configuracao),
});
let remoto = null;
let usuario = null;
let permissoes = { ler: true, editar: true, publicar: true };
let assinaturaDaConta = null;
let identidadeAtual = null;
let saidaLiberada = false;
/* A demonstração é estado do módulo, não do DOM: mexer em atributos pelo navegador não a liga. */
let emDemo = false;
const atual = () => (emDemo || !remoto ? demonstracao : remoto);
const METODOS = [
  "listar", "salvar", "remover", "versoes", "listarCategorias", "criarCategoria", "atualizarCategoria", "removerCategoria",
  "listarMidia", "enviarImagem", "lerConfiguracao", "salvarConfiguracao", "leituras", "comentarios", "moderar", "inscritos",
];
const repositorio = Object.fromEntries(METODOS.map((nome) => [nome, (...args) => atual()[nome](...args)]));
Object.defineProperty(repositorio, "demonstracao", { get: () => atual() === demonstracao });
repositorio.reset = () => (atual() === demonstracao ? demonstracao.reset() : Promise.resolve());

let mesa = null;

function comoUsuario(user) {
  const nome = String(user?.name || "").trim();
  const email = String(user?.email || "");
  const partes = (nome || email.split("@")[0]).split(/[\s._-]+/).filter(Boolean);
  return {
    nome: nome || email,
    autor: nome,
    primeiroNome: nome ? partes[0] : "",
    iniciais: partes.slice(0, 2).map((parte) => parte[0]?.toUpperCase()).join("") || "P",
  };
}

const AVISO_PERDA = "Havia alterações não salvas e elas não puderam ser recuperadas. Por segurança, nada é gravado em nome de outra conta.";

function mostrarLogin(aviso = "") {
  root.dataset.blogGate = "login";
  emDemo = false;
  identidadeAtual = null;
  assinaturaDaConta = null;
  const perdeu = mesa?.sair();
  if (perdeu || aviso) {
    const status = root.querySelector("[data-admin-auth-status]");
    if (status) status.textContent = aviso || AVISO_PERDA;
  }
  if (loginView) loginView.hidden = false;
  if (panel) panel.hidden = true;
  document.title = "Potala — Mesa do Caderno";
}

const demoPermitida = demonstracaoPermitida({ ambiente: AMBIENTE_SUPABASE, origem: globalThis.location?.origin });

function abrirMesa({ demo = false } = {}) {
  // A demonstração só abre onde a lista de permissão deixa, nem se o botão for reexibido à mão.
  if (demo && !demoPermitida) return;
  root.dataset.blogGate = "mesa";
  emDemo = demo;
  if (loginView) loginView.hidden = true;
  if (panel) panel.hidden = false;
  mesa ||= criarMesa({ raiz: panel, repositorio, permissoes });
  /* As permissoes seguem a sessao atual a cada entrada: troca de conta nao exige F5. */
  mesa.entrar({ usuario: demo ? null : usuario, permissoes: demo ? {} : permissoes, identidade: demo ? "demonstracao" : identidadeAtual });
}

/*
 * O "acesso de teste" é uma demonstração que vive só no navegador (três textos
 * inventados, nada vai ao banco). Em Production ele fica oculto: ao lado do
 * login, parece um segundo acesso ao Blog real. Em LAB, Preview e uso local
 * continua disponível. Em Production (domínio oficial, alias ou endereço do
 * deployment) não há parâmetro de URL nem atributo que a reative: o botão fica
 * oculto e abrirMesa recusa o modo demonstração.
 */
const botaoDeTeste = root?.querySelector("[data-blog-teste]");
if (botaoDeTeste) botaoDeTeste.hidden = !demoPermitida;
botaoDeTeste?.addEventListener("click", () => abrirMesa({ demo: true }));
continueButton?.addEventListener("click", () => abrirMesa());
/*
 * Sair: na demonstracao so fecha a Mesa. Com conta, grava antes o que estiver pendente (a sessao ainda e a
 * mesma); se nao der, pergunta e deixa copiar o texto. Sem pendencias, segue o fluxo normal.
 */
panel?.addEventListener("click", async (event) => {
  const botao = event.target.closest?.("[data-admin-sign-out]");
  if (!botao) return;
  if (saidaLiberada) { saidaLiberada = false; return; }
  if (emDemo) {
    event.stopImmediatePropagation();
    mostrarLogin();
    return;
  }
  if (!mesa?.temMudancas()) return;
  event.stopImmediatePropagation();
  event.preventDefault();
  if (await mesa.prepararSaida()) {
    saidaLiberada = true;
    botao.click();
  }
}, true);

try {
  const client = getSupabaseClient();
  remoto = criarBlogAdministrativo({ client });
  /*
   * Conta trocada em outra aba: antes de qualquer coisa corta gravacoes e apaga da tela o texto do usuario
   * anterior. Assinado primeiro para rodar antes do login tratar a sessao nova.
   */
  client.auth.onAuthStateChange((_evento, sessao) => {
    if (emDemo || root.dataset.blogGate !== "mesa") return;
    if (identidadeMudou(identidadeAtual, sessao?.user?.id || null)) mostrarLogin("A conta mudou em outra aba. Confirme a conta para continuar.");
  });
  const form = root?.querySelector("[data-admin-auth-form]");
  form?.addEventListener("submit", () => { root.dataset.blogGate = "entrar"; }, true);
  createAdminAuth({
    client,
    root,
    managePanel: false,
    onAuthorized(access) {
      usuario = comoUsuario(access?.user);
      permissoes = permissoesDaSessao(access);
      identidadeAtual = identidadeDaSessao(access);
      const assinatura = assinaturaDaSessao(access);
      const entrada = entradaAoAutorizar({
        gate: root.dataset.blogGate, hash: window.location.hash, assinaturaAnterior: assinaturaDaConta, assinatura, emDemo,
      });
      assinaturaDaConta = assinatura;
      /* Quem volta com a sessão aberta e um endereço da mesa (#/editar/…) entra direto. */
      /* "reabrir": Mesa ja aberta e a conta (ou o que ela pode) mudou; abre de novo com as permissoes novas. */
      if (entrada !== "continuar") abrirMesa();
      else if (continueButton) continueButton.hidden = false;
    },
    onState(state) {
      if (emDemo) return;
      if (state !== "authorized" && root.dataset.blogGate === "mesa") mostrarLogin();
    },
  });
} catch (error) {
  root.dataset.authState = "error";
  const status = root.querySelector("[data-admin-auth-status]");
  if (status) status.textContent = "Não foi possível iniciar a mesa do Blog.";
  console.error(error);
}
