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
    valor: String(c.price_text || "").trim(),
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
  const contato = elemento(doc, "a", "cp-contato", curso.esgotado ? "Falar com o Instituto sobre a próxima turma" : "Falar com o Instituto para se inscrever");
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

export async function iniciarCatalogoPublico(raiz = globalThis.document?.querySelector("[data-catalogo-publico]")) {
  if (!raiz) return;
  const buscar = async () => {
    const [{ SUPABASE_CONFIG }, { criarRestPublico }] = await Promise.all([
      import("../supabase/config.js"),
      import("../supabase/rest.js"),
    ]);
    return criarRestPublico({ config: SUPABASE_CONFIG }).rpc("list_public_courses", {});
  };
  await renderizarCatalogo(raiz, { buscar });
}

if (typeof document !== "undefined") iniciarCatalogoPublico();
