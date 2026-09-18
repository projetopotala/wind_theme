import { createAdminAuth } from "../admin/admin-auth.js";
import { getSupabaseClient } from "../supabase/client.js";
import { DEFAULT_BLOG_POSTS } from "../blog/blog-data.js";
import { criarBlogAdministrativo, criarBlogDeDemonstracao } from "../blog/blog-remoto.js";
import { createBlogRepository } from "../blog/blog-repository.js";
import { readBlogSettings, saveBlogSettings } from "../blog/blog-settings.js";
import { criarMesa } from "./mesa-app.js";

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
const demonstracao = criarBlogDeDemonstracao({
  local: createBlogRepository({ defaults: DEFAULT_BLOG_POSTS }),
  lerConfiguracao: () => readBlogSettings(),
  salvarConfiguracao: (configuracao) => saveBlogSettings(configuracao),
});
let remoto = null;
let usuario = null;
const atual = () => (root.dataset.blogDemo === "true" || !remoto ? demonstracao : remoto);
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
    primeiroNome: nome ? partes[0] : "",
    iniciais: partes.slice(0, 2).map((parte) => parte[0]?.toUpperCase()).join("") || "P",
  };
}

function mostrarLogin() {
  root.dataset.blogGate = "login";
  delete root.dataset.blogDemo;
  mesa?.sair();
  if (loginView) loginView.hidden = false;
  if (panel) panel.hidden = true;
  document.title = "Potala — Mesa do Caderno";
}

function abrirMesa({ demo = false } = {}) {
  root.dataset.blogGate = "mesa";
  if (demo) root.dataset.blogDemo = "true";
  else delete root.dataset.blogDemo;
  if (loginView) loginView.hidden = true;
  if (panel) panel.hidden = false;
  mesa ||= criarMesa({ raiz: panel, repositorio });
  mesa.entrar({ usuario: demo ? null : usuario });
}

root?.querySelector("[data-blog-teste]")?.addEventListener("click", () => abrirMesa({ demo: true }));
continueButton?.addEventListener("click", () => abrirMesa());
panel?.querySelector("[data-admin-sign-out]")?.addEventListener("click", (event) => {
  if (root.dataset.blogDemo !== "true") return;
  event.stopImmediatePropagation();
  mostrarLogin();
}, true);

try {
  const client = getSupabaseClient();
  remoto = criarBlogAdministrativo({ client });
  const form = root?.querySelector("[data-admin-auth-form]");
  form?.addEventListener("submit", () => { root.dataset.blogGate = "entrar"; }, true);
  createAdminAuth({
    client,
    root,
    managePanel: false,
    onAuthorized(access) {
      usuario = comoUsuario(access?.user);
      /* Quem volta com a sessão aberta e um endereço da mesa (#/editar/…) entra direto. */
      if (root.dataset.blogGate === "entrar" || /^#\/./.test(window.location.hash)) abrirMesa();
      else if (continueButton) continueButton.hidden = false;
    },
    onState(state) {
      if (root.dataset.blogDemo === "true") return;
      if (state !== "authorized" && root.dataset.blogGate === "mesa") mostrarLogin();
    },
  });
} catch (error) {
  root.dataset.authState = "error";
  const status = root.querySelector("[data-admin-auth-status]");
  if (status) status.textContent = "Não foi possível iniciar a mesa do Blog.";
  console.error(error);
}
