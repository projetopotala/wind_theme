/*
 * MESA DO CADERNO EM MODO DEMONSTRAÇÃO (APRESENTAÇÃO).
 *
 * Abre a mesma Mesa do portal, mas sempre com o repositório de demonstração: três textos
 * inventados guardados só neste navegador (localStorage). Esta página NÃO importa a configuração
 * do banco, não carrega o cliente Supabase e não faz login: nada aqui chega ao Blog real.
 */
import { createBlogRepository } from "../blog/blog-repository.js";
import { criarBlogDeDemonstracao } from "../blog/blog-remoto.js";
import { readBlogSettings, saveBlogSettings } from "../blog/blog-settings.js";
import { criarMesa } from "../blog-admin/mesa-app.js";
import { CHAVE_ANTIGA, TEXTOS_DE_DEMONSTRACAO } from "../blog-admin/demonstracao.js";

const CHAVE = "potala.blog.apresentacao.v1";
const root = document.getElementById("blog-admin-app");
const loginView = root?.querySelector("[data-admin-auth-view]");
const panel = document.getElementById("admin-panel");

try { globalThis.localStorage?.removeItem(CHAVE_ANTIGA); } catch { /* sem armazenamento, nada a limpar */ }

const demonstracao = criarBlogDeDemonstracao({
  local: createBlogRepository({ defaults: TEXTOS_DE_DEMONSTRACAO, key: CHAVE }),
  lerConfiguracao: () => readBlogSettings(),
  salvarConfiguracao: (configuracao) => saveBlogSettings(configuracao),
  metadataKey: `${CHAVE}.meta`,
});

const METODOS = [
  "listar", "salvar", "remover", "versoes", "listarCategorias", "criarCategoria", "atualizarCategoria", "removerCategoria",
  "listarMidia", "enviarImagem", "lerConfiguracao", "salvarConfiguracao", "leituras", "comentarios", "moderar", "inscritos",
  "listarPerfis", "salvarPerfil",
];
const repositorio = Object.fromEntries(METODOS.map((nome) => [nome, (...args) => demonstracao[nome](...args)]));
Object.defineProperty(repositorio, "demonstracao", { get: () => true });
repositorio.reset = () => demonstracao.reset();

/* Reiniciar: apaga só as duas chaves desta demonstração (textos e situação) e recarrega com os três textos originais. */
document.querySelector("[data-reiniciar-demo]")?.addEventListener("click", () => {
  try { globalThis.localStorage?.removeItem(CHAVE); globalThis.localStorage?.removeItem(`${CHAVE}.meta`); } catch { /* sem armazenamento, nada a apagar */ }
  window.location.hash = "#/visao";
  window.location.reload();
});

if (root && panel) {
  root.dataset.blogGate = "mesa";
  root.dataset.authState = "demonstracao";
  if (loginView) loginView.hidden = true;
  panel.hidden = false;
  const mesa = criarMesa({ raiz: panel, repositorio, permissoes: {} });
  mesa.entrar({ usuario: null, permissoes: {}, identidade: "demonstracao" });
  /* "Sair" na demonstração só volta ao roteiro: não há sessão para encerrar. */
  panel.addEventListener("click", (event) => {
    if (!event.target.closest?.("[data-admin-sign-out]")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.href = "apresentacao.html";
  }, true);
}
