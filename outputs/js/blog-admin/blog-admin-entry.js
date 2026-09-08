import { createAdminAuth } from "../admin/admin-auth.js";
import { getSupabaseClient } from "../supabase/client.js";
import { DEFAULT_BLOG_POSTS } from "../blog/blog-data.js";
import { createBlogRepository } from "../blog/blog-repository.js";
import { createBlogEditor } from "./blog-editor.js";

const root = document.getElementById("blog-admin-app");
const panel = document.getElementById("admin-panel");
let editor = null;
const acessoTeste = new URLSearchParams(window.location.search).get("acesso") === "teste";

function abrirEditor() {
  if (!editor) editor = createBlogEditor({ root: panel, repository: createBlogRepository({ defaults: DEFAULT_BLOG_POSTS }) });
  panel?.querySelector("h2")?.focus();
}

if (acessoTeste && root && panel) {
  root.dataset.authState = "authorized";
  root.querySelector("[data-admin-auth-view]")?.setAttribute("hidden", "");
  panel.hidden = false;
  const aviso = document.createElement("p");
  aviso.className = "blog-editor-teste";
  aviso.textContent = "Acesso de teste. Os textos desta mesa são de demonstração e não são publicados.";
  panel.querySelector(".blog-editor-topbar")?.append(aviso);
  panel.querySelector("[data-admin-sign-out]")?.addEventListener("click", () => {
    window.location.assign("/blog");
  });
  abrirEditor();
}

try {
  if (!acessoTeste) {
    const client = getSupabaseClient();
    createAdminAuth({ client, root, onAuthorized: abrirEditor });
  }
} catch (error) {
  root.dataset.authState = "error";
  const status = root.querySelector("[data-admin-auth-status]");
  if (status) status.textContent = "Não foi possível iniciar o editor do Blog.";
  console.error(error);
}
