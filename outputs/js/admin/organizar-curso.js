/*
 * CENTRAL OPERACIONAL | ORGANIZAR UM CURSO (P1C)
 *
 * Um caminho em etapas por cima do que já existe, sem cadastro paralelo:
 *   - curso = "definition.save" (tipo Curso), turma = "offering.save",
 *     aula = "schedule.save" (a mesma Agenda), inscrição = "enrollment.save";
 *   - cada item é gravado por um comando próprio, pelo mesmo cliente da
 *     operação (op_apply): o banco confere permissão, revisão e repetição;
 *   - antes de gravar, o plano inteiro é conferido localmente com o MESMO
 *     motor de regras (capacidade, inscrição repetida, conflito de sala e de
 *     professor, sala indisponível), sobre o estado recém-lido do banco.
 *
 * Não é uma transação única: são operações independentes, gravadas em ordem.
 * Se uma falhar no meio, o que já foi gravado permanece, aparece como gravado
 * e a continuação parte dali, sem repetir. Não há desfazer automático.
 *
 * O que este fluxo NUNCA faz: criar pessoa, conta ou acesso; mudar papéis;
 * inscrever alguém por semelhança de nome (a escolha é sempre por cadastro,
 * com e-mail à vista); gerar link de reunião; gravar ao avançar de etapa.
 */
import { aplicarComando } from "./operations/motor.js";
import { HANDLERS } from "./operations/client.js";
import { nomesParecidos, normalizarNome } from "./cadastro-profissional.js";

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const e = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

export const ETAPAS = Object.freeze([
  { n: 1, titulo: "Curso" },
  { n: 2, titulo: "Turma" },
  { n: 3, titulo: "Professor" },
  { n: 4, titulo: "Aulas" },
  { n: 5, titulo: "Inscrições" },
  { n: 6, titulo: "Revisão" },
]);

const TIPOS = Object.freeze({ course: "Curso", activity: "Atividade", workshop: "Workshop", lecture: "Palestra", event: "Evento", group: "Grupo", cultural: "Atividade cultural", appointment: "Atendimento", rental: "Locação" });
const SITUACAO = Object.freeze({ active: "Ativa", waitlist: "Lista de espera", completed: "Concluída", cancelled: "Cancelada" });
const OCUPA = ["active", "completed"];

/* ------------------------------------------------------------------ regras puras */

const PALAVRAS_VAZIAS = new Set(["de", "da", "do", "das", "dos", "e", "em", "para", "a", "o", "as", "os", "com", "curso", "turma"]);
const palavras = (t) => normalizarNome(t).split(" ").filter((p) => p.length > 1 && !PALAVRAS_VAZIAS.has(p));

/* Mesmo nome sem acentos/maiúsculas = repetido. Palavras em comum = parecido: só AVISA. */
export function semelhancaDeCurso(definicoes = [], titulo = "") {
  const alvo = normalizarNome(titulo);
  if (!alvo) return { iguais: [], parecidos: [] };
  const iguais = definicoes.filter((d) => normalizarNome(d.title) === alvo);
  const a = new Set(palavras(titulo));
  const parecidos = definicoes.filter((d) => {
    if (iguais.includes(d)) return false;
    const n = normalizarNome(d.title);
    if (n && (n.includes(alvo) || alvo.includes(n))) return true;
    const b = new Set(palavras(d.title));
    if (!a.size || !b.size) return false;
    const comum = [...a].filter((p) => b.has(p)).length;
    return comum / new Set([...a, ...b]).size >= 0.5;
  });
  return { iguais, parecidos };
}

export const cursosDisponiveis = (s) => (s?.activity_definitions || []).filter((d) => d.kind === "course");
export const turmasDoCurso = (s, cursoId) => (s?.activity_offerings || []).filter((o) => cursoId && o.definition_id === cursoId);
/* Professor: cadastro com papel Profissional e ativo. Ninguém é promovido aqui. */
export const professoresAdequados = (s) => (s?.profiles || []).filter((p) => (p.roles || []).includes("professional") && p.active !== false);

export function inteiroOuNulo(v) {
  const t = String(v ?? "").trim();
  if (!t) return null;
  return /^\d+$/.test(t) && Number(t) >= 1 ? Number(t) : NaN;
}

export const ocupadas = (s, turmaId) => (s?.enrollments || []).filter((x) => x.offering_id === turmaId && OCUPA.includes(x.status)).length;
export const inscricaoDe = (s, turmaId, perfilId) => (s?.enrollments || []).find((x) => x.offering_id === turmaId && x.profile_id === perfilId) || null;

export const aulasDaTurma = (s, turmaId, agora = Date.now()) => (s?.schedule_items || [])
  .filter((i) => i.offering_id === turmaId && i.status === "booked" && Date.parse(i.ends_at) > agora)
  .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

/* Quem pode ser inscrito: busca por nome OU e-mail; cada resultado é um cadastro, com o e-mail à vista. */
export function buscarPessoas(s, termo, { turmaId = "", limite = 20 } = {}) {
  const t = normalizarNome(termo);
  const tEmail = String(termo || "").trim().toLowerCase();
  if (t.length < 2 && tEmail.length < 2) return [];
  return (s?.profiles || [])
    .filter((p) => normalizarNome(p.display_name).includes(t) || (tEmail.length >= 2 && String(p.email || "").toLowerCase().includes(tEmail)))
    .slice(0, limite)
    .map((p) => ({ perfil: p, inativo: p.active === false, inscricao: turmaId ? inscricaoDe(s, turmaId, p.id) : null }));
}

/* Há nomes parecidos entre os resultados? Então a escolha precisa ser conferida pelo e-mail. */
export function haHomonimos(resultados = []) {
  for (let i = 0; i < resultados.length; i++) for (let j = i + 1; j < resultados.length; j++) {
    if (nomesParecidos(resultados[i].perfil.display_name, resultados[j].perfil.display_name)) return true;
  }
  return false;
}

const isoLocal = (data, hora) => `${data}T${hora}`;
const instante = (data, hora) => Date.parse(`${data}T${hora}:00-03:00`);

export function validarAula(aula = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(aula.data || "")) return "Informe a data da aula.";
  if (!/^\d{2}:\d{2}$/.test(aula.inicio || "") || !/^\d{2}:\d{2}$/.test(aula.fim || "")) return "Informe o horário de início e de término.";
  if (!(instante(aula.data, aula.fim) > instante(aula.data, aula.inicio))) return "O término deve ser depois do início.";
  if (aula.modo !== "online" && !aula.salaId) return "Aula presencial precisa de uma sala.";
  if (aula.link && !/^https?:\/\//i.test(aula.link.trim())) return "O link online deve começar com https://.";
  if (aula.repetirAte && !/^\d{4}-\d{2}-\d{2}$/.test(aula.repetirAte)) return "Data final da repetição inválida.";
  if (aula.repetirAte && aula.repetirAte < aula.data) return "A repetição deve terminar depois da primeira aula.";
  return "";
}

export function pendenciasDaAula(aula = {}) {
  if (aula.modo !== "online") return [];
  const link = String(aula.link || "").trim();
  if (!link) return ["online sem link: os alunos não terão o botão de entrar até o link ser cadastrado na Agenda"];
  if (!/^https:\/\//i.test(link)) return ["o link precisa começar com https:// para aparecer ao aluno no Meu Potala"];
  return [];
}

/* Participantes previstos da aula: a capacidade da turma, limitada pela sala. O motor recusa acima de qualquer uma. */
export function participantesDaAula(s, { capacidade = null, salaId = "", modo = "presencial", previstos = 0 } = {}) {
  const base = capacidade ?? Math.max(1, previstos);
  const sala = modo !== "online" ? (s?.rooms || []).find((r) => r.id === salaId) : null;
  return Math.max(1, sala?.capacity ? Math.min(base, sala.capacity) : base);
}

/* Os dados da turma que valem para o plano: a existente (lida do banco) ou a nova (do formulário). */
export function turmaEfetiva(estado, s) {
  if (estado.turma.modo === "existente") {
    const t = (s?.activity_offerings || []).find((o) => o.id === estado.turma.id);
    return t ? { id: t.id, titulo: t.title, modalidade: t.mode || "presencial", capacidade: t.capacity ?? null, professorAtual: t.professional_id || "", existente: t } : null;
  }
  return { id: "", titulo: String(estado.turma.titulo || "").trim(), modalidade: estado.turma.modalidade || "presencial", capacidade: inteiroOuNulo(estado.turma.capacidade), professorAtual: "", existente: null };
}

/*
 * O plano: a lista ordenada do que será gravado, um comando por item.
 * { ref: "curso" | "turma" } é preenchido com o id gravado (ou o existente) na hora.
 */
export function montarPlanoCurso(estado, s) {
  const passos = [];
  const curso = estado.curso.modo === "existente" ? (s?.activity_definitions || []).find((d) => d.id === estado.curso.id) : null;
  if (estado.curso.modo === "novo") {
    passos.push({ chave: "curso", tipo: "definition.save", define: "curso", payload: { title: String(estado.curso.titulo || "").trim(), kind: "course" }, descricao: `Cadastrar o curso “${String(estado.curso.titulo || "").trim()}”` });
  }
  const turma = turmaEfetiva(estado, s);
  const professor = professorEfetivo(estado, turma);
  if (turma && estado.turma.modo === "nova") {
    passos.push({ chave: "turma", tipo: "offering.save", define: "turma", payload: { title: turma.titulo, definition_id: curso ? curso.id : { ref: "curso" }, professional_id: professor, mode: turma.modalidade, capacity: turma.capacidade }, descricao: `Criar a turma “${turma.titulo}”` });
  } else if (turma?.existente && professor !== (turma.professorAtual || null)) {
    const t = turma.existente;
    passos.push({ chave: "turma", tipo: "offering.save", payload: { id: t.id, title: t.title, definition_id: t.definition_id, professional_id: professor, mode: t.mode || "presencial", capacity: t.capacity ?? null }, descricao: `Definir ${nomeDe(s, professor) || "o professor"} como professor da turma “${t.title}”` });
  }
  const turmaRef = turma?.existente ? turma.existente.id : { ref: "turma" };
  const previstos = (turma?.existente ? ocupadas(s, turma.existente.id) : 0) + estado.inscricoes.filter((i) => OCUPA.includes(i.status)).length;
  for (const a of estado.aulas) {
    const payload = {
      title: `Aula · ${turma?.titulo || "Turma"}`, kind: "course", offering_id: turmaRef, mode: a.modo,
      room_id: a.modo === "online" ? null : a.salaId, professional_id: professor, client_id: null,
      starts_at: isoLocal(a.data, a.inicio), ends_at: isoLocal(a.data, a.fim),
      participants: participantesDaAula(s, { capacidade: turma?.capacidade ?? null, salaId: a.salaId, modo: a.modo, previstos }),
      online_url: a.modo === "online" ? String(a.link || "").trim() : "", price_cents: null, setup_minutes: 0, teardown_minutes: 0, requirements: [], extras: [],
    };
    if (a.repetirAte) payload.recurrence = { frequency: "weekly", interval: 1, until: a.repetirAte };
    passos.push({ chave: `aula:${a.chave}`, tipo: "schedule.save", aula: a.chave, payload, descricao: `Agendar ${a.repetirAte ? "aulas semanais a partir de" : "a aula de"} ${dataCurta(a.data)}, ${a.inicio}–${a.fim}${a.repetirAte ? ` até ${dataCurta(a.repetirAte)}` : ""} (${a.modo === "online" ? "online" : "presencial"})` });
  }
  for (const i of estado.inscricoes) {
    const p = (s?.profiles || []).find((x) => x.id === i.perfilId);
    passos.push({ chave: `insc:${i.perfilId}`, tipo: "enrollment.save", inscricao: i.perfilId, payload: { profile_id: i.perfilId, offering_id: turmaRef, status: i.status }, descricao: `Inscrever ${p?.display_name || "pessoa"}${p?.email ? ` (${p.email})` : ""}${i.status === "waitlist" ? " na lista de espera" : ""}` });
  }
  return passos;
}

/* "Definir depois" nunca retira o professor que a turma já tem: só vale para turma sem professor. */
export function professorEfetivo(estado, turma) {
  if (estado.professor.semProfessor || !estado.professor.id) return turma?.professorAtual || null;
  return estado.professor.id;
}

export function resolverPayload(passo, refs = {}) {
  const r = structuredClone(passo.payload);
  for (const [k, v] of Object.entries(r)) {
    if (v && typeof v === "object" && !Array.isArray(v) && "ref" in v) {
      if (!refs[v.ref]) throw new Error(v.ref === "curso" ? "O curso ainda não foi gravado." : "A turma ainda não foi gravada.");
      r[k] = refs[v.ref];
    }
  }
  return r;
}

export function aplicarMudancas(estado, changes = []) {
  const novo = structuredClone(estado);
  for (const { table, id, after } of changes) {
    const linhas = (novo[table] ||= []);
    const i = linhas.findIndex((l) => l.id === id);
    if (after == null) { if (i >= 0) linhas.splice(i, 1); } else if (i >= 0) linhas[i] = after; else linhas.push(after);
  }
  return novo;
}

/* Confere o plano inteiro com as regras reais do motor, numa cópia: nada é gravado aqui. */
export function simularPlano(s, passos, refsIniciais = {}) {
  let atual = structuredClone(s || {});
  const refs = { ...refsIniciais };
  let n = 0;
  const id = () => `simulado-${++n}`;
  const agora = new Date().toISOString();
  for (const passo of passos) {
    try {
      const payload = resolverPayload(passo, refs);
      const { result, changes } = aplicarComando(atual, { type: passo.tipo, payload }, { handlers: HANDLERS, id, agora });
      atual = aplicarMudancas(atual, changes);
      if (passo.define) refs[passo.define] = result?.id;
    } catch (causa) {
      return { ok: false, chave: passo.chave, passo, erro: String(causa?.message || causa) };
    }
  }
  return { ok: true, estado: atual, refs };
}

/*
 * Depois de uma falha, só se afirma o que for CONFERIDO no estado relido do banco.
 * idsAntes: ids por coleção lidos antes da primeira tentativa.
 */
export function confirmarPasso(passo, s, { idsAntes = {}, refs = {} } = {}) {
  let p;
  try { p = resolverPayload(passo, refs); } catch { return null; }
  const novo = (col) => (s?.[col] || []).filter((x) => !(idsAntes[col] || new Set()).has(x.id));
  if (passo.tipo === "definition.save") return novo("activity_definitions").find((d) => normalizarNome(d.title) === normalizarNome(p.title) && d.kind === p.kind) || null;
  if (passo.tipo === "offering.save") {
    if (p.id) { const t = (s?.activity_offerings || []).find((o) => o.id === p.id); return t && (t.professional_id || null) === (p.professional_id || null) ? t : null; }
    return novo("activity_offerings").find((o) => o.definition_id === p.definition_id && normalizarNome(o.title) === normalizarNome(p.title)) || null;
  }
  if (passo.tipo === "schedule.save") {
    const inicio = Date.parse(`${p.starts_at}:00-03:00`);
    return novo("schedule_items").find((i) => i.offering_id === p.offering_id && i.status === "booked" && Date.parse(i.starts_at) === inicio) || null;
  }
  if (passo.tipo === "enrollment.save") return (s?.enrollments || []).find((x) => x.profile_id === p.profile_id && x.offering_id === p.offering_id) || null;
  return null;
}

/*
 * Grava o plano item a item pelo cliente da operação. Depois de qualquer falha, relê o banco e
 * só considera gravado o que for conferido. PT409 (outra janela gravou): uma nova tentativa,
 * sobre o estado relido, com as regras conferidas de novo pelo motor. Para no primeiro item
 * que não pôde ser gravado; o que veio antes fica gravado (não há desfazer automático).
 */
export async function executarPlano({ operations, passos, refs = {}, idsAntes = {}, aoGravar = () => {} }) {
  const r = { ...refs };
  for (const passo of passos) {
    let resultado = null;
    for (let tentativa = 0; tentativa < 2 && !resultado; tentativa++) {
      try {
        /* Mesmo comando com os mesmos dados reaproveita o identificador da operação: o banco não grava duas vezes. */
        resultado = await operations.command(passo.tipo, resolverPayload(passo, r));
      } catch (causa) {
        const motivo = String(causa?.message || "falha de conexão").replace(/[.\s]+$/, "");
        let registro = null;
        let conferido = true;
        try { await operations.refresh?.(); registro = confirmarPasso(passo, operations.snapshot, { idsAntes, refs: r }); } catch { conferido = false; }
        if (registro) { resultado = registro; break; }
        if (conferido && causa?.code === "PT409" && tentativa === 0) continue;
        return { ok: false, refs: r, falha: { passo, refs: { ...r }, motivo, conferido } };
      }
    }
    const id = resultado?.id || "";
    if (passo.define) r[passo.define] = id;
    aoGravar(passo, id);
  }
  return { ok: true, refs: r };
}

export function idsPorColecao(s) {
  return Object.fromEntries(["activity_definitions", "activity_offerings", "schedule_items", "enrollments"].map((c) => [c, new Set((s?.[c] || []).map((x) => x.id))]));
}

/* Cadastro novo cujo nome apareceu no banco depois da etapa (outra janela): não cria repetido. */
export function repetidoNoBanco(estado, s) {
  if (estado.curso.modo === "novo" && semelhancaDeCurso(s?.activity_definitions, estado.curso.titulo).iguais.length) return "Outro cadastro com o mesmo nome de curso apareceu no banco. Volte à etapa Curso e escolha o existente.";
  if (estado.turma.modo === "nova" && estado.curso.modo === "existente" && turmasDoCurso(s, estado.curso.id).some((t) => normalizarNome(t.title) === normalizarNome(estado.turma.titulo))) return "Já existe uma turma com este nome neste curso. Volte à etapa Turma e escolha a existente.";
  return "";
}

export function validarEtapa(etapa, estado, s) {
  if (etapa === 1) {
    if (estado.curso.modo === "existente") return estado.curso.id && (s?.activity_definitions || []).some((d) => d.id === estado.curso.id) ? "" : "Escolha um curso da lista ou cadastre um novo.";
    if (!String(estado.curso.titulo || "").trim()) return "Informe o nome do curso.";
    const { iguais, parecidos } = semelhancaDeCurso(s?.activity_definitions, estado.curso.titulo);
    if (iguais.length) return `Já existe “${iguais[0].title}” (${TIPOS[iguais[0].kind] || iguais[0].kind}). Use o cadastro existente em vez de criar outro.`;
    if (parecidos.length && !estado.curso.confirmaSemelhante) return "Há cadastro com nome parecido. Use um deles ou confirme que é outro curso.";
    return "";
  }
  if (etapa === 2) {
    if (estado.turma.modo === "existente") return estado.turma.id && turmasDoCurso(s, estado.curso.id).some((t) => t.id === estado.turma.id) ? "" : "Escolha uma turma da lista ou crie uma nova.";
    if (!String(estado.turma.titulo || "").trim()) return "Informe o nome da turma.";
    if (!["presencial", "online"].includes(estado.turma.modalidade)) return "Escolha a modalidade.";
    if (Number.isNaN(inteiroOuNulo(estado.turma.capacidade))) return "A capacidade deve ser um número inteiro a partir de 1, ou vazia para sem limite.";
    if (estado.curso.modo === "existente" && turmasDoCurso(s, estado.curso.id).some((t) => normalizarNome(t.title) === normalizarNome(estado.turma.titulo))) return "Este curso já tem uma turma com este nome. Escolha a existente ou dê outro nome.";
    return "";
  }
  if (etapa === 3) {
    if (estado.professor.semProfessor) return "";
    if (!estado.professor.id) return turmaEfetiva(estado, s)?.professorAtual ? "Escolha o professor desta turma." : "Escolha o professor ou marque “Definir o professor depois”.";
    return professoresAdequados(s).some((p) => p.id === estado.professor.id) ? "" : "Este cadastro não está ativo como profissional. Escolha outro professor.";
  }
  if (etapa === 4 && estado.aulaNova.data) return "Há uma aula preenchida que ainda não foi adicionada: clique em “Adicionar aula” ou apague a data.";
  return "";
}

export function pendencias(estado, s) {
  const lista = [];
  const turma = turmaEfetiva(estado, s);
  if (!professorEfetivo(estado, turma)) lista.push("Turma sem professor: defina depois em Cursos e atividades (Editar turma).");
  const existentes = turma?.existente ? aulasDaTurma(s, turma.existente.id).length : 0;
  if (!estado.aulas.length && !existentes) lista.push("Nenhuma aula agendada: os alunos ainda não verão a próxima aula no Meu Potala.");
  for (const a of estado.aulas) for (const p of pendenciasDaAula(a)) lista.push(`Aula de ${dataCurta(a.data)}: ${p}.`);
  const inscritos = (turma?.existente ? ocupadas(s, turma.existente.id) : 0) + estado.inscricoes.length;
  if (!inscritos) lista.push("Nenhum aluno inscrito ainda.");
  return lista;
}

/* ------------------------------------------------------------------ interface */

function dataCurta(data) { const [a, m, d] = String(data || "").split("-"); return d ? `${d}/${m}/${a}` : ""; }
const dataHora = (iso) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const nomeDe = (s, id) => (s?.profiles || []).find((p) => p.id === id)?.display_name || "";
const salasDisponiveis = (s) => (s?.rooms || []).filter((r) => r.status === "available" && r.capacity);

function etapasHtml(atual) {
  return `<ol class="cg-etapas" aria-label="Etapas para organizar o curso">${ETAPAS.map((x) => `<li${x.n === atual ? ' aria-current="step"' : ""}${x.n < atual ? " data-feita" : ""}><span>${x.n}</span>${e(x.titulo)}</li>`).join("")}</ol>`;
}

const radio = (nome, valor, atual, texto, extra = "") => `<label class="op-check"><input type="radio" name="${nome}" value="${e(valor)}" ${valor === atual ? "checked" : ""} ${extra}> ${texto}</label>`;

function etapaCurso(estado, s) {
  const cursos = cursosDisponiveis(s);
  const intro = `<p class="cg-explica op-span"><strong>Curso</strong> é o que se ensina (por exemplo, “Meditação para iniciantes”). <strong>Turma</strong> é cada edição dele, com professor, datas e alunos. Um curso pode ter várias turmas. Nada é gravado até a revisão final.</p>`;
  const aviso = estado.intencao === "turma" ? `<p class="cg-nota op-span" role="status">Para criar uma turma, escolha primeiro o curso dela.</p>` : estado.intencao === "inscrever" ? `<p class="cg-nota op-span" role="status">Para inscrever alunos, escolha o curso e a turma; depois você pode ir direto às inscrições.</p>` : "";
  const escolha = `<fieldset class="op-span"><legend>Este curso</legend>${radio("cursoModo", "existente", estado.curso.modo, "Já está cadastrado", cursos.length ? "" : "disabled")}${radio("cursoModo", "novo", estado.curso.modo, "É um curso novo")}</fieldset>`;
  if (estado.curso.modo === "existente") {
    if (!cursos.length) return intro + aviso + escolha + `<p class="op-span op-muted" role="status">Ainda não há cursos cadastrados. Marque “É um curso novo”.</p>`;
    return intro + aviso + escolha + `<ul class="cg-lista op-span" aria-label="Cursos cadastrados">${cursos.map((c) => {
      const n = turmasDoCurso(s, c.id).length;
      const usando = estado.curso.id === c.id;
      return `<li class="cg-candidato"><strong>${e(c.title)}</strong><small>${n === 1 ? "1 turma" : `${n} turmas`}</small>${usando ? `<span class="op-badge" data-oc-usando>Escolhido</span>` : `<button type="button" class="op-button" data-oc-curso="${e(c.id)}">Escolher</button>`}</li>`;
    }).join("")}</ul>`;
  }
  const { iguais, parecidos } = semelhancaDeCurso(s?.activity_definitions, estado.curso.titulo);
  const cartao = (d) => `<li class="cg-candidato"><strong>${e(d.title)}</strong><small>${e(TIPOS[d.kind] || d.kind)}</small>${d.kind === "course" ? `<button type="button" class="op-button" data-oc-curso="${e(d.id)}">Usar este curso</button>` : `<span class="op-badge">Outro tipo</span>`}</li>`;
  let semelhantes = "";
  if (String(estado.curso.titulo || "").trim() && (iguais.length || parecidos.length)) {
    semelhantes = `<div class="op-span" role="status" data-oc-semelhantes><p class="cg-explica">${iguais.length ? "Já existe um cadastro com este nome:" : "Há cadastros com nome parecido. Se for o mesmo curso, use o existente:"}</p><ul class="cg-lista">${[...iguais, ...parecidos].map(cartao).join("")}</ul>${!iguais.length ? `<label class="op-check"><input type="checkbox" name="confirmaSemelhante" ${estado.curso.confirmaSemelhante ? "checked" : ""}> Confirmo que é outro curso e quero cadastrá-lo</label>` : ""}</div>`;
  }
  return intro + aviso + escolha + `<label class="op-span">Nome do curso<input name="cursoTitulo" type="text" autocomplete="off" value="${e(estado.curso.titulo)}" required data-oc-verificar></label>
    <p class="cg-nota op-span">Será cadastrado como tipo Curso. Descrição, preço e página pública ainda não fazem parte deste cadastro.</p>${semelhantes}`;
}

function etapaTurma(estado, s) {
  const turmas = estado.curso.modo === "existente" ? turmasDoCurso(s, estado.curso.id) : [];
  const nomeCurso = estado.curso.modo === "existente" ? (s?.activity_definitions || []).find((d) => d.id === estado.curso.id)?.title : estado.curso.titulo;
  const escolha = `<fieldset class="op-span"><legend>Turma de “${e(nomeCurso)}”</legend>${radio("turmaModo", "existente", estado.turma.modo, "Usar uma turma que já existe", turmas.length ? "" : "disabled")}${radio("turmaModo", "nova", estado.turma.modo, "Criar uma turma nova")}</fieldset>`;
  if (estado.turma.modo === "existente") {
    if (!turmas.length) return escolha + `<p class="op-span op-muted" role="status">Este curso ainda não tem turmas. Marque “Criar uma turma nova”.</p>`;
    return escolha + `<ul class="cg-lista op-span" aria-label="Turmas deste curso">${turmas.map((t) => {
      const ocup = ocupadas(s, t.id);
      const usando = estado.turma.id === t.id;
      const resumo = [t.mode === "online" ? "Online" : "Presencial", t.capacity ? `${ocup} de ${t.capacity} vagas ocupadas` : `${ocup} inscritos · sem limite`, nomeDe(s, t.professional_id) ? `Professor: ${nomeDe(s, t.professional_id)}` : "sem professor", `${aulasDaTurma(s, t.id).length} aulas futuras`].join(" · ");
      return `<li class="cg-candidato"><strong>${e(t.title)}</strong><small>${e(resumo)}</small>${usando ? `<span class="op-badge" data-oc-usando>Escolhida</span>` : `<button type="button" class="op-button" data-oc-turma="${e(t.id)}">Escolher</button>`}</li>`;
    }).join("")}</ul>
    <p class="cg-nota op-span">Nome, modalidade e capacidade de uma turma existente mudam em Cursos e atividades (Editar).</p>
    ${estado.turma.id ? `<button type="button" class="op-button op-span" data-oc-pular-inscricoes>Ir direto às inscrições</button>` : ""}`;
  }
  return escolha + `<label class="op-span">Nome da turma<input name="turmaTitulo" type="text" autocomplete="off" value="${e(estado.turma.titulo)}" placeholder="Ex.: Turma de março · noite" required></label>
    <fieldset><legend>Modalidade</legend>${radio("turmaModalidade", "presencial", estado.turma.modalidade, "Presencial")}${radio("turmaModalidade", "online", estado.turma.modalidade, "Online")}</fieldset>
    <label>Capacidade (vagas)<input name="turmaCapacidade" type="number" min="1" step="1" inputmode="numeric" value="${e(estado.turma.capacidade)}" placeholder="Sem limite"></label>
    <p class="cg-nota op-span">As aulas (datas e horários) entram na etapa Aulas. Matrícula pública e pagamento não fazem parte deste fluxo.</p>`;
}

function etapaProfessor(estado, s) {
  const lista = professoresAdequados(s);
  const turma = turmaEfetiva(estado, s);
  const atual = turma?.professorAtual ? `<p class="op-span" role="status">Professor atual da turma: <strong>${e(nomeDe(s, turma.professorAtual) || "cadastro não encontrado")}</strong>.</p>` : "";
  const intro = `<p class="cg-explica op-span">O professor é um cadastro já existente com o papel Profissional. Este fluxo não cria contas, não dá acesso administrativo e não publica perfis.</p>`;
  const depois = turma?.professorAtual ? "" : `<label class="op-check op-span"><input type="checkbox" name="semProfessor" ${estado.professor.semProfessor ? "checked" : ""}> Definir o professor depois</label>`;
  const cadastrar = `<button type="button" class="op-button op-span" data-oc-cadastrar-professor>Cadastrar profissional (cadastro guiado)</button><p class="cg-nota op-span">O curso em andamento fica guardado; ao terminar o cadastro, você volta para esta etapa.</p>`;
  if (!lista.length) return intro + atual + `<p class="op-span" role="status" data-oc-sem-professor>Não há profissionais ativos cadastrados.</p>` + cadastrar + depois;
  const mudanca = turma?.existente && estado.professor.id && estado.professor.id !== turma.professorAtual && !estado.professor.semProfessor
    ? `<p class="cg-nota op-span" role="status">Aulas já agendadas desta turma continuam com o professor que tinham; altere-as na Agenda, se for o caso.</p>` : "";
  return intro + atual + `<label class="op-span">Professor<select name="professorId" data-oc-professor><option value="">Selecione</option>${lista.map((p) => `<option value="${e(p.id)}" ${p.id === estado.professor.id ? "selected" : ""}>${e(p.display_name)}${p.email ? ` · ${e(p.email)}` : ""}</option>`).join("")}</select></label>${mudanca}${depois}${cadastrar}`;
}

function etapaAulas(estado, s) {
  const turma = turmaEfetiva(estado, s);
  const salas = salasDisponiveis(s);
  const existentes = turma?.existente ? aulasDaTurma(s, turma.existente.id) : [];
  const nova = estado.aulaNova;
  const modo = nova.modo || turma?.modalidade || "presencial";
  const listaExistentes = existentes.length ? `<div class="op-span"><p class="cg-explica">Já agendadas para esta turma:</p><ul class="oc-aulas">${existentes.slice(0, 8).map((i) => `<li>${e(dataHora(i.starts_at))} · ${i.mode === "online" ? "online" : e((s.rooms || []).find((r) => r.id === i.room_id)?.name || "sala")}${i.mode === "online" && !i.online_url ? " · <strong>sem link</strong>" : ""}</li>`).join("")}${existentes.length > 8 ? `<li>e mais ${existentes.length - 8}</li>` : ""}</ul></div>` : "";
  const planejadas = estado.aulas.length ? `<div class="op-span"><p class="cg-explica">A agendar ao gravar:</p><ul class="oc-aulas" data-oc-planejadas>${estado.aulas.map((a) => `<li><span>${e(dataCurta(a.data))} · ${e(a.inicio)}–${e(a.fim)} · ${a.modo === "online" ? "online" : e((s.rooms || []).find((r) => r.id === a.salaId)?.name || "sala")}${a.repetirAte ? ` · toda semana até ${e(dataCurta(a.repetirAte))}` : ""}${pendenciasDaAula(a).length ? ` <small>${e(pendenciasDaAula(a)[0])}</small>` : ""}</span><button type="button" class="cg-link" data-oc-remover-aula="${e(a.chave)}">Remover</button></li>`).join("")}</ul></div>` : "";
  const capSala = modo !== "online" && turma?.capacidade && salas.find((r) => r.id === nova.salaId)?.capacity < turma.capacidade
    ? `<p class="cg-nota op-span" role="status">A sala escolhida comporta ${salas.find((r) => r.id === nova.salaId).capacity}; a turma aceita ${turma.capacidade}.</p>` : "";
  return `<p class="cg-explica op-span">As aulas entram na Agenda do Instituto, com a turma e o professor. Etapa opcional: você pode agendar depois. Conflitos de sala e de professor são conferidos ao adicionar e de novo ao gravar.</p>${listaExistentes}${planejadas}
    <fieldset class="op-span oc-aula-nova" data-oc-aula-nova><legend>Adicionar aula</legend>
      <label>Data<input name="aulaData" type="date" value="${e(nova.data)}"></label>
      <label>Início<input name="aulaInicio" type="time" value="${e(nova.inicio)}"></label>
      <label>Término<input name="aulaFim" type="time" value="${e(nova.fim)}"></label>
      <label>Modalidade<select name="aulaModo" data-oc-aula-modo><option value="presencial" ${modo !== "online" ? "selected" : ""}>Presencial</option><option value="online" ${modo === "online" ? "selected" : ""}>Online</option></select></label>
      ${modo === "online"
        ? `<label class="op-span">Link da reunião (opcional agora)<input name="aulaLink" type="url" inputmode="url" autocomplete="off" placeholder="https://" value="${e(nova.link)}"></label><p class="cg-nota op-span">Cole o link criado na ferramenta de reunião do Instituto. Este fluxo não gera links.</p>`
        : salas.length ? `<label class="op-span">Sala<select name="aulaSala" data-oc-aula-sala><option value="">Selecione</option>${salas.map((r) => `<option value="${e(r.id)}" ${r.id === nova.salaId ? "selected" : ""}>${e(r.name)} · ${e(r.capacity)} lugares</option>`).join("")}</select></label>${capSala}`
          : `<p class="op-span" role="status">Não há sala disponível com cadastro confirmado. Confirme as salas em Salas, ou agende esta aula como online.</p>`}
      <label class="op-span">Repetir toda semana até (opcional)<input name="aulaRepetirAte" type="date" value="${e(nova.repetirAte)}"></label>
      <button type="button" class="op-button" data-oc-adicionar-aula>Adicionar aula</button>
      <p class="op-form-error op-span" role="alert" data-oc-erro-aula>${e(estado.erroAula || "")}</p>
    </fieldset>`;
}

function etapaInscricoes(estado, s) {
  const turma = turmaEfetiva(estado, s);
  const cap = turma?.capacidade ?? null;
  const ocup = (turma?.existente ? ocupadas(s, turma.existente.id) : 0) + estado.inscricoes.filter((i) => i.status === "active").length;
  const vagas = cap == null ? "Turma sem limite de vagas." : ocup >= cap ? `Turma cheia (${ocup} de ${cap}). Novas escolhas entram na lista de espera.` : `${cap - ocup} ${cap - ocup === 1 ? "vaga livre" : "vagas livres"} de ${cap}.`;
  const escolhidas = estado.inscricoes.length ? `<div class="op-span"><p class="cg-explica">A inscrever ao gravar:</p><ul class="cg-lista" data-oc-escolhidas>${estado.inscricoes.map((i) => {
    const p = (s.profiles || []).find((x) => x.id === i.perfilId) || {};
    return `<li class="cg-candidato"><strong>${e(p.display_name || "Cadastro removido")}</strong><small>${e(p.email || "sem e-mail")} · ${e(SITUACAO[i.status])}${!p.email ? " · só verá o curso no Meu Potala se tiver conta vinculada" : ""}</small><button type="button" class="cg-link" data-oc-remover-inscricao="${e(i.perfilId)}">Remover</button></li>`;
  }).join("")}</ul></div>` : "";
  return `<p class="cg-explica op-span">Procure pessoas que já estão em Pessoas, pelo nome ou pelo e-mail, e escolha uma a uma. Ninguém é inscrito sem a sua confirmação na revisão. Quem ainda não tem cadastro deve ser cadastrado em Pessoas primeiro.</p>
    <p class="op-span" role="status" data-oc-vagas>${e(vagas)}</p>${escolhidas}
    <label class="op-span">Procurar pessoa<input name="busca" type="search" autocomplete="off" value="${e(estado.busca)}" placeholder="Nome ou e-mail (2 letras ou mais)" data-oc-busca></label>
    <div class="op-span" data-oc-resultados aria-live="polite">${resultadosHtml(estado, s)}</div>`;
}

export function resultadosHtml(estado, s) {
  const turma = turmaEfetiva(estado, s);
  const lista = buscarPessoas(s, estado.busca, { turmaId: turma?.existente?.id || "" });
  if (String(estado.busca || "").trim().length < 2) return "";
  if (!lista.length) return `<p class="op-muted">Ninguém encontrado. Confira a grafia ou cadastre a pessoa em Pessoas.</p>`;
  const aviso = haHomonimos(lista) ? `<p class="cg-nota" role="status" data-oc-homonimos>Há pessoas com nomes parecidos: confira o e-mail antes de escolher.</p>` : "";
  return aviso + `<ul class="cg-lista">${lista.map(({ perfil: p, inativo, inscricao }) => {
    const escolhida = estado.inscricoes.some((i) => i.perfilId === p.id);
    const acao = inscricao ? `<span class="op-badge">Já tem inscrição (${e(SITUACAO[inscricao.status] || inscricao.status)})</span>`
      : inativo ? `<span class="op-badge">Cadastro inativo</span>`
        : escolhida ? `<span class="op-badge">Escolhida</span>`
          : `<button type="button" class="op-button" data-oc-escolher="${e(p.id)}" aria-label="Escolher ${e(p.display_name)}${p.email ? `, ${e(p.email)}` : ""}">Escolher</button>`;
    return `<li class="cg-candidato"><strong>${e(p.display_name)}</strong><small>${e(p.email || "sem e-mail")}</small>${acao}</li>`;
  }).join("")}</ul>`;
}

function etapaRevisao(estado, s) {
  const turma = turmaEfetiva(estado, s);
  const curso = estado.curso.modo === "existente" ? (s.activity_definitions || []).find((d) => d.id === estado.curso.id) : null;
  const passos = montarPlanoCurso(estado, s);
  const sim = estado.simulacao;
  const efetivo = professorEfetivo(estado, turma);
  const prof = !efetivo ? "A definir depois" : efetivo === turma?.professorAtual ? `${nomeDe(s, efetivo)} (sem mudança)` : nomeDe(s, efetivo);
  const linhas = [
    ["Curso", curso ? `Existente: ${curso.title}` : `Novo: ${estado.curso.titulo}`],
    ["Turma", turma?.existente ? `Existente: ${turma.titulo}` : `Nova: ${turma?.titulo}`],
    ["Modalidade", turma?.modalidade === "online" ? "Online" : "Presencial"],
    ["Capacidade", turma?.capacidade ? `${turma.capacidade} vagas` : "Sem limite"],
    ["Professor", prof || "—"],
    ["Aulas novas", estado.aulas.length ? `${estado.aulas.length}${estado.aulas.some((a) => a.repetirAte) ? " (com repetição semanal)" : ""}` : "Nenhuma"],
    ["Inscrições novas", estado.inscricoes.length ? String(estado.inscricoes.length) : "Nenhuma"],
  ];
  const gravados = estado.registro.length ? `<div class="op-span" data-oc-gravados><p class="cg-explica">Já gravado nesta sessão:</p><ul class="cg-situacao">${estado.registro.map((r) => `<li data-ok="sim"><span aria-hidden="true">✓</span> ${e(r.descricao)}</li>`).join("")}</ul></div>` : "";
  const falha = estado.falha ? `<div class="op-span oc-falha" role="alert" data-oc-falha><strong>${e(estado.falha.titulo)}</strong><p>${e(estado.falha.texto)}</p></div>` : "";
  const plano = passos.length
    ? `<ol class="oc-plano op-span" data-oc-plano>${passos.map((p) => `<li>${e(p.descricao)}${sim && !sim.ok && sim.chave === p.chave ? ` <strong class="oc-recusado">não pode ser gravado: ${e(sim.erro)}</strong>` : ""}</li>`).join("")}</ol>`
    : `<p class="op-span" role="status" data-oc-nada>Não há nada novo para gravar.</p>`;
  const conferencia = !passos.length ? "" : sim?.ok ? `<p class="cg-nota op-span" role="status" data-oc-conferido>Conferido com as regras da operação (vagas, inscrição repetida, sala e horário do professor) sobre os dados atuais.</p>` : sim ? `<p class="op-span oc-recusado" role="status">Corrija o item indicado antes de gravar.</p>` : "";
  const pend = pendencias(estado, s);
  return `${falha}${gravados}<dl class="cg-resumo op-span">${linhas.map(([k, v]) => `<div><dt>${e(k)}</dt><dd>${e(v)}</dd></div>`).join("")}</dl>
    <p class="cg-explica op-span">Ao gravar, ${passos.length === 1 ? "este item é gravado" : "estes itens são gravados um a um, nesta ordem"}:</p>${plano}${conferencia}
    ${passos.length > 1 ? `<p class="cg-nota op-span">São gravações independentes. Se uma falhar, as anteriores ficam gravadas, a tela mostra o que faltou e “Continuar gravação” segue dali, sem repetir.</p>` : ""}
    ${pend.length ? `<div class="op-span"><p class="cg-explica">Fica pendente (pode ser feito depois):</p><ul class="cg-nota">${pend.map((p) => `<li>${e(p)}</li>`).join("")}</ul></div>` : ""}
    <p class="cg-nota op-span">Não muda: cadastros e papéis das pessoas, contas de acesso, permissões, aulas e inscrições que já existiam, e as páginas públicas.</p>`;
}

function etapaConclusao(estado, s) {
  const pend = pendencias(estado, s);
  const opcionais = ["Página pública do curso: ainda não existe; nada foi publicado.", "Mensagem aos alunos: não é enviada automaticamente."];
  return `<p class="cg-explica op-span" role="status">${e(estado.registro.length ? "Curso organizado." : "Nada precisou ser gravado.")}</p>
    <div class="op-span"><p class="cg-explica">Concluído</p><ul class="cg-situacao" data-oc-concluido>${estado.registro.length ? estado.registro.map((r) => `<li data-ok="sim"><span aria-hidden="true">✓</span> ${e(r.descricao)}</li>`).join("") : "<li>Sem gravações nesta sessão.</li>"}</ul></div>
    ${pend.length ? `<div class="op-span"><p class="cg-explica">Pendente</p><ul class="cg-situacao" data-oc-pendente>${pend.map((p) => `<li data-ok="nao"><span aria-hidden="true">•</span> ${e(p)}</li>`).join("")}</ul></div>` : ""}
    <div class="op-span"><p class="cg-explica">Opcional</p><ul class="cg-nota">${opcionais.map((p) => `<li>${e(p)}</li>`).join("")}</ul></div>
    <p class="cg-nota op-span">Alunos inscritos com e-mail igual ao da conta (ou com conta vinculada) veem o curso, o professor e a próxima aula em Meu Potala → Cursos.</p>
    <div class="cg-proximos op-span"><button type="button" class="op-button" data-oc-ir="ofertas">Ver em Cursos e atividades</button><button type="button" class="op-button" data-oc-ir="agenda">Ver na Agenda</button><button type="button" class="op-button" data-oc-outro>Organizar outro curso</button></div>`;
}

export function renderizarOrganizar(estado, s = {}) {
  const etapa = estado.etapa;
  const concluido = etapa === 7;
  const titulo = concluido ? "Curso organizado" : ETAPAS[etapa - 1].titulo;
  const corpos = { 1: etapaCurso, 2: etapaTurma, 3: etapaProfessor, 4: etapaAulas, 5: etapaInscricoes, 6: etapaRevisao, 7: etapaConclusao };
  const passos = etapa === 6 ? montarPlanoCurso(estado, s) : [];
  const rotuloGravar = estado.registro.length || estado.falha ? "Continuar gravação" : "Gravar";
  const avancar = concluido ? `<button type="button" class="op-primary" data-oc-fechar>Fechar</button>`
    : etapa === 6 ? (passos.length ? `<button type="submit" class="op-primary" ${estado.salvando || estado.simulacao?.ok === false ? "disabled" : ""}>${estado.salvando ? "Gravando…" : rotuloGravar}</button>` : `<button type="submit" class="op-primary">Concluir</button>`)
      : `<button type="submit" class="op-primary">Continuar</button>`;
  const voltar = etapa > 1 && !concluido ? `<button type="button" data-oc-voltar${estado.salvando ? " disabled" : ""}>Voltar</button>` : "";
  const rascunho = estado.rascunho && !concluido
    ? `<p class="cg-rascunho" role="status">${estado.registro.length ? "Curso em andamento: parte já foi gravada (veja na revisão)." : "Curso em andamento (ainda não gravado)."} <button type="button" class="cg-link" data-oc-recomecar>Começar de novo</button></p>` : "";
  return `<header><div><p class="op-eyebrow">Organizar um curso${concluido ? "" : ` · etapa ${etapa} de ${ETAPAS.length}`}</p><h2 id="oc-titulo" tabindex="-1">${e(titulo)}</h2></div><button type="button" class="op-close" data-oc-fechar aria-label="Fechar organizar um curso">×</button></header>
    ${concluido ? "" : etapasHtml(etapa)}${rascunho}
    <div class="op-form-body" data-oc-corpo>${corpos[etapa](estado, s)}</div>
    <p class="op-form-error" role="alert" data-oc-erro tabindex="-1">${e(estado.erro || "")}</p>
    <footer>${concluido ? "" : `<button type="button" data-oc-fechar${estado.salvando ? " disabled" : ""}>Cancelar</button>`}${voltar}${avancar}</footer>`;
}

export const ESTADO_INICIAL = () => ({
  etapa: 1, intencao: "",
  curso: { modo: "existente", id: "", titulo: "", confirmaSemelhante: false },
  turma: { modo: "nova", id: "", titulo: "", modalidade: "presencial", capacidade: "" },
  professor: { id: "", semProfessor: false },
  aulas: [], aulaNova: { data: "", inicio: "", fim: "", modo: "", salaId: "", link: "", repetirAte: "" },
  inscricoes: [], busca: "",
  registro: [], falha: null, incerto: null, idsAntes: null, simulacao: null,
  erro: "", erroAula: "", salvando: false, rascunho: false, aguardandoProfessor: false,
});

/* ------------------------------------------------------------------ controlador */

export function createOrganizarCurso({ root, operations, onSalvo = () => {}, onNavegar = () => {}, abrirCadastroProfissional = null, documento = root?.ownerDocument || globalThis.document } = {}) {
  if (!root || !operations) return null;
  const dialog = documento.createElement("dialog");
  dialog.className = "op-dialog cg-dialog oc-dialog";
  dialog.setAttribute("aria-labelledby", "oc-titulo");
  dialog.setAttribute("data-oc-dialog", "");
  const form = documento.createElement("form");
  form.setAttribute("data-oc-form", "");
  form.noValidate = true;
  dialog.appendChild(form);
  root.appendChild(dialog);

  let estado = ESTADO_INICIAL();
  let seq = 0;
  const s = () => operations.snapshot || {};

  function desenhar({ focar = "titulo" } = {}) {
    form.innerHTML = renderizarOrganizar(estado, s());
    if (focar === "titulo") form.querySelector("#oc-titulo")?.focus?.();
    else if (focar === "erro") form.querySelector("[data-oc-erro]")?.focus?.();
    else if (focar) form.querySelector(focar)?.focus?.();
  }

  function lerCampos() {
    const f = form.elements;
    const valor = (n) => (f[n] ? String(f[n].value ?? "") : undefined);
    const marcado = (n) => { const r = form.querySelector(`input[name="${n}"]:checked`); return r ? r.value : undefined; };
    if (marcado("cursoModo")) estado.curso.modo = marcado("cursoModo");
    if (valor("cursoTitulo") !== undefined) estado.curso.titulo = valor("cursoTitulo");
    if (f.confirmaSemelhante) estado.curso.confirmaSemelhante = f.confirmaSemelhante.checked;
    if (marcado("turmaModo")) estado.turma.modo = marcado("turmaModo");
    if (valor("turmaTitulo") !== undefined) estado.turma.titulo = valor("turmaTitulo");
    if (marcado("turmaModalidade")) estado.turma.modalidade = marcado("turmaModalidade");
    if (valor("turmaCapacidade") !== undefined) estado.turma.capacidade = valor("turmaCapacidade");
    if (valor("professorId") !== undefined) estado.professor.id = valor("professorId");
    if (f.semProfessor) estado.professor.semProfessor = f.semProfessor.checked;
    const a = estado.aulaNova;
    for (const [campo, nome] of [["data", "aulaData"], ["inicio", "aulaInicio"], ["fim", "aulaFim"], ["modo", "aulaModo"], ["salaId", "aulaSala"], ["link", "aulaLink"], ["repetirAte", "aulaRepetirAte"]]) if (valor(nome) !== undefined) a[campo] = valor(nome);
    if (valor("busca") !== undefined) estado.busca = valor("busca");
  }

  function irPara(etapa, foco = "titulo") {
    estado.etapa = etapa; estado.erro = ""; estado.erroAula = "";
    if (etapa === 3 && !estado.professor.id && !estado.professor.semProfessor) {
      const t = turmaEfetiva(estado, s());
      if (t?.professorAtual) estado.professor.id = t.professorAtual;
    }
    if (etapa === 6) estado.simulacao = conferirPlano();
    desenhar({ focar: foco });
  }

  function conferirPlano() {
    const passos = montarPlanoCurso(estado, s());
    if (!passos.length) return null;
    return simularPlano(s(), passos);
  }

  /* Adiciona a aula ao plano só se o motor aceitar o plano inteiro com ela (conflitos, sala, capacidade). */
  function adicionarAula() {
    lerCampos();
    const t = turmaEfetiva(estado, s());
    const aula = { ...estado.aulaNova, modo: estado.aulaNova.modo || t?.modalidade || "presencial", chave: `a${++seq}` };
    if (aula.modo === "online") aula.salaId = "";
    const erro = validarAula(aula);
    if (erro) { estado.erroAula = erro; desenhar({ focar: "[data-oc-erro-aula]" }); return; }
    const sim = simularPlano(s(), montarPlanoCurso({ ...estado, aulas: [...estado.aulas, aula], inscricoes: [] }, s()));
    if (!sim.ok) { estado.erroAula = sim.erro; desenhar({ focar: "[name=aulaData]" }); return; }
    estado.aulas.push(aula);
    estado.aulaNova = { data: "", inicio: aula.inicio, fim: aula.fim, modo: aula.modo, salaId: aula.salaId, link: aula.link, repetirAte: "" };
    estado.erroAula = ""; estado.erro = "";
    desenhar({ focar: "[name=aulaData]" });
  }

  function escolherPessoa(perfilId) {
    const t = turmaEfetiva(estado, s());
    const p = (s().profiles || []).find((x) => x.id === perfilId);
    if (!p || p.active === false) return;
    if (t?.existente && inscricaoDe(s(), t.existente.id, perfilId)) return;
    if (estado.inscricoes.some((i) => i.perfilId === perfilId)) return;
    const ocup = (t?.existente ? ocupadas(s(), t.existente.id) : 0) + estado.inscricoes.filter((i) => i.status === "active").length;
    const status = t?.capacidade != null && ocup >= t.capacidade ? "waitlist" : "active";
    estado.inscricoes.push({ perfilId, status });
    desenhar({ focar: "[data-oc-busca]" });
  }

  function marcarGravado(passo, id) {
    estado.registro.push({ chave: passo.chave, descricao: passo.descricao, id });
    if (passo.tipo === "definition.save") estado.curso = { modo: "existente", id, titulo: "", confirmaSemelhante: false };
    else if (passo.tipo === "offering.save") { if (!passo.payload.id) estado.turma = { ...estado.turma, modo: "existente", id }; }
    else if (passo.tipo === "schedule.save") estado.aulas = estado.aulas.filter((a) => a.chave !== passo.aula);
    else if (passo.tipo === "enrollment.save") estado.inscricoes = estado.inscricoes.filter((i) => i.perfilId !== passo.inscricao);
  }

  const refsAtuais = () => ({ curso: estado.curso.modo === "existente" ? estado.curso.id : "", turma: estado.turma.modo === "existente" ? estado.turma.id : "" });

  async function gravar() {
    estado.salvando = true; estado.erro = ""; estado.falha = null; desenhar({ focar: false });
    const parar = (titulo, texto) => { estado.salvando = false; estado.falha = { titulo, texto }; estado.simulacao = conferirPlano(); desenhar({ focar: "[data-oc-falha]" }); };
    try { await operations.refresh?.(); } catch (causa) {
      return parar("Nada foi gravado agora.", `Não foi possível ler os dados atuais do banco (${String(causa?.message || "falha de conexão").replace(/[.\s]+$/, "")}). Tente de novo quando a conexão voltar.`);
    }
    /* Uma tentativa anterior ficou sem resposta: confere no banco antes de reenviar. */
    if (estado.incerto) {
      const r = confirmarPasso(estado.incerto.passo, s(), { idsAntes: estado.idsAntes || {}, refs: estado.incerto.refs });
      if (r) marcarGravado(estado.incerto.passo, r.id);
      estado.incerto = null;
    }
    estado.idsAntes ||= idsPorColecao(s());
    const repetido = repetidoNoBanco(estado, s());
    if (repetido) return parar("Nada foi gravado agora.", repetido);
    const plano = montarPlanoCurso(estado, s());
    const sim = simularPlano(s(), plano, refsAtuais());
    if (!sim.ok) { estado.salvando = false; estado.simulacao = sim; estado.falha = { titulo: "Nada foi gravado agora.", texto: `Com os dados atuais, “${sim.passo.descricao}” não pode ser gravado: ${sim.erro}` }; desenhar({ focar: "[data-oc-falha]" }); return; }
    const r = await executarPlano({ operations, passos: plano, refs: refsAtuais(), idsAntes: estado.idsAntes, aoGravar: marcarGravado });
    if (!r.ok) {
      const { passo, motivo, conferido } = r.falha;
      onSalvo({ parcial: true });
      if (!conferido) {
        estado.incerto = { passo, refs: r.falha.refs };
        return parar("Gravação interrompida.", `Não foi possível confirmar se “${passo.descricao}” foi gravado (${motivo}). Ao continuar, o sistema confere primeiro e não grava duas vezes.${estado.registro.length ? " O que aparece como gravado acima já está no banco." : ""}`);
      }
      return parar(estado.registro.length ? "Gravação parcial." : "Nada foi gravado.", `“${passo.descricao}” não foi gravado (conferido no banco): ${motivo}.${estado.registro.length ? " O que aparece como gravado acima permanece; não há desfazer automático." : ""} Corrija, se for o caso, e use “Continuar gravação”.`);
    }
    estado.salvando = false; estado.falha = null; estado.simulacao = null;
    onSalvo({ parcial: false, registro: estado.registro });
    estado.etapa = 7;
    desenhar();
  }

  function limpar() {
    estado = ESTADO_INICIAL();
    if (dialog.open) dialog.close();
    form.innerHTML = "";
  }

  const temConteudo = () => Boolean(estado.curso.id || estado.curso.titulo || estado.turma.id || estado.turma.titulo || estado.aulas.length || estado.inscricoes.length || estado.registro.length);

  function abrir({ intencao = "" } = {}) {
    if (estado.etapa === 7) estado = ESTADO_INICIAL();
    if (!temConteudo()) {
      estado = ESTADO_INICIAL();
      estado.intencao = intencao;
      estado.curso.modo = intencao === "curso" || !cursosDisponiveis(s()).length ? "novo" : "existente";
    }
    estado.rascunho = temConteudo();
    estado.aguardandoProfessor = false;
    if (estado.etapa === 6) estado.simulacao = conferirPlano();
    desenhar({ focar: false });
    if (!dialog.open) dialog.showModal?.();
    desenhar();
  }
  const fechar = () => { if (dialog.open) dialog.close(); };

  /* Cadastro guiado de profissional (P1B) por cima: este rascunho fica guardado e volta quando ele fechar. */
  function cadastrarProfessor() {
    if (typeof abrirCadastroProfissional !== "function") { onNavegar("pessoas"); fechar(); return; }
    lerCampos();
    estado.aguardandoProfessor = true;
    fechar();
    const outro = abrirCadastroProfissional();
    outro?.addEventListener?.("close", () => { if (estado.aguardandoProfessor) abrir(); }, { once: true });
  }

  /* Chamado quando o cadastro guiado grava um profissional: já deixa escolhido, se ele estiver adequado. */
  function professorCadastrado(id) {
    if (!estado.aguardandoProfessor || !id) return;
    if (professoresAdequados(s()).some((p) => p.id === id)) { estado.professor.id = id; estado.professor.semProfessor = false; }
  }

  form.addEventListener("submit", (evento) => {
    evento.preventDefault();
    if (estado.salvando) return;
    lerCampos();
    if (estado.etapa === 6) {
      if (!montarPlanoCurso(estado, s()).length) { estado.etapa = 7; desenhar(); return; }
      void gravar(); return;
    }
    const erro = validarEtapa(estado.etapa, estado, s());
    if (erro) { estado.erro = erro; desenhar({ focar: "erro" }); return; }
    if (estado.etapa === 1 && estado.curso.modo === "novo") { estado.turma = { ...estado.turma, modo: "nova", id: "" }; }
    irPara(estado.etapa + 1);
  });

  form.addEventListener("change", (evento) => {
    const nome = evento.target?.name;
    if (["cursoModo", "turmaModo", "turmaModalidade", "aulaModo", "aulaSala", "semProfessor", "professorId"].includes(nome)) {
      lerCampos();
      if (nome === "cursoModo" && estado.curso.modo === "novo") estado.curso.id = "";
      if (nome === "turmaModo" && estado.turma.modo === "nova") estado.turma.id = "";
      if (nome === "aulaModo") estado.erroAula = "";
      desenhar({ focar: `[name="${nome}"]${evento.target.type === "radio" ? ":checked" : ""}` });
    }
  });

  let espera = 0;
  form.addEventListener("input", (evento) => {
    if (evento.target?.matches?.("[data-oc-busca]")) {
      estado.busca = evento.target.value;
      clearTimeout(espera);
      espera = setTimeout(() => { const alvo = form.querySelector("[data-oc-resultados]"); if (alvo) alvo.innerHTML = resultadosHtml(estado, s()); }, 150);
    } else if (evento.target?.matches?.("[data-oc-verificar]")) { estado.curso.confirmaSemelhante = false; }
  });

  form.addEventListener("click", (evento) => {
    const alvo = evento.target?.closest?.("button");
    if (!alvo || estado.salvando && !alvo.hasAttribute("data-oc-fechar")) return;
    if (alvo.hasAttribute("data-oc-fechar")) { if (estado.salvando) return; lerCampos(); fechar(); return; }
    if (alvo.hasAttribute("data-oc-voltar")) {
      lerCampos();
      const destino = estado.etapa === 5 && estado.pulouParaInscricoes ? 2 : estado.etapa - 1;
      if (destino <= 2) estado.pulouParaInscricoes = false;
      irPara(destino); return;
    }
    if (alvo.hasAttribute("data-oc-recomecar")) { const intencao = estado.intencao; estado = ESTADO_INICIAL(); estado.intencao = intencao; estado.curso.modo = cursosDisponiveis(s()).length ? "existente" : "novo"; desenhar(); return; }
    if (alvo.dataset.ocCurso) {
      lerCampos();
      if (estado.curso.id !== alvo.dataset.ocCurso) { estado.turma = { modo: turmasDoCurso(s(), alvo.dataset.ocCurso).length ? "existente" : "nova", id: "", titulo: estado.turma.titulo, modalidade: estado.turma.modalidade, capacidade: estado.turma.capacidade }; estado.professor = { id: "", semProfessor: false }; estado.inscricoes = []; }
      estado.curso = { modo: "existente", id: alvo.dataset.ocCurso, titulo: "", confirmaSemelhante: false };
      estado.erro = ""; desenhar({ focar: "[data-oc-usando]" }); return;
    }
    if (alvo.dataset.ocTurma) {
      lerCampos();
      if (estado.turma.id !== alvo.dataset.ocTurma) { estado.professor = { id: "", semProfessor: false }; estado.inscricoes = []; }
      estado.turma = { ...estado.turma, modo: "existente", id: alvo.dataset.ocTurma };
      estado.erro = ""; desenhar({ focar: "[data-oc-usando]" }); return;
    }
    if (alvo.hasAttribute("data-oc-pular-inscricoes")) {
      lerCampos();
      const erro = validarEtapa(2, estado, s());
      if (erro) { estado.erro = erro; desenhar({ focar: "erro" }); return; }
      const t = turmaEfetiva(estado, s());
      estado.professor = { id: t?.professorAtual || "", semProfessor: !t?.professorAtual };
      estado.pulouParaInscricoes = true;
      irPara(5); return;
    }
    if (alvo.hasAttribute("data-oc-cadastrar-professor")) { cadastrarProfessor(); return; }
    if (alvo.hasAttribute("data-oc-adicionar-aula")) { adicionarAula(); return; }
    if (alvo.dataset.ocRemoverAula) { lerCampos(); estado.aulas = estado.aulas.filter((a) => a.chave !== alvo.dataset.ocRemoverAula); desenhar({ focar: "[name=aulaData]" }); return; }
    if (alvo.dataset.ocEscolher) { lerCampos(); escolherPessoa(alvo.dataset.ocEscolher); return; }
    if (alvo.dataset.ocRemoverInscricao) {
      lerCampos();
      estado.inscricoes = estado.inscricoes.filter((i) => i.perfilId !== alvo.dataset.ocRemoverInscricao);
      /* Saiu alguém: quem estava na espera por falta de vaga pode voltar a ocupar a vaga. */
      const t = turmaEfetiva(estado, s());
      let livres = t?.capacidade == null ? Infinity : t.capacidade - (t.existente ? ocupadas(s(), t.existente.id) : 0) - estado.inscricoes.filter((i) => i.status === "active").length;
      for (const i of estado.inscricoes) if (i.status === "waitlist" && livres > 0) { i.status = "active"; livres--; }
      desenhar({ focar: "[data-oc-busca]" }); return;
    }
    if (alvo.dataset.ocIr) { const destino = alvo.dataset.ocIr; fechar(); onNavegar(destino); return; }
    if (alvo.hasAttribute("data-oc-outro")) { estado = ESTADO_INICIAL(); estado.curso.modo = cursosDisponiveis(s()).length ? "existente" : "novo"; desenhar(); }
  });
  form.addEventListener("keydown", (evento) => {
    /* Enter na busca procura; não avança de etapa. */
    if (evento.key === "Enter" && evento.target?.matches?.("[data-oc-busca]")) { evento.preventDefault(); const alvo = form.querySelector("[data-oc-resultados]"); if (alvo) alvo.innerHTML = resultadosHtml(estado, s()); }
  });
  dialog.addEventListener("cancel", (evento) => { evento.preventDefault(); if (estado.salvando) return; lerCampos(); fechar(); });
  dialog.addEventListener("close", () => { estado.rascunho = false; });

  /* "Organizar um curso" em Cursos e atividades e os atalhos da Visão geral abrem o fluxo. */
  const onRootClick = (evento) => {
    const gatilho = evento.target?.closest?.("[data-organizar-curso]");
    if (gatilho) { evento.preventDefault?.(); abrir({ intencao: gatilho.getAttribute("data-organizar-intencao") || "" }); }
  };
  root.addEventListener("click", onRootClick);

  return { abrir, fechar, limpar, professorCadastrado, get estado() { return estado; }, destroy() { root.removeEventListener("click", onRootClick); clearTimeout(espera); dialog.remove(); } };
}
