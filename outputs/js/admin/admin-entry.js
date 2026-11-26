import {
  createAdminAuth,
  createAdminPasswordSetup,
  isAdminFirstAccess,
  nivelDoBlog,
  rotuloDoPapel,
} from "./admin-auth.js";
import { createAdminController } from "./admin-controller.js";
import { createAdminShell } from "./admin-shell.js";
import { ligarRotasDoAdmin } from "./admin-rotas.js";
import { ligarTarefas } from "./admin-tarefas.js";
import { createCadastroGuiado } from "./cadastro-profissional.js";
import { createOrganizarCurso } from "./organizar-curso.js";
import { createNovoCurso } from "./novo-curso.js";
import { createInscricoesCursos } from "./inscricoes-cursos.js";
import { createCursosPainel } from "./cursos-painel.js";
import { createServicosAtendimento } from "./servicos-atendimento.js";
import { createOperationsClient } from "./operations/client.js";
import { createOperationsController } from "./operations/controller.js";
import { carregarRecebidos } from "./recebidos.js";
import { createPagamentosPixAdmin } from "./pagamentos-pix-admin.js";
import { createAppointmentPanel } from "./appointment-panel.js";
import { createAccessPanel } from "./access-panel.js";
import { createEditarSite } from "../site/editar-site.js";
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
let appointmentPanel = null;
let atendimentosPanel = null;
let accessPanel = null;
let cadastroGuiado = null;
let editarSite = null;
let organizarCurso = null;
let cursosPainel = null;
let usuarioAtual = null;
const firstAccess = isAdminFirstAccess(window.location);

const shell = panel ? createAdminShell({ root: panel }) : null;
const tarefas = panel ? ligarTarefas({ root: panel }) : null;
/* Cada seção tem endereço (/admin/#/acessos): recarregar e o Voltar do navegador respeitam onde a pessoa estava. */
const rotas = panel ? ligarRotasDoAdmin({ janela: window, nav: panel.querySelector("[data-admin-nav]"), painel: panel }) : null;
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
  /* Depois de confirmar um atendimento o item da agenda existe só no servidor: recarrega o estado operacional e redesenha. */
  const refreshOperational = async () => { await operations.refresh(); operationsController?.render(); };
  appointmentPanel = createAppointmentPanel({ root: panel, client, getOperationalState: () => operations.snapshot, refreshOperational });
  /* Seção Atendimentos: mesmo motor do cartão da Visão geral (que segue como caminho alternativo), montado na sua própria área. */
  const atendimentosRoot = panel.querySelector("[data-admin-workspace=\"atendimentos\"]");
  atendimentosPanel = atendimentosRoot
    ? createAppointmentPanel({ root: atendimentosRoot, client, getOperationalState: () => operations.snapshot, refreshOperational,
      selector: "[data-atendimentos-admin]", view: "atendimentos" })
    : null;
  atendimentosRoot?.addEventListener("click", (evento) => {
    const destino = evento.target?.closest?.("[data-atendimentos-goto]")?.getAttribute("data-atendimentos-goto");
    if (destino) panel.querySelector(`[data-admin-nav] [data-section="${destino}"]`)?.click();
  });
  operationsController = createOperationsController({
    root: panel,
    client: operations,
    onRendered: () => { appointmentPanel?.render(); atendimentosPanel?.render(); cursosPainel?.render(); },
    onNavigate(section) {
      panel.querySelector(`[data-admin-nav] [data-section="${section}"]`)?.click();
    },
  });
  /* P1B: cadastro guiado de profissional, sobre os mesmos comandos de Pessoas e as funções de Usuários e acessos. */
  cadastroGuiado = createCadastroGuiado({
    root: panel,
    operations,
    client,
    onSalvo({ id } = {}) { organizarCurso?.professorCadastrado(id); operationsController?.render(); void accessPanel?.reload().catch(() => {}); },
    onNavegar(section) { panel.querySelector(`[data-admin-nav] [data-section="${section}"]`)?.click(); },
  });
  /* Novo curso: caminho principal simples (mesmos comandos e mesmo motor do Organizar um curso). */
  createNovoCurso({ root: panel, operations, client, onSalvo() { operationsController?.render(); void cursosPainel?.recarregar(); } });
  /* Lista simples de cursos (cartoes com contagem de interessados e pedidos). */
  cursosPainel = createCursosPainel({ root: panel, operations, client });
  cursosPainel?.render();
  /* Inscricoes de cursos: fila dos pedidos feitos pelos alunos (decisoes no banco, com auditoria). */
  createInscricoesCursos({ root: panel, client });
  /* P1C: organizar um curso, sobre os mesmos comandos de Cursos e atividades e da Agenda. */
  organizarCurso = createOrganizarCurso({
    root: panel,
    operations,
    onSalvo() { operationsController?.render(); },
    onNavegar(section) { panel.querySelector(`[data-admin-nav] [data-section="${section}"]`)?.click(); },
    abrirCadastroProfissional() { cadastroGuiado?.abrir(); return panel.querySelector("[data-cg-dialog]"); },
  });
  /* Serviços de atendimento: cadastro simples (mesmo motor do Novo curso); só a administração grava, o banco audita. */
  createServicosAtendimento({
    root: panel.querySelector("[data-servicos-atendimento]"),
    operations,
    onSalvo() { operationsController?.render(); void atendimentosPanel?.reload(); },
  });
  /* PAY-06: pagamentos por Pix, somente leitura, dentro de Financeiro. So o Owner ativo (area oculta para os demais; o banco recusa de qualquer forma). */
  const pagamentosPix = createPagamentosPixAdmin({ root: panel.querySelector("[data-pagamentos-pix-admin]"), client });
  panel.querySelector("[data-admin-nav] [data-section=\"financeiro\"]")?.addEventListener("click", () => { void pagamentosPix?.iniciar(); });
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
    onState(state) {
      if (state !== "authorized") { editarSite?.limpar(); appointmentPanel?.clear(); atendimentosPanel?.clear(); accessPanel?.clear(); cadastroGuiado?.limpar(); organizarCurso?.limpar(); }
      else if (appointmentPanel) { void appointmentPanel.reload(); void atendimentosPanel?.reload(); }
    },
    async onAuthorized(access) {
      /* Troca de conta na mesma aba: nada do rascunho anterior fica disponível. */
      const quem = access.session?.user?.id || access.user?.id || null;
      if (usuarioAtual && quem !== usuarioAtual) { cadastroGuiado?.limpar(); organizarCurso?.limpar(); }
      usuarioAtual = quem;
      shell?.setUser({
        name: access.user?.name || access.session?.user?.email || "Administração Potala",
        role: rotuloDoPapel(access),
        blogNivel: nivelDoBlog(access),
        accessRole: access.role,
      });
      /*
       * Minha área profissional: só o Owner COM vínculo profissional ativo (lido do banco,
       * pela mesma função do Meu Potala). Sem vínculo, falha ou outro papel: o link não existe.
       */
      const linkArea = panel.querySelector("[data-admin-minha-area]");
      if (linkArea) {
        linkArea.hidden = true;
        if (access.role === "owner") {
          void Promise.resolve(client.rpc("my_appointment_professional_profiles")).then(({ data, error }) => {
            if (!error && Array.isArray(data) && data.some((p) => p?.profile_id) && usuarioAtual === quem) linkArea.hidden = false;
          }).catch(() => {});
        }
      }
      /* Editar site: só a conta Owner monta o editor; o banco confere de novo em cada chamada. */
      if (access.role === "owner" && !editarSite) {
        editarSite = createEditarSite({
          root: panel.querySelector("[data-editar-site]"),
          client,
          /* Páginas cujo conteúdo é de outro módulo (ex.: a Travessia, na Jornada): o editor só leva até lá. */
          abrirModulo: (secao) => panel.querySelector(`[data-admin-nav] [data-section="${secao}"]`)?.click(),
        });
        panel.addEventListener("click", (evento) => {
          if (evento.target?.closest?.('[data-admin-nav] [data-section="editar-site"]')) void editarSite?.abrir();
        });
      } else if (access.role !== "owner") { editarSite?.limpar(); }
      /* Os atalhos seguem o menu: só aparecem os das seções que esta conta pode abrir. */
      tarefas?.atualizar();
      /* Já com o menu desta conta definido: quem recarregou em "Usuários e acessos" não vê a Visão geral piscar enquanto a operação abre. */
      rotas?.aplicar();
      if (!passwordSetup) {
        passwordSetup = createAdminPasswordSetup({ client, root: panel, firstAccess });
      }
      /* Operação e editor da Jornada são independentes: um falhar não segura o outro. */
      if (access.role !== "blog_editor") {
        operacaoAbrindo ||= abrirOperacao(client, access).catch((error) => console.error("Falha ao abrir a operação.", error));
        /* Usuários e acessos: só para owner/admin; o banco confere de novo (admin_list_accounts). */
        if (!accessPanel) {
          accessPanel = createAccessPanel({ root: panel, client });
          /* Relê ao abrir a seção: mudanças feitas em Pessoas (papel, ativo) aparecem na hora. */
          panel.addEventListener("click", (evento) => {
            if (evento.target?.closest?.('[data-admin-nav] [data-section="atendimentos"]')) void atendimentosPanel?.reload();
            if (evento.target?.closest?.('[data-admin-nav] [data-section="acessos"]')) {
              void accessPanel.reload().catch((error) => console.error("Falha ao carregar usuários e acessos.", error));
            }
          });
        }
        void accessPanel.reload().catch((error) => console.error("Falha ao carregar usuários e acessos.", error));
      }
      if (!controller) {
        controller = createAdminController({ root: panel, repository: remoteRepository });
        await Promise.resolve(controller.pronto).catch((error) => console.error("Falha ao abrir o editor da Jornada.", error));
      }
      if (operacaoAbrindo) await operacaoAbrindo;
      if (appointmentPanel) { void appointmentPanel.reload(); void atendimentosPanel?.reload(); }
      /* Depois de tudo montado (os cliques de cada seção já têm quem os ouça), abre a seção do endereço. */
      rotas?.aplicar();
      (panel?.querySelector("[data-admin-workspace]:not([hidden]) h2") || panel?.querySelector("h2"))?.focus();
    },
  });
} catch (error) {
  root.dataset.authState = "error";
  if (authStatus) authStatus.textContent = "Não foi possível iniciar o acesso administrativo.";
  console.error("Falha ao iniciar o painel Potala.", error);
}
