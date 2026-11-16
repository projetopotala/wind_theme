/*
 * "Inscricoes de cursos": fila simples do Owner para os pedidos feitos pelos alunos.
 * Le por admin_list_course_enrollment_requests e decide por admin_decide_course_enrollment_request
 * (somente administracao; o banco confere a situacao, a versao do pedido e registra a auditoria).
 * Recebimento por fora do portal: "Registrar pagamento recebido" chama admin_register_manual_course_payment (somente o
 * Owner; o banco confere o valor congelado no pedido, grava o recebimento como origem "manual" e matricula numa unica
 * transacao). O valor NUNCA e digitado: vem do pedido. Correcao/estorno: admin_reverse_manual_course_payment.
 * Pagamento "confirmado pelo servidor" (futuro webhook do Asaas) continua fora do navegador.
 */
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const e = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

export const SITUACOES = Object.freeze({
  solicitada: "Solicitada",
  aguardando_pagamento: "Aguardando pagamento",
  pagamento_confirmado: "Pagamento confirmado",
  matriculada: "Matriculada",
  recusada: "Recusada",
  cancelada: "Cancelada",
});

export const FORMAS_DE_RECEBIMENTO = Object.freeze([["pix", "Pix"], ["transferencia", "Transferência"], ["dinheiro", "Dinheiro"], ["outro", "Outro"]]);
export const AVISO_RECEBIMENTO = "Confirme somente se o Instituto já recebeu o pagamento. Esta ação registrará o recebimento e concluirá a matrícula.";

export function acoesPermitidas(status, precoCentavos) {
  if (status === "solicitada") return [["aprovar", precoCentavos === 0 ? "Aprovar e matricular" : "Aprovar (aguardar pagamento)"], ["recusar", "Recusar"], ["cancelar", "Cancelar"]];
  if (status === "aguardando_pagamento") return [["recusar", "Recusar"], ["cancelar", "Cancelar"]];
  if (status === "pagamento_confirmado" || status === "matriculada") return [["cancelar", "Cancelar matrícula"]];
  return [];
}

const reais = (c) => (Number.isInteger(c) ? (c === 0 ? "Gratuito" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c / 100)) : "—");
const data = (iso) => { const d = new Date(iso); return Number.isNaN(d.valueOf()) ? "" : new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(d); };
const diaBR = (ymd) => (/^\d{4}-\d{2}-\d{2}$/.test(String(ymd)) ? String(ymd).split("-").reverse().join("/") : "");
const rotuloForma = (m) => FORMAS_DE_RECEBIMENTO.find(([k]) => k === m)?.[1] ?? m;

/* Hoje em Sao Paulo (AAAA-MM-DD), para a data padrao e o limite do campo. */
export function hojeEmSaoPaulo(agora = new Date()) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
  return /^\d{4}-\d{2}-\d{2}$/.test(p) ? p : agora.toISOString().slice(0, 10);
}

/* Acoes de dinheiro permitidas para o pedido (o banco confere de novo). */
export function acoesDeRecebimento(item) {
  const pag = item?.payment;
  if (item?.status === "aguardando_pagamento" && Number.isInteger(item.price_cents) && item.price_cents > 0) return [["receber", "Registrar pagamento recebido"]];
  if (pag?.source === "manual" && pag.status === "registrado") {
    if (item.status === "matriculada") return [["corrigir", "Corrigir recebimento"]];
    if (item.status === "cancelada") return [["estorno", "Registrar estorno realizado"]];
  }
  return [];
}

export function textoDoRecebimento(item) {
  const p = item?.payment;
  if (!p) return "";
  const base = `${reais(p.amount_cents)} · ${rotuloForma(p.method)} · ${diaBR(p.received_on)}${p.reference ? ` · ${p.reference}` : ""}`;
  if (p.status === "registrado") {
    return item.status === "cancelada"
      ? `Recebimento manual registrado (${base}). Inscrição cancelada, mas nenhum estorno foi registrado.`
      : `Recebimento manual registrado: ${base}.`;
  }
  if (p.status === "anulado") return `Registro de recebimento anulado (${base}): ${p.reversal_reason || "sem motivo"}.`;
  if (p.status === "estornado") return `Recebimento estornado (${base}): ${p.reversal_reason || "sem motivo"}.`;
  return "";
}

export function renderizarInscricoes(lista = [], { filtro = "pendentes", mensagem = "", erro = "" } = {}) {
  const pendentes = ["solicitada", "aguardando_pagamento", "pagamento_confirmado"];
  const itens = (Array.isArray(lista) ? lista : []).filter((i) => filtro === "todas" || pendentes.includes(i.status));
  return `<header class="nc-cabecalho"><h2 id="ic-titulo">Inscrições de cursos</h2><button type="button" class="op-button" data-ic-fechar>Fechar</button></header>
    <div class="ic-filtro" role="group" aria-label="Filtrar">
      <button type="button" class="op-button${filtro === "pendentes" ? " op-primary" : ""}" data-ic-filtro="pendentes">Pendentes</button>
      <button type="button" class="op-button${filtro === "todas" ? " op-primary" : ""}" data-ic-filtro="todas">Todas</button>
    </div>
    ${erro ? `<p class="nc-erros" role="alert">${e(erro)}</p>` : ""}
    ${mensagem ? `<p class="nc-ok" role="status">${e(mensagem)}</p>` : ""}
    ${itens.length ? `<ul class="ic-lista">${itens.map((i) => {
      const vagas = Number.isInteger(i.capacity) ? `${Math.max(i.capacity - (i.seats_taken || 0), 0)} de ${i.capacity} vagas livres` : "Vagas sem limite";
      const recebimento = textoDoRecebimento(i);
      const dinheiro = acoesDeRecebimento(i);
      return `<li class="ic-item" data-ic-item="${e(i.id)}">
        <p class="ic-situacao">${e(SITUACOES[i.status] || i.status)}</p>
        <h3>${e(i.course_title || "Curso")}</h3>
        <p>${e(i.student_name)} · ${e(i.student_email)}</p>
        <p class="op-field-hint">Pedido em ${e(data(i.created_at))} · ${e(reais(i.price_cents))} · ${e(vagas)}</p>
        ${recebimento ? `<p class="ic-recebimento">${e(recebimento)}</p>` : ""}
        <div class="ic-acoes">${dinheiro.map(([a, rot]) => `<button type="button" class="op-button${a === "receber" ? " op-primary" : ""}" data-ic-${e(a)}="${e(i.id)}">${e(rot)}</button>`).join("")}${acoesPermitidas(i.status, i.price_cents).map(([d, rot]) => `<button type="button" class="op-button${d === "aprovar" ? " op-primary" : ""}" data-ic-decidir="${e(d)}" data-ic-id="${e(i.id)}" data-ic-versao="${e(i.updated_at)}">${e(rot)}</button>`).join("")}</div>
      </li>`;
    }).join("")}</ul>` : `<p>${filtro === "pendentes" ? "Nenhuma inscrição pendente." : "Nenhuma inscrição ainda."}</p>`}`;
}

/* Janela de confirmacao do recebimento. O valor e do pedido (somente leitura). */
export function renderizarConfirmacaoRecebimento(item, { hoje = hojeEmSaoPaulo(), erro = "" } = {}) {
  const criado = String(item?.created_at || "").slice(0, 10);
  return `<header class="nc-cabecalho"><h2 id="ic-rec-titulo">Registrar pagamento recebido</h2><button type="button" class="op-button" data-ic-rec-fechar>Fechar</button></header>
    <p class="ic-aviso" role="note">${e(AVISO_RECEBIMENTO)}</p>
    ${erro ? `<p class="nc-erros" role="alert">${e(erro)}</p>` : ""}
    <dl class="ic-resumo">
      <div><dt>Curso</dt><dd>${e(item?.course_title || "Curso")}</dd></div>
      <div><dt>Aluno</dt><dd>${e(item?.student_name)} · ${e(item?.student_email)}</dd></div>
      <div><dt>Valor esperado</dt><dd><strong>${e(reais(item?.price_cents))}</strong></dd></div>
    </dl>
    <label>Forma de pagamento<select name="forma" required>${FORMAS_DE_RECEBIMENTO.map(([k, r]) => `<option value="${k}">${e(r)}</option>`).join("")}</select></label>
    <label>Data do recebimento<input type="date" name="data" required value="${e(hoje)}" max="${e(hoje)}"${/^\d{4}-\d{2}-\d{2}$/.test(criado) ? ` min="${e(criado)}"` : ""}></label>
    <label>Referência ou observação <span class="op-field-hint" data-ic-ref-dica>(opcional)</span><input name="referencia" maxlength="200" autocomplete="off" placeholder="Ex.: comprovante Pix, nome de quem pagou"></label>
    <label class="op-check"><input type="checkbox" name="confirmo" required> Confirmo que o Instituto já recebeu ${e(reais(item?.price_cents))}.</label>
    <div class="ic-acoes"><button type="button" class="op-button" data-ic-rec-fechar>Voltar</button><button type="button" class="op-button op-primary" data-ic-rec-confirmar disabled>Confirmar recebimento e matricular</button></div>`;
}

/* Correcao do recebimento (registro por engano) ou registro de estorno ja realizado. */
export function renderizarCorrecaoRecebimento(item, { modo = "corrigir", erro = "" } = {}) {
  const soEstorno = modo === "estorno";
  return `<header class="nc-cabecalho"><h2 id="ic-rec-titulo">${soEstorno ? "Registrar estorno realizado" : "Corrigir recebimento"}</h2><button type="button" class="op-button" data-ic-rec-fechar>Fechar</button></header>
    <p class="ic-aviso" role="note">Nada é apagado: o recebimento fica na história com quem corrigiu, quando e por quê. Cancelar a inscrição, por si só, não registra devolução de dinheiro.</p>
    ${erro ? `<p class="nc-erros" role="alert">${e(erro)}</p>` : ""}
    <p><strong>${e(item?.course_title || "Curso")}</strong> · ${e(item?.student_name)} · ${e(textoDoRecebimento(item))}</p>
    ${soEstorno ? `<input type="hidden" name="desfecho" value="estorno_realizado"><p>O dinheiro já foi devolvido ao aluno.</p>` : `<fieldset class="ic-opcoes"><legend>O que aconteceu?</legend>
      <label class="op-check"><input type="radio" name="desfecho" value="registro_incorreto" checked> Registrei por engano: o dinheiro não entrou. A inscrição volta a aguardar pagamento.</label>
      <label class="op-check"><input type="radio" name="desfecho" value="estorno_realizado"> O dinheiro foi devolvido ao aluno. A inscrição é cancelada.</label></fieldset>`}
    <label>Motivo (obrigatório)<textarea name="motivo" rows="3" minlength="5" maxlength="300" required placeholder="Ex.: conferido no extrato, Pix não compensou"></textarea></label>
    <div class="ic-acoes"><button type="button" class="op-button" data-ic-rec-fechar>Voltar</button><button type="button" class="op-button op-primary" data-ic-corr-confirmar>${soEstorno ? "Registrar estorno" : "Confirmar correção"}</button></div>`;
}

export const MENSAGENS_DE_RECEBIMENTO = Object.freeze({
  PT409: "A inscrição mudou ou já tem recebimento. A lista foi atualizada.",
  42501: "Somente o Owner registra recebimentos.",
  22023: "Confira os dados: o valor, a data e a forma precisam ser válidos para esta inscrição.",
  PT422: "O cadastro do aluno precisa ser revisado pelo Instituto antes da matrícula. Nada foi registrado.",
  P0002: "Inscrição não encontrada. A lista foi atualizada.",
});

const novaChave = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : null);

export function createInscricoesCursos({ root, client, documento = root?.ownerDocument || globalThis.document, novaChaveFn = novaChave } = {}) {
  if (!root || !client?.rpc) return null;
  const dialog = documento.createElement("dialog");
  dialog.className = "op-dialog nc-dialog ic-dialog";
  dialog.setAttribute("aria-labelledby", "ic-titulo");
  const corpo = documento.createElement("div");
  corpo.className = "ic-corpo";
  dialog.appendChild(corpo);
  root.appendChild(dialog);

  const janela = documento.createElement("dialog");
  janela.className = "op-dialog nc-dialog ic-dialog ic-recebimento-dialog";
  janela.setAttribute("aria-labelledby", "ic-rec-titulo");
  const painel = documento.createElement("div");
  painel.className = "ic-corpo";
  janela.appendChild(painel);
  root.appendChild(janela);

  let lista = [];
  let filtro = "pendentes";
  let foco = null; // { tipo, id, chave, enviando }
  const desenhar = (extra = {}) => { corpo.innerHTML = renderizarInscricoes(lista, { filtro, ...extra }); };
  const doPedido = (id) => lista.find((i) => i.id === id);

  async function carregar(extra = {}) {
    const { data: d, error } = await client.rpc("admin_list_course_enrollment_requests");
    if (error) { desenhar({ erro: "Não foi possível carregar as inscrições." }); return; }
    lista = Array.isArray(d) ? d : [];
    desenhar(extra);
  }

  const fecharJanela = () => { foco = null; janela.close?.(); };
  const campo = (nome) => painel.querySelector?.(`[name="${nome}"]`);
  const habilitar = () => {
    const botao = painel.querySelector?.("[data-ic-rec-confirmar]");
    if (!botao) return;
    const ok = campo("confirmo")?.checked && campo("data")?.value && campo("forma")?.value && !foco?.enviando;
    const semRef = campo("forma")?.value === "outro" && !String(campo("referencia")?.value || "").trim();
    botao.disabled = !ok || semRef;
    const dica = painel.querySelector?.("[data-ic-ref-dica]");
    if (dica) dica.textContent = campo("forma")?.value === "outro" ? "(obrigatória para “Outro”)" : "(opcional)";
  };

  function abrirRecebimento(id) {
    const item = doPedido(id);
    if (!item) return;
    foco = { tipo: "receber", id, chave: novaChaveFn(), enviando: false };
    painel.innerHTML = renderizarConfirmacaoRecebimento(item);
    janela.showModal?.();
    habilitar();
  }
  function abrirCorrecao(id, modo) {
    const item = doPedido(id);
    if (!item?.payment?.id) return;
    foco = { tipo: modo, id, enviando: false };
    painel.innerHTML = renderizarCorrecaoRecebimento(item, { modo });
    janela.showModal?.();
  }

  async function confirmarRecebimento() {
    const item = foco && doPedido(foco.id);
    if (!item || foco.enviando || !foco.chave) return;
    habilitar();
    if (painel.querySelector?.("[data-ic-rec-confirmar]")?.disabled) return;
    foco.enviando = true;
    const botao = painel.querySelector("[data-ic-rec-confirmar]");
    if (botao) botao.disabled = true;
    const { error } = await client.rpc("admin_register_manual_course_payment", {
      p_idempotency_key: foco.chave,
      p_request_id: item.id,
      p_expected_updated_at: item.updated_at,
      p_amount_cents: item.price_cents,
      p_method: campo("forma").value,
      p_received_on: campo("data").value,
      p_reference: String(campo("referencia")?.value || "").trim() || null,
    });
    if (error) {
      foco.enviando = false;
      const msg = MENSAGENS_DE_RECEBIMENTO[error.code] || "Não foi possível registrar. Nada foi alterado; tente de novo.";
      if (["PT409", "P0002", "PT422", "42501"].includes(error.code)) { fecharJanela(); await carregar({ erro: msg }); return; }
      painel.innerHTML = renderizarConfirmacaoRecebimento(item, { erro: msg });
      habilitar();
      return;
    }
    fecharJanela();
    await carregar({ mensagem: "Recebimento registrado. O aluno foi matriculado e o curso já aparece no Meu Potala." });
  }

  async function confirmarCorrecao() {
    const item = foco && doPedido(foco.id);
    if (!item || foco.enviando) return;
    const motivo = String(campo("motivo")?.value || "").trim();
    const desfecho = painel.querySelector?.('[name="desfecho"]:checked')?.value || campo("desfecho")?.value || "registro_incorreto";
    if (motivo.length < 5) { painel.innerHTML = renderizarCorrecaoRecebimento(item, { modo: foco.tipo, erro: "Escreva o motivo (pelo menos 5 caracteres)." }); return; }
    foco.enviando = true;
    const { error } = await client.rpc("admin_reverse_manual_course_payment", { p_payment_id: item.payment.id, p_outcome: desfecho, p_reason: motivo });
    foco.enviando = false;
    if (error) {
      fecharJanela();
      await carregar({ erro: MENSAGENS_DE_RECEBIMENTO[error.code] || "Não foi possível registrar a correção. Nada foi alterado." });
      return;
    }
    fecharJanela();
    await carregar({ mensagem: "Correção registrada." });
  }

  painel.addEventListener("click", (ev) => {
    if (ev.target?.closest?.("[data-ic-rec-fechar]")) { fecharJanela(); return; }
    if (ev.target?.closest?.("[data-ic-rec-confirmar]")) { void confirmarRecebimento(); return; }
    if (ev.target?.closest?.("[data-ic-corr-confirmar]")) { void confirmarCorrecao(); }
  });
  painel.addEventListener("input", habilitar);
  painel.addEventListener("change", habilitar);
  janela.addEventListener?.("close", () => { foco = null; });

  corpo.addEventListener("click", async (ev) => {
    if (ev.target?.closest?.("[data-ic-fechar]")) { dialog.close?.(); return; }
    const f = ev.target?.closest?.("[data-ic-filtro]");
    if (f) { filtro = f.getAttribute("data-ic-filtro"); desenhar(); return; }
    const rec = ev.target?.closest?.("[data-ic-receber]");
    if (rec) { abrirRecebimento(rec.getAttribute("data-ic-receber")); return; }
    const cor = ev.target?.closest?.("[data-ic-corrigir]");
    if (cor) { abrirCorrecao(cor.getAttribute("data-ic-corrigir"), "corrigir"); return; }
    const est = ev.target?.closest?.("[data-ic-estorno]");
    if (est) { abrirCorrecao(est.getAttribute("data-ic-estorno"), "estorno"); return; }
    const b = ev.target?.closest?.("[data-ic-decidir]");
    if (!b) return;
    const decisao = b.getAttribute("data-ic-decidir");
    if ((decisao === "recusar" || decisao === "cancelar") && !globalThis.confirm?.(decisao === "recusar" ? "Recusar esta inscrição?" : "Cancelar esta inscrição?")) return;
    b.disabled = true;
    const { error } = await client.rpc("admin_decide_course_enrollment_request", { p_id: b.getAttribute("data-ic-id"), p_expected_updated_at: b.getAttribute("data-ic-versao"), p_decision: decisao });
    if (error) {
      const msg = { PT409: "A inscrição mudou. A lista foi atualizada.", 42501: "Seu acesso não permite esta decisão.", 22023: "Esta mudança não é permitida na situação atual." }[error.code] || "Não foi possível registrar a decisão.";
      await carregar({ erro: msg });
      return;
    }
    await carregar({ mensagem: "Decisão registrada." });
  });

  root.addEventListener("click", (ev) => {
    if (!ev.target?.closest?.("[data-inscricoes-cursos]")) return;
    ev.preventDefault();
    desenhar();
    if (!dialog.open) dialog.showModal?.();
    void carregar();
  });
  return { dialog, janela, carregar };
}
