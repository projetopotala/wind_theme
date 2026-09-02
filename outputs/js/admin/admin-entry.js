import {
  createAdminAuth,
  createAdminPasswordSetup,
  isAdminFirstAccess,
} from "./admin-auth.js";
import { createAdminController } from "./admin-controller.js";
import { DEFAULT_HOME_BLOCKS } from "../home/journey-data.js";
import { createSupabaseContentRepository } from "../home/supabase-content-repository.js";
import { getSupabaseClient } from "../supabase/client.js";

const root = document.getElementById("admin-app");
const panel = document.getElementById("admin-panel");
const authStatus = root?.querySelector("[data-admin-auth-status]");
let controller = null;
let passwordSetup = null;
const firstAccess = isAdminFirstAccess(window.location);

try {
  const client = getSupabaseClient();
  const repository = createSupabaseContentRepository({
    client,
    defaults: DEFAULT_HOME_BLOCKS,
  });

  createAdminAuth({
    client,
    root,
    async onAuthorized() {
      if (!passwordSetup) {
        passwordSetup = createAdminPasswordSetup({ client, root: panel, firstAccess });
      }
      if (!controller) {
        controller = createAdminController({ root: panel, repository });
        await controller.pronto;
      }
      panel?.querySelector("h2")?.focus();
    },
  });
} catch (error) {
  root.dataset.authState = "error";
  if (authStatus) authStatus.textContent = "Não foi possível iniciar o acesso administrativo.";
  console.error("Falha ao iniciar o painel Potala.", error);
}
