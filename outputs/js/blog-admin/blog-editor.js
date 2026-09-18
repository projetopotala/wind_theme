/*
 * O EDITOR DA MESA.
 *
 * Uma folha para escrever: capa, título grande, subtítulo e os blocos
 * editados no lugar, parecidos com o que o leitor vai ver. Tudo o que não é
 * escrever mora no painel ao lado (Publicação, Detalhes, SEO).
 *
 * O texto salva sozinho um instante depois de cada mudança. Num texto que já
 * está no ar, o que se salva fica como "alterações não publicadas" até alguém
 * clicar em Atualizar: o leitor nunca vê um texto pela metade. Ctrl+S e cada
 * mudança de status também guardam uma versão no histórico.
 */
import { icone } from "../admin/icones.js";
import { BLOG_BLOCK_TYPES, estimateReadingMinutes, normalizePost, normalizePosts } from "../blog/blog-model.js";
import {
  TIPOS_DE_BLOCO, aplicarCampo, blocoHtml, blocoNovo, corpoHtml, duplicarBloco, formatarSelecao, insercaoHtml, menuDeBlocosHtml,
} from "./mesa-blocos.js";
import {
  SECOES_DO_PORTAL, autoresDe, enderecoLivre, fraseDoAgendamento, fraseDoStatus, hojeNoInstituto, horaDe, instanteDe,
  partesDoInstante, pendenciasParaPublicar, resumoDasMudancas, tagsDe, tempoRelativo, textoAtual,
} from "./mesa-modelo.js";
import { esc } from "./mesa-ui.js";
import { chipDeStatus } from "./mesa-visoes.js";

const clone = (value) => JSON.parse(JSON.stringify(value));

/* ------------------------------------------------------------------
 * Operações puras sobre o texto (usadas também pelos testes)
 * ------------------------------------------------------------------ */

export function createBlankPost(now = new Date().toISOString()) {
  const stamp = String(now || new Date().toISOString());
  const id = `post-${stamp.replace(/\D/g, "").slice(0, 14) || Date.now()}`;
  return normalizePost({ id, slug: `novo-texto-${id.slice(-6)}`, title: "Novo texto", subtitle: "", excerpt: "", category: "reflexao", author: "Instituto Potala", publishedAt: stamp.slice(0, 10), readingMinutes: 1, cover: "", coverAlt: "", featured: false, status: "draft", content: [], updatedAt: stamp });
}

export function addContentBlock(post, type) {
  if (!BLOG_BLOCK_TYPES.includes(type)) return post;
  return { ...post, content: [...(post.content || []), blocoNovo(type)] };
}

export function moveContentBlock(post, blockId, direction) {
  const content = clone(post.content || []);
  const from = content.findIndex(({ id }) => id === blockId);
  const to = Math.max(0, Math.min(content.length - 1, from + Number(direction || 0)));
  if (from < 0 || from === to) return { ...post, content };
  const [block] = content.splice(from, 1);
  content.splice(to, 0, block);
  return { ...post, content };
}

export function removeContentBlock(post, blockId) {
  return { ...post, content: (post.content || []).filter(({ id }) => id !== blockId) };
}

export function mergeDraftPosts(posts, draft) {
  const copy = clone(posts || []);
  const normalized = normalizePost(draft);
  if (normalized.featured) copy.forEach((post) => { post.featured = false; });
  const index = copy.findIndex(({ id }) => id === normalized.id);
  if (index >= 0) copy[index] = normalized;
  else copy.push(normalized);
  return normalizePosts(copy);
}

export function postPreview(previewWindow, posts, selectedSlug, origin = globalThis.location?.origin || "*") {
  previewWindow?.postMessage?.({ type: "potala:blog-preview", posts: normalizePosts(posts), selectedSlug: String(selectedSlug || "") }, origin);
}

/* ------------------------------------------------------------------
 * O editor
 * ------------------------------------------------------------------ */

const i = (nome, classe = "mesa-icone") => icone(nome, { classe });
const ESPERA_DO_SALVAMENTO = 1500;
const ACAO_DO_HISTORICO = {
  rascunho: "Salvou o rascunho", pendente: "Salvou alterações", revisao: "Enviou para revisão", publicar: "Publicou",
  agendar: "Agendou", despublicar: "Tirou do ar", arquivar: "Arquivou",
};
const VERBO = { publicar: "publicar", agendar: "agendar", revisao: "enviar para revisão", despublicar: "tirar do ar", arquivar: "arquivar", restaurar: "voltar a rascunho" };
const LIMITES = { excerpt: 220, "seo.title": 60, "seo.description": 160 };

const lerPreferencia = (chave, padrao) => { try { return globalThis.localStorage?.getItem(chave) ?? padrao; } catch { return padrao; } };
const gravarPreferencia = (chave, valor) => { try { globalThis.localStorage?.setItem(chave, valor); } catch { /* sem armazenamento: só não lembra */ } };
const cortar = (texto, limite) => (texto.length > limite ? `${texto.slice(0, limite - 1).trimEnd()}…` : texto);

function crescer(campo) {
  if (!campo?.matches?.("textarea")) return;
  campo.style.height = "auto";
  campo.style.height = `${campo.scrollHeight}px`;
}
const crescerTodos = (raiz) => raiz?.querySelectorAll("textarea").forEach(crescer);

function sugestaoDeAgenda() {
  const amanha = new Date(Date.now() + 86400000);
  return { dia: hojeNoInstituto(amanha), hora: "10:00" };
}

export function createBlogEditor({ root, ctx } = {}) {
  if (!root || !ctx) throw new TypeError("root e ctx são obrigatórios");

  let registro = null;
  let post = null;
  let base = null;
  let salvoComo = "";
  let versaoComo = "";
  let estado = "salvo";
  let ultimoSalvamento = null;
  let avisouErro = false;
  let espera = null;
  let emVoo = null;
  let repetir = false;
  let ocupado = false;
  let selecionado = "";
  let aba = lerPreferencia("mesa.aba", "publicacao");
  let escolha = "agora";
  let agenda = sugestaoDeAgenda();
  let slugAutomatico = true;
  let historico = null;
  let arrastando = "";
  let destino = null;
  let esperaDaPrevia = null;
  let painelAberto = lerPreferencia("mesa.painel", "aberto") === "aberto" && !globalThis.matchMedia?.("(max-width: 1100px)").matches;

  root.innerHTML = `<div class="mesa-editor" data-painel="${painelAberto ? "aberto" : "fechado"}">
    <header class="mesa-editor__topo">
      <a class="mesa-voltar" href="#/posts">${i("chevron-left")}<span>Posts</span></a>
      <span class="mesa-editor__divisor" aria-hidden="true"></span>
      <div class="mesa-editor__nome"><p data-editor-nome tabindex="-1"></p><span data-editor-status></span></div>
      <span class="mesa-salvo" data-editor-salvo role="status"></span>
      <div class="mesa-editor__acoes">
        <button type="button" class="mesa-botao mesa-botao--contorno" data-editor-previa>${i("eye")}<span>Pré-visualizar</span></button>
        <button type="button" class="mesa-botao-icone" data-editor-alternar-painel aria-controls="mesa-painel" aria-expanded="${painelAberto}" title="Configurações do texto">${i("settings")}<span class="sr-only">Configurações do texto</span></button>
        <button type="button" class="mesa-botao mesa-botao--principal" data-editor-principal></button>
      </div>
    </header>
    <div class="mesa-editor__meio">
      <div class="mesa-editor__area" data-editor-area>
        <article class="mesa-folha" data-editor-folha aria-label="Texto">
          <div class="mesa-folha__capa" data-editor-capa></div>
          <div class="mesa-folha__texto">
            <button type="button" class="mesa-folha__categoria" data-editor-categoria title="Mudar a categoria"></button>
            <label class="sr-only" for="mesa-campo-titulo">Título</label>
            <textarea id="mesa-campo-titulo" class="mesa-folha__titulo" data-editor-campo="title" rows="1" maxlength="160" placeholder="Título do texto"></textarea>
            <label class="sr-only" for="mesa-campo-subtitulo">Subtítulo</label>
            <textarea id="mesa-campo-subtitulo" class="mesa-folha__subtitulo" data-editor-campo="subtitle" rows="1" maxlength="240" placeholder="Um subtítulo que convide à leitura"></textarea>
            <div class="mesa-blocos" data-editor-blocos></div>
            <div class="mesa-adicionar"><button type="button" class="mesa-adicionar__botao" data-editor-adicionar aria-haspopup="menu" aria-expanded="false">${i("plus")}Adicionar bloco</button></div>
          </div>
        </article>
        <p class="mesa-atalhos"><span data-editor-palavras></span><span aria-hidden="true"><kbd>Ctrl</kbd> <kbd>S</kbd> salvar · <kbd>Ctrl</kbd> <kbd>K</kbd> comandos</span></p>
      </div>
      <aside class="mesa-painel" id="mesa-painel" data-editor-painel aria-label="Configurações do texto">
        <header class="mesa-painel__topo">
          <div class="mesa-painel__linha"><h2>Configurações</h2><button type="button" class="mesa-botao-icone" data-editor-fechar-painel aria-label="Fechar configurações">${i("x")}</button></div>
          <div class="mesa-abas mesa-abas--painel" role="tablist" aria-label="Configurações do texto">
            <button type="button" role="tab" id="mesa-aba-publicacao" data-editor-aba="publicacao" aria-controls="mesa-painel-corpo">Publicação</button>
            <button type="button" role="tab" id="mesa-aba-detalhes" data-editor-aba="detalhes" aria-controls="mesa-painel-corpo">Detalhes</button>
            <button type="button" role="tab" id="mesa-aba-seo" data-editor-aba="seo" aria-controls="mesa-painel-corpo">SEO</button>
          </div>
        </header>
        <div class="mesa-painel__corpo" id="mesa-painel-corpo" role="tabpanel" data-editor-painel-corpo></div>
        <footer class="mesa-painel__rodape" data-editor-painel-rodape></footer>
      </aside>
      <div class="mesa-painel__veu" data-editor-fechar-painel aria-hidden="true"></div>
    </div>
    <div class="mesa-previa" data-editor-previa-painel hidden role="dialog" aria-modal="true" aria-label="Pré-visualização">
      <div class="mesa-previa__barra">
        <p><strong>Pré-visualização</strong><small>como o leitor vai ver</small></p>
        <div class="mesa-abas" role="group" aria-label="Tamanho da tela">
          <button type="button" data-previa-aparelho="desktop" aria-pressed="true">${i("monitor")}Computador</button>
          <button type="button" data-previa-aparelho="mobile" aria-pressed="false">${i("smartphone")}Celular</button>
        </div>
        <button type="button" class="mesa-botao mesa-botao--contorno mesa-botao--pequeno" data-previa-nova-aba>${i("external-link")}<span>Abrir em nova aba</span></button>
        <button type="button" class="mesa-botao-icone" data-previa-fechar aria-label="Fechar pré-visualização">${i("x")}</button>
      </div>
      <div class="mesa-previa__moldura" data-previa-moldura data-aparelho="desktop"><iframe title="Pré-visualização do artigo" data-previa-quadro></iframe></div>
    </div>
  </div>`;

  const $ = (seletor) => root.querySelector(seletor);
  const casca = $(".mesa-editor");
  const area = $("[data-editor-area]");
  const folha = $("[data-editor-folha]");
  const painel = $("[data-editor-painel]");
  const corpoDoPainel = $("[data-editor-painel-corpo]");
  const rodapeDoPainel = $("[data-editor-painel-rodape]");
  const previa = $("[data-editor-previa-painel]");
  const quadro = $("[data-previa-quadro]");

  /* ---------------- o que é gravado ---------------- */

  const paraGravar = () => normalizePost({ ...post, readingMinutes: estimateReadingMinutes(post) });
  /* O que conta como mudança: o texto inteiro, menos a hora da última gravação. */
  function assinatura() {
    return JSON.stringify({ ...paraGravar(), updatedAt: "" });
  }
  const textoVazio = () => !String(post.title || "").trim() && !String(post.subtitle || "").trim() && !post.content.length && !post.cover;
  const noAr = () => ["published", "scheduled"].includes(registro?.status);
  const nuncaPublicado = () => !registro || (["draft", "review"].includes(registro.status) && !registro.publicarEm);

  function acaoDoSalvamento() {
    if (noAr()) return "pendente";
    if (registro?.status === "archived") return "arquivar";
    return "rascunho";
  }

  function acaoPrincipal() {
    const status = registro?.status || "draft";
    if (status === "published") return { acao: "publicar", rotulo: "Atualizar", icone: "send", desativado: !registro.pendente && estado === "salvo" };
    if (status === "scheduled") return { acao: "agendar", rotulo: "Salvar agendamento", icone: "calendar-clock" };
    if (status === "archived") return { acao: "restaurar", rotulo: "Voltar a rascunho", icone: "rotate-ccw" };
    return escolha === "agendar"
      ? { acao: "agendar", rotulo: "Agendar", icone: "calendar-clock" }
      : { acao: "publicar", rotulo: "Publicar", icone: "send" };
  }

  /* ---------------- salvar ---------------- */

  function mudou() {
    if (estado !== "salvando") estado = assinatura() === salvoComo ? "salvo" : estado === "erro" ? "erro" : "sujo";
    desenharSalvo();
    desenharBotoes();
    desenharPalavras();
    if (!previa.hidden) {
      clearTimeout(esperaDaPrevia);
      esperaDaPrevia = setTimeout(() => enviarPrevia(quadro.contentWindow), 250);
    }
    clearTimeout(espera);
    if (estado !== "salvo") espera = setTimeout(() => salvar({ automatico: true }), ESPERA_DO_SALVAMENTO);
  }

  /*
   * automatico: o salvamento de fundo — sem aviso de sucesso e sem versão.
   * registrar: guarda uma versão no histórico (Ctrl+S, sair do editor).
   */
  async function salvar({ automatico = false, registrar = !automatico, silencioso = automatico } = {}) {
    clearTimeout(espera);
    espera = null;
    if (emVoo) {
      repetir = true;
      await emVoo;
      if (automatico) return estado === "salvo";
    }
    if (!registro && textoVazio()) return true;
    const agora = assinatura();
    const gravarVersao = registrar && agora !== versaoComo;
    if (agora === salvoComo && !gravarVersao) {
      if (!silencioso) ctx.avisos.mostrar("Tudo salvo.");
      return true;
    }
    const documento = paraGravar();
    estado = "salvando";
    desenharSalvo();
    emVoo = ctx.salvarRegistro(documento, acaoDoSalvamento(), {
      registrar: gravarVersao,
      resumo: gravarVersao ? resumoDasMudancas(base, documento) : "",
    }).then((novo) => {
      const primeiraVez = !registro;
      registro = novo;
      salvoComo = agora;
      ultimoSalvamento = new Date();
      avisouErro = false;
      if (gravarVersao) {
        versaoComo = agora;
        base = documento;
        historico = null;
      }
      estado = assinatura() === salvoComo ? "salvo" : "sujo";
      if (primeiraVez) ctx.aoCriar?.(registro.id);
      if (!silencioso) ctx.avisos.mostrar(noAr() ? "Alterações salvas. Elas entram no ar quando você clicar em Atualizar." : "Rascunho salvo.");
      desenharCabecalho();
      if (aba === "publicacao" || (aba === "detalhes" && gravarVersao)) desenharPainel({ manterFoco: true });
      return true;
    }).catch((erro) => {
      estado = "erro";
      if (!avisouErro || !silencioso) {
        avisouErro = true;
        ctx.avisos.mostrar(`Erro ao salvar: ${erro.message}`, { tipo: "erro", acao: { rotulo: "Tentar de novo", executar: () => salvar({ silencioso: false, registrar: false }) } });
      }
      return false;
    }).finally(() => {
      emVoo = null;
      desenharSalvo();
      desenharBotoes();
      if (repetir) {
        repetir = false;
        if (estado === "sujo") espera = setTimeout(() => salvar({ automatico: true }), ESPERA_DO_SALVAMENTO);
      }
    });
    return emVoo;
  }

  function mostrarProblema(problema) {
    ctx.avisos.mostrar(problema.texto, { tipo: "erro", duracao: 6000 });
    if (problema.aba) {
      abrirPainel(problema.aba);
      corpoDoPainel.querySelector(`[data-editor-campo="${problema.campo}"]`)?.focus();
    } else if (problema.campo === "cover") {
      $("[data-capa-acao]")?.focus();
    } else if (problema.bloco) {
      selecionar(problema.bloco);
      folha.querySelector(`[data-bloco-id="${CSS.escape(problema.bloco)}"] [data-bloco-acao]:not([data-bloco-acao="arrastar"])`)?.focus();
    } else if (problema.campo === "content") {
      $("[data-editor-adicionar]")?.focus();
    } else {
      folha.querySelector(`[data-editor-campo="${problema.campo}"]`)?.focus();
    }
  }

  async function mudarStatus(acao) {
    if (ocupado) return;
    clearTimeout(espera);
    if (emVoo) await emVoo;
    let documento = paraGravar();
    let quando = null;
    if (acao === "publicar" || acao === "agendar") {
      const problemas = pendenciasParaPublicar(post);
      if (problemas.length) { mostrarProblema(problemas[0]); return; }
    }
    if (acao === "agendar") {
      quando = instanteDe(agenda.dia, agenda.hora);
      if (!quando || quando <= new Date()) {
        abrirPainel("publicacao");
        ctx.avisos.mostrar(quando ? "Escolha um momento no futuro para agendar." : "Escolha a data e o horário da publicação.", { tipo: "erro", duracao: 6000 });
        corpoDoPainel.querySelector('[data-agenda="dia"]')?.focus();
        return;
      }
      documento = { ...documento, publishedAt: agenda.dia };
    }
    if (acao === "publicar" && registro?.status !== "published") documento = { ...documento, publishedAt: hojeNoInstituto() };
    if (acao === "despublicar" && registro?.status === "published") {
      const ok = await ctx.confirmar({ titulo: "Tirar este texto do ar?", texto: "Ele sai do Blog agora e volta a ser rascunho. Os links para ele deixam de funcionar até você publicar de novo.", confirmar: "Tirar do ar", perigo: true });
      if (!ok) return;
    }
    if (acao === "arquivar") {
      const ok = await ctx.confirmar({ titulo: "Arquivar este texto?", texto: noAr() ? "Ele sai do Blog e fica guardado no arquivo. Você pode trazê-lo de volta depois." : "Ele sai da lista principal e fica guardado no arquivo.", confirmar: "Arquivar" });
      if (!ok) return;
    }
    ocupado = true;
    desenharBotoes();
    try {
      const eraPublicado = registro?.status === "published";
      const novo = await ctx.salvarRegistro(documento, acao === "restaurar" ? "despublicar" : acao, { quando, registrar: true, resumo: resumoDasMudancas(base, documento) });
      registro = novo;
      post.publishedAt = documento.publishedAt;
      salvoComo = versaoComo = assinatura();
      base = documento;
      historico = null;
      estado = "salvo";
      ultimoSalvamento = new Date();
      if (ctx.loja.demonstracao && (acao === "publicar" || acao === "agendar")) {
        ctx.avisos.mostrar(acao === "publicar" ? "Publicado no acesso de teste: o Blog real não muda." : `${fraseDoAgendamento(quando)} (no acesso de teste)`);
      } else if (acao === "publicar") {
        ctx.avisos.mostrar(eraPublicado ? "Atualizado: o Blog já mostra a versão nova." : "Publicado! O texto já está no Blog.", { acao: { rotulo: "Ver no Blog", executar: () => globalThis.open(`artigo.html?post=${encodeURIComponent(post.slug)}`, "_blank", "noopener") } });
      } else if (acao === "agendar") {
        ctx.avisos.mostrar(fraseDoAgendamento(quando));
      } else {
        ctx.avisos.mostrar({ revisao: "Enviado para revisão.", despublicar: "O texto voltou a ser rascunho.", arquivar: "Texto arquivado.", restaurar: "O texto voltou a ser rascunho." }[acao]);
      }
      escolha = registro.status === "scheduled" ? "agendar" : "agora";
      desenharCabecalho();
      desenharPainel();
    } catch (erro) {
      ctx.avisos.mostrar(`Não foi possível ${VERBO[acao] || "salvar"}: ${erro.message}`, { tipo: "erro" });
    } finally {
      ocupado = false;
      desenharBotoes();
    }
  }

  async function descartarAlteracoes() {
    const ok = await ctx.confirmar({ titulo: "Descartar as alterações?", texto: "O editor volta a mostrar o texto que está no ar. As alterações descartadas continuam no histórico.", confirmar: "Descartar", perigo: true });
    if (!ok) return;
    try {
      const agendado = registro.status === "scheduled";
      const novo = await ctx.salvarRegistro(registro.post, agendado ? "agendar" : "publicar", { quando: agendado ? registro.publicarEm : null, registrar: true, resumo: "Alterações descartadas" });
      carregar(novo);
      ctx.avisos.mostrar("Alterações descartadas.");
    } catch (erro) {
      ctx.avisos.mostrar(`Não foi possível descartar: ${erro.message}`, { tipo: "erro" });
    }
  }

  async function excluir() {
    if (!registro) {
      ctx.navegar("#/posts");
      return;
    }
    const ok = await ctx.confirmar({ titulo: "Excluir este texto?", texto: "Ele é apagado de vez, com o histórico. Se quiser só tirá-lo de circulação, arquive.", confirmar: "Excluir", perigo: true });
    if (!ok) return;
    try {
      clearTimeout(espera);
      await ctx.excluirRegistro(registro.id);
      registro = null;
      salvoComo = assinatura();
      estado = "salvo";
      ctx.avisos.mostrar("Texto excluído.");
      ctx.navegar("#/posts");
    } catch (erro) {
      ctx.avisos.mostrar(`Não foi possível excluir: ${erro.message}`, { tipo: "erro" });
    }
  }

  /* ---------------- desenho: cabeçalho ---------------- */

  function desenharSalvo() {
    const alvo = $("[data-editor-salvo]");
    let conteudo;
    if (estado === "salvando") conteudo = `${i("loader-circle", "mesa-icone is-girando")}<span>Salvando…</span>`;
    else if (estado === "erro") conteudo = `${i("circle-alert")}<span>Erro ao salvar</span><button type="button" class="mesa-link" data-editor-repetir>Tentar de novo</button>`;
    else if (estado === "sujo") conteudo = `${i("pencil")}<span>Alterações não salvas</span>`;
    else if (!registro) conteudo = `${i("pencil")}<span>Rascunho novo</span>`;
    else {
      const quando = ultimoSalvamento || new Date(registro.atualizadoEm);
      const hoje = hojeNoInstituto(quando) === hojeNoInstituto();
      conteudo = `${i("check")}<span>${hoje ? `Salvo às ${esc(horaDe(quando))}` : `Salvo ${esc(tempoRelativo(quando))}`}</span>`;
    }
    alvo.dataset.estado = estado;
    alvo.innerHTML = conteudo;
  }

  function desenharBotoes() {
    const principal = acaoPrincipal();
    for (const botao of root.querySelectorAll("[data-editor-principal]")) {
      botao.innerHTML = `${i(ocupado ? "loader-circle" : principal.icone, ocupado ? "mesa-icone is-girando" : "mesa-icone")}<span>${esc(principal.rotulo)}</span>`;
      botao.disabled = ocupado || Boolean(principal.desativado);
      botao.title = principal.desativado ? "Nada novo para atualizar" : "";
    }
  }

  function desenharCabecalho() {
    $("[data-editor-nome]").textContent = String(post.title || "").trim() || "Texto sem título";
    $("[data-editor-status]").innerHTML = `${chipDeStatus(registro?.status || "draft")}${registro?.pendente ? `<span class="mesa-selo">${i("history")}Alterações não publicadas</span>` : ""}`;
    desenharSalvo();
    desenharBotoes();
  }

  function desenharPalavras() {
    const palavras = [post.title, post.subtitle, ...post.content.flatMap((bloco) => [bloco.text, bloco.caption, ...(bloco.items || [])])]
      .join(" ").split(/\s+/).filter(Boolean).length;
    $("[data-editor-palavras]").textContent = `${palavras} ${palavras === 1 ? "palavra" : "palavras"} · cerca de ${estimateReadingMinutes(post)} min de leitura`;
  }

  /* ---------------- desenho: a folha ---------------- */

  function desenharCapa() {
    const alvo = $("[data-editor-capa]");
    alvo.innerHTML = post.cover
      ? `<figure class="mesa-capa">
          <img src="${esc(post.cover)}" alt="">
          <div class="mesa-capa__acoes">
            <button type="button" class="mesa-botao mesa-botao--vidro mesa-botao--pequeno" data-capa-acao="trocar">${i("image")}Trocar capa</button>
            <button type="button" class="mesa-botao mesa-botao--vidro mesa-botao--pequeno" data-capa-acao="remover">${i("trash-2")}Remover</button>
          </div>
        </figure>
        <label class="mesa-capa__alt">${i("type")}<span class="sr-only">Descrição da capa</span><input data-editor-campo="coverAlt" value="${esc(post.coverAlt)}" maxlength="200" placeholder="Descreva a capa para quem usa leitor de tela"></label>`
      : `<button type="button" class="mesa-capa mesa-capa--vazia" data-capa-acao="trocar">${i("image")}<strong>Adicionar imagem de capa</strong><small>Abre o artigo e aparece nos cartões do Blog. Você também pode arrastar uma foto para cá.</small></button>`;
  }

  function desenharCategoria() {
    $("[data-editor-categoria]").innerHTML = `${i("tag")}${esc(ctx.rotuloDaCategoria(post.category))}`;
  }

  function desenharBlocos() {
    const alvo = $("[data-editor-blocos]");
    const blocos = post.content;
    alvo.innerHTML = blocos.length
      ? blocos.map((bloco, indice) => blocoHtml(bloco, { indice, total: blocos.length }) + (indice < blocos.length - 1 ? insercaoHtml(bloco.id) : "")).join("")
      : `<div class="mesa-comecar"><p>Escolha o primeiro bloco do texto:</p>${menuDeBlocosHtml()}</div>`;
    $("[data-editor-adicionar]").parentElement.hidden = !blocos.length;
    marcarSelecao();
    crescerTodos(alvo);
  }

  function desenharFolha() {
    desenharCapa();
    desenharCategoria();
    const titulo = $('[data-editor-campo="title"]');
    const subtitulo = $('[data-editor-campo="subtitle"]');
    titulo.value = post.title || "";
    subtitulo.value = post.subtitle || "";
    desenharBlocos();
    desenharPalavras();
    requestAnimationFrame(() => { crescer(titulo); crescer(subtitulo); crescerTodos($("[data-editor-blocos]")); });
  }

  const elementoDoBloco = (id) => folha.querySelector(`[data-bloco-id="${CSS.escape(id)}"]`);

  function marcarSelecao() {
    for (const bloco of folha.querySelectorAll("[data-bloco-id]")) bloco.classList.toggle("is-selecionado", bloco.dataset.blocoId === selecionado);
  }

  function selecionar(id) {
    if (selecionado === id) return;
    selecionado = id;
    marcarSelecao();
  }

  function focarBloco(id, { fim = false, inicio = false } = {}) {
    const bloco = elementoDoBloco(id);
    if (!bloco) return;
    selecionar(id);
    const campo = bloco.querySelector(".mesa-bloco__corpo [data-bloco-campo]")
      || bloco.querySelector(".mesa-bloco__opcoes input, .mesa-bloco__opcoes select, .mesa-bloco__corpo button, .mesa-bloco__opcoes button");
    campo?.focus();
    if (campo?.setSelectionRange && (fim || inicio)) {
      const posicao = fim ? campo.value.length : 0;
      campo.setSelectionRange(posicao, posicao);
    }
  }

  function redesenharCorpo(id) {
    const bloco = post.content.find((item) => item.id === id);
    const alvo = elementoDoBloco(id)?.querySelector(".mesa-bloco__corpo");
    if (!bloco || !alvo) return;
    alvo.innerHTML = corpoHtml(bloco);
    crescerTodos(alvo);
  }

  function redesenharBloco(id) {
    const indice = post.content.findIndex((item) => item.id === id);
    const alvo = elementoDoBloco(id);
    if (indice < 0 || !alvo) return;
    alvo.outerHTML = blocoHtml(post.content[indice], { indice, total: post.content.length });
    marcarSelecao();
    crescerTodos(elementoDoBloco(id));
  }

  function editarBloco(id, campo, valor) {
    post.content = post.content.map((bloco) => (bloco.id === id ? aplicarCampo(bloco, campo, valor) : bloco));
    mudou();
  }

  function inserirBloco(tipo, depoisDe = "", extra = {}) {
    const bloco = { ...blocoNovo(tipo), ...extra };
    const posicao = depoisDe ? post.content.findIndex((item) => item.id === depoisDe) + 1 : post.content.length;
    post.content = [...post.content.slice(0, posicao), bloco, ...post.content.slice(posicao)];
    selecionado = bloco.id;
    desenharBlocos();
    mudou();
    return bloco;
  }

  function abrirMenuDeBlocos(botao, depoisDe) {
    ctx.menu.abrir(botao, TIPOS_DE_BLOCO.map((tipo) => ({ id: tipo.tipo, rotulo: tipo.rotulo, icone: tipo.icone })), (tipo) => novoBloco(tipo, depoisDe));
  }

  async function novoBloco(tipo, depoisDe) {
    const bloco = inserirBloco(tipo, depoisDe);
    if (tipo === "image") await acaoDeBloco("escolher-imagem", bloco.id);
    else if (tipo === "gallery") await acaoDeBloco("adicionar-a-galeria", bloco.id);
    else focarBloco(bloco.id);
  }

  function moverBloco(id, direcao) {
    const antes = post.content.findIndex((item) => item.id === id);
    post = moveContentBlock(post, id, direcao);
    if (post.content.findIndex((item) => item.id === id) === antes) return false;
    desenharBlocos();
    mudou();
    return true;
  }

  function moverPara(id, alvo) {
    if (!alvo || alvo.id === id) return;
    const bloco = post.content.find((item) => item.id === id);
    const resto = post.content.filter((item) => item.id !== id);
    const posicao = resto.findIndex((item) => item.id === alvo.id) + (alvo.depois ? 1 : 0);
    post.content = [...resto.slice(0, posicao), bloco, ...resto.slice(posicao)];
    selecionado = id;
    desenharBlocos();
    mudou();
  }

  async function acaoDeBloco(acao, id, botao) {
    const bloco = post.content.find((item) => item.id === id);
    if (!bloco) return;
    if (acao === "subir" || acao === "descer") {
      if (moverBloco(id, acao === "subir" ? -1 : 1)) {
        const mesmoBotao = elementoDoBloco(id)?.querySelector(`[data-bloco-acao="${acao}"]:not([disabled])`);
        (mesmoBotao || elementoDoBloco(id)?.querySelector(".mesa-bloco__corpo [data-bloco-campo]"))?.focus();
      }
      return;
    }
    if (acao === "duplicar") {
      const indice = post.content.findIndex((item) => item.id === id);
      const copia = duplicarBloco(bloco);
      post.content = [...post.content.slice(0, indice + 1), copia, ...post.content.slice(indice + 1)];
      selecionado = copia.id;
      desenharBlocos();
      focarBloco(copia.id);
      mudou();
      ctx.avisos.mostrar("Bloco duplicado.");
      return;
    }
    if (acao === "remover") {
      const antes = clone(post.content);
      const indice = antes.findIndex((item) => item.id === id);
      post = removeContentBlock(post, id);
      selecionado = "";
      desenharBlocos();
      mudou();
      const vizinho = post.content[Math.max(0, indice - 1)];
      if (vizinho) focarBloco(vizinho.id, { fim: true });
      else $('[data-editor-campo="subtitle"]').focus();
      ctx.avisos.mostrar("Bloco removido.", { acao: { rotulo: "Desfazer", executar: () => { post.content = antes; selecionado = id; desenharBlocos(); focarBloco(id); mudou(); } } });
      return;
    }
    if (acao === "escolher-imagem") {
      const escolha_ = await ctx.biblioteca.escolher({ titulo: "Imagem do bloco", atual: bloco.src });
      if (escolha_?.[0]) {
        editarBloco(id, "src", escolha_[0]);
        redesenharBloco(id);
        elementoDoBloco(id)?.querySelector('[data-bloco-campo="caption"]')?.focus();
      } else {
        (botao || elementoDoBloco(id)?.querySelector('[data-bloco-acao="escolher-imagem"]'))?.focus();
      }
      return;
    }
    if (acao === "adicionar-a-galeria") {
      const urls = await ctx.biblioteca.escolher({ titulo: "Fotos da galeria", varias: true });
      if (!urls?.length) return;
      const imagens = [...(bloco.images || []), ...urls.map((src) => ({ src, alt: "" }))];
      if (imagens.length > 12) ctx.avisos.mostrar("Uma galeria leva até 12 fotos: as demais ficaram de fora.", { tipo: "info" });
      editarBloco(id, "images", imagens.slice(0, 12));
      redesenharBloco(id);
      return;
    }
    if (acao === "remover-da-galeria") {
      const indice = Number(botao?.dataset.indice);
      editarBloco(id, "images", (bloco.images || []).filter((_, posicao) => posicao !== indice));
      redesenharBloco(id);
    }
  }

  function formatarBloco(id, formato) {
    const campo = elementoDoBloco(id)?.querySelector(".mesa-bloco__corpo textarea[data-bloco-campo]");
    if (!campo) return;
    const resultado = formatarSelecao(campo.value, campo.selectionStart ?? campo.value.length, campo.selectionEnd ?? campo.value.length, formato);
    campo.value = resultado.texto;
    crescer(campo);
    campo.focus();
    campo.setSelectionRange(resultado.inicio, resultado.fim);
    editarBloco(id, campo.dataset.blocoCampo, resultado.texto);
  }

  async function acaoDaCapa(acao) {
    if (acao === "trocar") {
      const escolha_ = await ctx.biblioteca.escolher({ titulo: "Imagem de capa", atual: post.cover });
      if (!escolha_?.[0]) return;
      post.cover = escolha_[0];
      desenharCapa();
      mudou();
      $('[data-editor-campo="coverAlt"]')?.focus();
      return;
    }
    const anterior = { cover: post.cover, coverAlt: post.coverAlt };
    post.cover = "";
    desenharCapa();
    mudou();
    $("[data-capa-acao]")?.focus();
    ctx.avisos.mostrar("Capa removida.", { acao: { rotulo: "Desfazer", executar: () => { Object.assign(post, anterior); desenharCapa(); mudou(); } } });
  }

  /* ---------------- campos do texto (folha e painel) ---------------- */

  function atualizarContador(campo, valor) {
    const limite = LIMITES[campo];
    const alvo = root.querySelector(`[data-conta="${campo}"]`);
    if (!limite || !alvo) return;
    alvo.textContent = `${valor.length}/${limite}`;
    alvo.classList.toggle("is-longo", valor.length > limite);
  }

  function lerCampo(campo, alvo) {
    const valor = alvo.type === "checkbox" ? alvo.checked : alvo.value;
    if (campo.startsWith("seo.")) post.seo = { ...(post.seo || {}), [campo.slice(4)]: valor };
    else post[campo] = valor;
    if (campo === "title") {
      $("[data-editor-nome]").textContent = valor.trim() || "Texto sem título";
      document.title = `${valor.trim() || "Novo post"} — Mesa do Caderno`;
      if (slugAutomatico) {
        post.slug = enderecoLivre(valor || "novo-texto", ctx.loja.registros, post.id);
        const endereco = corpoDoPainel.querySelector('[data-editor-campo="slug"]');
        if (endereco) endereco.value = post.slug;
      }
    }
    if (campo === "slug") slugAutomatico = false;
    if (campo === "category") desenharCategoria();
    if (typeof valor === "string") atualizarContador(campo, valor);
    if (aba === "seo") desenharGoogle();
    mudou();
  }

  /* ---------------- o painel ---------------- */

  function abrirPainel(novaAba = aba) {
    painelAberto = true;
    casca.dataset.painel = "aberto";
    $("[data-editor-alternar-painel]").setAttribute("aria-expanded", "true");
    if (!globalThis.matchMedia?.("(max-width: 1100px)").matches) gravarPreferencia("mesa.painel", "aberto");
    if (novaAba !== aba) { aba = novaAba; gravarPreferencia("mesa.aba", aba); }
    desenharPainel();
  }

  function fecharPainel() {
    painelAberto = false;
    casca.dataset.painel = "fechado";
    $("[data-editor-alternar-painel]").setAttribute("aria-expanded", "false");
    if (!globalThis.matchMedia?.("(max-width: 1100px)").matches) gravarPreferencia("mesa.painel", "fechado");
    $("[data-editor-alternar-painel]").focus();
  }

  const campoDoPainel = (rotulo, conteudo, { conta = "", dica = "" } = {}) => `<div class="mesa-campo"><span class="mesa-campo__rotulo">${rotulo}${conta ? `<small data-conta="${conta}"></small>` : ""}</span>${conteudo}${dica ? `<small class="mesa-dica">${dica}</small>` : ""}</div>`;

  function publicacaoHtml() {
    const status = registro?.status || "draft";
    const etapas = [["draft", "Rascunho"], ["review", "Revisão"], status === "published" ? ["published", "Publicado"] : ["scheduled", "Agendado"]];
    const atual = status === "archived" ? -1 : etapas.findIndex(([valor]) => valor === status);
    const escolhaVisivel = ["draft", "review"].includes(status);
    const mostraAgenda = status === "scheduled" || (escolhaVisivel && escolha === "agendar");
    const autores = autoresDe(ctx.loja.registros);
    return `<section class="mesa-painel__secao">
        <h3 class="mesa-rotulo">Estado</h3>
        ${status === "archived"
          ? `<p class="mesa-frase">${chipDeStatus("archived")} ${esc(fraseDoStatus(registro))}</p>`
          : `<ol class="mesa-etapas">${etapas.map(([, rotulo], indice) => `<li class="${indice < atual ? "is-feita" : indice === atual ? "is-atual" : ""}"${indice === atual ? ' aria-current="step"' : ""}><span aria-hidden="true"></span>${rotulo}</li>`).join("")}</ol>
             ${mostraAgenda ? "" : `<p class="mesa-frase">${esc(fraseDoStatus(registro))}</p>`}`}
        ${registro?.pendente ? `<div class="mesa-aviso-fixo">${i("history")}<p>Há alterações salvas que ainda não estão no ar. <strong>Atualizar</strong> publica essas alterações.</p><button type="button" class="mesa-link" data-editor-acao="descartar">Descartar alterações</button></div>` : ""}
      </section>
      ${escolhaVisivel ? `<section class="mesa-painel__secao">
        <div class="mesa-escolhas" role="radiogroup" aria-label="Quando publicar">
          <button type="button" role="radio" aria-checked="${escolha === "agora"}" data-escolha="agora">${i("send")}<span><strong>Publicar agora</strong><small>O texto entra no Blog assim que você publicar.</small></span></button>
          <button type="button" role="radio" aria-checked="${escolha === "agendar"}" data-escolha="agendar">${i("calendar-clock")}<span><strong>Agendar</strong><small>Escolha o dia e a hora: o texto entra sozinho.</small></span></button>
        </div>
      </section>` : ""}
      ${mostraAgenda ? `<section class="mesa-painel__secao">
        <div class="mesa-par">
          <label class="mesa-campo"><span class="mesa-campo__rotulo">Data</span><input type="date" data-agenda="dia" value="${esc(agenda.dia)}" min="${hojeNoInstituto()}"></label>
          <label class="mesa-campo"><span class="mesa-campo__rotulo">Hora</span><input type="time" data-agenda="hora" value="${esc(agenda.hora)}" step="300"></label>
        </div>
        <p class="mesa-frase mesa-frase--ouro" data-agenda-frase aria-live="polite">${esc(fraseDoAgendamento(instanteDe(agenda.dia, agenda.hora)))}</p>
        <p class="mesa-dica">Horário de Brasília.</p>
      </section>` : ""}
      <section class="mesa-painel__secao mesa-painel__acoes">
        ${status === "draft" ? `<button type="button" class="mesa-botao mesa-botao--contorno" data-editor-acao="revisao">${i("eye")}Enviar para revisão</button>` : ""}
        ${status === "review" ? `<button type="button" class="mesa-botao mesa-botao--contorno" data-editor-acao="despublicar">${i("undo-2")}Voltar a rascunho</button>` : ""}
        ${status === "scheduled" ? `<button type="button" class="mesa-botao mesa-botao--contorno" data-editor-acao="publicar">${i("send")}Publicar agora</button><button type="button" class="mesa-botao mesa-botao--fantasma" data-editor-acao="despublicar">${i("undo-2")}Cancelar agendamento</button>` : ""}
        ${status === "published" ? `<a class="mesa-botao mesa-botao--contorno" href="artigo.html?post=${encodeURIComponent(registro.post.slug)}" target="_blank" rel="noopener">${i("external-link")}Ver no Blog</a><button type="button" class="mesa-botao mesa-botao--fantasma" data-editor-acao="despublicar">${i("undo-2")}Despublicar</button>` : ""}
      </section>
      <section class="mesa-painel__secao">
        ${campoDoPainel("Endereço do texto", `<div class="mesa-endereco"><span>artigo.html?post=</span><input data-editor-campo="slug" value="${esc(post.slug)}" spellcheck="false" aria-label="Endereço do texto"></div>`,
          { dica: status === "published" ? "Mudar o endereço de um texto publicado quebra os links que já circulam." : "Criado a partir do título. Só letras, números e hífens." })}
        ${campoDoPainel("Escrito por", `<input data-editor-campo="author" value="${esc(post.author)}" list="mesa-autores" maxlength="80" aria-label="Escrito por"><datalist id="mesa-autores">${autores.map((nome) => `<option value="${esc(nome)}">`).join("")}</datalist>`)}
        <label class="mesa-marcar"><input type="checkbox" data-editor-campo="featured" ${post.featured ? "checked" : ""}><span><strong>Artigo principal do Blog</strong><small>Aparece em destaque no topo. Só um texto por vez.</small></span></label>
      </section>`;
  }

  function detalhesHtml() {
    const categorias = ctx.loja.categorias;
    const conhecida = categorias.some(({ id }) => id === post.category);
    const publicados = ctx.loja.registros.filter((item) => item.status === "published" && item.id !== post.id);
    const relacionados = (post.relatedPostIds || []).map((id) => publicados.find((item) => item.id === id)).filter(Boolean);
    const portal = post.relatedPortal || [];
    return `<section class="mesa-painel__secao">
        ${campoDoPainel("Resumo", `<textarea data-editor-campo="excerpt" rows="4" maxlength="300" placeholder="Duas ou três linhas que aparecem nos cartões do Blog" aria-label="Resumo">${esc(post.excerpt)}</textarea>`, { conta: "excerpt" })}
        <div class="mesa-campo"><span class="mesa-campo__rotulo">Categoria</span>
          <div class="mesa-linha">
            <select data-editor-campo="category" aria-label="Categoria">${conhecida ? "" : `<option value="${esc(post.category)}" selected>${esc(ctx.rotuloDaCategoria(post.category))} (fora do menu)</option>`}${categorias.map((item) => `<option value="${esc(item.id)}" ${item.id === post.category ? "selected" : ""}>${esc(item.rotulo)}</option>`).join("")}</select>
            <button type="button" class="mesa-botao mesa-botao--fantasma mesa-botao--pequeno" data-editor-nova-categoria>${i("plus")}Nova</button>
          </div>
          <form class="mesa-linha" data-editor-categoria-form hidden>
            <input name="rotulo" maxlength="40" placeholder="Nome da nova categoria" aria-label="Nome da nova categoria" required>
            <button type="submit" class="mesa-botao mesa-botao--contorno mesa-botao--pequeno">Criar</button>
          </form>
        </div>
        <div class="mesa-campo"><span class="mesa-campo__rotulo">Etiquetas</span>
          <div class="mesa-etiquetas">${(post.tags || []).map((tag) => `<span class="mesa-etiqueta">${esc(tag)}<button type="button" data-etiqueta-tirar="${esc(tag)}" aria-label="Tirar a etiqueta ${esc(tag)}">${i("x")}</button></span>`).join("")}
            <input data-editor-etiqueta list="mesa-etiquetas-conhecidas" placeholder="${(post.tags || []).length ? "Mais uma…" : "Adicionar etiqueta"}" aria-label="Adicionar etiqueta" maxlength="40">
            <datalist id="mesa-etiquetas-conhecidas">${tagsDe(ctx.loja.registros).map((tag) => `<option value="${esc(tag)}">`).join("")}</datalist>
          </div>
          <small class="mesa-dica">Enter ou vírgula para adicionar. Ajudam a busca da mesa.</small>
        </div>
      </section>
      <section class="mesa-painel__secao">
        <h3 class="mesa-rotulo">Conteúdo relacionado</h3>
        <div class="mesa-campo"><span class="mesa-campo__rotulo">Leia também</span>
          <ul class="mesa-relacionados">${relacionados.map((item) => `<li>${i("file-text")}<span>${esc(item.post.title)}</span><button type="button" class="mesa-botao-icone" data-relacionado-tirar="${esc(item.id)}" aria-label="Tirar ${esc(item.post.title)}">${i("x")}</button></li>`).join("")}</ul>
          ${relacionados.length < 3 ? `<select data-editor-relacionado aria-label="Escolher um texto para indicar"><option value="">Escolher um texto…</option>${publicados.filter((item) => !(post.relatedPostIds || []).includes(item.id)).map((item) => `<option value="${esc(item.id)}">${esc(item.post.title)}</option>`).join("")}</select>` : ""}
          <small class="mesa-dica">Sem escolha, o artigo mostra textos da mesma categoria.</small>
        </div>
        <div class="mesa-campo"><span class="mesa-campo__rotulo">Também no Portal</span>
          <ul class="mesa-relacionados">${portal.map((item) => `<li>${i("link")}<span>${esc(item.titulo)}</span><button type="button" class="mesa-botao-icone" data-portal-tirar="${esc(item.href)}" aria-label="Tirar ${esc(item.titulo)}">${i("x")}</button></li>`).join("")}</ul>
          ${portal.length < 3 ? `<select data-editor-portal aria-label="Escolher uma seção do Portal"><option value="">Escolher uma seção…</option>${SECOES_DO_PORTAL.filter((secao) => !portal.some((item) => item.href === secao.href)).map((secao) => `<option value="${esc(secao.href)}">${esc(secao.titulo)}</option>`).join("")}</select>` : ""}
        </div>
      </section>
      <section class="mesa-painel__secao">
        <h3 class="mesa-rotulo">Histórico</h3>
        <div data-editor-historico></div>
      </section>`;
  }

  function googleHtml() {
    const titulo = String(post.seo?.title || post.title || "Título do texto");
    const texto = String(post.seo?.description || post.excerpt || "O resumo do texto aparece aqui.");
    const host = globalThis.location?.host || "wind-theme.vercel.app";
    return `<p class="mesa-google__endereco">${esc(host)} › artigo › ${esc(post.slug)}</p><p class="mesa-google__titulo">${esc(cortar(titulo, 60))}</p><p class="mesa-google__texto">${esc(cortar(texto, 160))}</p>`;
  }

  function seoHtml() {
    const imagem = post.seo?.image || post.cover;
    return `<section class="mesa-painel__secao">
        <h3 class="mesa-rotulo">Como aparece no Google</h3>
        <div class="mesa-google" data-editor-google>${googleHtml()}</div>
      </section>
      <section class="mesa-painel__secao">
        ${campoDoPainel("Título para buscadores", `<input data-editor-campo="seo.title" value="${esc(post.seo?.title || "")}" maxlength="70" placeholder="${esc(post.title || "Igual ao título")}" aria-label="Título para buscadores">`, { conta: "seo.title", dica: "Vazio, usa o título do texto." })}
        ${campoDoPainel("Descrição", `<textarea data-editor-campo="seo.description" rows="3" maxlength="170" placeholder="${esc(post.excerpt || "Igual ao resumo")}" aria-label="Descrição para buscadores">${esc(post.seo?.description || "")}</textarea>`, { conta: "seo.description", dica: "Vazia, usa o resumo." })}
        <div class="mesa-campo"><span class="mesa-campo__rotulo">Imagem ao compartilhar</span>
          ${imagem ? `<img class="mesa-seo__imagem" src="${esc(imagem)}" alt="">` : '<p class="mesa-dica">Sem imagem: escolha uma capa ou uma imagem própria.</p>'}
          <div class="mesa-linha">
            <button type="button" class="mesa-botao mesa-botao--contorno mesa-botao--pequeno" data-seo-imagem="trocar">${i("image")}Escolher outra</button>
            ${post.seo?.image ? `<button type="button" class="mesa-botao mesa-botao--fantasma mesa-botao--pequeno" data-seo-imagem="capa">Usar a capa</button>` : ""}
          </div>
        </div>
      </section>`;
  }

  function desenharGoogle() {
    const alvo = corpoDoPainel.querySelector("[data-editor-google]");
    if (alvo) alvo.innerHTML = googleHtml();
  }

  function desenharRodape() {
    const status = registro?.status || "draft";
    const secundaria = !registro ? "" : status === "archived"
      ? `<button type="button" class="mesa-link is-perigo" data-editor-acao="excluir">${i("trash-2")}Excluir texto</button>`
      : nuncaPublicado() && status === "draft"
        ? `<button type="button" class="mesa-link is-perigo" data-editor-acao="excluir">${i("trash-2")}Excluir rascunho</button>`
        : `<button type="button" class="mesa-link is-perigo" data-editor-acao="arquivar">${i("archive")}Arquivar post</button>`;
    rodapeDoPainel.innerHTML = `${secundaria}<button type="button" class="mesa-botao mesa-botao--principal" data-editor-principal></button>`;
    desenharBotoes();
  }

  function desenharPainel({ manterFoco = false } = {}) {
    const focado = manterFoco && corpoDoPainel.contains(document.activeElement) ? document.activeElement : null;
    if (focado && focado.matches("input, textarea, select")) {
      /* Não redesenhar por baixo de quem está digitando: só o que depende do status. */
      desenharRodape();
      return;
    }
    for (const botao of painel.querySelectorAll("[data-editor-aba]")) {
      botao.setAttribute("aria-selected", String(botao.dataset.editorAba === aba));
      botao.tabIndex = botao.dataset.editorAba === aba ? 0 : -1;
    }
    corpoDoPainel.setAttribute("aria-labelledby", `mesa-aba-${aba}`);
    corpoDoPainel.innerHTML = aba === "detalhes" ? detalhesHtml() : aba === "seo" ? seoHtml() : publicacaoHtml();
    for (const campo of Object.keys(LIMITES)) {
      const valor = campo.startsWith("seo.") ? post.seo?.[campo.slice(4)] : post[campo];
      atualizarContador(campo, String(valor || ""));
    }
    crescerTodos(corpoDoPainel);
    desenharRodape();
    if (aba === "detalhes") carregarHistorico();
  }

  async function carregarHistorico() {
    const alvo = corpoDoPainel.querySelector("[data-editor-historico]");
    if (!alvo) return;
    if (!registro) { alvo.innerHTML = '<p class="mesa-dica">O histórico começa quando o texto for salvo.</p>'; return; }
    if (historico === null) {
      alvo.innerHTML = `<p class="mesa-dica">${i("loader-circle", "mesa-icone is-girando")} Carregando…</p>`;
      const id = registro.id;
      try {
        const versoes = await ctx.repositorio.versoes(id);
        if (registro?.id !== id) return;
        historico = versoes;
      } catch (erro) {
        alvo.innerHTML = `<p class="mesa-dica is-erro" role="alert">${esc(erro.message)} <button type="button" class="mesa-link" data-historico-repetir>Tentar de novo</button></p>`;
        return;
      }
    }
    const destinoAtual = corpoDoPainel.querySelector("[data-editor-historico]");
    if (!destinoAtual) return;
    destinoAtual.innerHTML = historico.length
      ? `<ol class="mesa-versoes">${historico.map((versao) => `<li>
          <p><strong>${esc(ACAO_DO_HISTORICO[versao.acao] || "Salvou")}</strong> · ${esc(versao.autor || "Equipe")}</p>
          <small>${esc(tempoRelativo(versao.em))}${versao.resumo ? ` — ${esc(versao.resumo)}` : ""}</small>
          <button type="button" class="mesa-link" data-versao-restaurar="${esc(versao.id)}">Trazer esta versão</button></li>`).join("")}</ol>`
      : '<p class="mesa-dica">Nenhuma versão guardada ainda. Cada publicação e cada Ctrl+S ficam aqui.</p>';
  }

  async function restaurarVersao(id) {
    const versao = historico?.find((item) => String(item.id) === String(id));
    if (!versao) return;
    const ok = await ctx.confirmar({ titulo: "Trazer esta versão?", texto: "O editor passa a mostrar o texto desta versão. O que está no editor agora fica guardado no histórico.", confirmar: "Trazer versão" });
    if (!ok) return;
    await salvar({ registrar: true, silencioso: true });
    const antes = clone(post);
    post = { ...clone(versao.documento), id: post.id, slug: post.slug, featured: post.featured };
    desenharFolha();
    desenharPainel();
    mudou();
    ctx.avisos.mostrar("Versão trazida para o editor.", { acao: { rotulo: "Desfazer", executar: () => { post = antes; desenharFolha(); desenharPainel(); mudou(); } } });
  }

  function adicionarEtiqueta(campo) {
    const novas = campo.value.split(",").map((tag) => tag.trim().toLocaleLowerCase("pt-BR")).filter(Boolean);
    campo.value = "";
    if (!novas.length) return;
    const tags = [...new Set([...(post.tags || []), ...novas])];
    if (tags.length > 12) ctx.avisos.mostrar("Até 12 etiquetas por texto.", { tipo: "info" });
    post.tags = tags.slice(0, 12);
    desenharPainel();
    corpoDoPainel.querySelector("[data-editor-etiqueta]")?.focus();
    mudou();
  }

  /* ---------------- prévia ---------------- */

  function dadosDaPrevia() {
    const rascunho = { ...paraGravar(), status: "published" };
    return { posts: mergeDraftPosts(ctx.loja.registros.map(textoAtual), rascunho), slug: rascunho.slug };
  }

  function enviarPrevia(janela) {
    if (!janela || !post) return;
    const { posts, slug } = dadosDaPrevia();
    postPreview(janela, posts, slug, globalThis.location.origin);
  }

  function abrirPrevia() {
    previa.hidden = false;
    casca.classList.add("tem-previa");
    quadro.src = `artigo.html?preview=1&post=${encodeURIComponent(post.slug)}`;
    previa.querySelector("[data-previa-fechar]").focus();
  }

  function fecharPrevia() {
    previa.hidden = true;
    casca.classList.remove("tem-previa");
    quadro.src = "about:blank";
    $("[data-editor-previa]").focus();
  }

  function previaEmNovaAba() {
    ctx.definirPrevia(dadosDaPrevia);
    globalThis.open(`artigo.html?preview=1&post=${encodeURIComponent(post.slug)}`, "_blank");
  }

  quadro.addEventListener("load", () => { if (!previa.hidden) enviarPrevia(quadro.contentWindow); });
  previa.addEventListener("click", (evento) => {
    if (evento.target.closest("[data-previa-fechar]")) { fecharPrevia(); return; }
    if (evento.target.closest("[data-previa-nova-aba]")) { previaEmNovaAba(); return; }
    const aparelho = evento.target.closest("[data-previa-aparelho]");
    if (aparelho) {
      $("[data-previa-moldura]").dataset.aparelho = aparelho.dataset.previaAparelho;
      for (const botao of previa.querySelectorAll("[data-previa-aparelho]")) botao.setAttribute("aria-pressed", String(botao === aparelho));
    }
  });
  previa.addEventListener("keydown", (evento) => { if (evento.key === "Escape") { evento.stopPropagation(); fecharPrevia(); } });

  /* ---------------- eventos da folha ---------------- */

  folha.addEventListener("focusin", (evento) => {
    const bloco = evento.target.closest("[data-bloco-id]");
    if (bloco) selecionar(bloco.dataset.blocoId);
    else if (evento.target.closest("[data-editor-campo], [data-editor-capa]")) selecionar("");
  });

  folha.addEventListener("input", (evento) => {
    const alvo = evento.target;
    if (alvo.matches("textarea")) crescer(alvo);
    const campo = alvo.dataset.editorCampo;
    if (campo) { lerCampo(campo, alvo); return; }
    const campoDoBloco = alvo.dataset.blocoCampo;
    if (!campoDoBloco) return;
    const id = alvo.closest("[data-bloco-id]").dataset.blocoId;
    editarBloco(id, campoDoBloco, alvo.type === "checkbox" ? alvo.checked : alvo.value);
    if (alvo.closest(".mesa-bloco__opcoes")) redesenharCorpo(id);
  });

  folha.addEventListener("click", async (evento) => {
    const alvo = evento.target;
    const blocoEl = alvo.closest("[data-bloco-id]");
    if (blocoEl) selecionar(blocoEl.dataset.blocoId);
    const acao = alvo.closest("[data-bloco-acao]");
    if (acao && blocoEl) { if (acao.dataset.blocoAcao !== "arrastar") await acaoDeBloco(acao.dataset.blocoAcao, blocoEl.dataset.blocoId, acao); return; }
    const formatar = alvo.closest("[data-bloco-formatar]");
    if (formatar && blocoEl) { formatarBloco(blocoEl.dataset.blocoId, formatar.dataset.blocoFormatar); return; }
    const inserir = alvo.closest("[data-inserir-apos]");
    if (inserir) { abrirMenuDeBlocos(inserir, inserir.dataset.inserirApos); return; }
    const adicionar = alvo.closest("[data-editor-adicionar]");
    if (adicionar) { abrirMenuDeBlocos(adicionar, post.content.at(-1)?.id || ""); return; }
    const novo = alvo.closest("[data-novo-bloco]");
    if (novo) { await novoBloco(novo.dataset.novoBloco, post.content.at(-1)?.id || ""); return; }
    const capa = alvo.closest("[data-capa-acao]");
    if (capa) { await acaoDaCapa(capa.dataset.capaAcao); return; }
    if (alvo.closest("[data-editor-categoria]")) {
      abrirPainel("detalhes");
      corpoDoPainel.querySelector('[data-editor-campo="category"]')?.focus();
    }
  });

  folha.addEventListener("keydown", (evento) => {
    const alvo = evento.target;
    const blocoEl = alvo.closest?.("[data-bloco-id]");
    const modificador = evento.ctrlKey || evento.metaKey;
    if (blocoEl && evento.altKey && (evento.key === "ArrowUp" || evento.key === "ArrowDown")) {
      evento.preventDefault();
      const id = blocoEl.dataset.blocoId;
      if (moverBloco(id, evento.key === "ArrowUp" ? -1 : 1)) focarBloco(id);
      return;
    }
    if (evento.key === "Escape" && selecionado && !ctx.menuAberto?.()) { selecionar(""); return; }
    if (alvo.dataset?.editorCampo === "title" && evento.key === "Enter") { evento.preventDefault(); $('[data-editor-campo="subtitle"]').focus(); return; }
    if (alvo.dataset?.editorCampo === "subtitle" && evento.key === "Enter") {
      evento.preventDefault();
      if (post.content[0]) focarBloco(post.content[0].id, { inicio: true });
      else novoBloco("paragraph", "");
      return;
    }
    if (!blocoEl || !alvo.matches(".mesa-bloco__corpo textarea")) return;
    const id = blocoEl.dataset.blocoId;
    const bloco = post.content.find((item) => item.id === id);
    if (modificador && (evento.key === "b" || evento.key === "i")) {
      evento.preventDefault();
      formatarBloco(id, evento.key === "b" ? "negrito" : "italico");
      return;
    }
    if (evento.key === "Enter" && !evento.shiftKey && !modificador && ["paragraph", "heading"].includes(bloco.type)) {
      evento.preventDefault();
      const antes = alvo.value.slice(0, alvo.selectionStart);
      const depois = alvo.value.slice(alvo.selectionEnd);
      alvo.value = antes;
      crescer(alvo);
      editarBloco(id, "text", antes);
      const novo = inserirBloco("paragraph", id, { text: depois });
      focarBloco(novo.id, { inicio: true });
      return;
    }
    if (evento.key === "Backspace" && bloco.type === "paragraph" && !alvo.value) {
      evento.preventDefault();
      const indice = post.content.findIndex((item) => item.id === id);
      post = removeContentBlock(post, id);
      selecionado = "";
      desenharBlocos();
      mudou();
      const anterior = post.content[indice - 1];
      if (anterior) focarBloco(anterior.id, { fim: true });
      else $('[data-editor-campo="subtitle"]').focus();
    }
  });

  /* Arrastar blocos para reordenar e soltar fotos para enviar. */
  const limparAlvo = () => folha.querySelectorAll(".is-alvo-antes, .is-alvo-depois").forEach((item) => item.classList.remove("is-alvo-antes", "is-alvo-depois"));
  function fimDoArraste() {
    arrastando = "";
    destino = null;
    limparAlvo();
    area.classList.remove("is-soltando");
    folha.querySelectorAll(".is-arrastando").forEach((item) => item.classList.remove("is-arrastando"));
  }

  area.addEventListener("dragstart", (evento) => {
    const alca = evento.target.closest?.(".mesa-bloco__alca");
    if (!alca) return;
    const bloco = alca.closest("[data-bloco-id]");
    arrastando = bloco.dataset.blocoId;
    evento.dataTransfer.effectAllowed = "move";
    evento.dataTransfer.setData("text/plain", arrastando);
    try { evento.dataTransfer.setDragImage(bloco, 24, 24); } catch { /* o navegador usa a alça */ }
    bloco.classList.add("is-arrastando");
  });
  area.addEventListener("dragover", (evento) => {
    if (arrastando) {
      const alvo = evento.target.closest?.("[data-bloco-id]");
      limparAlvo();
      evento.preventDefault();
      if (!alvo || alvo.dataset.blocoId === arrastando) { destino = null; return; }
      const caixa = alvo.getBoundingClientRect();
      const depois = evento.clientY > caixa.top + caixa.height / 2;
      alvo.classList.add(depois ? "is-alvo-depois" : "is-alvo-antes");
      destino = { id: alvo.dataset.blocoId, depois };
      return;
    }
    if ([...(evento.dataTransfer?.types || [])].includes("Files")) {
      evento.preventDefault();
      area.classList.add("is-soltando");
    }
  });
  area.addEventListener("dragleave", (evento) => {
    if (!area.contains(evento.relatedTarget)) { area.classList.remove("is-soltando"); limparAlvo(); }
  });
  area.addEventListener("dragend", fimDoArraste);
  area.addEventListener("drop", async (evento) => {
    if (arrastando) {
      evento.preventDefault();
      const id = arrastando;
      const alvo = destino;
      fimDoArraste();
      moverPara(id, alvo);
      return;
    }
    const arquivos = evento.dataTransfer?.files;
    if (!arquivos?.length) return;
    evento.preventDefault();
    area.classList.remove("is-soltando");
    const sobreCapa = Boolean(evento.target.closest?.("[data-editor-capa]"));
    let depoisDe = evento.target.closest?.("[data-bloco-id]")?.dataset.blocoId || selecionado || post.content.at(-1)?.id || "";
    const urls = await ctx.biblioteca.escolher({ titulo: sobreCapa ? "Imagem de capa" : "Enviar imagens", varias: !sobreCapa, arquivos });
    if (!urls?.length) return;
    if (sobreCapa) { post.cover = urls[0]; desenharCapa(); mudou(); return; }
    for (const src of urls) depoisDe = inserirBloco("image", depoisDe, { src }).id;
    focarBloco(depoisDe);
  });

  /* ---------------- eventos do painel e do cabeçalho ---------------- */

  root.addEventListener("click", async (evento) => {
    const alvo = evento.target;
    if (alvo.closest("[data-editor-principal]")) { await mudarStatus(acaoPrincipal().acao); return; }
    if (alvo.closest("[data-editor-previa]")) { abrirPrevia(); return; }
    if (alvo.closest("[data-editor-repetir]")) { await salvar({ registrar: false, silencioso: false }); return; }
    if (alvo.closest("[data-editor-alternar-painel]")) { if (painelAberto) fecharPainel(); else abrirPainel(); return; }
    if (alvo.closest("[data-editor-fechar-painel]")) { fecharPainel(); return; }
    const trocaDeAba = alvo.closest("[data-editor-aba]");
    if (trocaDeAba) { abrirPainel(trocaDeAba.dataset.editorAba); trocaDeAba.focus(); return; }
    if (!painel.contains(alvo)) return;
    const escolhaDe = alvo.closest("[data-escolha]");
    if (escolhaDe) {
      escolha = escolhaDe.dataset.escolha;
      desenharPainel();
      desenharBotoes();
      corpoDoPainel.querySelector(`[data-escolha="${escolha}"]`)?.focus();
      return;
    }
    const acao = alvo.closest("[data-editor-acao]");
    if (acao) {
      const nome = acao.dataset.editorAcao;
      if (nome === "descartar") await descartarAlteracoes();
      else if (nome === "excluir") await excluir();
      else await mudarStatus(nome);
      return;
    }
    if (alvo.closest("[data-editor-nova-categoria]")) {
      const form = corpoDoPainel.querySelector("[data-editor-categoria-form]");
      form.hidden = !form.hidden;
      if (!form.hidden) form.elements.rotulo.focus();
      return;
    }
    const etiqueta = alvo.closest("[data-etiqueta-tirar]");
    if (etiqueta) {
      post.tags = (post.tags || []).filter((tag) => tag !== etiqueta.dataset.etiquetaTirar);
      desenharPainel();
      corpoDoPainel.querySelector("[data-editor-etiqueta]")?.focus();
      mudou();
      return;
    }
    const relacionado = alvo.closest("[data-relacionado-tirar]");
    if (relacionado) { post.relatedPostIds = (post.relatedPostIds || []).filter((id) => id !== relacionado.dataset.relacionadoTirar); desenharPainel(); mudou(); return; }
    const secao = alvo.closest("[data-portal-tirar]");
    if (secao) { post.relatedPortal = (post.relatedPortal || []).filter((item) => item.href !== secao.dataset.portalTirar); desenharPainel(); mudou(); return; }
    const versao = alvo.closest("[data-versao-restaurar]");
    if (versao) { await restaurarVersao(versao.dataset.versaoRestaurar); return; }
    if (alvo.closest("[data-historico-repetir]")) { historico = null; carregarHistorico(); return; }
    const imagemSeo = alvo.closest("[data-seo-imagem]");
    if (imagemSeo) {
      if (imagemSeo.dataset.seoImagem === "capa") post.seo = { ...(post.seo || {}), image: "" };
      else {
        const escolha_ = await ctx.biblioteca.escolher({ titulo: "Imagem ao compartilhar", atual: post.seo?.image || post.cover });
        if (!escolha_?.[0]) return;
        post.seo = { ...(post.seo || {}), image: escolha_[0] };
      }
      desenharPainel();
      mudou();
    }
  });

  painel.addEventListener("input", (evento) => {
    const alvo = evento.target;
    if (alvo.matches("textarea")) crescer(alvo);
    const campo = alvo.dataset.editorCampo;
    if (campo && campo !== "slug") { lerCampo(campo, alvo); return; }
    if (campo === "slug") { slugAutomatico = false; return; }
    const parte = alvo.dataset.agenda;
    if (parte) {
      agenda = { ...agenda, [parte]: alvo.value };
      const frase = corpoDoPainel.querySelector("[data-agenda-frase]");
      if (frase) frase.textContent = fraseDoAgendamento(instanteDe(agenda.dia, agenda.hora));
      if (registro?.status === "scheduled") mudou();
    }
  });

  painel.addEventListener("change", (evento) => {
    const alvo = evento.target;
    if (alvo.dataset.editorCampo === "slug") {
      const pedido = alvo.value;
      post.slug = enderecoLivre(pedido || post.title || "novo-texto", ctx.loja.registros, post.id);
      alvo.value = post.slug;
      if (pedido && post.slug !== pedido.trim()) ctx.avisos.mostrar(`Endereço ajustado para “${post.slug}”.`, { tipo: "info" });
      mudou();
      if (aba === "seo") desenharGoogle();
      return;
    }
    if (alvo.matches("[data-editor-relacionado]") && alvo.value) {
      post.relatedPostIds = [...(post.relatedPostIds || []), alvo.value].slice(0, 3);
      desenharPainel();
      mudou();
      corpoDoPainel.querySelector("[data-editor-relacionado]")?.focus();
      return;
    }
    if (alvo.matches("[data-editor-portal]") && alvo.value) {
      const secao = SECOES_DO_PORTAL.find((item) => item.href === alvo.value);
      post.relatedPortal = [...(post.relatedPortal || []), secao].slice(0, 3);
      desenharPainel();
      mudou();
      corpoDoPainel.querySelector("[data-editor-portal]")?.focus();
    }
  });

  painel.addEventListener("keydown", (evento) => {
    const alvo = evento.target;
    if (alvo.matches("[data-editor-etiqueta]") && (evento.key === "Enter" || evento.key === ",")) {
      evento.preventDefault();
      adicionarEtiqueta(alvo);
      return;
    }
    if (alvo.matches("[data-editor-aba]") && (evento.key === "ArrowRight" || evento.key === "ArrowLeft")) {
      const abas = [...painel.querySelectorAll("[data-editor-aba]")];
      const proxima = abas[(abas.indexOf(alvo) + (evento.key === "ArrowRight" ? 1 : -1) + abas.length) % abas.length];
      abrirPainel(proxima.dataset.editorAba);
      proxima.focus();
    }
    if (evento.key === "Escape" && globalThis.matchMedia?.("(max-width: 1100px)").matches) fecharPainel();
  });
  painel.addEventListener("focusout", (evento) => {
    if (evento.target.matches?.("[data-editor-etiqueta]") && evento.target.value.trim()) adicionarEtiqueta(evento.target);
  });

  painel.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    if (!evento.target.matches("[data-editor-categoria-form]")) return;
    const rotulo = evento.target.elements.rotulo.value.trim();
    if (!rotulo) return;
    try {
      const nova = await ctx.repositorio.criarCategoria({ rotulo, ordem: ctx.loja.categorias.length + 1 });
      ctx.loja.categorias = await ctx.repositorio.listarCategorias();
      ctx.categoriasMudaram();
      post.category = nova.id;
      desenharCategoria();
      desenharPainel();
      mudou();
      ctx.avisos.mostrar(`Categoria “${nova.rotulo}” criada.`);
      corpoDoPainel.querySelector('[data-editor-campo="category"]')?.focus();
    } catch (erro) {
      ctx.avisos.mostrar(erro.message, { tipo: "erro" });
    }
  });

  /* ---------------- abrir um texto ---------------- */

  function carregar(novoRegistro, { agendar = false } = {}) {
    registro = novoRegistro;
    if (registro) post = clone(textoAtual(registro));
    else {
      const novo = createBlankPost();
      post = { ...novo, id: `${novo.id}-${Math.random().toString(36).slice(2, 6)}`, title: "", author: ctx.usuario?.nome || "Instituto Potala", category: ctx.loja.categorias[0]?.id || "reflexao" };
    }
    post.content = post.content || [];
    slugAutomatico = nuncaPublicado() && (!registro || post.slug === enderecoLivre(post.title, ctx.loja.registros, post.id));
    base = registro ? textoAtual(registro) : null;
    salvoComo = versaoComo = assinatura();
    estado = "salvo";
    avisouErro = false;
    ultimoSalvamento = registro ? new Date(registro.atualizadoEm) : null;
    selecionado = "";
    historico = null;
    escolha = agendar || registro?.status === "scheduled" ? "agendar" : "agora";
    agenda = registro?.status === "scheduled" ? partesDoInstante(registro.publicarEm) : sugestaoDeAgenda();
    if (!previa.hidden) fecharPrevia();
    desenharCabecalho();
    desenharFolha();
    if (agendar) abrirPainel("publicacao");
    else desenharPainel();
  }

  return {
    get registro() { return registro; },
    abrir(id, { agendar = false } = {}) {
      const encontrado = id ? ctx.loja.registros.find((item) => item.id === id) : null;
      if (id && !encontrado) return false;
      carregar(encontrado, { agendar });
      if (agendar) corpoDoPainel.querySelector('[data-agenda="dia"]')?.focus();
      else if (!registro) $('[data-editor-campo="title"]').focus();
      else $("[data-editor-nome]").focus({ preventScroll: true });
      area.scrollTop = 0;
      return true;
    },
    temMudancas: () => Boolean(post) && (estado !== "salvo" || Boolean(espera) || Boolean(emVoo)),
    guardar: () => salvar({ automatico: true }),
    salvarAgora: () => salvar({ registrar: true, silencioso: false }),
    /* Antes de sair: grava o que falta e guarda uma versão. Devolve false se não conseguiu. */
    async sair() {
      if (!post) return true;
      if (!previa.hidden) fecharPrevia();
      if (!registro && textoVazio()) return true;
      if (registro && !registro.pendente && estado === "salvo" && assinatura() === versaoComo) return true;
      return salvar({ registrar: true, silencioso: true });
    },
    dadosDaPrevia,
    comandos() {
      if (!post) return [];
      const principal = acaoPrincipal();
      return [
        { grupo: "Este texto", rotulo: "Salvar agora", icone: "check", atalho: "Ctrl S", executar: () => salvar({ registrar: true, silencioso: false }) },
        { grupo: "Este texto", rotulo: "Pré-visualizar", icone: "eye", executar: abrirPrevia },
        !principal.desativado && { grupo: "Este texto", rotulo: principal.rotulo, icone: principal.icone, executar: () => mudarStatus(principal.acao) },
        ["draft", "review"].includes(registro?.status || "draft") && { grupo: "Este texto", rotulo: "Agendar publicação", icone: "calendar-clock", executar: () => { escolha = "agendar"; abrirPainel("publicacao"); desenharBotoes(); corpoDoPainel.querySelector('[data-agenda="dia"]')?.focus(); } },
        { grupo: "Este texto", rotulo: "Trocar a capa", icone: "image", executar: () => acaoDaCapa("trocar") },
        { grupo: "Este texto", rotulo: "Detalhes: resumo, categoria e etiquetas", icone: "tag", executar: () => abrirPainel("detalhes") },
        { grupo: "Este texto", rotulo: "SEO", icone: "search", executar: () => abrirPainel("seo") },
        { grupo: "Este texto", rotulo: "Histórico de versões", icone: "history", executar: () => { abrirPainel("detalhes"); corpoDoPainel.querySelector("[data-editor-historico]")?.scrollIntoView({ block: "center" }); } },
        ...TIPOS_DE_BLOCO.map((tipo) => ({ grupo: "Adicionar bloco", rotulo: `Adicionar ${tipo.rotulo.toLocaleLowerCase("pt-BR")}`, icone: tipo.icone, executar: () => novoBloco(tipo.tipo, selecionado || post.content.at(-1)?.id || "") })),
      ].filter(Boolean);
    },
  };
}
