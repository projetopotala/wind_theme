/*
 * "Novo curso": caminho principal e simples para o Owner cadastrar, editar e divulgar um curso.
 *
 * Nao cria um sistema paralelo: monta um plano com os MESMOS comandos oficiais da operacao
 * (definition.save, offering.save, schedule.save) e o executa pelo mesmo motor do "Organizar um curso"
 * (simularPlano antes, executarPlano depois: grava em ordem, nao duplica ao repetir e confere no banco).
 * Valor em reais vira centavos inteiros (price_cents). A divulgacao publica so mostra curso completo
 * (regra no banco: list_public_courses / list_public_course_definitions).
 */
import { executarPlano, idsPorColecao, participantesDaAula, professoresAdequados, simularPlano, turmasDoCurso, validarAula } from "./organizar-curso.js";

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const e = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
const IMAGEM = /^media\/[a-z0-9][a-z0-9._/-]{0,200}$/i;

/* "120", "120,5", "R$ 1.200,00", "0" -> centavos inteiros; vazio ou invalido -> null. */
export function reaisParaCentavos(texto) {
  const limpo = String(texto ?? "").replace(/R\$|\s/gi, "").trim();
  if (!limpo) return null;
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$|^\d+(\.\d{1,2})$/.test(limpo)) return null;
  let normal = limpo;
  if (normal.includes(",")) normal = normal.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(normal)) normal = normal.replace(/\./g, "");
  const valor = Math.round(Number(normal) * 100);
  return Number.isSafeInteger(valor) && valor >= 0 && valor <= 999999999 ? valor : null;
}

export function centavosParaReais(centavos) {
  if (!Number.isInteger(centavos)) return "";
  return (centavos / 100).toFixed(2).replace(".", ",");
}

export const cursosEditaveis = (s) => (s?.activity_definitions || []).filter((d) => d.kind === "course");

/* Dados do formulario a partir de um curso existente (e sua primeira turma). */
export function dadosDoCurso(s, cursoId) {
  const d = cursosEditaveis(s).find((x) => x.id === cursoId);
  if (!d) return novoFormulario();
  const t = turmasDoCurso(s, d.id)[0] || null;
  return {
    cursoId: d.id, turmaId: t?.id || "", nome: d.title || "", descricao: d.summary || t?.summary || "", imagem: d.image || "",
    professorId: t?.professional_id || "", modalidade: t?.mode || "online",
    valor: centavosParaReais(Number.isInteger(t?.price_cents) ? t.price_cents : d.price_cents),
    comTurma: Boolean(t), capacidade: t?.capacity ?? "", publicar: d.published === true,
    aula: { data: "", inicio: "", fim: "", salaId: "", link: "" },
  };
}

export function novoFormulario() {
  return { cursoId: "", turmaId: "", nome: "", descricao: "", imagem: "", professorId: "", modalidade: "online", valor: "", comTurma: false, capacidade: "", publicar: false, aula: { data: "", inicio: "", fim: "", salaId: "", link: "" } };
}

export function validarNovoCurso(dados, s, agora = Date.now()) {
  const erros = [];
  const nome = String(dados.nome || "").trim();
  if (!nome) erros.push("Informe o nome do curso.");
  if (nome && cursosEditaveis(s).some((d) => d.id !== dados.cursoId && String(d.title || "").trim().toLowerCase() === nome.toLowerCase())) erros.push("Já existe um curso com este nome.");
  if (dados.publicar && !String(dados.descricao || "").trim()) erros.push("Para publicar, escreva a descrição do curso.");
  if (dados.imagem && !IMAGEM.test(dados.imagem)) erros.push("A imagem deve ser um arquivo do site em media/.");
  const centavos = reaisParaCentavos(dados.valor);
  if (String(dados.valor || "").trim() && centavos === null) erros.push("Valor inválido. Use, por exemplo, 150 ou 150,00.");
  if (dados.comTurma) {
    if (!dados.professorId) erros.push("Escolha o professor responsável pela turma.");
    const cap = Number(dados.capacidade);
    if (!Number.isInteger(cap) || cap < 1) erros.push("Informe a quantidade de vagas da turma.");
    if (dados.publicar && centavos === null) erros.push("Para abrir inscrições, informe o valor (0 para gratuito).");
    const temAula = dados.aula && (dados.aula.data || dados.aula.inicio || dados.aula.fim);
    if (temAula) {
      const problema = validarAula({ ...dados.aula, modo: dados.modalidade === "online" ? "online" : "presencial" });
      if (problema) erros.push(problema);
      else if (Date.parse(`${dados.aula.data}T${dados.aula.inicio}:00-03:00`) <= agora) erros.push("A primeira aula precisa ser no futuro.");
    } else if (dados.publicar && !dados.turmaId) erros.push("Para abrir inscrições, informe a data e o horário da primeira aula.");
  }
  return erros;
}

/* O plano, no formato do motor do "Organizar um curso". */
export function montarPlanoNovoCurso(dados, s) {
  const passos = [];
  const centavos = reaisParaCentavos(dados.valor);
  const existente = cursosEditaveis(s).find((d) => d.id === dados.cursoId) || null;
  const curso = {
    ...(existente ? { id: existente.id } : {}), title: String(dados.nome).trim(), kind: "course",
    summary: String(dados.descricao || "").trim().slice(0, 600), image: String(dados.imagem || "").trim(),
    price_cents: centavos, published: dados.publicar === true,
  };
  passos.push({ chave: "curso", tipo: "definition.save", define: "curso", payload: curso, descricao: `${existente ? "Atualizar" : "Cadastrar"} o curso "${curso.title}"` });
  if (!dados.comTurma) return passos;
  const turmaExistente = (s?.activity_offerings || []).find((o) => o.id === dados.turmaId) || null;
  const cap = Number(dados.capacidade);
  passos.push({
    chave: "turma", tipo: "offering.save", define: "turma",
    payload: {
      ...(turmaExistente ? { id: turmaExistente.id } : {}), title: curso.title, definition_id: existente ? existente.id : { ref: "curso" },
      professional_id: dados.professorId, mode: dados.modalidade === "online" ? "online" : "presencial", capacity: cap,
      price_cents: centavos, summary: curso.summary, image: curso.image, published: dados.publicar === true,
    },
    descricao: `${turmaExistente ? "Atualizar" : "Abrir"} a turma de "${curso.title}"`,
  });
  const a = dados.aula || {};
  if (a.data && a.inicio && a.fim) {
    const online = dados.modalidade === "online";
    passos.push({
      chave: "aula:1", tipo: "schedule.save", aula: "1",
      payload: {
        title: `Aula · ${curso.title}`, kind: "course", offering_id: turmaExistente ? turmaExistente.id : { ref: "turma" }, mode: online ? "online" : "presencial",
        room_id: online ? null : a.salaId, professional_id: dados.professorId, client_id: null,
        starts_at: `${a.data}T${a.inicio}`, ends_at: `${a.data}T${a.fim}`,
        participants: participantesDaAula(s, { capacidade: cap, salaId: a.salaId, modo: online ? "online" : "presencial" }),
        online_url: online ? String(a.link || "").trim() : "", price_cents: null, setup_minutes: 0, teardown_minutes: 0, requirements: [], extras: [],
      },
      descricao: `Agendar a aula de ${a.data.split("-").reverse().join("/")}, ${a.inicio}-${a.fim}`,
    });
  }
  return passos;
}

export function renderizarNovoCurso(dados, s, { erros = [], interessados = [], mensagem = "" } = {}) {
  const cursos = cursosEditaveis(s);
  const profs = professoresAdequados(s);
  const salas = (s?.rooms || []).filter((r) => r.status === "available");
  const opt = (v, t, sel) => `<option value="${e(v)}"${sel ? " selected" : ""}>${e(t)}</option>`;
  const meus = interessados.filter((i) => i.course_id === dados.cursoId);
  return `<header class="nc-cabecalho"><h2 id="nc-titulo">${dados.cursoId ? "Editar curso" : "Novo curso"}</h2>
    <button type="button" class="op-button" data-nc-fechar>Fechar</button></header>
    <label>Curso<select name="cursoId" data-nc-escolher>${opt("", "Novo curso", !dados.cursoId)}${cursos.map((c) => opt(c.id, `${c.title}${c.published ? " (publicado)" : " (rascunho)"}`, c.id === dados.cursoId)).join("")}</select></label>
    <label>Nome do curso<input name="nome" required maxlength="160" value="${e(dados.nome)}"></label>
    <label>Descrição<textarea name="descricao" maxlength="600" rows="4">${e(dados.descricao)}</textarea></label>
    <label>Imagem (arquivo do site em media/, opcional)<input name="imagem" maxlength="200" placeholder="media/cursos/exemplo.jpg" value="${e(dados.imagem)}"></label>
    <label>Valor em reais (0 para gratuito)<input name="valor" inputmode="decimal" placeholder="150,00" value="${e(dados.valor)}"></label>
    <fieldset class="nc-turma"><legend>Turma</legend>
      <label class="op-check"><input type="checkbox" name="comTurma" value="true"${dados.comTurma ? " checked" : ""}> Este curso tem turma com inscrições abertas</label>
      ${dados.comTurma ? `
      <label>Professor responsável<select name="professorId">${opt("", "Escolha o professor", !dados.professorId)}${profs.map((p) => opt(p.id, p.display_name, p.id === dados.professorId)).join("")}</select></label>
      <label>Modalidade<select name="modalidade">${opt("online", "Online", dados.modalidade === "online")}${opt("presencial", "Presencial", dados.modalidade !== "online")}</select></label>
      <label>Vagas<input name="capacidade" type="number" min="1" value="${e(dados.capacidade)}"></label>
      <p class="op-field-hint">${dados.turmaId ? "Para acrescentar uma aula, preencha abaixo. As aulas já marcadas continuam na Agenda." : "Primeira aula:"}</p>
      <label>Data<input name="aulaData" type="date" value="${e(dados.aula.data)}"></label>
      <label>Início<input name="aulaInicio" type="time" value="${e(dados.aula.inicio)}"></label>
      <label>Término<input name="aulaFim" type="time" value="${e(dados.aula.fim)}"></label>
      ${dados.modalidade === "online"
    ? `<label>Link da aula online (opcional)<input name="aulaLink" type="url" placeholder="https://" value="${e(dados.aula.link)}"></label>`
    : `<label>Sala<select name="aulaSala">${opt("", "Escolha a sala", !dados.aula.salaId)}${salas.map((r) => opt(r.id, r.name, r.id === dados.aula.salaId)).join("")}</select></label>`}` : `<p class="op-field-hint">Sem turma, o curso aparece em "Outros cursos do Instituto" com o botão "Tenho interesse", sem cobrança.</p>`}
    </fieldset>
    <fieldset><legend>Estado</legend>
      <label class="op-check"><input type="radio" name="publicar" value="false"${dados.publicar ? "" : " checked"}> Rascunho (não aparece no site)</label>
      <label class="op-check"><input type="radio" name="publicar" value="true"${dados.publicar ? " checked" : ""}> Publicado</label>
      <p class="op-field-hint">Só aparece no site o curso com descrição. Para inscrições abertas, a turma precisa de professor, vagas, valor e uma aula futura.</p>
    </fieldset>
    ${erros.length ? `<ul class="nc-erros" role="alert" data-nc-erro tabindex="-1">${erros.map((x) => `<li>${e(x)}</li>`).join("")}</ul>` : ""}
    ${mensagem ? `<p class="nc-ok" role="status">${e(mensagem)}</p>` : ""}
    <button type="submit" class="op-button op-primary">Salvar curso</button>
    ${dados.cursoId ? `<section class="nc-interessados"><h3>Interessados (${meus.length})</h3>${meus.length ? `<ul>${meus.map((i) => `<li>${e(i.name)} · ${e(i.email)}</li>`).join("")}</ul>` : "<p>Ninguém registrou interesse ainda.</p>"}</section>` : ""}`;
}

export function createNovoCurso({ root, operations, client = null, onSalvo = () => {}, documento = root?.ownerDocument || globalThis.document } = {}) {
  if (!root || !operations) return null;
  const dialog = documento.createElement("dialog");
  dialog.className = "op-dialog nc-dialog";
  dialog.setAttribute("aria-labelledby", "nc-titulo");
  const form = documento.createElement("form");
  form.noValidate = true;
  dialog.appendChild(form);
  root.appendChild(dialog);
  let dados = novoFormulario();
  let interessados = [];
  const s = () => operations.snapshot || {};
  const desenhar = (extra = {}) => { form.innerHTML = renderizarNovoCurso(dados, s(), { interessados, ...extra }); };

  function ler() {
    const f = form.elements;
    const v = (n) => (f[n] ? String(f[n].value ?? "") : "");
    return {
      ...dados, nome: v("nome"), descricao: v("descricao"), imagem: v("imagem").trim(), valor: v("valor"),
      comTurma: Boolean(f.comTurma?.checked), professorId: f.professorId ? v("professorId") : dados.professorId,
      modalidade: f.modalidade ? v("modalidade") : dados.modalidade, capacidade: f.capacidade ? v("capacidade") : dados.capacidade,
      publicar: form.querySelector("input[name='publicar']:checked")?.value === "true",
      aula: { data: v("aulaData"), inicio: v("aulaInicio"), fim: v("aulaFim"), salaId: v("aulaSala"), link: v("aulaLink") },
    };
  }

  async function carregarInteressados() {
    if (!client?.rpc) return;
    const { data, error } = await client.rpc("admin_list_course_interests");
    interessados = !error && Array.isArray(data) ? data : [];
  }

  async function abrir(cursoId = "") {
    dados = cursoId ? dadosDoCurso(s(), cursoId) : novoFormulario();
    desenhar();
    if (!dialog.open) dialog.showModal?.();
    await carregarInteressados().catch(() => {});
    desenhar();
  }

  form.addEventListener("change", (ev) => {
    if (ev.target?.matches?.("[data-nc-escolher]")) { dados = ev.target.value ? dadosDoCurso(s(), ev.target.value) : novoFormulario(); desenhar(); return; }
    if (ev.target?.name === "comTurma" || ev.target?.name === "modalidade") { dados = ler(); desenhar(); }
  });
  form.addEventListener("click", (ev) => { if (ev.target?.closest?.("[data-nc-fechar]")) dialog.close?.(); });
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    dados = ler();
    const erros = validarNovoCurso(dados, s());
    if (erros.length) { desenhar({ erros }); form.querySelector("[data-nc-erro]")?.focus?.(); return; }
    const passos = montarPlanoNovoCurso(dados, s());
    const simulado = simularPlano(s(), passos);
    if (!simulado.ok) { desenhar({ erros: [simulado.erro] }); return; }
    const botao = form.querySelector("[type='submit']");
    if (botao) botao.disabled = true;
    const r = await executarPlano({ operations, passos, idsAntes: idsPorColecao(s()) });
    if (!r.ok) {
      /* O que ja foi gravado fica ligado ao formulario: salvar de novo continua (atualiza), nunca cria outro curso. */
      dados = { ...dados, cursoId: r.refs.curso || dados.cursoId, turmaId: r.refs.turma || dados.turmaId };
      desenhar({ erros: [`Não foi possível salvar: ${r.falha.motivo}. O que já foi gravado permanece; salve de novo para continuar.`] });
      return;
    }
    dados = dadosDoCurso(s(), r.refs.curso || dados.cursoId);
    desenhar({ mensagem: dados.publicar ? "Curso salvo e publicado. Ele aparece no site se estiver completo." : "Curso salvo como rascunho." });
    onSalvo(r.refs);
  });
  root.addEventListener("click", (ev) => {
    const botao = ev.target?.closest?.("[data-novo-curso]");
    if (botao) { ev.preventDefault(); void abrir(botao.getAttribute("data-novo-curso") || ""); }
  });
  return { abrir, dialog };
}
