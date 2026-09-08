import { createAdminAuth } from "../admin/admin-auth.js";
import { getSupabaseClient } from "../supabase/client.js";
import { DEFAULT_BLOG_POSTS } from "../blog/blog-data.js";
import { createBlogRepository } from "../blog/blog-repository.js";
import { createBlogEditor } from "./blog-editor.js";
import { createBlogDesk } from "./blog-desk.js";

const root = document.getElementById("blog-admin-app");
const loginView = root?.querySelector("[data-admin-auth-view]");
const panel = document.getElementById("admin-panel");
const deskView = root?.querySelector("[data-blog-desk]");
const editorView = root?.querySelector("[data-blog-editor]");
const continueButton = root?.querySelector("[data-blog-continue]");
const repository = createBlogRepository({ defaults: DEFAULT_BLOG_POSTS });
let editor = null;
let desk = null;

function mostrarLogin() {
  root.dataset.blogGate = "login";
  delete root.dataset.blogDemo;
  if (loginView) loginView.hidden = false;
  if (panel) panel.hidden = true;
  if (deskView) deskView.hidden = false;
  if (editorView) editorView.hidden = true;
}

function abrirMesa({ demo = false } = {}) {
  root.dataset.blogGate = "mesa";
  if (demo) root.dataset.blogDemo = "true";
  if (loginView) loginView.hidden = true;
  if (panel) panel.hidden = false;
  if (deskView) deskView.hidden = false;
  if (editorView) editorView.hidden = true;
  if (!desk) {
    desk = createBlogDesk({
      root: deskView,
      repository,
      onWrite: () => abrirEditor(),
      onEdit: (id) => abrirEditor(id),
    });
  } else {
    desk.render();
  }
  deskView?.querySelector("h2")?.focus();
}

function abrirEditor(id) {
  if (deskView) deskView.hidden = true;
  if (editorView) editorView.hidden = false;
  if (!editor) editor = createBlogEditor({ root: editorView, repository });
  if (id) editor.open(id);
  else editor.startNew();
}

function sair() {
  if (root.dataset.blogDemo === "true") {
    mostrarLogin();
    return;
  }
  panel?.querySelector("[data-admin-sign-out]")?.click();
}

root?.querySelector("[data-blog-teste]")?.addEventListener("click", () => abrirMesa({ demo: true }));
continueButton?.addEventListener("click", () => abrirMesa());
editorView?.querySelector("[data-blog-leave]")?.addEventListener("click", () => abrirMesa({
  demo: root.dataset.blogDemo === "true",
}));
editorView?.querySelector("[data-blog-sign-out]")?.addEventListener("click", sair);
panel?.querySelector("[data-admin-sign-out]")?.addEventListener("click", (event) => {
  if (root.dataset.blogDemo !== "true") return;
  event.stopImmediatePropagation();
  mostrarLogin();
}, true);

try {
  const client = getSupabaseClient();
  const form = root?.querySelector("[data-admin-auth-form]");
  form?.addEventListener("submit", () => { root.dataset.blogGate = "entrar"; }, true);
  createAdminAuth({
    client,
    root,
    managePanel: false,
    onAuthorized() {
      if (root.dataset.blogGate === "entrar") abrirMesa();
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
  if (status) status.textContent = "Não foi possível iniciar o editor do Blog.";
  console.error(error);
}
