/*
 * PAY-06: painel financeiro (Pix) na Central, dentro da secao Financeiro. SOMENTE LEITURA e so para o Owner ativo.
 * Le por admin_pay_overview, admin_list_appointment_payments e admin_list_appointment_payment_events; o banco recusa quem nao e
 * Owner ativo (42501). Nao ha botao que gere, cancele, confirme ou edite cobranca: o estado do pagamento so muda pelo servidor.
 * Nao mostra CPF, nome do cliente, contato, codigo Pix nem identificadores do provedor (as funcoes nem os devolvem).
 */
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const e = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

export const SITUACOES_DE_PAGAMENTO = Object.freeze({
  criando: "Preparando", aguardando_pagamento: "Aguardando pagamento", em_processamento: "Em análise", confirmado: "Pagamento identificado",
  recebido: "Recebido", vencido: "Vencido", cancelado: "Cancelado", estornado: "Estornado", em_contestacao: "Em contestação", divergente: "Divergente",
});
export const RESULTADOS_DE_EVENTO = Object.freeze({
  aplicado: "Aplicado", sem_mudanca: "Sem mudança", obsoleto: "Antigo, ignorado", divergencia: "Divergência", sem_correspondencia: "Sem cobrança correspondente",
});
export const TIPOS_DE_REVISAO = Object.freeze({
  sem_id_no_provedor: "Cobrança sem registro no provedor", multiplas_no_provedor: "Várias cobranças no provedor", orfa_no_provedor: "Cobrança sem atendimento",
  divergencia_status: "Situação diferente do provedor", divergencia_financeira: "Valor diferente do esperado", pago_sem_atendimento: "Pago sem atendimento",
  revisao_financeira: "Revisão financeira", hold_expirado_sem_id: "Reserva expirada sem cobrança", falha_cancelamento_hold: "Falha ao liberar reserva",
  liberacao_bloqueada: "Liberação bloqueada",
});
export const MENSAGENS_DE_ERRO = Object.freeze({
  42501: "Somente o Owner ativo acompanha os pagamentos.",
});
const FALHA_GENERICA = "Não foi possível carregar os pagamentos agora. Tente de novo em instantes.";

export const mensagemDeErro = (erro) => MENSAGENS_DE_ERRO[erro?.code] || FALHA_GENERICA;
export const emFalha = (item) => item?.status === "divergente" || item?.status === "em_contestacao" || Number(item?.eventos_com_falha) > 0 || Number(item?.revisoes_abertas) > 0 || Boolean(item?.failure_reason);

const REAL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const reais = (c) => (Number.isInteger(c) && c >= 0 ? REAL.format(c / 100) : "—");
export function quando(valor) {
  const d = valor ? new Date(valor) : null;
  return d && !Number.isNaN(d.valueOf()) ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(d) : "—";
}
const curto = (id) => String(id || "").slice(0, 8);

export function renderizarResumo(visao) {
  if (!visao) return "";
  const por = visao.por_situacao && typeof visao.por_situacao === "object" ? visao.por_situacao : {};
  const chips = Object.entries(por).map(([s, n]) => `<li><span>${e(SITUACOES_DE_PAGAMENTO[s] || s)}</span> <strong>${e(n)}</strong></li>`).join("");
  return `<div class="pg-resumo">
    <p class="pg-trava" data-pg-trava="${visao.charges_enabled === true ? "aberta" : "fechada"}">Cobranças: <strong>${visao.charges_enabled === true ? "liberadas" : "bloqueadas"}</strong></p>
    <p>${e(visao.total ?? 0)} cobrança(s) no total · ${e(visao.revisoes_abertas ?? 0)} pendência(s) de revisão · último evento: ${e(quando(visao.ultimo_evento_em))}</p>
    ${chips ? `<ul class="pg-chips">${chips}</ul>` : ""}
  </div>`;
}

export function renderizarLista(lista, { filtro = "", aberto = "", historico = null, historicoErro = "" } = {}) {
  const itens = Array.isArray(lista) ? lista : [];
  const opcoes = [["", "Todas"], ...Object.entries(SITUACOES_DE_PAGAMENTO)];
  const seletor = `<label class="pg-filtro">Situação
    <select data-pg-filtro>${opcoes.map(([k, r]) => `<option value="${e(k)}"${k === filtro ? " selected" : ""}>${e(r)}</option>`).join("")}</select></label>`;
  if (!itens.length) return `${seletor}<p class="pg-vazio" role="status">${filtro ? "Nenhuma cobrança com esta situação." : "Nenhuma cobrança ainda. Os pagamentos por Pix continuam desativados."}</p>`;
  return `${seletor}<ul class="pg-lista">${itens.map((i) => {
    const falha = emFalha(i);
    const abre = aberto === i.id;
    return `<li class="pg-item" data-pg-item="${e(i.id)}" data-status="${e(i.status)}"${falha ? " data-falha" : ""}>
      <p class="pg-situacao">${e(SITUACOES_DE_PAGAMENTO[i.status] || i.status)}${falha ? ' <span class="pg-alerta">Atenção</span>' : ""}</p>
      <h3>${e(i.servico || "Atendimento")} · ${e(reais(i.amount_cents))}</h3>
      <p class="pg-detalhe">Cobrança ${e(curto(i.id))} · criada em ${e(quando(i.created_at))} · atualizada em ${e(quando(i.updated_at))}</p>
      ${i.received_at ? `<p class="pg-detalhe">Recebida em ${e(quando(i.received_at))}</p>` : ""}
      ${i.failure_reason ? `<p class="pg-falha">Falha registrada: ${e(i.failure_reason)}</p>` : ""}
      ${Number(i.revisoes_abertas) > 0 ? `<p class="pg-falha">${e(i.revisoes_abertas)} pendência(s) de revisão aberta(s)</p>` : ""}
      <button type="button" class="op-button" data-pg-historico="${e(i.id)}" aria-expanded="${abre ? "true" : "false"}">${abre ? "Ocultar histórico" : `Ver histórico (${e(i.eventos ?? 0)})`}</button>
      ${abre ? renderizarHistorico(historico, historicoErro) : ""}
    </li>`;
  }).join("")}</ul>`;
}

export function renderizarHistorico(h, erro = "") {
  if (erro) return `<p class="pg-erro" role="alert">${e(erro)}</p>`;
  if (!h) return `<p class="pg-carregando" role="status">Carregando histórico…</p>`;
  const eventos = Array.isArray(h.eventos) ? h.eventos : [];
  const revisoes = Array.isArray(h.revisoes) ? h.revisoes : [];
  if (!eventos.length && !revisoes.length) return `<p class="pg-vazio" role="status">Nenhum evento recebido para esta cobrança.</p>`;
  return `<div class="pg-historico">
    ${eventos.length ? `<ol class="pg-eventos">${eventos.map((x) => `<li${x.resultado === "divergencia" || x.resultado === "sem_correspondencia" ? " data-falha" : ""}>
      <strong>${e(quando(x.recebido_em))}</strong> · ${e(x.evento)} · ${e(RESULTADOS_DE_EVENTO[x.resultado] || x.resultado)}
      ${x.de || x.para ? ` · ${e(SITUACOES_DE_PAGAMENTO[x.de] || x.de || "—")} → ${e(SITUACOES_DE_PAGAMENTO[x.para] || x.para || "—")}` : ""}
      ${Number.isInteger(x.valor_cents) ? ` · ${e(reais(x.valor_cents))}` : ""}</li>`).join("")}</ol>` : ""}
    ${revisoes.length ? `<ul class="pg-revisoes">${revisoes.map((r) => `<li data-falha>${e(TIPOS_DE_REVISAO[r.tipo] || r.tipo)} · aberta em ${e(quando(r.aberta_em))} · ${r.resolvida_em ? `resolvida em ${e(quando(r.resolvida_em))}` : "em aberto"}</li>`).join("")}</ul>` : ""}
  </div>`;
}

export function renderizarPainel({ carregando = false, erro = "", visao = null, lista = [], filtro = "", aberto = "", historico = null, historicoErro = "" } = {}) {
  const topo = `<header class="pg-cabecalho"><h3 id="pg-titulo">Pagamentos por Pix</h3>
    <p class="op-muted">Acompanhamento somente leitura. Nada aqui gera, cancela ou altera cobranças.</p></header>`;
  if (carregando) return `${topo}<p class="pg-carregando" role="status">Carregando pagamentos…</p>`;
  if (erro) return `${topo}<p class="pg-erro" role="alert">${e(erro)}</p><button type="button" class="op-button" data-pg-recarregar>Tentar de novo</button>`;
  return `${topo}${renderizarResumo(visao)}${renderizarLista(lista, { filtro, aberto, historico, historicoErro })}<button type="button" class="op-button" data-pg-recarregar>Atualizar</button>`;
}

/* Liga o painel a um elemento. So chama RPCs de leitura; recusa montar sem cliente. */
export function createPagamentosPixAdmin({ root, client } = {}) {
  if (!root || !client?.rpc) return null;
  let estado = { carregando: false, erro: "", visao: null, lista: [], filtro: "", aberto: "", historico: null, historicoErro: "" };
  let geracao = 0;
  let carregou = false;
  const desenhar = () => { root.innerHTML = renderizarPainel(estado); };

  async function carregar() {
    const minha = ++geracao;
    estado = { ...estado, carregando: true, erro: "" }; desenhar();
    try {
      const [v, l] = await Promise.all([
        client.rpc("admin_pay_overview"),
        client.rpc("admin_list_appointment_payments", { p_status: estado.filtro || null, p_limit: 50 }),
      ]);
      if (v.error) throw v.error;
      if (l.error) throw l.error;
      if (minha !== geracao) return;
      estado = { ...estado, carregando: false, visao: v.data, lista: Array.isArray(l.data) ? l.data : [], aberto: "", historico: null, historicoErro: "" };
    } catch (erro) {
      if (minha !== geracao) return;
      estado = { ...estado, carregando: false, erro: mensagemDeErro(erro) };
    }
    desenhar();
  }

  async function abrirHistorico(id) {
    if (estado.aberto === id) { estado = { ...estado, aberto: "", historico: null, historicoErro: "" }; desenhar(); return; }
    const minha = ++geracao;
    estado = { ...estado, aberto: id, historico: null, historicoErro: "" }; desenhar();
    try {
      const { data, error } = await client.rpc("admin_list_appointment_payment_events", { p_payment_id: id });
      if (error) throw error;
      if (minha !== geracao) return;
      estado = { ...estado, historico: data && typeof data === "object" ? data : { eventos: [], revisoes: [] } };
    } catch (erro) {
      if (minha !== geracao) return;
      estado = { ...estado, historicoErro: mensagemDeErro(erro) };
    }
    desenhar();
  }

  root.addEventListener("click", (evento) => {
    if (evento.target.closest?.("[data-pg-recarregar]")) { void carregar(); return; }
    const h = evento.target.closest?.("[data-pg-historico]");
    if (h) void abrirHistorico(h.getAttribute("data-pg-historico"));
  });
  root.addEventListener("change", (evento) => {
    const f = evento.target.closest?.("[data-pg-filtro]");
    if (f) { estado = { ...estado, filtro: f.value }; void carregar(); }
  });

  return {
    /* Chamado quando a secao Financeiro abre; carrega uma vez e so se a conta e Owner (o botao/area ja esta oculto para as demais). */
    async iniciar() { if (carregou || root.hidden) return; carregou = true; await carregar(); },
    recarregar: carregar,
  };
}
