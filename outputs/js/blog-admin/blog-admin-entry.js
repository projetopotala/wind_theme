import { createAdminAuth } from "../admin/admin-auth.js";
import { getSupabaseClient } from "../supabase/client.js";
import { DEFAULT_BLOG_POSTS } from "../blog/blog-data.js";
import { createBlogRepository } from "../blog/blog-repository.js";
import { createBlogEditor } from "./blog-editor.js";

const root = document.getElementById("blog-admin-app");
const panel = document.getElementById("admin-panel");
let editor = null;

try {
  const client = getSupabaseClient();
  createAdminAuth({ client, root, onAuthorized() {
    if (!editor) editor = createBlogEditor({ root:panel, repository:createBlogRepository({ defaults:DEFAULT_BLOG_POSTS }) });
    panel?.querySelector("h2")?.focus();
  } });
} catch (error) {
  root.dataset.authState = "error";
  const status = root.querySelector("[data-admin-auth-status]");
  if (status) status.textContent = "Não foi possível iniciar o editor do Blog.";
  console.error(error);
}
