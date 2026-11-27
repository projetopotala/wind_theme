/* PAY-06 + PAY-10: acompanhamento financeiro, precos e piloto Pix na mesma Central. Todas as escritas usam RPCs Owner-only. */
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
export function centavosDoCampo(valor) {
  const texto = String(valor ?? "").trim().replace(/\s|R\$/gi, "");
  if (!texto) return null;
  const normal = texto.includes(",") ? texto.replace(/\./g, "").replace(",", ".") : texto;
  if (!/^\d+(?:\.\d{1,2})?$/.test(normal)) return null;
  const [inteiro, decimal = ""] = normal.split(".");
  const centavos = Number(inteiro) * 100 + Number(decimal.padEnd(2, "0"));
  return Number.isSafeInteger(centavos) && centavos > 0 && centavos <= 99999999 ? centavos : null;
}
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

const ESTADOS_AUTORIZACAO = Object.freeze({ none: "Não autorizada", active: "Ativa", expired: "Expirada", revoked: "Revogada" });
export function renderizarPrecos(precos = [], ocupado = false) {
  const lista = Array.isArray(precos) ? precos : [];
  const corpo = !lista.length ? '<p class="pg-vazio" role="status">Nenhuma oferta ativa foi encontrada.</p>' : `<ul class="pg-config-lista">${lista.map((item) => {
    const bloqueada = item.test_or_demo || !item.professional_eligible;
    const motivo = item.test_or_demo ? "Oferta ou profissional identificado como teste/demonstração." : !item.professional_eligible ? "Profissional inativo, não publicado ou incompatível." : "";
    const valor = Number.isInteger(item.amount_cents) ? (item.amount_cents / 100).toFixed(2).replace(".", ",") : "";
    return `<li class="pg-config-item" data-pg-price-item="${e(item.offering_id)}"${bloqueada ? " data-bloqueado" : ""}>
      <div><p class="pg-situacao">${item.published ? "Oferta publicada" : "Oferta não publicada"}</p><h5>${e(item.title || item.offering_id)}</h5>
      <p class="pg-detalhe">Profissional: ${e(item.professional_name || "Não identificado")}</p></div>
      ${motivo ? `<p class="pg-falha" role="status">${e(motivo)}</p>` : ""}
      <label>Preço do atendimento (R$)<input data-pg-price-value inputmode="decimal" autocomplete="off" value="${e(valor)}" placeholder="0,00" ${bloqueada || ocupado ? "disabled" : ""}></label>
      <p class="pg-detalhe">${item.amount_cents == null ? "Nenhum preço cadastrado." : `${e(reais(item.amount_cents))} · ${item.price_active ? "ativo" : "inativo"}`}</p>
      <div class="pg-acoes"><button type="button" class="op-button" data-pg-price-save ${bloqueada || ocupado ? "disabled" : ""}>Salvar preço</button>
      ${item.amount_cents == null ? "" : `<button type="button" class="op-button" data-pg-price-toggle data-active="${item.price_active ? "true" : "false"}" ${bloqueada || ocupado ? "disabled" : ""}>${item.price_active ? "Desativar preço" : "Ativar preço"}</button>
      <button type="button" class="op-button" data-pg-offering-payments data-enabled="${item.payments_enabled ? "true" : "false"}" ${bloqueada || !item.price_active || ocupado ? "disabled" : ""}>${item.payments_enabled ? "Desativar Pix nesta oferta" : "Habilitar Pix nesta oferta"}</button>`}</div>
      <p class="pg-detalhe">Pix por oferta: <strong>${item.payments_enabled ? "habilitado" : "desativado"}</strong>. A trava global continua obrigatória.</p>
    </li>`;
  }).join("")}</ul>`;
  return `<section class="pg-config" aria-labelledby="pg-precos-titulo"><header><h4 id="pg-precos-titulo">Preços dos atendimentos</h4>
    <p class="op-muted">O valor é vinculado à oferta e não altera cobranças já criadas. Ofertas de teste não podem ser ativadas.</p></header>${corpo}</section>`;
}

export function renderizarPiloto(candidatos = [], ocupado = false) {
  const lista = Array.isArray(candidatos) ? candidatos : [];
  const corpo = !lista.length ? '<p class="pg-vazio" role="status">Nenhum pedido autenticado está disponível para o piloto.</p>' : `<ul class="pg-config-lista">${lista.map((item) => {
    const estado = ESTADOS_AUTORIZACAO[item.authorization_state] || item.authorization_state;
    const autorizar = item.authorization_state !== "active";
    const revogar = item.authorization_state !== "none" && item.authorization_state !== "revoked";
    return `<li class="pg-config-item" data-pg-pilot-item="${e(item.request_id)}"${item.eligible ? "" : " data-bloqueado"}>
      <div><p class="pg-situacao">Pedido ${e(curto(item.request_id))} · ${e(item.request_status)}</p><h5>${e(item.offering_title || "Atendimento")}</h5>
      <p class="pg-detalhe">Cliente: ${e(item.client_name || "Cliente autenticado")} · horário: ${e(quando(item.slot_starts_at))}</p></div>
      <p class="pg-detalhe">Autorização: <strong>${e(estado)}</strong>${item.authorization_expires_at ? ` · até ${e(quando(item.authorization_expires_at))}` : ""}${item.payment_status ? ` · pagamento ${e(SITUACOES_DE_PAGAMENTO[item.payment_status] || item.payment_status)}` : ""}</p>
      ${item.ineligible_reason ? `<p class="pg-falha" role="status">${e(item.ineligible_reason)}</p>` : ""}
      ${autorizar ? `<label>Validade da autorização<input data-pg-pilot-expiry type="datetime-local" ${!item.eligible || ocupado ? "disabled" : ""}></label>` : ""}
      <div class="pg-acoes">${autorizar ? `<button type="button" class="op-button" data-pg-pilot-authorize ${!item.eligible || ocupado ? "disabled" : ""}>Autorizar Pix de teste</button>` : ""}
      ${revogar ? `<button type="button" class="op-button" data-pg-pilot-revoke ${ocupado ? "disabled" : ""}>Revogar autorização</button>` : ""}</div>
    </li>`;
  }).join("")}</ul>`;
  return `<section class="pg-config" aria-labelledby="pg-piloto-titulo"><header><h4 id="pg-piloto-titulo">Pagamentos Pix de teste</h4>
    <p class="pg-aviso">Autorizar um pedido não gera cobrança e não substitui a trava financeira geral. Pagamentos permanecem bloqueados.</p></header>${corpo}</section>`;
}

export function renderizarPainel({ carregando = false, erro = "", acaoErro = "", mensagem = "", ocupado = false, visao = null, lista = [], precos = [], candidatos = [], filtro = "", aberto = "", historico = null, historicoErro = "" } = {}) {
  const topo = `<header class="pg-cabecalho"><h3 id="pg-titulo">Pagamentos por Pix</h3>
    <p class="op-muted">Acompanhe pagamentos e prepare preços e autorizações individuais. Nenhuma ação desta tela abre a trava geral ou gera cobrança.</p></header>`;
  if (carregando) return `${topo}<p class="pg-carregando" role="status">Carregando pagamentos…</p>`;
  if (erro) return `${topo}<p class="pg-erro" role="alert">${e(erro)}</p><button type="button" class="op-button" data-pg-recarregar>Tentar de novo</button>`;
  return `${topo}${acaoErro ? `<p class="pg-erro" role="alert">${e(acaoErro)}</p>` : ""}${mensagem ? `<p class="pg-sucesso" role="status">${e(mensagem)}</p>` : ""}
    ${renderizarResumo(visao)}${renderizarPrecos(precos, ocupado)}${renderizarPiloto(candidatos, ocupado)}
    <section class="pg-config" aria-labelledby="pg-historico-titulo"><header><h4 id="pg-historico-titulo">Histórico de pagamentos</h4><p class="op-muted">Somente leitura; o estado financeiro muda apenas pelo servidor.</p></header>
    ${renderizarLista(lista, { filtro, aberto, historico, historicoErro })}</section><button type="button" class="op-button" data-pg-recarregar>Atualizar</button>`;
}

/* Liga o painel a um elemento. So chama RPCs de leitura; recusa montar sem cliente. */
export function createPagamentosPixAdmin({ root, client, confirmar = (texto) => globalThis.confirm?.(texto) === true } = {}) {
  if (!root || !client?.rpc) return null;
  let estado = { carregando: false, ocupado: false, erro: "", acaoErro: "", mensagem: "", visao: null, lista: [], precos: [], candidatos: [], filtro: "", aberto: "", historico: null, historicoErro: "" };
  let geracao = 0;
  let carregou = false;
  const desenhar = () => { root.innerHTML = renderizarPainel(estado); };

  async function carregar() {
    const minha = ++geracao;
    estado = { ...estado, carregando: true, erro: "" }; desenhar();
    try {
      const [v, l, p, c] = await Promise.all([
        client.rpc("admin_pay_overview"),
        client.rpc("admin_list_appointment_payments", { p_status: estado.filtro || null, p_limit: 50 }),
        client.rpc("admin_list_appointment_service_prices"),
        client.rpc("admin_list_pay_pilot_candidates"),
      ]);
      if (v.error) throw v.error;
      if (l.error) throw l.error;
      if (p.error) throw p.error;
      if (c.error) throw c.error;
      if (minha !== geracao) return;
      estado = { ...estado, carregando: false, ocupado: false, visao: v.data, lista: Array.isArray(l.data) ? l.data : [], precos: Array.isArray(p.data) ? p.data : [], candidatos: Array.isArray(c.data) ? c.data : [], aberto: "", historico: null, historicoErro: "" };
    } catch (erro) {
      if (minha !== geracao) return;
      estado = { ...estado, carregando: false, erro: mensagemDeErro(erro) };
    }
    desenhar();
  }

  async function executar(acao, mensagem) {
    estado = { ...estado, ocupado: true, acaoErro: "", mensagem: "" }; desenhar();
    try {
      const { error } = await acao();
      if (error) throw error;
      estado = { ...estado, mensagem };
      await carregar();
    } catch (erro) {
      estado = { ...estado, ocupado: false, acaoErro: mensagemDeErro(erro) }; desenhar();
    }
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
    const salvar = evento.target.closest?.("[data-pg-price-save]");
    if (salvar) {
      const item = salvar.closest("[data-pg-price-item]"); const id = item?.getAttribute("data-pg-price-item");
      const centavos = centavosDoCampo(item?.querySelector("[data-pg-price-value]")?.value);
      if (!centavos) { estado = { ...estado, acaoErro: "Informe um preço válido maior que zero." }; desenhar(); return; }
      if (!confirmar(`Salvar ${reais(centavos)} como preço desta oferta?`)) return;
      void executar(() => client.rpc("admin_set_appointment_service_price", { p_offering_id: id, p_amount_cents: centavos, p_active: true }), "Preço salvo e ativado."); return;
    }
    const alternar = evento.target.closest?.("[data-pg-price-toggle]");
    if (alternar) {
      const item = alternar.closest("[data-pg-price-item]"); const id = item?.getAttribute("data-pg-price-item");
      const centavos = centavosDoCampo(item?.querySelector("[data-pg-price-value]")?.value); const ativo = alternar.dataset.active === "true";
      if (!centavos) { estado = { ...estado, acaoErro: "Informe um preço válido maior que zero." }; desenhar(); return; }
      if (!confirmar(`${ativo ? "Desativar" : "Ativar"} o preço desta oferta?`)) return;
      void executar(() => client.rpc("admin_set_appointment_service_price", { p_offering_id: id, p_amount_cents: centavos, p_active: !ativo }), ativo ? "Preço desativado." : "Preço ativado."); return;
    }
    const autorizar = evento.target.closest?.("[data-pg-pilot-authorize]");
    if (autorizar) {
      const item = autorizar.closest("[data-pg-pilot-item]"); const id = item?.getAttribute("data-pg-pilot-item");
      const valor = item?.querySelector("[data-pg-pilot-expiry]")?.value; const expira = valor ? new Date(valor) : null;
      if (!expira || Number.isNaN(expira.valueOf()) || expira <= new Date()) { estado = { ...estado, acaoErro: "Informe uma validade futura para a autorização." }; desenhar(); return; }
      if (!confirmar("Autorizar somente este pedido para o piloto Pix? Isso não gera cobrança.")) return;
      void executar(() => client.rpc("admin_set_pay_pilot_authorization_for_request", { p_request_id: id, p_expires_at: expira.toISOString(), p_enabled: true }), "Pedido autorizado para o piloto Pix."); return;
    }
    const politica = evento.target.closest?.("[data-pg-offering-payments]");
    if (politica) {
      const item = politica.closest("[data-pg-price-item]"); const id = item?.getAttribute("data-pg-price-item"); const ativa = politica.dataset.enabled === "true";
      if (!confirmar(`${ativa ? "Desativar" : "Habilitar"} pagamentos Pix para novos pedidos desta oferta? A trava global permanece obrigatória.`)) return;
      void executar(() => client.rpc("admin_set_pay_offering_policy", { p_offering_id: id, p_enabled: !ativa, p_require_prepayment: true }), ativa ? "Pix desativado nesta oferta." : "Pix habilitado nesta oferta."); return;
    }
    const revogar = evento.target.closest?.("[data-pg-pilot-revoke]");
    if (revogar) {
      const item = revogar.closest("[data-pg-pilot-item]"); const id = item?.getAttribute("data-pg-pilot-item");
      if (!confirmar("Revogar a autorização deste pedido? Cobranças existentes continuarão sendo acompanhadas.")) return;
      void executar(() => client.rpc("admin_set_pay_pilot_authorization_for_request", { p_request_id: id, p_expires_at: null, p_enabled: false }), "Autorização revogada.");
    }
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
