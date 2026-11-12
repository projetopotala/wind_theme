/*
 * CENTRAL OPERACIONAL | "O QUE DESEJA FAZER?"
 *
 * Atalhos por tarefa na entrada do painel. Nenhuma funcionalidade nova: cada
 * atalho abre a seção que já existe (pelo mesmo botão do menu lateral) e, quando
 * a seção oferece um formulário, abre esse formulário pelo mesmo botão que a
 * pessoa clicaria. Os dados continuam passando pelos mesmos cadastros e pelas
 * mesmas regras do banco.
 *
 * Permissões: o atalho só funciona se o botão da seção estiver visível e ativo
 * no menu. Quem não pode abrir a seção (por exemplo, a conta só do Blog) não
 * vê o atalho.
 */

export const TAREFAS = Object.freeze([
  {
    id: "profissional", secao: "pessoas", formulario: "person",
    marcar: 'input[name="roles"][value="professional"]',
    guia: "Preencha nome e contato. O papel Profissional já vem marcado. Publicar o perfil e vincular uma conta de acesso são escolhas separadas, feitas depois.",
  },
  {
    id: "horario", secao: "atendimentos", ancora: "#atend-horario",
  },
  {
    id: "solicitacoes", secao: "atendimentos", ancora: "#atend-solicitacoes",
  },
  {
    id: "curso", secao: "ofertas", formulario: "definition",
    escolher: ['select[name="kind"]', "course"],
    guia: "Dê o nome do curso. Depois, use “Criar turma” para abrir uma edição dele, com professor e modalidade.",
  },
  {
    id: "turma", secao: "ofertas", formulario: "offering",
    guia: "Escolha o curso, o professor e a modalidade. As aulas entram depois, na Agenda.",
  },
  {
    id: "inscrever", secao: "ofertas", ancora: "[data-admin-workspace=\"ofertas\"] .op-card:nth-of-type(2)",
  },
  {
    id: "site", secao: "jornada",
  },
]);

const porId = Object.fromEntries(TAREFAS.map((t) => [t.id, t]));

const botaoDaSecao = (root, secao) => root.querySelector(`[data-admin-nav] [data-section="${secao}"]`);

/* Mesmo critério do menu: escondido ou inerte (aria-disabled) não é permitido. */
export function secaoPermitida(root, secao) {
  const botao = botaoDaSecao(root, secao);
  if (!botao || botao.hidden || botao.getAttribute("aria-hidden") === "true") return false;
  if (botao.disabled || botao.getAttribute("aria-disabled") === "true") return false;
  return true;
}

/* Esconde os atalhos de seções que esta conta não pode abrir. */
export function atualizarTarefas(root) {
  for (const item of root.querySelectorAll("[data-admin-tarefa]")) {
    const tarefa = porId[item.getAttribute("data-admin-tarefa")];
    const secao = tarefa?.secao || item.getAttribute("data-admin-tarefa-secao");
    const permitido = secao ? secaoPermitida(root, secao) : true;
    const li = item.closest("li") || item;
    li.hidden = !permitido;
  }
}

function guiaNoFormulario(root, texto) {
  const corpo = root.querySelector("[data-op-form-body]");
  if (!corpo || !texto) return;
  corpo.querySelector("[data-admin-tarefa-guia]")?.remove();
  const guia = root.ownerDocument.createElement("p");
  guia.className = "admin-tarefa-guia op-span";
  guia.setAttribute("data-admin-tarefa-guia", "");
  guia.textContent = texto;
  corpo.prepend(guia);
}

function focarAncora(root, seletor) {
  const alvo = root.querySelector(seletor);
  if (!alvo) return false;
  const titulo = alvo.querySelector("h2, h3") || alvo;
  if (!titulo.hasAttribute("tabindex")) titulo.setAttribute("tabindex", "-1");
  alvo.scrollIntoView?.({ block: "start", behavior: "auto" });
  titulo.focus?.({ preventScroll: true });
  return true;
}

/* Executa a tarefa: abre a seção e, se houver, o formulário existente. */
export function executarTarefa(root, id) {
  const tarefa = porId[id];
  if (!tarefa || !secaoPermitida(root, tarefa.secao)) return false;
  botaoDaSecao(root, tarefa.secao).click();
  const area = root.querySelector(`[data-admin-workspace="${tarefa.secao}"]`);
  if (tarefa.formulario) {
    const botao = [...(area?.querySelectorAll(`[data-op-action="${tarefa.formulario}"]`) || [])].find((b) => !b.dataset.id && !b.disabled);
    if (!botao) { area?.querySelector("h2")?.focus?.(); return true; }
    botao.click();
    if (tarefa.marcar) { const caixa = root.querySelector(`[data-op-form-body] ${tarefa.marcar}`); if (caixa) caixa.checked = true; }
    if (tarefa.escolher) { const [sel, valor] = tarefa.escolher; const campo = root.querySelector(`[data-op-form-body] ${sel}`); if (campo && [...campo.options].some((o) => o.value === valor)) campo.value = valor; }
    guiaNoFormulario(root, tarefa.guia);
    return true;
  }
  if (tarefa.ancora && focarAncora(root, tarefa.ancora)) return true;
  (area?.querySelector("h2") || root.querySelector("#admin-panel-title"))?.focus?.();
  return true;
}

export function ligarTarefas({ root }) {
  if (!root?.querySelector("[data-admin-tarefas]")) return null;
  const onClick = (evento) => {
    const botao = evento.target?.closest?.("button[data-admin-tarefa]");
    if (!botao) return;
    evento.preventDefault?.();
    executarTarefa(root, botao.getAttribute("data-admin-tarefa"));
  };
  root.querySelector("[data-admin-tarefas]").addEventListener("click", onClick);
  atualizarTarefas(root);
  return { atualizar: () => atualizarTarefas(root) };
}
