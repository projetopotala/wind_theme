/*
 * "Serviços de atendimento": o Owner cadastra, edita, ativa e desativa serviços direto na Central, sem SQL.
 *
 * Não cria estrutura paralela. Usa o modelo que o banco já lê:
 *   - activity_definitions (kind "appointment"): nome, descrição e duração padrão (duration_minutes);
 *   - activity_offerings: UMA oferta por modalidade (o cliente vê "Serviço — Online/Presencial"; "ambas" = duas ofertas);
 *     `active` é o que decide se aparece para o cliente (list_appointment_offerings). professional_id só existe
 *     quando o serviço exige um profissional fixo;
 *   - offering_professionals: profissionais habilitados, entre os quais o Owner escolhe ao agendar.
 * Grava com os MESMOS comandos oficiais da operação (definition.save, offering.save, offering_professional.save), pelo
 * mesmo motor do "Novo curso" (simularPlano antes, executarPlano depois). Quem pode gravar é decidido no banco (op_apply:
 * só administração do portal) e cada gravação gera auditoria. Nada é excluído: desativar só oculta, os históricos ficam.
 * Serviço novo nasce INATIVO e só é ativado no último passo, depois do vínculo com profissionais.
 */
import { normalizarNome } from "./cadastro-profissional.js";
import { DURATIONS } from "./atendimentos-view.js";
import { executarPlano, simularPlano } from "./organizar-curso.js";

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const e = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
const MODOS = { online: "Online", presencial: "Presencial" };

export const definicoesDeAtendimento = (s) => (s?.activity_definitions || []).filter((d) => d.kind === "appointment");
export const profissionaisAtivos = (s) => (s?.profiles || []).filter((p) => p.active !== false && Array.isArray(p.roles) && p.roles.includes("professional"));
const ofertasDe = (s, definicaoId) => (s?.activity_offerings || []).filter((o) => o.definition_id === definicaoId);

/* Resumo de cada serviço para a lista. Oferta sem o campo `active` conta como ativa (é assim que o banco lê). */
export function servicosDeAtendimento(s) {
  return definicoesDeAtendimento(s).map((d) => {
    const ofertas = ofertasDe(s, d.id);
    const ativas = ofertas.filter((o) => o.active !== false);
    const ids = new Set(ofertas.map((o) => o.id));
    const vinculos = (s?.offering_professionals || []).filter((l) => ids.has(l.offering_id) && l.active !== false);
    const profissionais = [...new Set([...vinculos.map((l) => l.professional_id), ...ofertas.map((o) => o.professional_id).filter(Boolean)])];
    return {
      id: d.id, nome: d.title || "", descricao: d.summary || "", duracao: Number(d.duration_minutes) || 0,
      ofertas, ativo: ativas.length > 0, modalidades: [...new Set(ativas.map((o) => o.mode || "presencial"))], profissionais,
    };
  });
}

export function novoFormulario() {
  return { servicoId: "", nome: "", nomeOriginal: "", descricao: "", modalidade: "online", duracao: 60, profissionais: [], fixo: false, status: "ativo" };
}

export function dadosDoServico(s, servicoId) {
  const r = servicosDeAtendimento(s).find((x) => x.id === servicoId);
  if (!r) return novoFormulario();
  const base = r.ofertas.filter((o) => o.active !== false);
  const modos = new Set((base.length ? base : r.ofertas).map((o) => o.mode || "presencial"));
  return {
    servicoId: r.id, nome: r.nome, nomeOriginal: r.nome, descricao: r.descricao, duracao: r.duracao || 60,
    modalidade: modos.size > 1 ? "ambas" : (modos.has("online") ? "online" : (modos.has("presencial") ? "presencial" : "online")),
    profissionais: r.profissionais, fixo: r.ofertas.some((o) => Boolean(o.professional_id)), status: r.ativo ? "ativo" : "inativo",
  };
}

export function validarServico(dados, s) {
  const erros = [];
  const nome = String(dados.nome || "").trim();
  if (!nome) erros.push("Informe o nome do serviço.");
  if (nome.length > 100) erros.push("O nome do serviço deve ter até 100 caracteres.");
  const renomeado = !dados.servicoId || normalizarNome(nome) !== normalizarNome(dados.nomeOriginal || "");
  if (nome && renomeado && definicoesDeAtendimento(s).some((d) => d.id !== dados.servicoId && normalizarNome(d.title) === normalizarNome(nome))) {
    erros.push("Já existe um serviço de atendimento com este nome. Edite o existente ou escolha outro nome.");
  }
  if (String(dados.descricao || "").length > 600) erros.push("A descrição deve ter até 600 caracteres.");
  if (!["online", "presencial", "ambas"].includes(dados.modalidade)) erros.push("Escolha a modalidade: online, presencial ou ambas.");
  const duracao = Number(dados.duracao);
  if (!Number.isInteger(duracao) || duracao < 15 || duracao > 480) erros.push("Informe a duração padrão em minutos (de 15 a 480).");
  if (!["ativo", "inativo"].includes(dados.status)) erros.push("Escolha se o serviço fica ativo ou inativo.");
  const habilitados = new Set(profissionaisAtivos(s).map((p) => p.id));
  const escolhidos = [...new Set(dados.profissionais || [])];
  if (escolhidos.some((id) => !habilitados.has(id))) erros.push("Só profissionais ativos podem ser habilitados.");
  if (dados.status === "ativo" && !escolhidos.length) erros.push("Para deixar o serviço ativo, habilite pelo menos um profissional. Sem profissional, o cliente pediria um serviço que ninguém pode atender.");
  if (dados.fixo && escolhidos.length !== 1) erros.push("Serviço com profissional fixo precisa de exatamente um profissional escolhido.");
  return erros;
}

/*
 * Plano de gravação (mesma forma do "Novo curso"): definição, ofertas (inativas), vínculos e, por último, a ativação.
 * Serviço existente mantém ids; modalidade que sai da lista e profissional que sai da lista são DESATIVADOS, nunca apagados.
 */
export function montarPlanoServico(dados, s) {
  const passos = [];
  const existente = definicoesDeAtendimento(s).find((d) => d.id === dados.servicoId) || null;
  const titulo = String(dados.nome).trim();
  const ativar = dados.status === "ativo";
  const modos = dados.modalidade === "ambas" ? ["online", "presencial"] : [dados.modalidade];
  const escolhidos = [...new Set(dados.profissionais || [])];
  const defRef = existente ? existente.id : { ref: "servico" };
  passos.push({
    chave: "servico", tipo: "definition.save", define: "servico",
    payload: { ...(existente ? { id: existente.id } : {}), title: titulo, kind: "appointment", summary: String(dados.descricao || "").trim().slice(0, 600), duration_minutes: Number(dados.duracao) },
    descricao: `${existente ? "Atualizar" : "Cadastrar"} o serviço "${titulo}"`,
  });
  const antigas = existente ? ofertasDe(s, existente.id) : [];
  const ofertaIds = {};
  for (const modo of modos) {
    const ex = antigas.find((o) => (o.mode || "presencial") === modo) || null;
    ofertaIds[modo] = ex ? ex.id : { ref: `oferta:${modo}` };
    passos.push({
      chave: `oferta:${modo}`, tipo: "offering.save", define: `oferta:${modo}`,
      payload: {
        ...(ex ? { id: ex.id } : {}), title: titulo, definition_id: defRef, mode: modo, capacity: ex?.capacity || 1,
        professional_id: dados.fixo ? escolhidos[0] : null,
        /* Nova oferta nasce inativa e só liga no fim; oferta já ativa continua ativa só se o serviço continuar ativo. */
        active: ex ? (ativar && ex.active !== false) : false,
      },
      descricao: `${ex ? "Atualizar" : "Criar"} a oferta ${MODOS[modo].toLowerCase()} de "${titulo}"`,
    });
  }
  for (const ex of antigas) {
    if (modos.includes(ex.mode || "presencial") || ex.active === false) continue;
    passos.push({ chave: `desativar:${ex.id}`, tipo: "offering.save", payload: { id: ex.id, active: false }, descricao: `Retirar a oferta ${MODOS[ex.mode || "presencial"].toLowerCase()} (histórico preservado)` });
  }
  const vinculos = s?.offering_professionals || [];
  for (const modo of modos) {
    const ofertaId = ofertaIds[modo];
    const doBanco = typeof ofertaId === "string" ? vinculos.filter((l) => l.offering_id === ofertaId) : [];
    for (const pid of escolhidos) {
      const l = doBanco.find((x) => x.professional_id === pid);
      if (l && l.active !== false) continue;
      passos.push({ chave: `vinculo:${modo}:${pid}`, tipo: "offering_professional.save", payload: { ...(l ? { id: l.id } : {}), offering_id: ofertaId, professional_id: pid, active: true }, descricao: `Habilitar o profissional na oferta ${MODOS[modo].toLowerCase()}` });
    }
    for (const l of doBanco) {
      if (l.active === false || escolhidos.includes(l.professional_id)) continue;
      passos.push({ chave: `retirar:${l.id}`, tipo: "offering_professional.save", payload: { id: l.id, offering_id: l.offering_id, professional_id: l.professional_id, active: false }, descricao: "Retirar a habilitação de um profissional (histórico preservado)" });
    }
  }
  if (ativar) {
    for (const modo of modos) {
      const ex = antigas.find((o) => (o.mode || "presencial") === modo);
      if (ex && ex.active !== false) continue;
      passos.push({ chave: `ativar:${modo}`, tipo: "offering.save", payload: { id: ofertaIds[modo], active: true }, descricao: `Disponibilizar a oferta ${MODOS[modo].toLowerCase()} para o cliente` });
    }
  }
  return passos;
}

/* Ativar/desativar sem tocar no resto. Ativar exige pelo menos um profissional habilitado. */
export function montarPlanoAlternar(s, servicoId, ativo) {
  const r = servicosDeAtendimento(s).find((x) => x.id === servicoId);
  if (!r) return { erro: "Serviço não encontrado. Recarregue a Central.", passos: [] };
  if (!r.ofertas.length) return { erro: "Este serviço não tem oferta. Edite o serviço e salve para criá-la.", passos: [] };
  if (ativo) {
    const validos = new Set(profissionaisAtivos(s).map((p) => p.id));
    if (!r.profissionais.some((id) => validos.has(id))) return { erro: "Habilite pelo menos um profissional ativo antes de ativar o serviço.", passos: [] };
  }
  const passos = r.ofertas.filter((o) => (o.active !== false) !== ativo)
    .map((o) => ({ chave: `${ativo ? "ativar" : "desativar"}:${o.id}`, tipo: "offering.save", payload: { id: o.id, active: ativo }, descricao: `${ativo ? "Ativar" : "Desativar"} a oferta ${MODOS[o.mode || "presencial"].toLowerCase()}` }));
  return { erro: "", passos };
}

const rotuloModalidades = (r) => (r.modalidades.length ? r.modalidades.map((m) => MODOS[m] || m).join(" e ") : "—");

function renderizarLinha(r, s, ocupado) {
  const nomes = r.profissionais.map((id) => (s?.profiles || []).find((p) => p.id === id)?.display_name).filter(Boolean);
  return `<article class="serv-item" data-serv-id="${e(r.id)}" data-serv-ativo="${r.ativo}">
    <div class="serv-item-topo"><strong>${e(r.nome)}</strong> <span class="op-badge is-${r.ativo ? "available" : "unavailable"}">${r.ativo ? "Ativo" : "Inativo"}</span></div>
    <p class="op-muted">${e(rotuloModalidades(r))}${r.duracao ? ` · ${r.duracao} min` : ""} · ${nomes.length ? `Profissionais: ${e(nomes.join(", "))}` : "Nenhum profissional habilitado"}</p>
    ${r.descricao ? `<p>${e(r.descricao)}</p>` : ""}
    <div class="op-actions">
      <button type="button" class="op-button" data-serv-editar="${e(r.id)}" ${ocupado ? "disabled" : ""}>Editar</button>
      <button type="button" class="op-button" data-serv-alternar="${e(r.id)}" data-ativo="${r.ativo ? "false" : "true"}" ${ocupado ? "disabled" : ""}>${r.ativo ? "Desativar" : "Ativar"}</button>
    </div></article>`;
}

function renderizarFormulario(d, s, erros, ocupado) {
  const pros = profissionaisAtivos(s);
  const duracoes = [...new Set([...DURATIONS, Number(d.duracao)].filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);
  return `<form class="serv-form" data-serv-form novalidate>
    <h3>${d.servicoId ? "Editar serviço" : "Novo serviço"}</h3>
    ${erros.length ? `<ul class="serv-erros" role="alert">${erros.map((x) => `<li>${e(x)}</li>`).join("")}</ul>` : ""}
    <label>Nome do serviço<input name="nome" maxlength="100" value="${e(d.nome)}" required></label>
    <label>Descrição<textarea name="descricao" maxlength="600" rows="3">${e(d.descricao)}</textarea></label>
    <label>Modalidade<select name="modalidade">${[["online", "Online"], ["presencial", "Presencial"], ["ambas", "Online e presencial"]].map(([v, t]) => `<option value="${v}" ${d.modalidade === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
    <label>Duração padrão<select name="duracao">${duracoes.map((n) => `<option value="${n}" ${Number(d.duracao) === n ? "selected" : ""}>${n} minutos</option>`).join("")}</select></label>
    <fieldset><legend>Profissionais habilitados</legend>
      ${pros.length ? pros.map((p) => `<label class="serv-check"><input type="checkbox" name="profissional" value="${e(p.id)}" ${(d.profissionais || []).includes(p.id) ? "checked" : ""}> ${e(p.display_name)}</label>`).join("") : `<p class="op-muted">Nenhum profissional ativo cadastrado. Cadastre em Profissionais antes de ativar o serviço.</p>`}
      <label class="serv-check"><input type="checkbox" name="fixo" ${d.fixo ? "checked" : ""}> Profissional fixo: o pedido já nasce com ele (marque só com um profissional escolhido). Sem isso, o Owner escolhe, entre os habilitados, ao agendar.</label>
    </fieldset>
    <label>Situação<select name="status"><option value="ativo" ${d.status === "ativo" ? "selected" : ""}>Ativo: aparece para o cliente</option><option value="inativo" ${d.status === "inativo" ? "selected" : ""}>Inativo: oculto, histórico preservado</option></select></label>
    <div class="op-actions"><button type="button" class="op-button is-primary" data-serv-salvar ${ocupado ? "disabled" : ""}>${ocupado ? "Salvando…" : "Salvar serviço"}</button><button type="button" class="op-button" data-serv-cancelar ${ocupado ? "disabled" : ""}>Cancelar</button></div>
  </form>`;
}

export function renderizarServicos(s, { aberto = false, formulario = null, erros = [], mensagem = "", ocupado = false } = {}) {
  const lista = servicosDeAtendimento(s);
  return `<details class="atend-secao" id="atend-servicos" data-servicos-secao${aberto || formulario ? " open" : ""}>
    <summary><span class="atend-secao-titulo">Serviços de atendimento</span><span class="atend-secao-conta">${lista.length}</span></summary>
    <div class="serv-corpo">
      <p class="op-muted">Cadastre o que o cliente pode pedir. Só serviços ativos aparecem para o cliente; desativar não apaga consultas nem histórico.</p>
      <div class="op-actions"><button type="button" class="op-button is-primary" data-serv-novo ${ocupado ? "disabled" : ""}>Novo serviço</button></div>
      <p class="serv-mensagem" data-serv-mensagem role="status" aria-live="polite" tabindex="-1">${e(mensagem)}</p>
      ${formulario ? renderizarFormulario(formulario, s, erros, ocupado) : ""}
      <div class="serv-lista">${lista.length ? lista.map((r) => renderizarLinha(r, s, ocupado)).join("") : `<p class="op-muted">Nenhum serviço de atendimento cadastrado ainda.</p>`}</div>
    </div></details>`;
}

export function createServicosAtendimento({ root, operations, onSalvo = () => {} } = {}) {
  if (!root || !operations) return null;
  const estado = { aberto: false, formulario: null, erros: [], mensagem: "", ocupado: false };
  const s = () => operations.snapshot || {};
  const desenhar = () => { root.innerHTML = renderizarServicos(s(), estado); };

  function ler(form) {
    const f = form.elements;
    const v = (n) => (f[n] ? String(f[n].value ?? "") : "");
    return {
      ...(estado.formulario || novoFormulario()), nome: v("nome"), descricao: v("descricao"), modalidade: v("modalidade"), duracao: Number(v("duracao")),
      profissionais: [...form.querySelectorAll("input[name='profissional']:checked")].map((i) => i.value), fixo: Boolean(f.fixo?.checked), status: v("status"),
    };
  }

  async function gravar(passos, sucesso) {
    const sim = simularPlano(s(), passos);
    if (!sim.ok) { estado.erros = [sim.erro]; estado.mensagem = ""; desenhar(); return false; }
    estado.ocupado = true; estado.erros = []; estado.mensagem = "Salvando…"; desenhar();
    let r;
    try { r = await executarPlano({ operations, passos }); } catch (causa) { r = { ok: false, falha: { motivo: String(causa?.message || "falha de conexão") } }; }
    estado.ocupado = false;
    if (!r.ok) {
      estado.erros = [`Não foi possível salvar: ${r.falha?.motivo || "falha de conexão"}. O que já foi gravado fica inativo (não aparece para o cliente); confira a lista e tente de novo.`];
      estado.mensagem = ""; desenhar(); return false;
    }
    try { await operations.refresh?.(); } catch { /* o estado local já reflete os comandos gravados */ }
    estado.formulario = null; estado.erros = []; estado.mensagem = sucesso;
    desenhar(); onSalvo();
    return true;
  }

  async function click(evento) {
    const alvo = (seletor) => evento.target?.closest?.(seletor);
    if (estado.ocupado) return;
    if (alvo("[data-serv-novo]")) { estado.formulario = novoFormulario(); estado.erros = []; estado.mensagem = ""; estado.aberto = true; desenhar(); return; }
    const editar = alvo("[data-serv-editar]");
    if (editar) { estado.formulario = dadosDoServico(s(), editar.dataset.servEditar); estado.erros = []; estado.mensagem = ""; estado.aberto = true; desenhar(); return; }
    if (alvo("[data-serv-cancelar]")) { estado.formulario = null; estado.erros = []; desenhar(); return; }
    const alternar = alvo("[data-serv-alternar]");
    if (alternar) {
      const ativo = alternar.dataset.ativo === "true";
      const plano = montarPlanoAlternar(s(), alternar.dataset.servAlternar, ativo);
      if (plano.erro) { estado.mensagem = plano.erro; desenhar(); return; }
      const nome = servicosDeAtendimento(s()).find((x) => x.id === alternar.dataset.servAlternar)?.nome || "Serviço";
      await gravar(plano.passos, ativo ? `"${nome}" ativado: já aparece para o cliente.` : `"${nome}" desativado: não aparece mais para o cliente. Consultas e histórico foram preservados.`);
      return;
    }
    if (alvo("[data-serv-salvar]")) {
      const form = alvo("[data-serv-form]") || root.querySelector?.("[data-serv-form]");
      if (!form) return;
      const dados = ler(form);
      const erros = validarServico(dados, s());
      estado.formulario = dados;
      if (erros.length) { estado.erros = erros; estado.mensagem = ""; desenhar(); return; }
      const ativo = dados.status === "ativo";
      await gravar(montarPlanoServico(dados, s()), `Serviço "${String(dados.nome).trim()}" salvo${ativo ? ": já aparece para o cliente." : " como inativo: o cliente não o vê."}`);
    }
  }
  const alternarAberto = (evento) => { if (evento.target?.matches?.("[data-servicos-secao]")) estado.aberto = evento.target.open === true; };
  root.addEventListener("click", click);
  root.addEventListener("toggle", alternarAberto, true);
  desenhar();
  return { render: desenhar, abrirNovo() { estado.formulario = novoFormulario(); estado.aberto = true; desenhar(); }, destroy() { root.removeEventListener("click", click); root.removeEventListener("toggle", alternarAberto, true); } };
}
