/*
 * A LÓGICA DA MESA, sem tela.
 *
 * Status, filtros, ordenação, busca, os números da visão geral e as frases
 * que explicam uma publicação. Tudo aqui é função pura: recebe registros (o
 * texto e os dados de publicação que vêm do banco) e devolve dados, para ser
 * testado sem navegador.
 */

import { normalizePost, slugifyBlogTitle } from "../blog/blog-model.js";

export const STATUS = Object.freeze({
  draft: { rotulo: "Rascunho", icone: "pencil" },
  review: { rotulo: "Em revisão", icone: "eye" },
  scheduled: { rotulo: "Agendado", icone: "clock" },
  published: { rotulo: "Publicado", icone: "circle-check" },
  archived: { rotulo: "Arquivado", icone: "archive" },
});

export const ORDEM_DOS_STATUS = Object.freeze(["draft", "review", "scheduled", "published", "archived"]);

export const ORDENACOES = Object.freeze({
  recentes: "Mais recentes",
  antigos: "Mais antigos",
  atualizados: "Atualizados recentemente",
  titulo: "Título",
});

export const PERIODOS = Object.freeze({
  "": "Qualquer data",
  "7": "Últimos 7 dias",
  "30": "Últimos 30 dias",
  "365": "Último ano",
});

const DIA = 86400000;
const normalizar = (texto) => String(texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR");

/* O texto que a mesa mostra e edita: as alterações pendentes, quando houver. */
export const textoAtual = (registro) => registro?.pendente || registro?.post;

/* A data que conta para "publicado em": a do banco, ou a escrita no texto. */
export function dataDePublicacao(registro) {
  if (registro?.publicarEm) return new Date(registro.publicarEm);
  const escrita = registro?.post?.publishedAt;
  return escrita ? new Date(`${escrita}T12:00:00-03:00`) : null;
}

export function contarPorStatus(registros = []) {
  const contagem = { todos: registros.length };
  for (const status of ORDEM_DOS_STATUS) contagem[status] = 0;
  for (const registro of registros) contagem[registro.status] = (contagem[registro.status] || 0) + 1;
  return contagem;
}

export function textoPesquisavel(registro, rotuloDaCategoria = (id) => id) {
  const post = textoAtual(registro) || {};
  const blocos = (post.content || []).flatMap((bloco) => [bloco.text, bloco.caption, bloco.cite, ...(bloco.items || [])]);
  return normalizar([
    post.title, post.subtitle, post.excerpt, post.author, post.category, rotuloDaCategoria(post.category),
    ...(post.tags || []), ...blocos,
  ].filter(Boolean).join(" "));
}

export function filtrarPosts(registros = [], {
  busca = "", status = "todos", categoria = "", autor = "", periodo = "", ordem = "recentes", agora = Date.now(),
  rotuloDaCategoria,
} = {}) {
  const termo = normalizar(busca).trim();
  const limite = periodo ? agora - Number(periodo) * DIA : null;
  const lista = registros.filter((registro) => {
    const post = textoAtual(registro);
    if (status !== "todos" && registro.status !== status) return false;
    if (categoria && post.category !== categoria) return false;
    if (autor && post.author !== autor) return false;
    if (limite) {
      const quando = Date.parse(registro.atualizadoEm) || dataDePublicacao(registro)?.getTime() || 0;
      if (quando < limite) return false;
    }
    return !termo || textoPesquisavel(registro, rotuloDaCategoria).includes(termo);
  });
  const porData = (registro) => dataDePublicacao(registro)?.getTime() || Date.parse(registro.atualizadoEm) || 0;
  const comparar = {
    recentes: (a, b) => porData(b) - porData(a),
    antigos: (a, b) => porData(a) - porData(b),
    atualizados: (a, b) => (Date.parse(b.atualizadoEm) || 0) - (Date.parse(a.atualizadoEm) || 0),
    titulo: (a, b) => textoAtual(a).title.localeCompare(textoAtual(b).title, "pt-BR"),
  }[ordem] || (() => 0);
  return [...lista].sort(comparar);
}

export function autoresDe(registros = []) {
  return [...new Set(registros.map((registro) => textoAtual(registro).author).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function tagsDe(registros = []) {
  return [...new Set(registros.flatMap((registro) => textoAtual(registro).tags || []))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/*
 * O que precisa de atenção: coisas que o leitor veria como defeito (sem capa,
 * categoria que o menu não conhece) e o que está parado esperando alguém.
 */
export function resumoDaMesa(registros = [], { categorias = [], comentarios = [], agora = Date.now() } = {}) {
  const contagem = contarPorStatus(registros);
  const inicioDoMes = new Date(agora);
  inicioDoMes.setDate(1);
  inicioDoMes.setHours(0, 0, 0, 0);
  const idsDeCategoria = new Set(categorias.map(({ id }) => id));
  const naoArquivados = registros.filter((registro) => registro.status !== "archived");
  const porEdicao = (a, b) => (Date.parse(b.atualizadoEm) || 0) - (Date.parse(a.atualizadoEm) || 0);

  return {
    numeros: {
      publicados: contagem.published,
      rascunhos: contagem.draft + contagem.review,
      agendados: contagem.scheduled,
      doMes: registros.filter((registro) => ["published", "scheduled"].includes(registro.status)
        && (dataDePublicacao(registro)?.getTime() || 0) >= inicioDoMes.getTime()).length,
    },
    continuar: registros.filter((registro) => ["draft", "review"].includes(registro.status)).sort(porEdicao).slice(0, 3),
    agendados: registros.filter((registro) => registro.status === "scheduled")
      .sort((a, b) => Date.parse(a.publicarEm) - Date.parse(b.publicarEm)).slice(0, 5),
    editados: [...registros].sort(porEdicao).slice(0, 5),
    atencao: {
      semCapa: naoArquivados.filter((registro) => !textoAtual(registro).cover),
      semCategoria: naoArquivados.filter((registro) => !idsDeCategoria.has(textoAtual(registro).category)),
      pendentes: registros.filter((registro) => registro.pendente),
      comentarios: comentarios.filter((item) => item.status === "pending").length,
    },
  };
}

const DATA_LONGA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });
const HORA = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const DATA_CURTA = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: "America/Sao_Paulo" });

export const dataCurta = (data) => (data ? DATA_CURTA.format(new Date(data)).replace(".", "") : "");
export const horaDe = (data) => (data ? HORA.format(new Date(data)) : "");

const DIA_DO_CALENDARIO = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });

/* "agora há pouco", "há 3 h", "hoje às 08:45", "ontem às 16:40", "há 5 dias", "4 set". */
export function tempoRelativo(data, agora = Date.now()) {
  if (!data) return "";
  const instante = new Date(data);
  if (Number.isNaN(instante.getTime())) return "";
  const diferenca = agora - instante.getTime();
  if (diferenca >= 0 && diferenca < 60000) return "agora há pouco";
  if (diferenca >= 0 && diferenca < 3600000) return `há ${Math.round(diferenca / 60000)} min`;
  const dias = Math.round((Date.parse(DIA_DO_CALENDARIO.format(agora)) - Date.parse(DIA_DO_CALENDARIO.format(instante))) / DIA);
  if (dias === 0) return `hoje às ${HORA.format(instante)}`;
  if (dias === 1) return `ontem às ${HORA.format(instante)}`;
  if (dias === -1) return `amanhã às ${HORA.format(instante)}`;
  if (dias > 1 && dias < 7) return `há ${dias} dias`;
  return dataCurta(instante);
}

/* "Este post será publicado em 22/09/2026 às 10:00." */
export function fraseDoAgendamento(data) {
  if (!data || Number.isNaN(new Date(data).getTime())) return "Escolha a data e o horário da publicação.";
  return `Este post será publicado em ${DATA_LONGA.format(new Date(data))} às ${HORA.format(new Date(data))}.`;
}

/* Uma linha que diz, em português, onde o texto está. */
export function fraseDoStatus(registro, { agora = Date.now() } = {}) {
  if (!registro) return "Texto novo, ainda não salvo.";
  const quando = dataDePublicacao(registro);
  if (registro.status === "published") return quando ? `No ar desde ${DATA_LONGA.format(quando)}.` : "No ar.";
  if (registro.status === "scheduled") {
    return quando && quando.getTime() <= agora ? "A hora agendada chegou: o texto já está no ar." : fraseDoAgendamento(registro.publicarEm);
  }
  if (registro.status === "review") return "Aguardando revisão antes de publicar.";
  if (registro.status === "archived") return "Fora do ar, guardado no arquivo.";
  return "Rascunho: só a equipe vê.";
}

/* A linha de datas de um texto na lista: o que aconteceu por último, em palavras. */
export function linhaDoTempo(registro, agora = Date.now()) {
  const editado = tempoRelativo(registro.atualizadoEm, agora);
  const quando = dataDePublicacao(registro);
  if (registro.status === "published") {
    const publicado = quando ? `publicado em ${dataCurta(quando)}` : "publicado";
    return registro.pendente ? `${publicado} · alterações salvas ${tempoRelativo(registro.pendenteEm || registro.atualizadoEm, agora)}` : publicado;
  }
  if (registro.status === "scheduled") return quando ? `estreia em ${dataCurta(quando)}, ${horaDe(quando)}` : "agendado";
  if (registro.status === "review") return `enviado para revisão ${editado}`;
  if (registro.status === "archived") return `arquivado em ${dataCurta(registro.atualizadoEm)}`;
  return `última edição ${editado}`;
}

/* Data e hora digitadas no fuso do Instituto viram um instante. */
export function instanteDe(dia, hora) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia || "") || !/^\d{2}:\d{2}$/.test(hora || "")) return null;
  const instante = new Date(`${dia}T${hora}:00-03:00`);
  return Number.isNaN(instante.getTime()) ? null : instante;
}

export function partesDoInstante(data) {
  if (!data) return { dia: "", hora: "" };
  const local = new Date(new Date(data).getTime() - 3 * 3600000);
  return { dia: local.toISOString().slice(0, 10), hora: local.toISOString().slice(11, 16) };
}

/* O endereço de um texto não pode repetir o de outro. */
export function enderecoLivre(desejado, registros = [], idProprio = "") {
  const base = slugifyBlogTitle(desejado);
  const usados = new Set(registros.filter((registro) => registro.id !== idProprio).map((registro) => textoAtual(registro).slug));
  if (!usados.has(base)) return base;
  let numero = 2;
  while (usados.has(`${base}-${numero}`)) numero += 1;
  return `${base}-${numero}`;
}

/* O que mudou entre duas versões, em palavras, para o histórico. */
export function resumoDasMudancas(antes, depois) {
  if (!antes) return "Primeira versão";
  const a = normalizePost(antes);
  const b = normalizePost(depois);
  const partes = [];
  if (a.title !== b.title) partes.push("título");
  if (a.subtitle !== b.subtitle || a.excerpt !== b.excerpt) partes.push("resumo");
  if (a.cover !== b.cover || a.coverAlt !== b.coverAlt) partes.push("capa");
  if (a.category !== b.category || a.tags.join() !== b.tags.join()) partes.push("classificação");
  if (JSON.stringify(a.content) !== JSON.stringify(b.content)) {
    const diferenca = b.content.length - a.content.length;
    partes.push(diferenca > 0 ? `conteúdo (+${diferenca} ${diferenca === 1 ? "bloco" : "blocos"})` : diferenca < 0 ? `conteúdo (${diferenca} ${diferenca === -1 ? "bloco" : "blocos"})` : "conteúdo");
  }
  if (a.slug !== b.slug) partes.push("endereço");
  if (JSON.stringify(a.seo) !== JSON.stringify(b.seo)) partes.push("SEO");
  if (a.author !== b.author) partes.push("autor");
  return partes.length ? `Mudou ${partes.join(", ")}` : "Sem mudanças no texto";
}

/* As seções do Portal que um texto pode indicar em "Também no Portal". */
export const SECOES_DO_PORTAL = Object.freeze([
  { titulo: "Atendimentos", href: "atendimentos.html" },
  { titulo: "Saúde Integrativa", href: "saude-integrativa.html" },
  { titulo: "Atividades", href: "atividades.html" },
  { titulo: "Cursos", href: "cursos.html" },
  { titulo: "Workshops", href: "workshops.html" },
  { titulo: "Grupos de estudo", href: "grupos-de-estudo.html" },
  { titulo: "Mentorias", href: "mentorias.html" },
  { titulo: "Eventos futuros", href: "eventos.html" },
  { titulo: "Programação", href: "programacao.html" },
  { titulo: "Arte e Cultura", href: "cultura.html" },
  { titulo: "Cine Potala", href: "experiencias-culturais.html" },
  { titulo: "Especialistas", href: "especialistas.html" },
  { titulo: "Profissionais", href: "profissionais.html" },
  { titulo: "Marketplace", href: "marketplace.html" },
  { titulo: "Inspiração", href: "inspiracao.html" },
  { titulo: "Revista", href: "revista.html" },
  { titulo: "Quem somos", href: "quem-somos.html" },
]);

const COM_TEXTO = new Set(["paragraph", "heading", "quote", "callout"]);

/*
 * O que impede a publicação, na ordem em que o leitor notaria. Cada item diz
 * onde está o problema, para o editor levar a pessoa até o campo.
 */
export function pendenciasParaPublicar(post = {}) {
  const problemas = [];
  const blocos = Array.isArray(post.content) ? post.content : [];
  const titulo = String(post.title ?? "").trim();
  if (!titulo || titulo === "Novo texto") problemas.push({ campo: "title", texto: "Dê um título ao texto antes de publicar." });
  if (!String(post.cover ?? "").trim()) problemas.push({ campo: "cover", texto: "Escolha uma imagem de capa: ela abre o artigo e aparece nos cartões do Blog." });
  if (!String(post.excerpt ?? "").trim()) problemas.push({ campo: "excerpt", aba: "detalhes", texto: "Escreva o resumo que aparece nos cartões do Blog." });
  const temTexto = blocos.some((bloco) => (COM_TEXTO.has(bloco.type) && String(bloco.text ?? "").trim())
    || (bloco.type === "list" && (bloco.items || []).some((item) => String(item).trim())));
  if (!temTexto) problemas.push({ campo: "content", texto: "O texto ainda não tem conteúdo escrito." });
  const semFoto = blocos.find((bloco) => (bloco.type === "image" && !String(bloco.src ?? "").trim()) || (bloco.type === "gallery" && !(bloco.images || []).length));
  if (semFoto) problemas.push({ campo: "content", bloco: semFoto.id, texto: "Há um bloco de imagem sem foto. Escolha a foto ou remova o bloco." });
  return problemas;
}

/* O dia de hoje no fuso do Instituto, como o texto grava ("2026-09-18"). */
export const hojeNoInstituto = (agora = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
