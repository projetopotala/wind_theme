/*
 * "Novo curso": caminho principal e simples para o Owner cadastrar, editar e divulgar um curso.
 *
 * Nao cria um sistema paralelo: monta um plano com os MESMOS comandos oficiais da operacao
 * (definition.save, offering.save, schedule.save) e o executa pelo mesmo motor do "Organizar um curso"
 * (simularPlano antes, executarPlano depois: grava em ordem, nao duplica ao repetir e confere no banco).
 * Valor em reais vira centavos inteiros (price_cents). A divulgacao publica so mostra curso completo
 * (regra no banco: list_public_courses / list_public_course_definitions).
 */
import { enderecoDoSite } from "../shared/endereco-do-site.js";
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
  const preco = Number.isInteger(t?.price_cents) ? t.price_cents : d.price_cents;
  return {
    cursoId: d.id, turmaId: t?.id || "", nome: d.title || "", nomeOriginal: d.title || "", descricao: d.summary || t?.summary || "", imagem: d.image || "",
    professorId: t?.professional_id || "", modalidade: t?.mode || "online",
    precoTipo: preco === 0 ? "gratuito" : (Number.isInteger(preco) ? "pago" : ""),
    valor: centavosParaReais(preco),
    comTurma: Boolean(t), capacidade: t?.capacity ?? "", publicar: d.published === true,
    aula: { data: "", inicio: "", fim: "", salaId: "", link: "" },
  };
}

export function novoFormulario() {
  return { cursoId: "", turmaId: "", nome: "", nomeOriginal: "", precoTipo: "", descricao: "", imagem: "", professorId: "", modalidade: "online", valor: "", comTurma: false, capacidade: "", publicar: false, aula: { data: "", inicio: "", fim: "", salaId: "", link: "" } };
}

export function validarNovoCurso(dados, s, agora = Date.now()) {
  const erros = [];
  const nome = String(dados.nome || "").trim();
  if (!nome) erros.push("Informe o nome do curso.");
  /* Nome repetido bloqueia curso novo ou renomeado; editar um curso que ja tinha nome repetido continua possivel. */
  const renomeado = !dados.cursoId || nome.toLowerCase() !== String(dados.nomeOriginal || "").trim().toLowerCase();
  if (nome && renomeado && cursosEditaveis(s).some((d) => d.id !== dados.cursoId && String(d.title || "").trim().toLowerCase() === nome.toLowerCase())) erros.push("Já existe um curso com este nome. Edite o curso existente pela lista.");
  if (dados.publicar && !String(dados.descricao || "").trim()) erros.push("Para publicar, escreva a descrição do curso.");
  if (dados.publicar && dados.precoTipo !== "gratuito" && !String(dados.valor || "").trim()) erros.push("Para publicar, informe o preço ou marque o curso como gratuito.");
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
    price_cents: centavos,
    /* Durante a gravacao: rascunho. Curso que ja estava publicado e continua publicado nao sai do ar na edicao. */
    published: dados.publicar === true && existente?.published === true,
  };
  passos.push({ chave: "curso", tipo: "definition.save", define: "curso", payload: curso, descricao: `${existente ? "Atualizar" : "Cadastrar"} o curso "${curso.title}"` });
  /* Publicacao so no fim, depois de todas as gravacoes: se algo falhar antes, o curso fica em rascunho. */
  const publicarNoFim = (lista) => {
    if (dados.publicar !== true) return lista;
    lista.push({ chave: "publicar:curso", tipo: "definition.save", payload: { ...curso, id: existente ? existente.id : { ref: "curso" }, published: true }, descricao: `Publicar o curso "${curso.title}"` });
    const turma = lista.find((p) => p.chave === "turma");
    if (turma) lista.push({ chave: "publicar:turma", tipo: "offering.save", payload: { ...turma.payload, id: turma.payload.id || { ref: "turma" }, published: true }, descricao: `Abrir as inscrições de "${curso.title}"` });
    return lista;
  };
  if (!dados.comTurma) return publicarNoFim(passos);
  const turmaExistente = (s?.activity_offerings || []).find((o) => o.id === dados.turmaId) || null;
  const cap = Number(dados.capacidade);
  passos.push({
    chave: "turma", tipo: "offering.save", define: "turma",
    payload: {
      ...(turmaExistente ? { id: turmaExistente.id } : {}), title: curso.title, definition_id: existente ? existente.id : { ref: "curso" },
      professional_id: dados.professorId, mode: dados.modalidade === "online" ? "online" : "presencial", capacity: cap,
      price_cents: centavos, summary: curso.summary, image: curso.image,
      published: dados.publicar === true && turmaExistente?.published === true,
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
  return publicarNoFim(passos);
}

/* Nome comparavel: sem acento, pontuacao e palavras de ligacao ("Curso de Meditacao" ~ "Curso Meditacao"). */
export function normalizarNome(texto) {
  return String(texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((p) => p && !["curso", "de", "do", "da", "dos", "das", "o", "a", "e"].includes(p)).join(" ");
}

/* Outros cursos com nome parecido: aviso para nao criar ou editar a versao errada (nunca bloqueia nem mescla). */
export function cursosParecidos(s, nome, cursoId = "") {
  const alvo = normalizarNome(nome);
  if (!alvo) return [];
  return cursosEditaveis(s).filter((d) => d.id !== cursoId && normalizarNome(d.title) === alvo);
}

export const situacaoDoCurso = (d) => (d?.published === true ? "Publicado" : "Rascunho");
const finalDoId = (id) => String(id || "").slice(-6);

function seletorDeImagem(dados, imagens) {
  const atual = String(dados.imagem || "");
  const lista = imagens.map((i) => `media/${i.arquivo}`);
  if (atual && !lista.includes(atual)) lista.unshift(atual);
  return `<fieldset class="nc-imagem"><legend>Imagem de capa <span class="nc-opcional">opcional</span></legend>
    <div class="nc-capa">${atual ? `<img src="${e(enderecoDoSite(atual))}" alt="" data-nc-capa>` : `<span class="nc-sem-capa">Sem imagem</span>`}</div>
    <details class="nc-galeria"${atual ? "" : " open"}><summary>${atual ? "Trocar imagem" : "Escolher uma imagem do site"}</summary>
      <div class="nc-grade" role="listbox" aria-label="Imagens do site">
        <button type="button" class="nc-miniatura nc-nenhuma${atual ? "" : " nc-escolhida"}" data-nc-imagem="" aria-pressed="${!atual}">Sem imagem</button>
        ${lista.map((c) => `<button type="button" class="nc-miniatura${c === atual ? " nc-escolhida" : ""}" data-nc-imagem="${e(c)}" aria-pressed="${c === atual}" aria-label="Usar ${e(c.replace(/^media\//, ""))}"><img src="${e(enderecoDoSite(c))}" alt="" loading="lazy"></button>`).join("")}
      </div>
    </details>
    <input type="hidden" name="imagem" value="${e(atual)}">
  </fieldset>`;
}

export function renderizarNovoCurso(dados, s, { erros = [], interessados = [], mensagem = "", imagens = [] } = {}) {
  const profs = professoresAdequados(s);
  const salas = (s?.rooms || []).filter((r) => r.status === "available");
  const opt = (v, t, sel) => `<option value="${e(v)}"${sel ? " selected" : ""}>${e(t)}</option>`;
  const meus = interessados.filter((i) => i.course_id === dados.cursoId);
  const existente = cursosEditaveis(s).find((d) => d.id === dados.cursoId) || null;
  const publicado = existente?.published === true;
  const parecidos = cursosParecidos(s, dados.nome, dados.cursoId);
  const pago = dados.precoTipo === "pago";
  return `<header class="nc-cabecalho"><div><h2 id="nc-titulo">${existente ? "Editar curso" : "Novo curso"}</h2>
      ${existente ? `<p class="nc-identidade"><span class="nc-selo nc-selo-${publicado ? "publicado" : "rascunho"}">${situacaoDoCurso(existente)}</span> ${e(existente.title)} <small>· código …${e(finalDoId(existente.id))}</small></p>` : `<p class="op-field-hint">Preencha o básico. Turma, datas e vagas são opcionais.</p>`}</div>
    <button type="button" class="op-button" data-nc-fechar>Fechar</button></header>
    ${parecidos.length ? `<div class="nc-aviso" role="note"><p><strong>Atenção:</strong> já ${parecidos.length > 1 ? "existem cursos" : "existe um curso"} com nome parecido. ${existente ? "Confira se está editando o certo." : "Para alterar, edite o existente em vez de criar outro."}</p>
      <ul>${parecidos.map((d) => `<li>${e(d.title)} · <span class="nc-selo nc-selo-${d.published ? "publicado" : "rascunho"}">${situacaoDoCurso(d)}</span> <small>código …${e(finalDoId(d.id))}</small> <button type="button" class="op-button" data-nc-editar="${e(d.id)}">Editar este</button></li>`).join("")}</ul></div>` : ""}
    <label>Nome do curso<input name="nome" required maxlength="160" value="${e(dados.nome)}" placeholder="Ex.: Respiração para iniciantes"></label>
    <label>Descrição<textarea name="descricao" maxlength="600" rows="4" placeholder="O que a pessoa vai aprender, para quem é, duração.">${e(dados.descricao)}</textarea></label>
    ${seletorDeImagem(dados, imagens)}
    <fieldset class="nc-preco"><legend>Preço</legend>
      <div class="nc-opcoes">
        <label class="op-check"><input type="radio" name="precoTipo" value="gratuito"${dados.precoTipo === "gratuito" ? " checked" : ""}> Gratuito</label>
        <label class="op-check"><input type="radio" name="precoTipo" value="pago"${pago ? " checked" : ""}> Pago</label>
      </div>
      ${pago ? `<label>Valor em reais<input name="valor" inputmode="decimal" placeholder="150,00" value="${e(dados.valor)}"></label>` : ""}
    </fieldset>
    <details class="nc-avancado" data-nc-inscricoes${dados.comTurma ? " open" : ""}>
      <summary>Abrir inscrições <span class="nc-opcional">opcional · turma, data e vagas</span></summary>
      <p class="op-field-hint">Sem isso, o curso publicado aparece no site com o botão “Tenho interesse”. Abra inscrições quando houver turma com data e vagas.</p>
      <label class="op-check"><input type="checkbox" name="comTurma" value="true"${dados.comTurma ? " checked" : ""}> Abrir inscrições para uma turma</label>
      ${dados.comTurma ? `
      <label>Professor responsável<select name="professorId">${opt("", "Escolha o professor", !dados.professorId)}${profs.map((p) => opt(p.id, p.display_name, p.id === dados.professorId)).join("")}</select></label>
      <label>Modalidade<select name="modalidade">${opt("online", "Online", dados.modalidade === "online")}${opt("presencial", "Presencial", dados.modalidade !== "online")}</select></label>
      <label>Vagas<input name="capacidade" type="number" min="1" value="${e(dados.capacidade)}"></label>
      <p class="op-field-hint">${dados.turmaId ? "Para acrescentar uma aula, preencha abaixo. As aulas já marcadas continuam na Agenda." : "Primeira aula:"}</p>
      <div class="nc-linha">
        <label>Data<input name="aulaData" type="date" value="${e(dados.aula.data)}"></label>
        <label>Início<input name="aulaInicio" type="time" value="${e(dados.aula.inicio)}"></label>
        <label>Término<input name="aulaFim" type="time" value="${e(dados.aula.fim)}"></label>
      </div>
      ${dados.modalidade === "online"
    ? `<label>Link da aula online (opcional)<input name="aulaLink" type="url" placeholder="https://" value="${e(dados.aula.link)}"></label>`
    : `<label>Sala<select name="aulaSala">${opt("", "Escolha a sala", !dados.aula.salaId)}${salas.map((r) => opt(r.id, r.name, r.id === dados.aula.salaId)).join("")}</select></label>`}` : ""}
    </details>
    ${erros.length ? `<ul class="nc-erros" role="alert" data-nc-erro tabindex="-1">${erros.map((x) => `<li>${e(x)}</li>`).join("")}</ul>` : ""}
    ${mensagem ? `<p class="nc-ok" role="status">${e(mensagem)}</p>` : ""}
    <div class="nc-acoes">
      ${publicado
    ? `<button type="submit" class="op-button op-primary" data-nc-acao="publicar">Salvar alterações</button><button type="submit" class="op-button" data-nc-acao="rascunho">Tirar do site (voltar a rascunho)</button>`
    : `<button type="submit" class="op-button" data-nc-acao="rascunho">Salvar rascunho</button><button type="submit" class="op-button op-primary" data-nc-acao="publicar">Publicar curso</button>`}
    </div>
    ${dados.cursoId ? `<section class="nc-interessados" data-nc-interessados><h3>Interessados (${meus.length})</h3>${meus.length ? `<ul>${meus.map((i) => `<li>${e(i.name)} · ${e(i.email)}</li>`).join("")}</ul>` : "<p>Ninguém registrou interesse ainda.</p>"}</section>` : ""}`;
}

export function createNovoCurso({ root, operations, client = null, onSalvo = () => {}, carregarImagens = null, documento = root?.ownerDocument || globalThis.document } = {}) {
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
  let imagens = [];
  const s = () => operations.snapshot || {};
  const desenhar = (extra = {}) => { form.innerHTML = renderizarNovoCurso(dados, s(), { interessados, imagens, ...extra }); };
  const buscarImagens = carregarImagens || (async () => {
    const r = await globalThis.fetch?.(enderecoDoSite("media/manifest.json"), { cache: "no-store" });
    const m = r?.ok ? await r.json() : null;
    return Array.isArray(m?.imagens) ? m.imagens.filter((i) => /^[a-z0-9][a-z0-9._-]*\.(webp|jpe?g|png|avif)$/i.test(i.arquivo || "")) : [];
  });

  function ler() {
    const f = form.elements;
    const v = (n) => (f[n] ? String(f[n].value ?? "") : "");
    const precoTipo = form.querySelector("input[name='precoTipo']:checked")?.value || dados.precoTipo || "";
    return {
      ...dados, nome: v("nome"), descricao: v("descricao"), imagem: v("imagem").trim(), precoTipo,
      valor: precoTipo === "gratuito" ? "0" : (f.valor ? v("valor") : (dados.precoTipo === "pago" ? dados.valor : "")),
      comTurma: Boolean(f.comTurma?.checked), professorId: f.professorId ? v("professorId") : dados.professorId,
      modalidade: f.modalidade ? v("modalidade") : dados.modalidade, capacidade: f.capacidade ? v("capacidade") : dados.capacidade,
      aula: { data: v("aulaData"), inicio: v("aulaInicio"), fim: v("aulaFim"), salaId: v("aulaSala"), link: v("aulaLink") },
    };
  }

  async function carregarInteressados() {
    if (!client?.rpc) return;
    const { data, error } = await client.rpc("admin_list_course_interests");
    interessados = !error && Array.isArray(data) ? data : [];
  }

  async function abrir(cursoId = "", { inscricoes = false, interessadosEmFoco = false } = {}) {
    dados = cursoId ? dadosDoCurso(s(), cursoId) : novoFormulario();
    if (inscricoes) dados = { ...dados, comTurma: true };
    desenhar();
    if (!dialog.open) dialog.showModal?.();
    await Promise.all([
      carregarInteressados().catch(() => {}),
      imagens.length ? null : buscarImagens().then((l) => { imagens = Array.isArray(l) ? l : []; }).catch(() => {}),
    ]);
    desenhar();
    if (inscricoes) form.querySelector("[data-nc-inscricoes]")?.scrollIntoView?.({ block: "start" });
    if (interessadosEmFoco) form.querySelector("[data-nc-interessados]")?.scrollIntoView?.({ block: "start" });
  }

  form.addEventListener("change", (ev) => {
    const n = ev.target?.name;
    if (n === "comTurma" || n === "modalidade" || n === "precoTipo") { dados = ler(); desenhar(); }
  });
  form.addEventListener("click", (ev) => {
    if (ev.target?.closest?.("[data-nc-fechar]")) { dialog.close?.(); return; }
    const editar = ev.target?.closest?.("[data-nc-editar]");
    if (editar) { void abrir(editar.getAttribute("data-nc-editar")); return; }
    const img = ev.target?.closest?.("[data-nc-imagem]");
    if (img) { dados = { ...ler(), imagem: img.getAttribute("data-nc-imagem") || "" }; desenhar(); }
  });
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const acao = ev.submitter?.getAttribute?.("data-nc-acao") || "rascunho";
    dados = { ...ler(), publicar: acao === "publicar" };
    const erros = validarNovoCurso(dados, s());
    if (erros.length) { desenhar({ erros }); form.querySelector("[data-nc-erro]")?.focus?.(); return; }
    const passos = montarPlanoNovoCurso(dados, s());
    const simulado = simularPlano(s(), passos);
    if (!simulado.ok) { desenhar({ erros: [simulado.erro] }); return; }
    form.querySelectorAll("[type='submit']").forEach((b) => { b.disabled = true; });
    const r = await executarPlano({ operations, passos, idsAntes: idsPorColecao(s()) });
    if (!r.ok) {
      /* O que ja foi gravado fica ligado ao formulario: salvar de novo continua (atualiza), nunca cria outro curso. */
      dados = { ...dados, cursoId: r.refs.curso || dados.cursoId, turmaId: r.refs.turma || dados.turmaId };
      desenhar({ erros: [`Não foi possível salvar: ${r.falha.motivo}. O que já foi gravado permanece; salve de novo para continuar.`] });
      return;
    }
    dados = dadosDoCurso(s(), r.refs.curso || dados.cursoId);
    desenhar({ mensagem: dados.publicar ? "Curso publicado. Ele já aparece no site." : "Rascunho salvo. O curso não aparece no site." });
    onSalvo(r.refs);
  });
  root.addEventListener("click", (ev) => {
    const botao = ev.target?.closest?.("[data-novo-curso]");
    if (botao) {
      ev.preventDefault();
      void abrir(botao.getAttribute("data-novo-curso") || "", {
        inscricoes: botao.hasAttribute("data-nc-abrir-inscricoes"), interessadosEmFoco: botao.hasAttribute("data-nc-ver-interessados"),
      });
    }
  });
  return { abrir, dialog };
}
