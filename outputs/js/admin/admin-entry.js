import {
  createAdminAuth,
  createAdminPasswordSetup,
  isAdminFirstAccess,
} from "./admin-auth.js";
import { createAdminController } from "./admin-controller.js";
import { createAdminShell } from "./admin-shell.js";
import { connectOperations, createOperationsController } from "./operations/controller.js";
import { DEFAULT_HOME_BLOCKS } from "../home/journey-data.js";
import { withRequiredDefaultSections } from "../home/default-section-bridge.js";
import { createSupabaseContentRepository } from "../home/supabase-content-repository.js";
import { getSupabaseClient } from "../supabase/client.js";

const root = document.getElementById("admin-app");
const panel = document.getElementById("admin-panel");
const authStatus = root?.querySelector("[data-admin-auth-status]");
let controller = null;
let operationsController = null;
let passwordSetup = null;
const firstAccess = isAdminFirstAccess(window.location);

const shell = panel ? createAdminShell({ root: panel }) : null;
const operationsStatus = panel?.querySelector("[data-op-status]");
const operationsPromise = connectOperations().catch((error) => {
  if (operationsStatus) operationsStatus.textContent = `${error.message} Inicie com “npm run preview:portal”.`;
  return null;
});

try {
  const client = getSupabaseClient();
  const remoteRepository = withRequiredDefaultSections(createSupabaseContentRepository({
    client,
    defaults: DEFAULT_HOME_BLOCKS,
  }), DEFAULT_HOME_BLOCKS, ["revista"]);

  createAdminAuth({
    client,
    root,
    async onAuthorized(access) {
      const operations = await operationsPromise;
      operations?.setActor(access.user?.name || access.session?.user?.email || "local-admin");
      shell?.setUser({
        name: access.user?.name || access.session?.user?.email || "Administração Potala",
        role: access.role === "owner" ? "Administração" : "Equipe administrativa",
      });
      if (!passwordSetup) {
        passwordSetup = createAdminPasswordSetup({ client, root: panel, firstAccess });
      }
      if (!controller) {
        controller = createAdminController({ root: panel, repository: remoteRepository });
        await controller.pronto;
      }
      if (operations && !operationsController) {
        operationsController = createOperationsController({
          root: panel,
          client: operations,
          onNavigate(section) {
            panel.querySelector(`[data-admin-nav] [data-section="${section}"]`)?.click();
          },
        });
        if (operationsStatus) operationsStatus.textContent = "Operação local pronta.";
      }
      panel?.querySelector("h2")?.focus();
    },
  });
} catch (error) {
  root.dataset.authState = "error";
  if (authStatus) authStatus.textContent = "Não foi possível iniciar o acesso administrativo.";
  console.error("Falha ao iniciar o painel Potala.", error);
}
