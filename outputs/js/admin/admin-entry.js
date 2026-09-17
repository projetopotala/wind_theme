import {
  createAdminAuth,
  createAdminPasswordSetup,
  isAdminFirstAccess,
} from "./admin-auth.js";
import { createAdminController } from "./admin-controller.js";
import { createAdminShell } from "./admin-shell.js";
import { createOperationsClient } from "./operations/client.js";
import { createOperationsController } from "./operations/controller.js";
import { carregarRecebidos } from "./recebidos.js";
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
let operacaoAbrindo = null;
const firstAccess = isAdminFirstAccess(window.location);

const shell = panel ? createAdminShell({ root: panel }) : null;
const operationsStatus = panel?.querySelector("[data-op-status]");

/*
 * A operação abre depois da autorização: o banco só entrega o estado a quem
 * está com sessão de administração. Se falhar, o motivo aparece onde a
 * Visão geral estaria, e o editor da Jornada continua utilizável.
 */
async function abrirOperacao(client, access) {
  const operations = createOperationsClient({ client });
  operations.setActor(access.user?.name || access.session?.user?.email || "Administração Potala");
  try {
    await operations.refresh();
  } catch (error) {
    for (const node of panel.querySelectorAll("[data-op-view]")) {
      const aviso = document.createElement("p");
      aviso.className = "op-loading";
      aviso.setAttribute("role", "alert");
      aviso.textContent = error.message;
      node.replaceChildren(aviso);
    }
    if (operationsStatus) operationsStatus.textContent = error.message;
    return;
  }
  operationsController = createOperationsController({
    root: panel,
    client: operations,
    onNavigate(section) {
      panel.querySelector(`[data-admin-nav] [data-section="${section}"]`)?.click();
    },
  });
  carregarRecebidos(client)
    .then((dados) => operationsController?.definirRecebidos(dados))
    .catch((error) => operationsController?.definirRecebidos({ erro: error.message }));
}

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
      shell?.setUser({
        name: access.user?.name || access.session?.user?.email || "Administração Potala",
        role: access.role === "owner" ? "Administração" : "Equipe administrativa",
      });
      if (!passwordSetup) {
        passwordSetup = createAdminPasswordSetup({ client, root: panel, firstAccess });
      }
      /* Operação e editor da Jornada são independentes: um falhar não segura o outro. */
      operacaoAbrindo ||= abrirOperacao(client, access).catch((error) => console.error("Falha ao abrir a operação.", error));
      if (!controller) {
        controller = createAdminController({ root: panel, repository: remoteRepository });
        await Promise.resolve(controller.pronto).catch((error) => console.error("Falha ao abrir o editor da Jornada.", error));
      }
      await operacaoAbrindo;
      panel?.querySelector("h2")?.focus();
    },
  });
} catch (error) {
  root.dataset.authState = "error";
  if (authStatus) authStatus.textContent = "Não foi possível iniciar o acesso administrativo.";
  console.error("Falha ao iniciar o painel Potala.", error);
}
