/*
 * Catalogo publico de cursos: mostra as turmas que o Owner marcou para divulgacao.
 *
 * Os dados vem da funcao public.list_public_courses() (somente leitura, sem dados de alunos).
 * Todo texto entra no DOM por textContent; imagem so de caminho relativo em media/.
 * Nao inscreve ninguem: a inscricao continua sendo registrada pelo Instituto.
 */

const TIPOS = Object.freeze({
  course: "Curso",
  workshop: "Oficina",
  lecture: "Palestra",
  event: "Evento",
  cultural: "Atividade cultural",
});

const IMAGEM_VALIDA = /^media\/[a-z0-9][a-z0-9._/-]{0,200}$/i;

export function textoDeData(iso, fuso = "America/Sao_Paulo") {
  const data = new Date(iso);
  if (!iso || Number.isNaN(data.getTime())) return "";
  const dia = new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, weekday: "long", day: "numeric", month: "long" }).format(data);
  const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, hour: "2-digit", minute: "2-digit" }).format(data);
  return `${dia}, às ${hora}`;
}

/* Valor oficial em centavos (inteiro). 0 = gratuito. Sem valor valido: vazio. */
export function precoLegivel(c) {
  const v = c?.price_cents;
  if (!Number.isInteger(v) || v < 0) return "";
  if (v === 0) return "Gratuito";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v / 100);
}

/* Converte a linha do banco no que a tela mostra; nunca confia no formato. */
export function prepararCurso(bruto, fuso) {
  const c = bruto && typeof bruto === "object" ? bruto : {};
  const id = typeof c.id === "string" ? c.id : "";
  const titulo = String(c.title || "").trim();
  if (!id || !titulo) return null;
  const capacidade = Number.isInteger(c.capacity) ? c.capacity : null;
  const restantes = Number.isInteger(c.spots_left) ? c.spots_left : null;
  const esgotado = c.availability === "esgotado";
  let disponibilidade;
  if (esgotado) disponibilidade = "Turma lotada";
  else if (capacidade !== null && restantes !== null) disponibilidade = restantes === 1 ? "1 vaga restante" : `${restantes} vagas restantes`;
  else disponibilidade = "Vagas abertas";
  const proxima = c.next_session && typeof c.next_session === "object" ? c.next_session : null;
  return {
    id,
    titulo,
    tipo: TIPOS[c.kind] || "Curso",
    resumo: String(c.summary || "").trim(),
    modalidade: c.mode === "online" ? "Online" : "Presencial",
    disponibilidade,
    esgotado,
    valor: precoLegivel(c),
    imagem: typeof c.image === "string" && IMAGEM_VALIDA.test(c.image) && !c.image.includes("..") ? c.image : "",
    professor: String(c.teacher_name || "").trim(),
    proxima: proxima ? textoDeData(proxima.starts_at, fuso) : "",
  };
}

function elemento(doc, tag, classe, texto) {
  const el = doc.createElement(tag);
  if (classe) el.className = classe;
  if (texto) el.textContent = texto;
  return el;
}

function linha(doc, rotulo, valor) {
  const p = elemento(doc, "p", "cp-linha");
  p.appendChild(elemento(doc, "strong", "", `${rotulo}: `));
  p.appendChild(doc.createTextNode(valor));
  return p;
}

export function montarCartao(doc, curso, { hrefContato = "recepcao.html" } = {}) {
  const art = elemento(doc, "article", "cp-cartao");
  art.setAttribute("data-curso", curso.id);
  if (curso.imagem) {
    const img = doc.createElement("img");
    img.className = "cp-imagem";
    img.setAttribute("src", curso.imagem);
    img.setAttribute("alt", "");
    img.setAttribute("loading", "lazy");
    art.appendChild(img);
  }
  const corpo = elemento(doc, "div", "cp-corpo");
  corpo.appendChild(elemento(doc, "p", "cp-tipo", `${curso.tipo} · ${curso.modalidade}`));
  corpo.appendChild(elemento(doc, "h3", "cp-titulo", curso.titulo));
  if (curso.resumo) corpo.appendChild(elemento(doc, "p", "cp-resumo", curso.resumo));
  corpo.appendChild(elemento(doc, "p", curso.esgotado ? "cp-vagas cp-vagas--lotada" : "cp-vagas", curso.disponibilidade));

  const detalhes = elemento(doc, "details", "cp-detalhes");
  detalhes.appendChild(elemento(doc, "summary", "cp-detalhes-titulo", "Detalhes"));
  if (curso.professor) detalhes.appendChild(linha(doc, "Conduzido por", curso.professor));
  detalhes.appendChild(linha(doc, "Próximo encontro", curso.proxima || "A combinar com o Instituto"));
  detalhes.appendChild(linha(doc, "Modalidade", curso.modalidade));
  detalhes.appendChild(linha(doc, "Valor", curso.valor || "Consulte o Instituto"));
  if (!curso.esgotado) {
    const inscrever = elemento(doc, "button", "cp-interesse cp-inscrever", "Inscrever-se");
    inscrever.setAttribute("type", "button");
    inscrever.setAttribute("data-inscrever", curso.id);
    detalhes.appendChild(inscrever);
    const st = elemento(doc, "p", "cp-interesse-status");
    st.setAttribute("role", "status");
    st.setAttribute("data-inscrever-status", curso.id);
    detalhes.appendChild(st);
  }
  const contato = elemento(doc, "a", "cp-contato", curso.esgotado ? "Falar com o Instituto sobre a próxima turma" : "Dúvidas? Fale com o Instituto");
  contato.setAttribute("href", hrefContato);
  detalhes.appendChild(contato);
  corpo.appendChild(detalhes);
  art.appendChild(corpo);
  return art;
}

function mensagem(doc, texto, acao) {
  const caixa = elemento(doc, "div", "cp-mensagem");
  caixa.appendChild(elemento(doc, "p", "", texto));
  if (acao) caixa.appendChild(acao);
  return caixa;
}

/* Renderiza no elemento raiz. `buscar` devolve a lista; em falha mostra aviso com nova tentativa. */
export async function renderizarCatalogo(raiz, { buscar, doc = raiz.ownerDocument, fuso } = {}) {
  const lista = raiz.querySelector ? raiz.querySelector("[data-catalogo-lista]") : null;
  const alvo = lista || raiz;
  const limpar = () => { while (alvo.firstChild) alvo.removeChild(alvo.firstChild); };
  limpar();
  alvo.setAttribute("aria-busy", "true");
  alvo.appendChild(mensagem(doc, "Carregando as turmas do Instituto…"));
  try {
    const bruto = await buscar();
    const cursos = (Array.isArray(bruto) ? bruto : []).map((c) => prepararCurso(c, fuso)).filter(Boolean);
    limpar();
    if (cursos.length === 0) {
      alvo.appendChild(mensagem(doc, "No momento não há turmas abertas divulgadas aqui. Novas turmas serão anunciadas em breve; fale com o Instituto para saber das próximas datas."));
    } else {
      cursos.forEach((c) => alvo.appendChild(montarCartao(doc, c)));
    }
    alvo.setAttribute("aria-busy", "false");
    return cursos.length;
  } catch {
    limpar();
    const botao = elemento(doc, "button", "cp-tentar", "Tentar de novo");
    botao.setAttribute("type", "button");
    botao.addEventListener("click", () => { renderizarCatalogo(raiz, { buscar, doc, fuso }); });
    alvo.appendChild(mensagem(doc, "Não foi possível carregar as turmas agora. Tente de novo em instantes.", botao));
    alvo.setAttribute("aria-busy", "false");
    return -1;
  }
}

/* ---- Outros cursos do Instituto: aprovados, sem turma aberta. Sem preco e sem pagamento. ---- */
export function prepararCursoSemTurma(bruto) {
  const c = bruto && typeof bruto === "object" ? bruto : {};
  const id = typeof c.id === "string" ? c.id : "";
  const titulo = String(c.title || "").trim();
  if (!id || !titulo) return null;
  return {
    id, titulo, tipo: TIPOS[c.kind] || "Curso", resumo: String(c.summary || "").trim(),
    imagem: typeof c.image === "string" && IMAGEM_VALIDA.test(c.image) && !c.image.includes("..") ? c.image : "",
  };
}

export function montarCartaoInteresse(doc, curso) {
  const art = elemento(doc, "article", "cp-cartao cp-cartao--interesse");
  art.setAttribute("data-curso-sem-turma", curso.id);
  if (curso.imagem) {
    const img = doc.createElement("img");
    img.className = "cp-imagem"; img.setAttribute("src", curso.imagem); img.setAttribute("alt", ""); img.setAttribute("loading", "lazy");
    art.appendChild(img);
  }
  const corpo = elemento(doc, "div", "cp-corpo");
  corpo.appendChild(elemento(doc, "p", "cp-tipo", `${curso.tipo} · sem turma aberta`));
  corpo.appendChild(elemento(doc, "h3", "cp-titulo", curso.titulo));
  if (curso.resumo) corpo.appendChild(elemento(doc, "p", "cp-resumo", curso.resumo));
  const botao = elemento(doc, "button", "cp-interesse", "Tenho interesse");
  botao.setAttribute("type", "button");
  botao.setAttribute("data-interesse", curso.id);
  corpo.appendChild(botao);
  const aviso = elemento(doc, "p", "cp-interesse-status");
  aviso.setAttribute("role", "status");
  aviso.setAttribute("data-interesse-status", curso.id);
  corpo.appendChild(aviso);
  art.appendChild(corpo);
  return art;
}

export async function renderizarOutros(raiz, { buscar, doc = raiz.ownerDocument } = {}) {
  const alvo = raiz.querySelector ? raiz.querySelector("[data-outros-lista]") || raiz : raiz;
  const limpar = () => { while (alvo.firstChild) alvo.removeChild(alvo.firstChild); };
  try {
    const cursos = ((await buscar()) || []).map(prepararCursoSemTurma).filter(Boolean);
    limpar();
    raiz.hidden = cursos.length === 0;
    cursos.forEach((c) => alvo.appendChild(montarCartaoInteresse(doc, c)));
    return cursos.length;
  } catch {
    limpar();
    raiz.hidden = true;
    return -1;
  }
}

/* Interesse: identidade da sessao do portal (mesmo dominio); a funcao do banco usa auth.uid(). */
async function clienteDoPortal() {
  if (!globalThis.supabase?.createClient) {
    await new Promise((ok, falha) => {
      const s = document.createElement("script");
      s.src = "/vendor/supabase.js"; s.onload = ok; s.onerror = () => falha(new Error("sdk"));
      document.head.appendChild(s);
    });
  }
  const { getSupabaseClient } = await import("../supabase/client.js");
  return getSupabaseClient();
}

export async function registrarInteresse(cursoId, { obterCliente = clienteDoPortal } = {}) {
  const client = await obterCliente();
  const { data: sessao } = await client.auth.getSession();
  if (!sessao?.session) return { estado: "entrar" };
  const { data, error } = await client.rpc("register_course_interest", { p_course_id: cursoId });
  if (error) return { estado: "erro" };
  return { estado: data?.new === false ? "ja-registrado" : "registrado" };
}

export async function pedirInscricao(turmaId, chave, { obterCliente = clienteDoPortal } = {}) {
  const client = await obterCliente();
  const { data: sessao } = await client.auth.getSession();
  if (!sessao?.session) return { estado: "entrar" };
  const { data, error } = await client.rpc("request_course_enrollment", { p_idempotency_key: chave, p_offering_id: turmaId });
  if (error) {
    const porCodigo = { 23514: "lotada", PT409: "ja-inscrito", 22023: "fechada", 42501: "confirmar-email" };
    return { estado: porCodigo[error.code] || "erro" };
  }
  return { estado: data?.status === "solicitada" || data?.replayed ? "solicitada" : "erro" };
}

const MENSAGENS_INSCRICAO = {
  entrar: "Entre na sua conta (Meu Potala) e volte aqui para se inscrever.",
  solicitada: "Inscrição solicitada. Acompanhe em Meu Potala → Cursos. Ela ainda não é uma matrícula confirmada.",
  "ja-inscrito": "Você já tem uma inscrição nesta turma. Veja em Meu Potala → Cursos.",
  lotada: "A turma lotou. Fale com o Instituto sobre a próxima.",
  fechada: "As inscrições desta turma não estão abertas agora.",
  "confirmar-email": "Confirme seu e-mail para se inscrever.",
  erro: "Não foi possível enviar agora. Tente de novo em instantes.",
};

const MENSAGENS_INTERESSE = {
  entrar: "Entre na sua conta (Meu Potala) e volte aqui para registrar o interesse.",
  registrado: "Interesse registrado. O Instituto avisa quando abrir uma turma.",
  "ja-registrado": "Seu interesse já estava registrado.",
  erro: "Não foi possível registrar agora. Tente de novo em instantes.",
};

export async function iniciarCatalogoPublico(raiz = globalThis.document?.querySelector("[data-catalogo-publico]")) {
  if (!raiz) return;
  const rest = async () => {
    const [{ SUPABASE_CONFIG }, { criarRestPublico }] = await Promise.all([import("../supabase/config.js"), import("../supabase/rest.js")]);
    return criarRestPublico({ config: SUPABASE_CONFIG });
  };
  await renderizarCatalogo(raiz, { buscar: async () => (await rest()).rpc("list_public_courses", {}) });
  raiz.addEventListener("click", async (ev) => {
    const botao = ev.target?.closest?.("[data-inscrever]");
    if (!botao) return;
    const id = botao.getAttribute("data-inscrever");
    const status = raiz.querySelector(`[data-inscrever-status="${CSS.escape(id)}"]`);
    botao.dataset.chave ||= globalThis.crypto?.randomUUID?.() || "";
    if (!botao.dataset.chave) { if (status) status.textContent = MENSAGENS_INSCRICAO.erro; return; }
    botao.disabled = true;
    let r;
    try { r = await pedirInscricao(id, botao.dataset.chave); } catch { r = { estado: "erro" }; }
    if (status) {
      status.textContent = MENSAGENS_INSCRICAO[r.estado];
      if (r.estado === "entrar") { const a = document.createElement("a"); a.href = "/meu-potala.html"; a.textContent = " Entrar"; status.appendChild(a); }
      if (r.estado === "solicitada" || r.estado === "ja-inscrito") { const a = document.createElement("a"); a.href = "/meu-potala.html#cursos"; a.textContent = " Ver em Meu Potala"; status.appendChild(a); }
    }
    botao.disabled = ["solicitada", "ja-inscrito", "lotada"].includes(r.estado);
  });
  const outros = globalThis.document?.querySelector("[data-catalogo-outros]");
  if (!outros) return;
  await renderizarOutros(outros, { buscar: async () => (await rest()).rpc("list_public_course_definitions", {}) });
  outros.addEventListener("click", async (ev) => {
    const botao = ev.target?.closest?.("[data-interesse]");
    if (!botao) return;
    const id = botao.getAttribute("data-interesse");
    const status = outros.querySelector(`[data-interesse-status="${CSS.escape(id)}"]`);
    botao.disabled = true;
    let r;
    try { r = await registrarInteresse(id); } catch { r = { estado: "erro" }; }
    if (status) {
      status.textContent = MENSAGENS_INTERESSE[r.estado];
      if (r.estado === "entrar") {
        const link = document.createElement("a");
        link.href = "/meu-potala.html"; link.textContent = " Entrar";
        status.appendChild(link);
      }
    }
    botao.disabled = r.estado === "registrado" || r.estado === "ja-registrado";
  });
}

if (typeof document !== "undefined") iniciarCatalogoPublico();
