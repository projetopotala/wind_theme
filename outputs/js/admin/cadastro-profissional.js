/*
 * CENTRAL OPERACIONAL | CADASTRO GUIADO DE PROFISSIONAL (P1B)
 *
 * Um caminho em etapas por cima do que já existe — sem cadastro paralelo:
 *   - o perfil é gravado pelo mesmo comando de Pessoas ("person.save"), que
 *     só aceita os papéis cliente/aluno/participante/profissional e recusa
 *     e-mail repetido;
 *   - a conta de acesso é procurada em admin_list_accounts e vinculada por
 *     admin_link_professional (as mesmas funções de Usuários e acessos; o banco
 *     confere a permissão e as regras de novo);
 *   - publicação, horários e turmas continuam onde já estão.
 *
 * O que este fluxo NUNCA faz: criar conta de acesso, conceder Owner/Admin/Blog,
 * publicar o perfil sem a escolha explícita, vincular conta por semelhança de
 * nome, ou gravar algo antes da etapa de revisão.
 */

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const e = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

export const PAPEIS_OPERACIONAIS = Object.freeze(["client", "student", "participant", "professional"]);
const ROTULO_PAPEL = Object.freeze({ client: "Cliente", student: "Aluno", participant: "Participante", professional: "Profissional" });

export const ETAPAS = Object.freeze([
  { n: 1, titulo: "Identificação" },
  { n: 2, titulo: "Contato" },
  { n: 3, titulo: "Cadastro existente" },
  { n: 4, titulo: "Conta de acesso" },
  { n: 5, titulo: "Situação" },
  { n: 6, titulo: "Revisão" },
]);

/* ------------------------------------------------------------------ regras puras */

export const normalizarEmail = (v) => String(v || "").trim().toLowerCase();
export const emailValido = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizarEmail(v));

export function normalizarNome(v) {
  return String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/* Nome parecido: igual sem acentos, ou mesmo primeiro e último nome. Só AVISA; nunca decide sozinho. */
export function nomesParecidos(a, b) {
  const x = normalizarNome(a), y = normalizarNome(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const px = x.split(" "), py = y.split(" ");
  return px.length > 1 && py.length > 1 && px[0] === py[0] && px[px.length - 1] === py[py.length - 1];
}

export function verificarDuplicidade(perfis = [], { nome = "", email = "" } = {}) {
  const alvo = normalizarEmail(email);
  const porEmail = alvo ? perfis.find((p) => normalizarEmail(p.email) === alvo) || null : null;
  const porNome = perfis.filter((p) => p !== porEmail && nomesParecidos(p.display_name, nome));
  return { porEmail, porNome };
}

/*
 * Conta de acesso: só por e-mail IDÊNTICO ao do perfil. Nome parecido nunca vincula.
 * situacao: sem-email | erro | nenhuma | livre | ja-vinculada | vinculada-a-outro | perfil-ja-tem-conta
 */
export function analisarConta({ contas = null, perfisProf = null, erro = "" } = {}, { email = "", perfilId = "" } = {}) {
  const alvo = normalizarEmail(email);
  if (!alvo) return { situacao: "sem-email" };
  if (erro || !Array.isArray(contas)) return { situacao: "erro", erro };
  const perfil = perfilId && Array.isArray(perfisProf) ? perfisProf.find((p) => p.profile_id === perfilId) : null;
  const conta = contas.find((c) => normalizarEmail(c.email) === alvo) || null;
  if (perfil?.linked_user_id && (!conta || perfil.linked_user_id !== conta.id)) return { situacao: "perfil-ja-tem-conta", conta };
  if (!conta) return { situacao: "nenhuma" };
  const vinculos = conta.links || [];
  if (vinculos.some((v) => perfilId && v.profile_id === perfilId)) return { situacao: "ja-vinculada", conta };
  if (vinculos.length) return { situacao: "vinculada-a-outro", conta, outro: vinculos[0] };
  return { situacao: "livre", conta };
}

/* O que será gravado. Papéis: só os operacionais; Profissional sempre presente. */
export function montarPlano(estado, existente = null) {
  const rolesBase = existente ? (existente.roles || []) : [];
  const roles = [...new Set([...rolesBase.filter((r) => PAPEIS_OPERACIONAIS.includes(r)), "professional"])];
  const ativo = estado.ativo !== false;
  const publicado = estado.publicar === true;
  let perfil;
  if (existente) {
    perfil = { id: existente.id, roles, active: ativo, published: publicado };
    const tel = String(estado.telefone || "").trim();
    if (tel && !String(existente.phone || "").trim()) perfil.phone = tel;
  } else {
    perfil = { display_name: String(estado.nome || "").trim(), email: normalizarEmail(estado.email), phone: String(estado.telefone || "").trim(), roles, active: ativo, published: publicado };
  }
  return { perfil, vincular: estado.vincular === true && Boolean(estado.contaId), contaId: estado.contaId || "" };
}

export function validarEtapa(etapa, estado) {
  if (etapa === 1 && !String(estado.nome || "").trim()) return "Informe o nome completo do profissional.";
  if (etapa === 2 && estado.email && !emailValido(estado.email)) return "O e-mail parece incompleto. Corrija ou deixe em branco.";
  if (etapa === 3 && estado.duplicidade?.porEmail && !estado.existenteId) return "Já existe um cadastro com este e-mail: use esse cadastro ou volte e corrija o e-mail.";
  if (etapa === 3 && !estado.existenteId && estado.duplicidade?.porNome?.length && !estado.confirmaOutraPessoa) return "Há cadastro com nome parecido. Use um deles ou confirme que é outra pessoa.";
  return "";
}

/* ------------------------------------------------------------------ interface */

const sim = (v) => (v ? "Sim" : "Não");
const papeisTexto = (roles = []) => roles.map((r) => ROTULO_PAPEL[r] || r).join(", ") || "—";

function etapasHtml(atual) {
  return `<ol class="cg-etapas" aria-label="Etapas do cadastro">${ETAPAS.map((s) => `<li${s.n === atual ? ' aria-current="step"' : ""}${s.n < atual ? ' data-feita' : ""}><span>${s.n}</span>${e(s.titulo)}</li>`).join("")}</ol>`;
}

function existenteDe(estado, perfis) {
  return estado.existenteId ? perfis.find((p) => p.id === estado.existenteId) || null : null;
}

function corpo(estado, perfis) {
  const existente = existenteDe(estado, perfis);
  switch (estado.etapa) {
    case 1: return `<p class="cg-explica op-span">Aqui você cadastra (ou completa) o <strong>perfil operacional</strong> de um profissional. Isso <strong>não cria conta de acesso</strong> e <strong>não dá acesso administrativo</strong>. Nada é gravado até a revisão final.</p>
      <label class="op-span">Nome completo<input name="nome" type="text" autocomplete="off" value="${e(estado.nome)}" required></label>`;
    case 2: return `<p class="cg-explica op-span">O e-mail evita cadastro repetido e permite encontrar a conta de acesso da pessoa, se ela já tiver uma no site. É opcional, mas recomendado.</p>
      <label>E-mail<input name="email" type="email" autocomplete="off" value="${e(estado.email)}"></label>
      <label>Telefone<input name="telefone" type="tel" autocomplete="off" value="${e(estado.telefone)}"></label>
      <p class="cg-nota op-span">Especialidades e biografia ainda não têm campo próprio no cadastro operacional; por isso não são pedidas aqui.</p>`;
    case 3: {
      const { porEmail, porNome } = estado.duplicidade || { porEmail: null, porNome: [] };
      const cartao = (p, acao) => `<li class="cg-candidato"><strong>${e(p.display_name)}</strong><small>${e(p.email || "sem e-mail")} · ${e(papeisTexto(p.roles))} · ${p.active === false ? "inativo" : "ativo"}${p.published ? " · publicado" : ""}</small>${acao}</li>`;
      const usar = (p) => estado.existenteId === p.id
        ? `<span class="op-badge" data-cg-usando>Usando este cadastro</span>`
        : `<button type="button" class="op-button" data-cg-usar="${e(p.id)}">Usar este cadastro</button>`;
      if (porEmail) {
        return `<p class="cg-explica op-span" role="status">Já existe um cadastro com o e-mail <strong>${e(normalizarEmail(estado.email))}</strong>. Para não duplicar a pessoa, este fluxo completa o cadastro existente (acrescenta o papel Profissional, se faltar).</p>
          <ul class="cg-lista op-span">${cartao(porEmail, usar(porEmail))}</ul>`;
      }
      if (porNome.length) {
        return `<p class="cg-explica op-span" role="status">Encontramos ${porNome.length === 1 ? "um cadastro" : `${porNome.length} cadastros`} com nome parecido. Se for a mesma pessoa, use o cadastro existente; se não, confirme que é outra pessoa.</p>
          <ul class="cg-lista op-span">${porNome.map((p) => cartao(p, usar(p))).join("")}</ul>
          ${estado.existenteId ? `<button type="button" class="op-button op-span" data-cg-novo>Não é esta pessoa: criar cadastro novo</button>` : `<label class="op-check op-span"><input type="checkbox" name="confirmaOutraPessoa" ${estado.confirmaOutraPessoa ? "checked" : ""}> Confirmo que é outra pessoa e quero criar um cadastro novo</label>`}`;
      }
      return `<p class="cg-explica op-span" role="status">Nenhum cadastro com este e-mail ou nome parecido. Será criado um cadastro novo.</p>`;
    }
    case 4: {
      const a = analisarConta(estado.contasCarregadas || {}, { email: existente?.email || estado.email, perfilId: existente?.id || "" });
      const intro = `<p class="cg-explica op-span">A conta de acesso é diferente do perfil: é o login que a pessoa cria no site. O vínculo permite que ela atenda pelo Meu Potala. Etapa opcional; procura só a conta com o mesmo e-mail, nunca por nome.</p>`;
      if (estado.contasCarregando) return intro + `<p class="op-muted op-span" role="status">Procurando a conta…</p>`;
      const textos = {
        "sem-email": "Sem e-mail no cadastro, não há como encontrar a conta. Você pode vincular depois em Usuários e acessos.",
        erro: `Não foi possível consultar as contas agora (${e(a.erro || "tente de novo")}). Você pode continuar; o vínculo pode ser feito depois em Usuários e acessos.`,
        nenhuma: "Nenhuma conta com este e-mail. Quando a pessoa criar a conta no site, vincule em Usuários e acessos.",
        "ja-vinculada": "A conta com este e-mail já está vinculada a este perfil. Nada a fazer.",
        "vinculada-a-outro": `A conta com este e-mail já está vinculada a outro perfil (${e(a.outro?.display_name || "outro cadastro")}). Cada conta tem um único perfil; nada será vinculado. Resolva em Usuários e acessos.`,
        "perfil-ja-tem-conta": "Este perfil já está vinculado a outra conta de acesso. Nada será vinculado aqui; confira em Usuários e acessos.",
      };
      if (a.situacao === "livre") {
        const pendente = a.conta.status && a.conta.status !== "ativa" ? ` <small>(${e(a.conta.status === "pendente_confirmacao" ? "aguardando confirmação do e-mail" : a.conta.status === "bloqueada" ? "bloqueada" : "confirmada, nunca entrou")})</small>` : "";
        return intro + `<p class="op-span" role="status">Conta encontrada: <strong>${e(a.conta.email)}</strong>${pendente}. Ela ainda não tem perfil vinculado.</p>
          <label class="op-check op-span"><input type="checkbox" name="vincular" ${estado.vincular ? "checked" : ""}> Vincular esta conta ao perfil ao salvar (só o vínculo profissional; nenhum acesso administrativo)</label>`;
      }
      return intro + `<p class="op-span" role="status" data-cg-conta="${e(a.situacao)}">${textos[a.situacao]}</p>`;
    }
    case 5: return `<p class="cg-explica op-span">Estados diferentes, decididos separadamente. Publicar o perfil é uma escolha explícita: ele só aparece para agendamentos públicos se você marcar.</p>
      <fieldset class="op-span"><legend>Situação do cadastro</legend>
        <label class="op-check"><input type="checkbox" name="ativo" ${estado.ativo !== false ? "checked" : ""}> Cadastro ativo</label>
        <label class="op-check"><input type="checkbox" name="publicar" ${estado.publicar ? "checked" : ""}> Disponível para agendamentos públicos</label>
      </fieldset>
      <ul class="cg-nota op-span"><li><strong>Atendimentos:</strong> depois de salvar, ofereça horários em Atendimentos → Disponibilizar horário (o perfil precisa estar publicado).</li>
        <li><strong>Cursos:</strong> o profissional vira professor ao ser escolhido no campo Professor de uma turma (Criar turma).</li></ul>`;
    case 6: {
      const plano = montarPlano(estado, existente);
      const p = plano.perfil;
      const linhas = existente
        ? [["Cadastro", `Existente: ${existente.display_name} (${existente.email || "sem e-mail"})`], ["Papéis", `${papeisTexto(existente.roles)} → ${papeisTexto(p.roles)}`], ["Cadastro ativo", `${sim(existente.active !== false)} → ${sim(p.active)}`], ["Disponível publicamente", `${sim(existente.published)} → ${sim(p.published)}`], ...(p.phone ? [["Telefone", `(vazio) → ${p.phone}`]] : [])]
        : [["Cadastro", "Novo"], ["Nome", p.display_name], ["E-mail", p.email || "—"], ["Telefone", p.phone || "—"], ["Papéis", papeisTexto(p.roles)], ["Cadastro ativo", sim(p.active)], ["Disponível publicamente", sim(p.published)]];
      const conta = plano.vincular ? "Será vinculada ao perfil (somente vínculo profissional)." : "Nenhum vínculo será feito agora.";
      return `<p class="cg-explica op-span">Confira. Ao salvar, só isto é gravado:</p>
        <dl class="cg-resumo op-span">${linhas.map(([k, v]) => `<div><dt>${e(k)}</dt><dd>${e(v)}</dd></div>`).join("")}<div><dt>Conta de acesso</dt><dd>${e(conta)}</dd></div></dl>
        <p class="cg-nota op-span">Não muda: acessos administrativos, Blog, horários, turmas e inscrições.</p>`;
    }
    case 7: {
      const r = estado.resultado || {};
      const item = (ok, texto, pendencia) => `<li data-ok="${ok ? "sim" : "nao"}"><span aria-hidden="true">${ok ? "✓" : "•"}</span> ${e(texto)}${!ok && pendencia ? ` <small>${e(pendencia)}</small>` : ""}</li>`;
      return `<p class="cg-explica op-span" role="status">${e(r.mensagem || "Cadastro salvo.")}</p>
        <ul class="cg-situacao op-span">
          ${item(true, `Perfil profissional: ${r.nome || ""}`)}
          ${item(r.ativo, "Cadastro ativo", "inativo: não aparece nas escolhas da operação")}
          ${item(r.publicado, "Disponível publicamente", "não publicado (pode publicar depois em Pessoas)")}
          ${item(r.vinculado, "Conta de acesso vinculada", r.erroVinculo || "sem vínculo (faça em Usuários e acessos quando houver conta)")}
          ${item(false, "Horários de atendimento", "a configurar em Atendimentos")}
          ${item(false, "Turma ou curso", "a configurar em Criar turma")}
        </ul>
        <div class="cg-proximos op-span">
          <button type="button" class="op-button" data-cg-ir="atendimentos">Disponibilizar horário</button>
          <button type="button" class="op-button" data-cg-ir="ofertas">Criar turma</button>
          <button type="button" class="op-button" data-cg-ir="acessos">Usuários e acessos</button>
          <button type="button" class="op-button" data-cg-ir="pessoas">Ver em Pessoas</button>
        </div>`;
    }
    default: return "";
  }
}

export function renderizarCadastro(estado, perfis = []) {
  const etapa = estado.etapa;
  const concluido = etapa === 7;
  const titulo = concluido ? "Cadastro concluído" : ETAPAS[etapa - 1].titulo;
  const voltar = etapa > 1 && !concluido ? `<button type="button" data-cg-voltar>Voltar</button>` : "";
  const avancar = concluido
    ? `<button type="button" class="op-primary" data-cg-fechar>Fechar</button>`
    : etapa === 6
      ? `<button type="submit" class="op-primary" ${estado.salvando ? "disabled" : ""}>${estado.salvando ? "Salvando…" : "Salvar cadastro"}</button>`
      : `<button type="submit" class="op-primary" ${estado.contasCarregando ? "disabled" : ""}>Continuar</button>`;
  return `<header><div><p class="op-eyebrow">Cadastro guiado de profissional${concluido ? "" : ` · etapa ${etapa} de ${ETAPAS.length}`}</p><h2 id="cg-titulo" tabindex="-1">${e(titulo)}</h2></div><button type="button" class="op-close" data-cg-fechar aria-label="Fechar cadastro guiado">×</button></header>
    ${concluido ? "" : etapasHtml(etapa)}
    ${estado.rascunho && !concluido ? `<p class="cg-rascunho" role="status">Cadastro em andamento (ainda não salvo). <button type="button" class="cg-link" data-cg-recomecar>Começar de novo</button></p>` : ""}
    <div class="op-form-body" data-cg-corpo>${corpo(estado, perfis)}</div>
    <p class="op-form-error" role="alert" data-cg-erro tabindex="-1">${e(estado.erro || "")}</p>
    <footer>${concluido ? "" : `<button type="button" data-cg-fechar>Cancelar</button>`}${voltar}${avancar}</footer>`;
}

const ESTADO_INICIAL = () => ({ etapa: 1, nome: "", email: "", telefone: "", ativo: true, publicar: false, existenteId: "", confirmaOutraPessoa: false, vincular: false, contaId: "", duplicidade: null, contasCarregadas: null, contasCarregando: false, erro: "", salvando: false, resultado: null, rascunho: false });

/* ------------------------------------------------------------------ controlador */

export function createCadastroGuiado({ root, operations, client, onSalvo = () => {}, onNavegar = () => {}, documento = root?.ownerDocument || globalThis.document } = {}) {
  if (!root || !operations || !client) return null;
  const dialog = documento.createElement("dialog");
  dialog.className = "op-dialog cg-dialog";
  dialog.setAttribute("aria-labelledby", "cg-titulo");
  dialog.setAttribute("data-cg-dialog", "");
  const form = documento.createElement("form");
  form.setAttribute("data-cg-form", "");
  form.noValidate = true;
  dialog.appendChild(form);
  root.appendChild(dialog);

  let estado = ESTADO_INICIAL();
  const perfis = () => operations.snapshot?.profiles || [];

  function desenhar({ focar = true } = {}) {
    form.innerHTML = renderizarCadastro(estado, perfis());
    if (!focar) return;
    const campo = form.querySelector("[data-cg-corpo] input:not([type=hidden]), [data-cg-corpo] button");
    (campo || form.querySelector("#cg-titulo"))?.focus?.();
  }

  function lerCampos() {
    const dados = new FormData(form);
    for (const nome of ["nome", "email", "telefone"]) if (form.elements[nome]) estado[nome] = String(dados.get(nome) || "");
    for (const nome of ["ativo", "publicar", "vincular", "confirmaOutraPessoa"]) if (form.elements[nome]) estado[nome] = form.elements[nome].checked;
  }

  async function carregarContas() {
    estado.contasCarregando = true; desenhar({ focar: false });
    try {
      const [contas, profs] = await Promise.all([client.rpc("admin_list_accounts"), client.rpc("admin_list_professional_profiles")]);
      if (contas.error) estado.contasCarregadas = { erro: contas.error.code === "42501" ? "seu acesso não permite consultar contas" : "falha de conexão ou do banco" };
      else estado.contasCarregadas = { contas: Array.isArray(contas.data) ? contas.data : [], perfisProf: !profs.error && Array.isArray(profs.data) ? profs.data : [] };
    } catch {
      estado.contasCarregadas = { erro: "falha de conexão" };
    }
    estado.contasCarregando = false;
    const existente = existenteDe(estado, perfis());
    const a = analisarConta(estado.contasCarregadas, { email: existente?.email || estado.email, perfilId: existente?.id || "" });
    estado.contaId = a.situacao === "livre" ? a.conta.id : "";
    if (a.situacao !== "livre") estado.vincular = false;
    desenhar();
  }

  function irPara(etapa) {
    estado.etapa = etapa; estado.erro = "";
    if (etapa === 3) estado.duplicidade = verificarDuplicidade(perfis(), { nome: estado.nome, email: estado.email });
    if (etapa === 3 && estado.duplicidade.porEmail) estado.existenteId = estado.duplicidade.porEmail.id;
    if (etapa === 5) {
      const existente = existenteDe(estado, perfis());
      if (existente && !estado.situacaoAjustada) { estado.ativo = existente.active !== false; estado.publicar = existente.published === true; estado.situacaoAjustada = true; }
    }
    desenhar();
    if (etapa === 4 && !estado.contasCarregadas) void carregarContas();
  }

  async function salvar() {
    const existente = existenteDe(estado, perfis());
    const plano = montarPlano(estado, existente);
    estado.salvando = true; estado.erro = ""; desenhar({ focar: false });
    let perfilSalvo;
    try {
      perfilSalvo = await operations.command("person.save", plano.perfil);
    } catch (causa) {
      estado.salvando = false;
      estado.erro = `Nada foi gravado. ${causa?.message || "Falha de conexão."}`;
      desenhar({ focar: false });
      form.querySelector("[data-cg-erro]")?.focus?.();
      return;
    }
    const id = perfilSalvo?.id || existente?.id || (perfis().find((p) => normalizarEmail(p.email) && normalizarEmail(p.email) === plano.perfil.email)?.id) || "";
    const resultado = { nome: perfilSalvo?.display_name || existente?.display_name || plano.perfil.display_name, ativo: plano.perfil.active, publicado: plano.perfil.published, vinculado: false, erroVinculo: "" };
    const jaVinculada = analisarConta(estado.contasCarregadas || {}, { email: existente?.email || estado.email, perfilId: existente?.id || "" }).situacao === "ja-vinculada";
    resultado.vinculado = jaVinculada;
    if (plano.vincular && id) {
      try {
        const { error } = await client.rpc("admin_link_professional", { p_user_id: plano.contaId, p_profile_id: id });
        if (error) resultado.erroVinculo = `vínculo não feito: ${error.code === "42501" ? "seu acesso não permite vincular contas" : error.message || "erro do banco"}`;
        else resultado.vinculado = true;
      } catch { resultado.erroVinculo = "vínculo não feito: falha de conexão"; }
    }
    resultado.mensagem = existente ? "Cadastro existente atualizado." : "Cadastro criado.";
    if (resultado.erroVinculo) resultado.mensagem += " O perfil foi salvo, mas a conta não foi vinculada.";
    estado = { ...ESTADO_INICIAL(), etapa: 7, resultado, perfilId: id };
    onSalvo({ id, resultado });
    desenhar();
  }

  function abrir() {
    if (estado.etapa === 7) estado = ESTADO_INICIAL();
    estado.rascunho = Boolean(estado.nome || estado.email || estado.telefone) && estado.etapa > 1;
    desenhar({ focar: false });
    if (!dialog.open) dialog.showModal?.();
    desenhar();
  }
  const fechar = () => { if (dialog.open) dialog.close(); };

  form.addEventListener("submit", (evento) => {
    evento.preventDefault();
    lerCampos();
    const erro = validarEtapa(estado.etapa, estado);
    if (erro) { estado.erro = erro; desenhar({ focar: false }); form.querySelector("[data-cg-erro]")?.focus?.(); return; }
    if (estado.etapa === 6) { void salvar(); return; }
    if (estado.etapa === 1 && normalizarNome(estado.nome) !== estado.nomeVerificado) {
      estado.existenteId = ""; estado.confirmaOutraPessoa = false; estado.contasCarregadas = null; estado.vincular = false; estado.situacaoAjustada = false;
      estado.nomeVerificado = normalizarNome(estado.nome);
    }
    if (estado.etapa === 2 && normalizarEmail(estado.email) !== estado.emailVerificado) {
      estado.existenteId = ""; estado.confirmaOutraPessoa = false; estado.contasCarregadas = null; estado.vincular = false; estado.situacaoAjustada = false;
      estado.emailVerificado = normalizarEmail(estado.email);
    }
    irPara(estado.etapa + 1);
  });
  form.addEventListener("click", (evento) => {
    const alvo = evento.target?.closest?.("button");
    if (!alvo) return;
    if (alvo.hasAttribute("data-cg-fechar")) { lerCampos(); fechar(); return; }
    if (alvo.hasAttribute("data-cg-voltar")) { lerCampos(); irPara(estado.etapa - 1); return; }
    if (alvo.hasAttribute("data-cg-recomecar")) { estado = ESTADO_INICIAL(); desenhar(); return; }
    if (alvo.dataset.cgUsar) { estado.existenteId = alvo.dataset.cgUsar; estado.confirmaOutraPessoa = false; estado.contasCarregadas = null; estado.situacaoAjustada = false; desenhar(); return; }
    if (alvo.hasAttribute("data-cg-novo")) { estado.existenteId = ""; estado.contasCarregadas = null; estado.situacaoAjustada = false; desenhar(); return; }
    if (alvo.dataset.cgIr) { const destino = alvo.dataset.cgIr; fechar(); onNavegar(destino); }
  });
  dialog.addEventListener("cancel", (evento) => { evento.preventDefault(); lerCampos(); fechar(); });
  dialog.addEventListener("close", () => { estado.rascunho = false; });

  /* O botão "Cadastro guiado" de Pessoas (e o atalho da Visão geral) abrem o fluxo. */
  const onRootClick = (evento) => {
    if (evento.target?.closest?.("[data-cadastro-guiado]")) { evento.preventDefault?.(); abrir(); }
  };
  root.addEventListener("click", onRootClick);

  return { abrir, fechar, get estado() { return estado; }, destroy() { root.removeEventListener("click", onRootClick); dialog.remove(); } };
}
