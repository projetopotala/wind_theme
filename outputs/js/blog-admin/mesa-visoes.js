/*
 * AS TELAS DA MESA: Visão geral, Posts, Comentários e Configurações.
 *
 * Cada tela desenha a partir da "loja" (o que a mesa já leu do banco) e pede
 * as ações ao contexto — editar, publicar, arquivar são as mesmas no menu "⋯"
 * da lista e no editor, e moram num lugar só (mesa-app.js).
 */
import { icone } from "../admin/icones.js";
import { CAPA_PADRAO, capaDoCaderno } from "../blog/blog-settings.js";
import { esc } from "./mesa-ui.js";
import {
  ORDEM_DOS_STATUS, ORDENACOES, PERIODOS, STATUS, autoresDe, contarPorStatus, dataDePublicacao,
  filtrarPosts, horaDe, linhaDoTempo, resumoDaMesa, tempoRelativo, textoAtual,
} from "./mesa-modelo.js";

const numero = new Intl.NumberFormat("pt-BR");
const DIA = new Intl.DateTimeFormat("pt-BR", { day: "numeric", timeZone: "America/Sao_Paulo" });
const MES = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "America/Sao_Paulo" });
const i = (nome) => icone(nome, { classe: "mesa-icone" });
const plural = (quantos, um, varios) => `${numero.format(quantos)} ${quantos === 1 ? um : varios}`;

export const chipDeStatus = (status) => `<span class="mesa-status mesa-status--${esc(status)}">${i(STATUS[status]?.icone || "pencil")}${esc(STATUS[status]?.rotulo || status)}</span>`;

const capinha = (post) => (post.cover
  ? `<img src="${esc(post.cover)}" alt="" loading="lazy" decoding="async">`
  : `<span class="mesa-sem-capa">${i("image")}<small>Sem capa</small></span>`);

const vazio = (icone_, texto, acao = "") => `<div class="mesa-vazio">${i(icone_)}<p>${texto}</p>${acao}</div>`;

/* O que cada status permite no menu "⋯". */
export function itensDoMenu(registro) {
  const { status } = registro;
  const itens = [
    { id: "editar", rotulo: "Editar", icone: "pencil" },
    { id: "visualizar", rotulo: status === "published" ? "Ver no Blog" : "Pré-visualizar", icone: status === "published" ? "external-link" : "eye" },
    { id: "duplicar", rotulo: "Duplicar", icone: "copy" },
  ];
  if (status !== "published" && status !== "archived") itens.push({ id: "agendar", rotulo: status === "scheduled" ? "Reagendar" : "Agendar", icone: "calendar-clock" });
  if (status === "published" || status === "scheduled") itens.push({ id: "despublicar", rotulo: status === "scheduled" ? "Cancelar agendamento" : "Despublicar", icone: "undo-2" });
  if (status === "archived") itens.push({ id: "restaurar", rotulo: "Voltar a rascunho", icone: "rotate-ccw" });
  else itens.push({ id: "arquivar", rotulo: "Arquivar", icone: "archive" });
  itens.push("separador", { id: "excluir", rotulo: "Excluir", icone: "trash-2", perigo: true });
  return itens;
}

/* ------------------------------------------------------------------
 * Visão geral
 * ------------------------------------------------------------------ */

function saudacao(agora = new Date()) {
  const hora = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(agora));
  return hora < 5 ? "Boa noite" : hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
}

export function criarVisaoGeral(el, ctx) {
  el.addEventListener("click", (evento) => {
    const ir = evento.target.closest("[data-ir]");
    if (ir) { evento.preventDefault(); ctx.navegar(ir.dataset.ir); }
  });

  return {
    titulo: "Visão geral",
    desenhar() {
      const { loja } = ctx;
      const agora = Date.now();
      const resumo = resumoDaMesa(loja.registros, { categorias: loja.categorias, comentarios: loja.comentarios, agora });
      const { numeros, atencao } = resumo;
      const hoje = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" }).format(new Date());
      const maisLidos = loja.registros
        .filter((registro) => registro.status === "published")
        .map((registro) => ({ registro, leituras: loja.leituras[registro.post.slug] || 0 }))
        .sort((a, b) => b.leituras - a.leituras)
        .slice(0, 4);
      const totalDeLeituras = Object.values(loja.leituras).reduce((soma, valor) => soma + valor, 0);
      const pendencias = [
        atencao.comentarios && { ir: "#/comentarios", icone: "message-circle", texto: `${plural(atencao.comentarios, "comentário aguardando", "comentários aguardando")} leitura` },
        atencao.pendentes.length && { ir: "#/posts?atencao=pendentes", icone: "history", texto: `${plural(atencao.pendentes.length, "texto publicado tem", "textos publicados têm")} alterações ainda não publicadas` },
        atencao.semCapa.length && { ir: "#/posts?atencao=sem-capa", icone: "image", texto: `${plural(atencao.semCapa.length, "texto sem", "textos sem")} imagem de capa` },
        atencao.semCategoria.length && { ir: "#/posts?atencao=sem-categoria", icone: "tag", texto: `${plural(atencao.semCategoria.length, "texto com", "textos com")} categoria que o menu não mostra` },
      ].filter(Boolean);

      el.innerHTML = `<header class="mesa-cabeca">
          <div><p class="mesa-sobre">${esc(hoje)}</p><h1 class="mesa-titulo" tabindex="-1">${saudacao()}${ctx.usuario?.primeiroNome ? `, ${esc(ctx.usuario.primeiroNome)}` : ""}</h1></div>
          <a class="mesa-botao mesa-botao--principal" href="#/novo">${i("plus")}Novo post</a>
        </header>
        ${loja.demonstracao ? `<p class="mesa-faixa">${i("circle-alert")}<span>Você está no acesso de teste: nada do que fizer aqui chega ao Blog que os visitantes leem.</span></p>` : ""}
        <section class="mesa-numeros" aria-label="Números do blog">
          <a href="#/posts?status=published"><span>Publicados</span><strong>${numero.format(numeros.publicados)}</strong></a>
          <a href="#/posts?status=draft"><span>Rascunhos</span><strong>${numero.format(numeros.rascunhos)}</strong></a>
          <a href="#/posts?status=scheduled"><span>Agendados</span><strong>${numero.format(numeros.agendados)}</strong></a>
          <a href="#/posts"><span>Posts este mês</span><strong>${numero.format(numeros.doMes)}</strong></a>
        </section>

        <section class="mesa-secao" aria-labelledby="mesa-continuar">
          <h2 id="mesa-continuar" class="mesa-subtitulo">Continue de onde parou</h2>
          ${resumo.continuar.length
            ? `<div class="mesa-continuar">${resumo.continuar.map((registro) => {
                const post = textoAtual(registro);
                return `<a class="mesa-cartao" href="#/editar/${encodeURIComponent(registro.id)}">
                  <span class="mesa-cartao__capa">${capinha(post)}</span>
                  <span class="mesa-cartao__corpo">${chipDeStatus(registro.status)}
                    <strong>${esc(post.title)}</strong>
                    <span class="mesa-cartao__pe"><small>Última edição ${esc(tempoRelativo(registro.atualizadoEm))}</small><span class="mesa-link">Continuar${i("chevron-right")}</span></span>
                  </span></a>`;
              }).join("")}</div>`
            : vazio("pen-line", "Nenhum rascunho aberto. Que tal começar um texto novo?", `<a class="mesa-botao mesa-botao--contorno" href="#/novo">${i("plus")}Novo post</a>`)}
        </section>

        <div class="mesa-colunas">
          <div class="mesa-coluna">
            <section class="mesa-secao" aria-labelledby="mesa-agendados">
              <h2 id="mesa-agendados" class="mesa-subtitulo">Próximos agendamentos</h2>
              ${resumo.agendados.length
                ? `<ul class="mesa-lista-simples">${resumo.agendados.map((registro) => {
                    const quando = dataDePublicacao(registro);
                    return `<li><a href="#/editar/${encodeURIComponent(registro.id)}" class="mesa-agendado">
                      <span class="mesa-agendado__dia"><small>${esc(MES.format(quando).replace(".", ""))}</small><strong>${esc(DIA.format(quando))}</strong><small>${esc(horaDe(quando))}</small></span>
                      <span><strong>${esc(textoAtual(registro).title)}</strong><small>${esc(ctx.rotuloDaCategoria(textoAtual(registro).category))}</small></span>
                      ${chipDeStatus("scheduled")}</a></li>`;
                  }).join("")}</ul>`
                : vazio("calendar", "Nada agendado. Um texto pronto pode sair sozinho na hora marcada.")}
            </section>
            <section class="mesa-secao" aria-labelledby="mesa-editados">
              <h2 id="mesa-editados" class="mesa-subtitulo">Últimos editados</h2>
              ${resumo.editados.length
                ? `<ul class="mesa-lista-simples">${resumo.editados.map((registro) => `<li><a href="#/editar/${encodeURIComponent(registro.id)}" class="mesa-editado">
                    ${i("file-text")}<span>${esc(textoAtual(registro).title)}</span><small>${esc(tempoRelativo(registro.atualizadoEm))}</small></a></li>`).join("")}</ul>`
                : vazio("file-text", "Os textos editados aparecem aqui.")}
            </section>
          </div>
          <div class="mesa-coluna">
            <section class="mesa-secao mesa-quadro" aria-labelledby="mesa-atencao">
              <h2 id="mesa-atencao" class="mesa-subtitulo">Precisa de atenção ${pendencias.length ? `<span class="mesa-contador">${pendencias.length}</span>` : ""}</h2>
              ${pendencias.length
                ? `<ul class="mesa-lista-simples">${pendencias.map((item) => `<li><a href="${item.ir}" class="mesa-pendencia">${i(item.icone)}<span>${esc(item.texto)}</span>${i("chevron-right")}</a></li>`).join("")}</ul>`
                : vazio("circle-check", "Tudo em ordem por aqui.")}
            </section>
            <section class="mesa-secao mesa-quadro mesa-alcance" aria-labelledby="mesa-alcance">
              <h2 id="mesa-alcance" class="mesa-subtitulo">Alcance</h2>
              ${loja.demonstracao
                ? '<p class="mesa-dica">No acesso de teste nada é medido: os números aparecem na mesa real.</p>'
                : `<div class="mesa-alcance__numeros">
                    <p><span>Leituras</span><strong>${numero.format(totalDeLeituras)}</strong></p>
                    <p><span>Inscritos nas inspirações</span><strong>${numero.format(loja.inscritos)}</strong></p>
                  </div>
                  ${maisLidos.some((item) => item.leituras) ? `<h3 class="mesa-rotulo">Mais lidos</h3><ol class="mesa-mais-lidos">${maisLidos.filter((item) => item.leituras).map((item) => `<li><a href="#/editar/${encodeURIComponent(item.registro.id)}">${esc(item.registro.post.title)}</a><span>${numero.format(item.leituras)}</span></li>`).join("")}</ol>` : '<p class="mesa-dica">As leituras são contadas a cada abertura de um artigo publicado.</p>'}`}
              ${loja.falhas.length ? `<p class="mesa-dica is-erro" role="alert">${i("circle-alert")}Alguns números não puderam ser carregados. <button type="button" class="mesa-link" data-mesa-recarregar>Tentar de novo</button></p>` : ""}
            </section>
          </div>
        </div>`;
    },
  };
}

/* ------------------------------------------------------------------
 * Posts
 * ------------------------------------------------------------------ */

const ATENCAO = {
  "sem-capa": { rotulo: "textos sem capa", testar: (registro) => !textoAtual(registro).cover },
  "sem-categoria": { rotulo: "textos com categoria fora do menu", testar: (registro, ids) => !ids.has(textoAtual(registro).category) },
  pendentes: { rotulo: "alterações não publicadas", testar: (registro) => Boolean(registro.pendente) },
};
const POR_VEZ = 20;
const ROTULO_DA_ABA = { todos: "Todos", draft: "Rascunhos", review: "Em revisão", scheduled: "Agendados", published: "Publicados", archived: "Arquivados" };

export function criarListaDePosts(el, ctx) {
  const filtros = { busca: "", status: "todos", categoria: "", autor: "", periodo: "", ordem: "recentes", atencao: "" };
  let mostrando = POR_VEZ;
  let pendenteDeFoco = "";

  function aplicarParametros(parametros = {}) {
    if (!Object.keys(parametros).length) return;
    Object.assign(filtros, { status: "todos", atencao: "", categoria: "", autor: "", periodo: "", busca: "" });
    if (parametros.status && (parametros.status === "todos" || STATUS[parametros.status])) filtros.status = parametros.status;
    if (parametros.atencao && ATENCAO[parametros.atencao]) filtros.atencao = parametros.atencao;
    if (parametros.categoria) filtros.categoria = parametros.categoria;
    mostrando = POR_VEZ;
  }

  function resultado() {
    const { loja } = ctx;
    const ids = new Set(loja.categorias.map(({ id }) => id));
    let lista = filtrarPosts(loja.registros, { ...filtros, rotuloDaCategoria: ctx.rotuloDaCategoria });
    if (filtros.atencao) lista = lista.filter((registro) => ATENCAO[filtros.atencao].testar(registro, ids));
    return lista;
  }

  function linhaHtml(registro) {
    const post = textoAtual(registro);
    return `<li class="mesa-post" data-post-id="${esc(registro.id)}">
      <a class="mesa-post__capa" href="#/editar/${encodeURIComponent(registro.id)}" tabindex="-1" aria-hidden="true">${capinha(post)}</a>
      <div class="mesa-post__texto">
        <a class="mesa-post__titulo" href="#/editar/${encodeURIComponent(registro.id)}">${esc(post.title)}</a>
        <p class="mesa-post__meta">${chipDeStatus(registro.status)}
          ${registro.pendente ? `<span class="mesa-selo">${i("history")}Alterações não publicadas</span>` : ""}
          ${post.featured && registro.status === "published" ? `<span class="mesa-selo mesa-selo--ouro">Destaque</span>` : ""}
          <span>${esc(ctx.rotuloDaCategoria(post.category))}</span>
          <span class="mesa-ponto" aria-hidden="true"></span>
          <span>${esc(linhaDoTempo(registro))}</span>
          <span class="mesa-post__autor">· ${esc(post.author)}</span>
        </p>
      </div>
      <button type="button" class="mesa-botao-icone" data-post-menu="${esc(registro.id)}" aria-haspopup="menu" aria-expanded="false" aria-label="Mais ações para ${esc(post.title)}">${i("ellipsis")}</button>
    </li>`;
  }

  function opcoes(lista, atual, primeira) {
    return `<option value="">${esc(primeira)}</option>${lista.map(([valor, rotulo]) => `<option value="${esc(valor)}" ${valor === atual ? "selected" : ""}>${esc(rotulo)}</option>`).join("")}`;
  }

  function desenharLista() {
    const { loja } = ctx;
    const lista = resultado();
    const alvo = el.querySelector("[data-posts-lista]");
    const rodape = el.querySelector("[data-posts-rodape]");
    const temFiltro = filtros.busca || filtros.categoria || filtros.autor || filtros.periodo || filtros.atencao || filtros.status !== "todos";
    if (!loja.registros.length) {
      alvo.innerHTML = vazio("pen-line", "Nenhum texto ainda. O primeiro começa com um título.", `<a class="mesa-botao mesa-botao--principal" href="#/novo">${i("plus")}Novo post</a>`);
    } else if (!lista.length) {
      alvo.innerHTML = vazio("search", filtros.busca ? `Nada encontrado para “${esc(filtros.busca)}”.` : "Nenhum texto com esses filtros.", temFiltro ? '<button type="button" class="mesa-botao mesa-botao--contorno" data-posts-limpar>Limpar filtros</button>' : "");
    } else {
      alvo.innerHTML = `<ul class="mesa-posts">${lista.slice(0, mostrando).map(linhaHtml).join("")}</ul>`;
    }
    rodape.innerHTML = lista.length > 0
      ? `<p>Mostrando ${numero.format(Math.min(mostrando, lista.length))} de ${numero.format(lista.length)}</p>${lista.length > mostrando ? '<button type="button" class="mesa-botao mesa-botao--contorno" data-posts-mais>Ver mais textos</button>' : ""}`
      : "";
    const contagem = contarPorStatus(loja.registros);
    for (const aba of el.querySelectorAll("[data-posts-status]")) {
      const status = aba.dataset.postsStatus;
      aba.setAttribute("aria-selected", String(status === filtros.status));
      aba.querySelector("[data-conta]").textContent = numero.format(contagem[status] || 0);
    }
    const chip = el.querySelector("[data-posts-atencao]");
    chip.hidden = !filtros.atencao;
    if (filtros.atencao) chip.querySelector("span").textContent = `Mostrando: ${ATENCAO[filtros.atencao].rotulo}`;
    el.querySelector("[data-posts-total]").textContent = plural(loja.registros.length, "texto", "textos");
    if (pendenteDeFoco) {
      el.querySelector(`[data-post-menu="${CSS.escape(pendenteDeFoco)}"]`)?.focus();
      pendenteDeFoco = "";
    }
  }

  function desenhar(parametros) {
    aplicarParametros(parametros);
    const { loja } = ctx;
    const abas = ["todos", ...ORDEM_DOS_STATUS];
    el.innerHTML = `<header class="mesa-cabeca">
        <div class="mesa-cabeca__titulo"><h1 class="mesa-titulo" tabindex="-1">Posts</h1><span class="mesa-sobre" data-posts-total></span></div>
        <label class="mesa-busca mesa-busca--grande">${i("search")}<span class="sr-only">Buscar no blog</span>
          <input type="search" data-posts-busca placeholder="Buscar no blog" value="${esc(filtros.busca)}" aria-describedby="posts-busca-dica"></label>
        <a class="mesa-botao mesa-botao--principal" href="#/novo">${i("plus")}Novo post</a>
      </header>
      <p id="posts-busca-dica" class="sr-only">Procura no título, no texto, na categoria, no autor e nas etiquetas.</p>
      <div class="mesa-filtros">
        <div class="mesa-abas mesa-abas--status" role="tablist" aria-label="Status">
          ${abas.map((status) => `<button type="button" role="tab" data-posts-status="${status}">${ROTULO_DA_ABA[status]} <span data-conta></span></button>`).join("")}
        </div>
        <div class="mesa-selecoes">
          <label><span class="sr-only">Categoria</span><select data-posts-filtro="categoria">${opcoes(loja.categorias.map((item) => [item.id, item.rotulo]), filtros.categoria, "Todas as categorias")}</select></label>
          <label><span class="sr-only">Autor</span><select data-posts-filtro="autor">${opcoes(autoresDe(loja.registros).map((nome) => [nome, nome]), filtros.autor, "Todos os autores")}</select></label>
          <label><span class="sr-only">Período</span><select data-posts-filtro="periodo">${Object.entries(PERIODOS).map(([valor, rotulo]) => `<option value="${valor}" ${valor === filtros.periodo ? "selected" : ""}>${esc(rotulo)}</option>`).join("")}</select></label>
          <label><span class="sr-only">Ordenar</span><select data-posts-filtro="ordem">${Object.entries(ORDENACOES).map(([valor, rotulo]) => `<option value="${valor}" ${valor === filtros.ordem ? "selected" : ""}>Ordenar: ${esc(rotulo)}</option>`).join("")}</select></label>
        </div>
      </div>
      <p class="mesa-chip" data-posts-atencao hidden><span></span><button type="button" data-posts-sem-atencao aria-label="Mostrar todos">${i("x")}</button></p>
      <div data-posts-lista aria-live="polite"></div>
      <footer class="mesa-posts__rodape" data-posts-rodape></footer>`;
    desenharLista();
  }

  el.addEventListener("input", (evento) => {
    if (!evento.target.matches("[data-posts-busca]")) return;
    filtros.busca = evento.target.value;
    mostrando = POR_VEZ;
    desenharLista();
  });
  el.addEventListener("change", (evento) => {
    const campo = evento.target.dataset.postsFiltro;
    if (!campo) return;
    filtros[campo] = evento.target.value;
    mostrando = POR_VEZ;
    desenharLista();
  });
  el.addEventListener("click", (evento) => {
    const aba = evento.target.closest("[data-posts-status]");
    if (aba) { filtros.status = aba.dataset.postsStatus; mostrando = POR_VEZ; desenharLista(); return; }
    if (evento.target.closest("[data-posts-mais]")) { mostrando += POR_VEZ; desenharLista(); return; }
    if (evento.target.closest("[data-posts-sem-atencao]")) { filtros.atencao = ""; desenharLista(); return; }
    if (evento.target.closest("[data-posts-limpar]")) {
      Object.assign(filtros, { busca: "", status: "todos", categoria: "", autor: "", periodo: "", atencao: "" });
      desenhar();
      return;
    }
    const menu = evento.target.closest("[data-post-menu]");
    if (menu) {
      const registro = ctx.loja.registros.find((item) => item.id === menu.dataset.postMenu);
      if (!registro) return;
      ctx.menu.abrir(menu, itensDoMenu(registro), (acao) => {
        pendenteDeFoco = registro.id;
        ctx.executar(acao, registro);
      });
    }
  });

  return { titulo: "Posts", desenhar, redesenhar: () => (el.querySelector("[data-posts-lista]") ? desenharLista() : desenhar()) };
}

/* ------------------------------------------------------------------
 * Comentários
 * ------------------------------------------------------------------ */

const SITUACAO = { pending: "Aguardando leitura", approved: "Publicado", rejected: "Recusado" };

export function criarComentarios(el, ctx) {
  let aba = "pending";

  function desenhar() {
    const { loja } = ctx;
    const titulos = new Map(loja.registros.map((registro) => [registro.post.slug, registro]));
    const contagem = { pending: 0, approved: 0, rejected: 0 };
    for (const item of loja.comentarios) contagem[item.status] = (contagem[item.status] || 0) + 1;
    const lista = aba === "todos" ? loja.comentarios : loja.comentarios.filter((item) => item.status === aba);
    el.innerHTML = `<header class="mesa-cabeca">
        <div class="mesa-cabeca__titulo"><h1 class="mesa-titulo" tabindex="-1">Comentários</h1><span class="mesa-sobre">Um comentário só aparece no Blog depois de publicado aqui.</span></div>
      </header>
      <div class="mesa-abas mesa-abas--status" role="tablist" aria-label="Situação">
        ${[["pending", "Aguardando"], ["approved", "Publicados"], ["rejected", "Recusados"], ["todos", "Todos"]].map(([valor, rotulo]) => `<button type="button" role="tab" data-comentarios-aba="${valor}" aria-selected="${valor === aba}">${rotulo} <span>${numero.format(valor === "todos" ? loja.comentarios.length : contagem[valor])}</span></button>`).join("")}
      </div>
      ${loja.falhaDosComentarios ? `<p class="mesa-faixa is-erro" role="alert">${i("circle-alert")}<span>${esc(loja.falhaDosComentarios)}</span><button type="button" class="mesa-link" data-mesa-recarregar>Tentar de novo</button></p>` : ""}
      ${lista.length
        ? `<ul class="mesa-comentarios">${lista.map((item) => {
            const registro = titulos.get(item.slug);
            const onde = registro ? `<a href="#/editar/${encodeURIComponent(registro.id)}">${esc(registro.post.title)}</a>` : esc(item.slug ? item.slug : "Conversa do Caderno");
            const acoes = item.status === "pending"
              ? `<button type="button" class="mesa-botao mesa-botao--principal mesa-botao--pequeno" data-moderar="approved" data-id="${esc(item.id)}">${i("check")}Publicar</button><button type="button" class="mesa-botao mesa-botao--contorno mesa-botao--pequeno" data-moderar="rejected" data-id="${esc(item.id)}">${i("x")}Recusar</button>`
              : `<button type="button" class="mesa-botao mesa-botao--contorno mesa-botao--pequeno" data-moderar="${item.status === "approved" ? "rejected" : "approved"}" data-id="${esc(item.id)}">${item.status === "approved" ? `${i("undo-2")}Retirar do Blog` : `${i("check")}Publicar`}</button>`;
            return `<li class="mesa-comentario" data-situacao="${esc(item.status)}">
              <span class="mesa-comentario__inicial" aria-hidden="true">${esc(String(item.nome || "?").trim().charAt(0).toUpperCase())}</span>
              <div class="mesa-comentario__corpo">
                <p class="mesa-comentario__quem"><strong>${esc(item.nome)}</strong> em ${onde}</p>
                <p class="mesa-comentario__quando"><small>${esc(tempoRelativo(item.criadoEm))} · ${esc(SITUACAO[item.status] || item.status)}</small></p>
                <p class="mesa-comentario__texto">${esc(item.texto)}</p>
                <div class="mesa-comentario__acoes">${acoes}</div>
              </div></li>`;
          }).join("")}</ul>`
        : vazio("message-circle", loja.demonstracao ? "No acesso de teste não há comentários de visitantes." : aba === "pending" ? "Nenhum comentário esperando leitura." : "Nenhum comentário aqui.")}`;
  }

  el.addEventListener("click", async (evento) => {
    const trocar = evento.target.closest("[data-comentarios-aba]");
    if (trocar) { aba = trocar.dataset.comentariosAba; desenhar(); return; }
    const botao = evento.target.closest("[data-moderar]");
    if (!botao) return;
    const situacao = botao.dataset.moderar;
    for (const irmao of botao.parentElement.querySelectorAll("button")) irmao.disabled = true;
    try {
      await ctx.repositorio.moderar(botao.dataset.id, situacao);
      const item = ctx.loja.comentarios.find((comentario) => String(comentario.id) === botao.dataset.id);
      if (item) item.status = situacao;
      ctx.avisos.mostrar(situacao === "approved" ? "Comentário publicado no Blog." : "Comentário fora do Blog.");
      ctx.atualizarContadores();
      desenhar();
    } catch (erro) {
      for (const irmao of botao.parentElement.querySelectorAll("button")) irmao.disabled = false;
      ctx.avisos.mostrar(`Não foi possível moderar: ${erro.message}`, { tipo: "erro" });
    }
  });

  return { titulo: "Comentários", desenhar };
}

/* ------------------------------------------------------------------
 * Configurações
 * ------------------------------------------------------------------ */

export function criarConfiguracoes(el, ctx) {
  let capa = "";
  let salvando = false;

  function categoriasHtml() {
    const { loja } = ctx;
    const uso = new Map();
    for (const registro of loja.registros) uso.set(textoAtual(registro).category, (uso.get(textoAtual(registro).category) || 0) + 1);
    return loja.categorias.length
      ? `<ul class="mesa-categorias">${loja.categorias.map((categoria, indice) => `<li data-categoria="${esc(categoria.id)}">
          <button type="button" class="mesa-categoria__imagem" data-categoria-imagem aria-label="Trocar a imagem de ${esc(categoria.rotulo)}">${categoria.imagem ? `<img src="${esc(categoria.imagem)}" alt="">` : i("image")}</button>
          <label class="mesa-categoria__nome"><span class="sr-only">Nome da categoria</span><input value="${esc(categoria.rotulo)}" data-categoria-rotulo maxlength="40"></label>
          <small>${plural(uso.get(categoria.id) || 0, "texto", "textos")}</small>
          <span class="mesa-categoria__acoes">
            <button type="button" class="mesa-botao-icone" data-categoria-mover="-1" ${indice === 0 ? "disabled" : ""} aria-label="Subir">${i("arrow-up")}</button>
            <button type="button" class="mesa-botao-icone" data-categoria-mover="1" ${indice === loja.categorias.length - 1 ? "disabled" : ""} aria-label="Descer">${i("arrow-down")}</button>
            <button type="button" class="mesa-botao-icone is-perigo" data-categoria-apagar aria-label="Apagar ${esc(categoria.rotulo)}">${i("trash-2")}</button>
          </span></li>`).join("")}</ul>`
      : vazio("tag", "Nenhuma categoria ainda.");
  }

  function desenhar() {
    const { loja } = ctx;
    const configuracao = loja.configuracao || { name: "Caderno de Travessia", cover: CAPA_PADRAO };
    capa = capaDoCaderno(configuracao.cover);
    el.innerHTML = `<header class="mesa-cabeca">
        <div class="mesa-cabeca__titulo"><h1 class="mesa-titulo" tabindex="-1">Configurações</h1><span class="mesa-sobre">O que aparece no topo e no menu do Blog.</span></div>
      </header>
      <section class="mesa-secao mesa-quadro" aria-labelledby="config-caderno">
        <h2 id="config-caderno" class="mesa-subtitulo">O Caderno</h2>
        <form class="mesa-config" data-config-form>
          <label class="mesa-campo"><span>Nome do blog</span><input name="name" required maxlength="80" value="${esc(configuracao.name)}"></label>
          <div class="mesa-campo"><span>Imagem do topo</span>
            <figure class="mesa-config__capa"><img src="${esc(capa)}" alt="Imagem do topo do blog" data-config-capa></figure>
            <div class="mesa-linha">
              <button type="button" class="mesa-botao mesa-botao--contorno" data-config-trocar>${i("image")}Trocar imagem</button>
              <button type="button" class="mesa-botao mesa-botao--fantasma" data-config-padrao>Usar a imagem padrão</button>
            </div>
          </div>
          <div class="mesa-linha mesa-linha--fim"><button type="submit" class="mesa-botao mesa-botao--principal">${i("check")}Salvar</button></div>
        </form>
      </section>
      <section class="mesa-secao mesa-quadro" aria-labelledby="config-categorias">
        <h2 id="config-categorias" class="mesa-subtitulo">Categorias</h2>
        <p class="mesa-dica">Viram o menu e os medalhões do Blog, nesta ordem. Uma categoria com textos não pode ser apagada.</p>
        <div data-config-categorias>${categoriasHtml()}</div>
        <form class="mesa-linha mesa-nova-categoria" data-config-nova>
          <label class="mesa-campo mesa-campo--linha"><span class="sr-only">Nova categoria</span><input name="rotulo" placeholder="Nova categoria" maxlength="40" required></label>
          <button type="submit" class="mesa-botao mesa-botao--contorno">${i("plus")}Adicionar</button>
        </form>
      </section>
      ${loja.demonstracao ? `<section class="mesa-secao mesa-quadro" aria-labelledby="config-teste">
        <h2 id="config-teste" class="mesa-subtitulo">Acesso de teste</h2>
        <p class="mesa-dica">Desfaz tudo o que foi feito nesta demonstração e volta aos textos de exemplo.</p>
        <button type="button" class="mesa-botao mesa-botao--contorno" data-config-restaurar>${i("rotate-ccw")}Restaurar demonstração</button>
      </section>` : ""}`;
  }

  const redesenharCategorias = () => { el.querySelector("[data-config-categorias]").innerHTML = categoriasHtml(); };

  async function comCategoria(tarefa, sucesso) {
    try {
      await tarefa();
      ctx.loja.categorias = await ctx.repositorio.listarCategorias();
      ctx.categoriasMudaram();
      redesenharCategorias();
      if (sucesso) ctx.avisos.mostrar(sucesso);
    } catch (erro) {
      ctx.avisos.mostrar(erro.message, { tipo: "erro" });
      redesenharCategorias();
    }
  }

  el.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const form = evento.target;
    if (form.matches("[data-config-nova]")) {
      const rotulo = form.elements.rotulo.value.trim();
      if (!rotulo) return;
      await comCategoria(() => ctx.repositorio.criarCategoria({ rotulo, ordem: ctx.loja.categorias.length + 1 }), `Categoria “${rotulo}” criada.`);
      el.querySelector("[data-config-nova] input")?.focus();
      return;
    }
    if (!form.matches("[data-config-form]") || salvando) return;
    salvando = true;
    const botao = form.querySelector('[type="submit"]');
    botao.disabled = true;
    try {
      ctx.loja.configuracao = await ctx.repositorio.salvarConfiguracao({ name: form.elements.name.value, cover: capa });
      ctx.avisos.mostrar("Configuração salva. O Blog já mostra o nome e a imagem novos.");
    } catch (erro) {
      ctx.avisos.mostrar(`Não foi possível salvar: ${erro.message}`, { tipo: "erro" });
    } finally {
      salvando = false;
      botao.disabled = false;
    }
  });

  el.addEventListener("click", async (evento) => {
    if (evento.target.closest("[data-config-trocar]")) {
      const escolha = await ctx.biblioteca.escolher({ titulo: "Imagem do topo do blog", atual: capa });
      if (escolha?.[0]) { capa = escolha[0]; el.querySelector("[data-config-capa]").src = capa; }
      return;
    }
    if (evento.target.closest("[data-config-padrao]")) { capa = CAPA_PADRAO; el.querySelector("[data-config-capa]").src = capa; return; }
    if (evento.target.closest("[data-config-restaurar]")) {
      const ok = await ctx.confirmar({ titulo: "Restaurar a demonstração?", texto: "Os textos de exemplo voltam ao estado inicial. Isso só afeta o acesso de teste.", confirmar: "Restaurar" });
      if (ok) { await ctx.repositorio.reset?.(); await ctx.recarregar(); ctx.avisos.mostrar("Demonstração restaurada."); }
      return;
    }
    const linha = evento.target.closest("[data-categoria]");
    if (!linha) return;
    const id = linha.dataset.categoria;
    const categoria = ctx.loja.categorias.find((item) => item.id === id);
    if (evento.target.closest("[data-categoria-imagem]")) {
      const escolha = await ctx.biblioteca.escolher({ titulo: `Imagem de “${categoria.rotulo}”`, atual: categoria.imagem });
      if (escolha?.[0]) await comCategoria(() => ctx.repositorio.atualizarCategoria(id, { imagem: escolha[0] }), "Imagem da categoria trocada.");
      return;
    }
    const mover = evento.target.closest("[data-categoria-mover]");
    if (mover) {
      const lista = [...ctx.loja.categorias];
      const de = lista.findIndex((item) => item.id === id);
      const para = de + Number(mover.dataset.categoriaMover);
      if (para < 0 || para >= lista.length) return;
      [lista[de], lista[para]] = [lista[para], lista[de]];
      await comCategoria(() => Promise.all(lista.map((item, ordem) => (item.ordem === ordem + 1 ? null : ctx.repositorio.atualizarCategoria(item.id, { ordem: ordem + 1 })))));
      el.querySelector(`[data-categoria="${CSS.escape(id)}"] [data-categoria-mover="${mover.dataset.categoriaMover}"]`)?.focus();
      return;
    }
    if (evento.target.closest("[data-categoria-apagar]")) {
      const ok = await ctx.confirmar({ titulo: `Apagar “${categoria.rotulo}”?`, texto: "Ela sai do menu do Blog. Os textos não são apagados.", confirmar: "Apagar categoria", perigo: true });
      if (ok) await comCategoria(() => ctx.repositorio.removerCategoria(id), "Categoria apagada.");
    }
  });

  el.addEventListener("change", async (evento) => {
    if (!evento.target.matches("[data-categoria-rotulo]")) return;
    const id = evento.target.closest("[data-categoria]").dataset.categoria;
    const rotulo = evento.target.value.trim();
    if (!rotulo) { redesenharCategorias(); return; }
    await comCategoria(() => ctx.repositorio.atualizarCategoria(id, { rotulo: rotulo.toLocaleLowerCase("pt-BR") }), "Nome da categoria salvo.");
  });

  return { titulo: "Configurações", desenhar };
}
