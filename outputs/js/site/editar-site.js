/*
 * "Editar site": a página real do Portal numa moldura, com um painel ao lado.
 *
 * O Owner escolhe a página, clica no texto/imagem/botão que quer mudar, vê o resultado na hora, salva como
 * rascunho e publica. A prévia é a PRÓPRIA página (mesmos CSS e JS) carregada num quadro same-origin; o editor
 * só aplica o conteúdo por cima, elemento por elemento (aplicar.js). Nada é publicado ao digitar: gravar rascunho
 * e publicar são botões diferentes, e quem recusa uma conta que não é Owner é o banco, não esta tela.
 *
 * Todo texto do usuário entra no DOM por textContent/atributos — nunca por innerHTML.
 */
import { criarApiEditarSite, ErroEditarSite } from "./api.js";
import { aplicarConteudo, definirTexto, valorEfetivo } from "./aplicar.js";
import { criarEstadoEditor, limparConteudo } from "./estado.js";
import { DESTINOS_DO_PORTAL, PAGINAS_EDITAVEIS, carregarManifesto } from "./paginas.js";
import {
  LIMITE_ALT, LIMITE_TEXTO, POSICOES, descreverDestino, validarAlt, validarArquivoImagem, validarConteudo, validarLink, validarTexto,
} from "./validar.js";

const ESTILO_PREVIA = `
[data-es-chave]{cursor:pointer !important;outline:2px dashed transparent;outline-offset:3px;transition:outline-color .12s}
[data-es-chave]:hover{outline-color:rgba(216,178,106,.95)}
[data-es-chave].es-selecionado{outline:3px solid #d8b26a !important;outline-offset:3px;background-image:linear-gradient(rgba(216,178,106,.16),rgba(216,178,106,.16))}
html[data-editor-site] *{scroll-behavior:auto !important}
`;

export function h(tag, props = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [chave, valor] of Object.entries(props || {})) {
    if (valor === false || valor == null) continue;
    if (chave === "class") el.className = valor;
    else if (chave === "text") el.textContent = valor;
    else if (chave.startsWith("on") && typeof valor === "function") el.addEventListener(chave.slice(2).toLowerCase(), valor);
    else if (chave in el && !chave.startsWith("aria") && !chave.startsWith("data") && chave !== "list") el[chave] = valor;
    else el.setAttribute(chave, valor === true ? "" : String(valor));
  }
  for (const f of filhos.flat()) if (f != null && f !== false) el.append(f.nodeType ? f : document.createTextNode(String(f)));
  return el;
}

const ROTULO_SITUACAO = { publicado: "Publicado", rascunho: "Rascunho salvo — ainda não público", alterado: "Alterações não salvas" };
const CHAVE_BACKUP = (slug) => `potala.editar-site.${slug}`;

function dataCurta(iso) {
  try { return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); } catch { return ""; }
}
const resumir = (texto, n = 54) => { const t = String(texto || "").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

export function createEditarSite({ root, client, api = criarApiEditarSite({ client }), janela = window, armazenamento } = {}) {
  if (!root) throw new TypeError("root é obrigatório para montar o editor do site.");
  const memoria = armazenamento ?? (() => { try { return janela.localStorage; } catch { return null; } })();

  let pagina = null;
  let manifesto = null;
  let estado = null;
  let carga = null;
  let selecionada = null;
  let visualizando = null; // { version, content } — histórico em modo só leitura
  let ocupado = false;
  let dispositivo = "desktop";
  let iframeDoc = null;
  let aberto = false;

  /* ---------- peças fixas ---------- */
  const seletorPagina = h("select", { id: "es-pagina", "aria-label": "Escolher página" },
    PAGINAS_EDITAVEIS.map((p) => h("option", { value: p.slug, text: p.titulo })));
  const chip = h("span", { class: "es-chip", "data-es-chip": "", role: "status" });
  const botoesDispositivo = ["desktop", "celular"].map((d) => h("button", {
    type: "button", class: "es-seg", "data-es-dispositivo": d, "aria-pressed": d === "desktop" ? "true" : "false",
    onclick: () => definirDispositivo(d),
  }, d === "desktop" ? "Computador" : "Celular"));
  const btnDesfazer = h("button", { type: "button", class: "es-btn", "data-es-desfazer": "", onclick: desfazerTudo }, "Desfazer");
  const btnRefazer = h("button", { type: "button", class: "es-btn", "data-es-refazer": "", onclick: refazerTudo }, "Refazer");
  const btnHistorico = h("button", { type: "button", class: "es-btn", "data-es-historico": "", onclick: abrirHistorico }, "Histórico");
  const btnDescartar = h("button", { type: "button", class: "es-btn es-btn-suave", "data-es-descartar": "", onclick: descartarRascunho }, "Descartar alterações");
  const btnSalvar = h("button", { type: "button", class: "es-btn es-btn-forte", "data-es-salvar": "", onclick: () => void salvarRascunho() }, "Salvar rascunho");
  const btnPublicar = h("button", { type: "button", class: "es-btn es-btn-ouro", "data-es-publicar": "", onclick: () => void publicar() }, "Publicar");
  const aviso = h("div", { class: "es-aviso", "data-es-aviso": "", role: "status", "aria-live": "polite", hidden: true });
  const faixaVisualizacao = h("div", { class: "es-faixa", "data-es-faixa": "", hidden: true });
  const faixaRecuperacao = h("div", { class: "es-faixa es-faixa-alerta", "data-es-recuperacao": "", hidden: true });
  const quadro = h("iframe", { class: "es-quadro", title: "Prévia da página", "data-es-quadro": "", referrerpolicy: "same-origin" });
  const palco = h("div", { class: "es-palco", "data-dispositivo": "desktop" }, h("div", { class: "es-moldura" }, quadro));
  const listaSecoes = h("div", { class: "es-secoes-lista", "data-es-secoes": "" });
  const painel = h("aside", { class: "es-painel", "data-es-painel": "", "aria-label": "Editar elemento" });
  const botaoConteudo = h("button", { type: "button", class: "es-btn es-so-celular", "data-es-conteudo-toggle": "", "aria-expanded": "false", onclick: () => alternarSecoes() }, "Conteúdo da página");
  const colunaSecoes = h("aside", { class: "es-secoes", "data-es-colsecoes": "", "aria-label": "Conteúdo da página" },
    h("h3", { class: "es-titulo-coluna", text: "Conteúdo da página" }),
    h("p", { class: "es-ajuda", text: "Clique direto na página ou escolha aqui." }), listaSecoes);
  const dialogo = h("dialog", { class: "es-dialogo", "data-es-dialogo": "" });

  root.replaceChildren(
    h("div", { class: "es-barra" },
      h("div", { class: "es-barra-grupo" }, h("label", { for: "es-pagina", class: "es-rotulo", text: "Página" }), seletorPagina, chip),
      h("div", { class: "es-barra-grupo", role: "group", "aria-label": "Tamanho da tela" }, ...botoesDispositivo),
      h("div", { class: "es-barra-grupo es-barra-acoes" }, botaoConteudo, btnDesfazer, btnRefazer, btnHistorico, btnDescartar, btnSalvar, btnPublicar)),
    aviso, faixaVisualizacao, faixaRecuperacao,
    h("div", { class: "es-corpo" }, colunaSecoes, palco, painel),
    dialogo,
  );

  /* ---------- utilidades de tela ---------- */
  let temporizadorAviso = null;
  function avisar(texto, tipo = "ok") {
    aviso.hidden = !texto;
    aviso.textContent = texto || "";
    aviso.dataset.tipo = tipo;
    clearTimeout(temporizadorAviso);
    if (texto && tipo === "ok") temporizadorAviso = setTimeout(() => { aviso.hidden = true; }, 6000);
  }

  function perguntar({ titulo, texto, itens = [], botoes }) {
    return new Promise((resolver) => {
      const fechar = (valor) => { dialogo.close(); resolver(valor); };
      dialogo.replaceChildren(
        h("h3", { text: titulo }), texto ? h("p", { text: texto }) : null,
        itens.length ? h("ul", { class: "es-dialogo-lista" }, itens.map((i) => h("li", { text: i }))) : null,
        h("div", { class: "es-dialogo-acoes" }, botoes.map((b) => h("button", {
          type: "button", class: `es-btn ${b.classe || ""}`, "data-es-resposta": b.valor, onclick: () => fechar(b.valor),
        }, b.rotulo))),
      );
      dialogo.addEventListener("cancel", (e) => { e.preventDefault(); fechar("cancelar"); }, { once: true });
      if (typeof dialogo.showModal === "function") dialogo.showModal(); else dialogo.setAttribute("open", "");
      dialogo.querySelector("button")?.focus();
    });
  }

  function alternarSecoes(forcar) {
    const abrir = forcar ?? !colunaSecoes.classList.contains("es-aberta");
    colunaSecoes.classList.toggle("es-aberta", abrir);
    botaoConteudo.setAttribute("aria-expanded", String(abrir));
  }

  /* A página aparece com a largura de um computador (1280) ou de um celular (390) de verdade, reduzida para caber
     no palco: assim os CSS responsivos do site decidem o desenho, e não a largura do painel de administração. */
  function ajustarEscala() {
    const moldura = palco.firstElementChild;
    if (!moldura) return;
    if (janela.matchMedia?.("(max-width: 899px)").matches) { moldura.style.width = ""; moldura.style.height = ""; moldura.style.zoom = ""; return; }
    const larguraAlvo = dispositivo === "celular" ? 390 + 16 : 1280;
    const escala = Math.min(1, Math.max(0.3, (palco.clientWidth - 22) / larguraAlvo));
    const altura = Math.max(300, (palco.clientHeight - 22) / escala);
    moldura.style.width = `${larguraAlvo}px`;
    moldura.style.height = `${dispositivo === "celular" ? Math.min(altura, 860) : altura}px`;
    moldura.style.zoom = String(escala);
  }

  function definirDispositivo(d) {
    dispositivo = d;
    palco.dataset.dispositivo = d;
    for (const b of botoesDispositivo) b.setAttribute("aria-pressed", String(b.dataset.esDispositivo === d));
    ajustarEscala();
  }

  /* ---------- barra e estado ---------- */
  function atualizarBarra() {
    const sit = estado ? estado.situacao : "publicado";
    chip.dataset.situacao = sit;
    chip.textContent = visualizando ? `Visualizando a versão ${visualizando.version}` : `${ROTULO_SITUACAO[sit]}${estado?.versaoPublicada ? ` · versão ${estado.versaoPublicada}` : ""}`;
    const livre = !ocupado && !visualizando && Boolean(estado);
    btnDesfazer.disabled = !livre || !estado.podeDesfazer;
    btnRefazer.disabled = !livre || !estado.podeRefazer;
    btnSalvar.disabled = !livre || !estado.naoSalvo;
    btnPublicar.disabled = !livre || (!estado.naoSalvo && estado.diferencasComPublicado.length === 0);
    btnDescartar.disabled = !livre || (!estado.temRascunho && !estado.naoSalvo);
    btnHistorico.disabled = ocupado || !estado;
    seletorPagina.disabled = ocupado;
    root.dataset.situacao = sit;
    root.dataset.ocupado = ocupado ? "true" : "false";
  }

  function lembrarNavegador() {
    if (!memoria || !pagina || !estado) return;
    try {
      if (estado.naoSalvo) memoria.setItem(CHAVE_BACKUP(pagina.slug), JSON.stringify({ conteudo: estado.conteudo, versao: estado.versaoPublicada, em: Date.now() }));
      else memoria.removeItem(CHAVE_BACKUP(pagina.slug));
    } catch { /* sem armazenamento: o aviso de saída continua protegendo */ }
  }

  function aoMudar() {
    renderPrevia();
    atualizarBarra();
    renderSecoes();
    lembrarNavegador();
  }

  /* ---------- prévia ---------- */
  function renderPrevia() {
    if (!iframeDoc || !manifesto) return;
    aplicarConteudo(iframeDoc, manifesto, visualizando ? visualizando.content : estado.conteudo, { marcar: true, paginasConhecidas: Object.keys(DESTINOS_DO_PORTAL) });
    if (selecionada) iframeDoc.querySelector(`[data-es-chave="${selecionada}"]`)?.classList.add("es-selecionado");
  }

  function prepararQuadro() {
    try { iframeDoc = quadro.contentDocument; } catch { iframeDoc = null; }
    if (!iframeDoc || !manifesto) return;
    iframeDoc.documentElement.setAttribute("data-editor-site", "1");
    const estilo = iframeDoc.createElement("style");
    estilo.setAttribute("data-es-estilo", "");
    estilo.textContent = ESTILO_PREVIA;
    iframeDoc.head.append(estilo);
    iframeDoc.addEventListener("click", (evento) => {
      const alvo = evento.target?.closest?.("[data-es-chave]");
      const link = evento.target?.closest?.("a[href], button[type=submit], form");
      if (alvo) { evento.preventDefault(); evento.stopPropagation(); if (!visualizando) selecionar(alvo.getAttribute("data-es-chave"), { rolar: false }); return; }
      if (link) { evento.preventDefault(); avisar("Os links ficam desativados durante a edição. Clique no texto, na imagem ou no botão que você quer mudar.", "info"); }
    }, true);
    iframeDoc.addEventListener("submit", (e) => e.preventDefault(), true);
    renderPrevia();
    renderSecoes();
  }

  /* ---------- lista de conteúdo ---------- */
  function renderSecoes() {
    if (!manifesto) { listaSecoes.replaceChildren(); return; }
    const grupos = new Map();
    for (const item of manifesto.elementos) {
      if (!grupos.has(item.secao)) grupos.set(item.secao, []);
      grupos.get(item.secao).push(item);
    }
    const conteudo = visualizando ? visualizando.content : estado?.conteudo || {};
    listaSecoes.replaceChildren(...[...grupos].map(([nome, itens]) => h("details", { class: "es-grupo", open: itens.some((i) => i.chave === selecionada) || nome === "Apresentação" },
      h("summary", { text: nome }),
      h("ul", {}, itens.map((item) => {
        const valor = valorEfetivo(item, conteudo);
        const mudou = Boolean(limparConteudo(manifesto, { [item.chave]: conteudo[item.chave] || {} })[item.chave]);
        return h("li", {}, h("button", {
          type: "button", class: "es-item", "data-es-item": item.chave, "aria-current": item.chave === selecionada ? "true" : "false",
          onclick: () => { selecionar(item.chave, { rolar: true }); if (janela.matchMedia?.("(max-width: 899px)").matches) alternarSecoes(false); },
        }, h("span", { class: "es-item-tipo", "data-tipo": item.tipo, text: item.tipo === "imagem" ? "Imagem" : item.tipo === "botao" ? "Botão" : "Texto" }),
        h("span", { class: "es-item-nome", text: item.rotulo }),
        h("span", { class: "es-item-previa", text: item.tipo === "imagem" ? resumir(valor.alt || valor.src, 40) : resumir(valor.text, 40) }),
        mudou ? h("span", { class: "es-item-marca", text: "alterado", "aria-label": "alterado" }) : null));
      })))
    ));
  }

  /* ---------- painel lateral ---------- */
  function limparPainel() {
    painel.replaceChildren(
      h("div", { class: "es-vazio" },
        h("h3", { text: "Escolha o que editar" }),
        h("p", { text: "Clique em um título, texto, imagem ou botão na página ao lado. Ele fica marcado e as opções aparecem aqui." }),
        h("p", { class: "es-ajuda", text: "Nada vai para o ar até você clicar em Publicar." })));
    painel.dataset.aberto = "false";
    root.dataset.painelAberto = "false";
  }

  function selecionar(chave, { rolar = false } = {}) {
    const item = manifesto?.elementos.find((e) => e.chave === chave);
    if (!item) return;
    selecionada = chave;
    for (const marcado of iframeDoc?.querySelectorAll(".es-selecionado") || []) marcado.classList.remove("es-selecionado");
    const el = iframeDoc?.querySelector(`[data-es-chave="${chave}"]`);
    el?.classList.add("es-selecionado");
    montarPainel(item);
    root.dataset.painelAberto = "true";
    const pequeno = Boolean(janela.matchMedia?.("(max-width: 899px)").matches);
    if (el && (rolar || pequeno)) { el.scrollIntoView({ block: "center", behavior: "auto" }); if (pequeno) palco.scrollIntoView({ block: "start", behavior: "auto" }); }
    renderSecoes();
  }

  const camposComErro = (el, texto) => { el.textContent = texto || ""; el.hidden = !texto; };

  function montarPainel(item) {
    const atual = estado.valorDe(item.chave);
    const vivo = () => iframeDoc?.querySelector(`[data-es-chave="${item.chave}"]`);
    const erro = h("p", { class: "es-erro", role: "alert", hidden: true, "data-es-erro": "" });
    const cabeca = h("header", { class: "es-painel-cabeca" },
      h("p", { class: "es-painel-secao", text: item.secao }),
      h("h3", { text: item.rotulo }),
      h("button", { type: "button", class: "es-fechar", "aria-label": "Fechar painel", onclick: () => { selecionada = null; iframeDoc?.querySelector(".es-selecionado")?.classList.remove("es-selecionado"); limparPainel(); renderSecoes(); } }, "×"));
    const acoes = (aplicar, desfazer) => h("div", { class: "es-painel-acoes" },
      h("button", { type: "button", class: "es-btn es-btn-ouro", "data-es-aplicar": "", onclick: aplicar }, "Aplicar alteração"),
      h("button", { type: "button", class: "es-btn", "data-es-desfazer-campo": "", onclick: desfazer }, "Desfazer"));
    const restaurar = () => h("button", {
      type: "button", class: "es-btn es-btn-suave", "data-es-original": "", disabled: !estado.alterado(item.chave),
      onclick: () => { if (estado.restaurarOriginal(item.chave)) { aoMudar(); montarPainel(item); avisar("Voltou ao conteúdo original desta parte.", "ok"); } },
    }, "Restaurar o original");
    const campoTexto = (valor, { linhas, id }) => {
      const compoe = linhas > 1 ? "textarea" : "input";
      const campo = h(compoe, { id, class: "es-campo", maxLength: LIMITE_TEXTO, value: valor, rows: linhas > 1 ? linhas : undefined, type: linhas > 1 ? undefined : "text", "data-es-campo": "text", autocomplete: "off" });
      campo.addEventListener("keydown", (e) => { if (e.key === "Enter") e.preventDefault(); });
      return campo;
    };

    if (item.tipo === "texto" || item.tipo === "botao") {
      const longo = item.original.text.length > 70;
      const rotuloCampo = item.tipo === "botao" ? "Texto do botão" : item.rotulo;
      const campo = campoTexto(atual.text, { linhas: longo ? 6 : 2, id: "es-campo-texto" });
      const contador = h("span", { class: "es-contador" });
      const atualizarContador = () => { contador.textContent = `${campo.value.length} / ${LIMITE_TEXTO}`; };
      atualizarContador();
      campo.addEventListener("input", () => {
        if (/[\r\n]/.test(campo.value)) campo.value = campo.value.replace(/[\r\n]+/g, " ");
        atualizarContador();
        const v = vivo(); if (v && !validarTexto(campo.value)) definirTexto(v, campo.value);
        camposComErro(erro, "");
      });
      let campoLink = null, destino = null;
      const partes = [h("label", { for: "es-campo-texto", class: "es-rotulo", text: rotuloCampo }), campo, contador];
      if (item.tipo === "botao") {
        campoLink = h("input", { id: "es-campo-link", class: "es-campo", type: "text", value: atual.href, "data-es-campo": "href", autocomplete: "off", inputMode: "url", spellcheck: false });
        destino = h("p", { class: "es-destino", "data-es-destino": "" });
        const aoLink = () => {
          const e = validarLink(campoLink.value, { paginasConhecidas: Object.keys(DESTINOS_DO_PORTAL) });
          const ancoraOk = !e && campoLink.value.trim().startsWith("#") ? Boolean(iframeDoc?.getElementById(campoLink.value.trim().slice(1))) : true;
          destino.textContent = e || (!ancoraOk ? "Esse trecho não existe nesta página." : descreverDestino(campoLink.value, { rotulos: DESTINOS_DO_PORTAL }));
          destino.dataset.valido = String(!e && ancoraOk);
          const v = vivo(); if (v && !e && ancoraOk) v.setAttribute("href", campoLink.value.trim());
        };
        campoLink.addEventListener("input", () => { aoLink(); camposComErro(erro, ""); });
        aoLink();
        partes.push(h("label", { for: "es-campo-link", class: "es-rotulo", text: "Para onde o botão leva" }), campoLink, destino,
          h("p", { class: "es-ajuda", text: "Use https://… para outro site, o nome de uma página do Portal (exemplo: travessia.html) ou #trecho desta página." }),
          h("div", { class: "es-previa-botao" }, h("span", { text: "Como o botão fica:" }), h("a", { class: "es-botao-amostra", href: "#", tabIndex: -1, onclick: (e) => e.preventDefault(), "data-es-amostra": "", text: atual.text })));
        campo.addEventListener("input", () => { const a = painel.querySelector("[data-es-amostra]"); if (a) a.textContent = campo.value || " "; });
      }
      partes.push(h("details", { class: "es-original" }, h("summary", { text: "Ver o original" }), h("p", { class: "es-original-texto", text: item.original.text }),
        item.tipo === "botao" ? h("p", { class: "es-ajuda", text: `Link original: ${item.original.href}` }) : null));
      const aplicar = () => {
        const campos = { text: campo.value };
        if (campoLink) campos.href = campoLink.value.trim();
        const e = validarTexto(campos.text) || (campoLink ? validarLink(campos.href, { paginasConhecidas: Object.keys(DESTINOS_DO_PORTAL) }) : "");
        if (e) { camposComErro(erro, e); return; }
        if (campos.href?.startsWith("#") && !iframeDoc?.getElementById(campos.href.slice(1))) { camposComErro(erro, "Esse trecho não existe nesta página."); return; }
        const mudou = estado.definir(item.chave, campos);
        aoMudar();
        avisar(mudou ? "Alteração aplicada na prévia. Salve o rascunho para guardar." : "Nada mudou nesta parte.", mudou ? "ok" : "info");
      };
      const desfazerCampo = () => { montarPainel(item); renderPrevia(); };
      painel.replaceChildren(cabeca, h("div", { class: "es-painel-corpo" }, ...partes, erro, restaurar()), acoes(aplicar, desfazerCampo));
    } else {
      /* imagem */
      let arquivoNovo = null, urlLocal = null, pos = atual.pos || "";
      const resolvida = (src) => { try { return new URL(src, iframeDoc?.baseURI || janela.location.href).href; } catch { return src; } };
      const miniatura = h("img", { class: "es-miniatura", src: resolvida(atual.src), alt: "", "data-es-miniatura": "" });
      const entrada = h("input", { type: "file", id: "es-arquivo", class: "es-arquivo", accept: "image/jpeg,image/png,image/webp,image/avif", "data-es-arquivo": "" });
      entrada.addEventListener("change", () => {
        const f = entrada.files?.[0];
        if (!f) return;
        const e = validarArquivoImagem(f);
        if (e) { camposComErro(erro, e); entrada.value = ""; return; }
        camposComErro(erro, "");
        if (urlLocal) URL.revokeObjectURL(urlLocal);
        arquivoNovo = f; urlLocal = URL.createObjectURL(f);
        miniatura.src = urlLocal;
        const v = vivo(); if (v) { v.setAttribute("src", urlLocal); v.removeAttribute("srcset"); }
        nome.textContent = `${f.name} (${(f.size / 1024).toFixed(0)} KB)`;
        /* O texto alternativo antigo descreve a imagem ANTERIOR: limpa para a pessoa descrever a nova. */
        if (campoAlt.value === (item.original.alt ?? "") || campoAlt.value === (atual.alt ?? "")) campoAlt.value = "";
        campoAlt.placeholder = "Descreva a nova imagem em poucas palavras";
        campoAlt.focus();
      });
      const nome = h("p", { class: "es-ajuda", "data-es-arquivo-nome": "", text: "Formatos JPG, PNG, WebP ou AVIF, até 5 MB." });
      const campoAlt = h("input", { id: "es-campo-alt", class: "es-campo", type: "text", maxLength: LIMITE_ALT, value: atual.alt ?? "", "data-es-campo": "alt", autocomplete: "off" });
      campoAlt.addEventListener("input", () => { const v = vivo(); if (v) v.setAttribute("alt", campoAlt.value); camposComErro(erro, ""); });
      const grade = h("div", { class: "es-posicoes", role: "group", "aria-label": "Enquadramento da imagem" }, POSICOES.map(([valor, nomePos]) => h("button", {
        type: "button", class: "es-posicao", "aria-label": nomePos, title: nomePos, "aria-pressed": String(pos === valor), "data-pos": valor,
        onclick: () => { pos = valor; for (const b of grade.children) b.setAttribute("aria-pressed", String(b.dataset.pos === valor)); const v = vivo(); if (v) v.style.objectPosition = valor; },
      })));
      const aplicar = async () => {
        const e = validarAlt(campoAlt.value);
        if (e) { camposComErro(erro, e); return; }
        if (arquivoNovo && !campoAlt.value.trim()) { camposComErro(erro, "Descreva a nova imagem em poucas palavras, para quem usa leitor de tela."); campoAlt.focus(); return; }
        const campos = { alt: campoAlt.value };
        if (pos) campos.pos = pos;
        try {
          if (arquivoNovo) { ocupado = true; atualizarBarra(); avisar("Enviando a imagem…", "info"); campos.src = await api.enviarImagem(pagina.slug, arquivoNovo); }
        } catch (erroEnvio) { ocupado = false; atualizarBarra(); camposComErro(erro, erroEnvio.message); avisar(erroEnvio.message, "erro"); return; }
        ocupado = false;
        const mudou = estado.definir(item.chave, campos);
        arquivoNovo = null;
        aoMudar(); montarPainel(item);
        avisar(mudou ? "Imagem aplicada na prévia. Salve o rascunho para guardar." : "Nada mudou nesta imagem.", mudou ? "ok" : "info");
      };
      const desfazerCampo = () => { if (urlLocal) URL.revokeObjectURL(urlLocal); montarPainel(item); renderPrevia(); };
      painel.replaceChildren(cabeca, h("div", { class: "es-painel-corpo" },
        h("p", { class: "es-rotulo", text: "Imagem atual" }), miniatura,
        h("label", { for: "es-arquivo", class: "es-btn es-btn-arquivo", text: "Escolher outra imagem" }), entrada, nome,
        h("label", { for: "es-campo-alt", class: "es-rotulo", text: "Texto alternativo (descreve a imagem)" }), campoAlt,
        h("p", { class: "es-rotulo", text: "Qual parte da imagem aparece" }), grade,
        h("button", { type: "button", class: "es-btn es-btn-suave", onclick: () => { pos = ""; for (const b of grade.children) b.setAttribute("aria-pressed", "false"); const v = vivo(); if (v) v.style.objectPosition = ""; } }, "Enquadramento original"),
        erro, restaurar()), acoes(() => void aplicar(), desfazerCampo));
    }
    painel.dataset.aberto = "true";
    painel.querySelector("input, textarea")?.focus({ preventScroll: true });
  }

  /* ---------- ações ---------- */
  function desfazerTudo() { if (estado?.desfazer()) { aoMudar(); if (selecionada) selecionar(selecionada); } }
  function refazerTudo() { if (estado?.refazer()) { aoMudar(); if (selecionada) selecionar(selecionada); } }

  async function recarregarDoBanco() {
    carga = await api.carregar(pagina.slug);
    estado.recarregar({ publicado: carga.published, rascunho: carga.draft });
  }

  async function tratarConflito(erro, { aoSobrescrever } = {}) {
    const opcoes = [
      { valor: "recarregar", rotulo: "Carregar a versão mais recente", classe: "es-btn-forte" },
      ...(aoSobrescrever ? [{ valor: "manter", rotulo: "Manter as minhas alterações" }] : []),
      { valor: "cancelar", rotulo: "Decidir depois" },
    ];
    const r = await perguntar({
      titulo: "Esta página mudou em outra aba ou janela",
      texto: `${erro.message} Para não perder trabalho de ninguém, escolha como seguir.`,
      itens: ["Carregar a versão mais recente traz o que está no banco e descarta o que você ainda não salvou aqui.", ...(aoSobrescrever ? ["Manter as minhas alterações grava o que está nesta tela por cima do rascunho da outra aba."] : [])],
      botoes: opcoes,
    });
    if (r === "recarregar") { await recarregarDoBanco(); aoMudar(); limparPainel(); selecionada = null; avisar("Página recarregada com a versão mais recente.", "ok"); }
    else if (r === "manter" && aoSobrescrever) await aoSobrescrever();
  }

  async function salvarRascunho({ silencioso = false } = {}) {
    if (!estado || ocupado) return false;
    const conteudo = limparConteudo(manifesto, estado.conteudo);
    const problemas = validarConteudo(conteudo, { paginasConhecidas: Object.keys(DESTINOS_DO_PORTAL) });
    if (problemas.length) { avisar(`Revise antes de salvar: ${problemas[0].erro}`, "erro"); return false; }
    ocupado = true; atualizarBarra();
    try {
      const r = await api.salvarRascunho(pagina.slug, conteudo, estado.revisao);
      estado.marcarSalvo({ revision: r.revision });
      lembrarNavegador();
      if (!silencioso) avisar("Rascunho salvo. Ele ainda não está no site público.", "ok");
      return true;
    } catch (erro) {
      if (erro.codigo === "CONFLITO") {
        ocupado = false; atualizarBarra();
        await tratarConflito(erro, { aoSobrescrever: async () => {
          const meu = estado.conteudo;
          await recarregarDoBanco();
          estado.carregarNaoSalvo(meu);
          await salvarRascunho();
        } });
        return false;
      }
      avisar(erro.message, "erro");
      return false;
    } finally { ocupado = false; atualizarBarra(); }
  }

  async function publicar() {
    if (!estado || ocupado) return;
    const conteudoFinal = limparConteudo(manifesto, estado.conteudo);
    const problemas = validarConteudo(conteudoFinal, { paginasConhecidas: Object.keys(DESTINOS_DO_PORTAL) });
    if (problemas.length) { avisar(`Revise antes de publicar: ${problemas[0].erro}`, "erro"); return; }
    const mudancas = estado.diferencasComPublicado.map((c) => manifesto.elementos.find((e) => e.chave === c)?.rotulo || c);
    const r = await perguntar({
      titulo: `Publicar “${pagina.titulo}”?`,
      texto: "Estas alterações passam a aparecer para todas as pessoas que visitam o site, na hora. Você pode restaurar uma versão anterior depois, pelo Histórico.",
      itens: mudancas.length ? mudancas.slice(0, 12).map((m) => m).concat(mudancas.length > 12 ? [`… e mais ${mudancas.length - 12}`] : []) : ["Volta ao conteúdo original da página."],
      botoes: [{ valor: "publicar", rotulo: "Publicar agora", classe: "es-btn-ouro" }, { valor: "cancelar", rotulo: "Cancelar" }],
    });
    if (r !== "publicar") return;
    if (estado.naoSalvo && !(await salvarRascunho({ silencioso: true }))) return;
    ocupado = true; atualizarBarra();
    try {
      const pub = await api.publicar(pagina.slug, estado.versaoPublicada, estado.revisao);
      estado.marcarPublicado({ version: pub.version });
      lembrarNavegador();
      await recarregarHistorico();
      aoMudar();
      avisar(`Publicado. A versão ${pub.version} já está no ar.`, "ok");
    } catch (erro) {
      if (erro.codigo === "CONFLITO") { ocupado = false; await tratarConflito(erro); }
      else avisar(erro.message, "erro");
    } finally { ocupado = false; atualizarBarra(); }
  }

  async function descartarRascunho() {
    if (!estado || ocupado) return;
    const r = await perguntar({
      titulo: "Descartar as alterações?",
      texto: estado.temRascunho ? "O rascunho salvo e o que está na tela serão apagados. O site publicado não muda." : "O que você mexeu e ainda não salvou será desfeito. O site publicado não muda.",
      botoes: [{ valor: "descartar", rotulo: "Descartar", classe: "es-btn-perigo" }, { valor: "cancelar", rotulo: "Manter" }],
    });
    if (r !== "descartar") return;
    ocupado = true; atualizarBarra();
    try {
      if (estado.temRascunho) await api.descartarRascunho(pagina.slug, estado.revisao);
      estado.marcarDescartado();
      lembrarNavegador();
      selecionada = null; limparPainel(); aoMudar();
      avisar("Alterações descartadas. A página voltou ao que está publicado.", "ok");
    } catch (erro) {
      if (erro.codigo === "CONFLITO") { ocupado = false; await tratarConflito(erro); } else avisar(erro.message, "erro");
    } finally { ocupado = false; atualizarBarra(); }
  }

  async function recarregarHistorico() { carga = await api.carregar(pagina.slug); }

  function sairDaVisualizacao() {
    visualizando = null;
    faixaVisualizacao.hidden = true;
    aoMudar();
  }

  async function abrirHistorico() {
    if (!estado || ocupado) return;
    try { await recarregarHistorico(); } catch (erro) { avisar(erro.message, "erro"); return; }
    const hist = carga.history || [];
    const lista = hist.length
      ? h("ul", { class: "es-historico", "data-es-historico-lista": "" }, hist.map((v) => h("li", {},
        h("div", {}, h("strong", { text: `Versão ${v.version}` }), h("span", { class: "es-ajuda", text: ` · ${v.action === "restore" ? `restaurada da versão ${v.restored_from}` : "publicada"} · ${dataCurta(v.at)} · ${v.elements} ${v.elements === 1 ? "alteração" : "alterações"}` }),
          v.version === estado.versaoPublicada ? h("span", { class: "es-chip", "data-situacao": "publicado", text: "no ar agora" }) : null),
        h("div", { class: "es-historico-acoes" },
          h("button", { type: "button", class: "es-btn", "data-es-ver": v.version, onclick: () => void verVersao(v.version) }, "Ver na página"),
          v.version === estado.versaoPublicada ? null : h("button", { type: "button", class: "es-btn es-btn-ouro", "data-es-restaurar": v.version, onclick: () => void restaurar(v.version) }, "Restaurar")))))
      : h("p", { class: "es-ajuda", text: "Ainda não há versões publicadas desta página. Quando você publicar, cada versão fica guardada aqui." });
    dialogo.replaceChildren(h("h3", { text: `Histórico de “${pagina.titulo}”` }), lista,
      h("div", { class: "es-dialogo-acoes" }, h("button", { type: "button", class: "es-btn", "data-es-fechar-dialogo": "", onclick: () => dialogo.close() }, "Fechar")));
    if (typeof dialogo.showModal === "function") dialogo.showModal(); else dialogo.setAttribute("open", "");
  }

  async function verVersao(version) {
    try {
      const conteudo = await api.conteudoDaVersao(pagina.slug, version);
      dialogo.close();
      visualizando = { version, content: conteudo };
      faixaVisualizacao.replaceChildren(
        h("span", { text: `Você está vendo a versão ${version}. Nada foi alterado.` }),
        h("button", { type: "button", class: "es-btn", "data-es-voltar": "", onclick: sairDaVisualizacao }, "Voltar à edição"),
        h("button", { type: "button", class: "es-btn es-btn-ouro", onclick: () => void restaurar(version) }, "Restaurar esta versão"));
      faixaVisualizacao.hidden = false;
      aoMudar();
    } catch (erro) { avisar(erro.message, "erro"); }
  }

  async function restaurar(version) {
    if (!estado || ocupado) return;
    const comRascunho = estado.temRascunho || estado.naoSalvo;
    const r = await perguntar({
      titulo: `Restaurar a versão ${version}?`,
      texto: "A página volta a mostrar o conteúdo dessa versão, na hora, para todo o público. A versão atual continua guardada no histórico.",
      itens: comRascunho ? ["Você tem alterações em rascunho. Elas serão descartadas ao restaurar."] : [],
      botoes: [{ valor: "restaurar", rotulo: "Restaurar agora", classe: "es-btn-ouro" }, { valor: "cancelar", rotulo: "Cancelar" }],
    });
    if (r !== "restaurar") return;
    if (dialogo.open) dialogo.close();
    ocupado = true; atualizarBarra();
    try {
      const resp = await api.restaurar(pagina.slug, version, estado.versaoPublicada, comRascunho);
      visualizando = null; faixaVisualizacao.hidden = true;
      await recarregarDoBanco();
      lembrarNavegador();
      selecionada = null; limparPainel(); aoMudar();
      avisar(`Versão ${version} restaurada como versão ${resp.version}.`, "ok");
    } catch (erro) {
      if (erro.codigo === "CONFLITO") { ocupado = false; await tratarConflito(erro); } else avisar(erro.message, "erro");
    } finally { ocupado = false; atualizarBarra(); }
  }

  /* ---------- páginas ---------- */
  async function carregarPagina(slug) {
    const alvo = PAGINAS_EDITAVEIS.find((p) => p.slug === slug);
    if (!alvo) return;
    ocupado = true; atualizarBarra(); avisar("Abrindo a página…", "info");
    try {
      const [mf, dados] = await Promise.all([carregarManifesto(slug), api.carregar(slug)]);
      pagina = alvo; manifesto = mf; carga = dados;
      estado = criarEstadoEditor({ manifesto: mf, publicado: dados.published, rascunho: dados.draft });
      selecionada = null; visualizando = null; faixaVisualizacao.hidden = true;
      seletorPagina.value = slug;
      limparPainel();
      iframeDoc = null;
      await new Promise((resolver, rejeitar) => {
        const limite = setTimeout(() => rejeitar(new Error("A página demorou demais para abrir.")), 30000);
        quadro.addEventListener("load", () => { clearTimeout(limite); resolver(); }, { once: true });
        quadro.src = new URL(`${alvo.arquivo}?editor-site=1`, janela.location.origin).href;
      });
      prepararQuadro();
      ajustarEscala();
      oferecerRecuperacao();
      avisar("", "ok");
    } catch (erro) {
      avisar(erro instanceof ErroEditarSite ? erro.message : "Não foi possível abrir essa página agora. Tente de novo.", "erro");
    } finally { ocupado = false; aoMudar(); }
  }

  function oferecerRecuperacao() {
    faixaRecuperacao.hidden = true;
    if (!memoria || !pagina) return;
    let guardado = null;
    try { guardado = JSON.parse(memoria.getItem(CHAVE_BACKUP(pagina.slug)) || "null"); } catch { guardado = null; }
    if (!guardado?.conteudo) return;
    const proprio = JSON.stringify(limparConteudo(manifesto, guardado.conteudo));
    if (proprio === JSON.stringify(limparConteudo(manifesto, estado.conteudo))) { try { memoria.removeItem(CHAVE_BACKUP(pagina.slug)); } catch { /* ok */ } return; }
    faixaRecuperacao.replaceChildren(
      h("span", { text: `Encontramos alterações não salvas desta página, de ${dataCurta(guardado.em)}, neste navegador.` }),
      h("button", { type: "button", class: "es-btn es-btn-ouro", "data-es-recuperar": "", onclick: () => { estado.carregarNaoSalvo(limparConteudo(manifesto, guardado.conteudo)); faixaRecuperacao.hidden = true; aoMudar(); avisar("Alterações recuperadas. Salve o rascunho para guardá-las.", "ok"); } }, "Recuperar"),
      h("button", { type: "button", class: "es-btn", onclick: () => { try { memoria.removeItem(CHAVE_BACKUP(pagina.slug)); } catch { /* ok */ } faixaRecuperacao.hidden = true; } }, "Descartar"));
    faixaRecuperacao.hidden = false;
  }

  seletorPagina.addEventListener("change", async () => {
    const novo = seletorPagina.value;
    if (estado?.naoSalvo) {
      const r = await perguntar({
        titulo: "Há alterações não salvas",
        texto: `Você mexeu em “${pagina.titulo}” e ainda não salvou o rascunho.`,
        botoes: [{ valor: "salvar", rotulo: "Salvar rascunho e trocar", classe: "es-btn-ouro" }, { valor: "trocar", rotulo: "Trocar sem salvar" }, { valor: "ficar", rotulo: "Ficar nesta página" }],
      });
      if (r === "ficar" || r === "cancelar") { seletorPagina.value = pagina.slug; return; }
      if (r === "salvar" && !(await salvarRascunho({ silencioso: true }))) { seletorPagina.value = pagina.slug; return; }
    }
    await carregarPagina(novo);
  });

  const aviseAoSair = (evento) => { if (estado?.naoSalvo) { evento.preventDefault(); evento.returnValue = ""; } };
  janela.addEventListener("beforeunload", aviseAoSair);

  limparPainel();
  atualizarBarra();
  const observador = typeof janela.ResizeObserver === "function" ? new janela.ResizeObserver(() => ajustarEscala()) : null;
  observador?.observe(palco);
  janela.addEventListener("resize", ajustarEscala);

  return {
    /** Abre o editor (na primeira vez carrega a primeira página). */
    async abrir() {
      if (aberto) return;
      aberto = true;
      await carregarPagina(seletorPagina.value || PAGINAS_EDITAVEIS[0].slug);
    },
    limpar() {
      aberto = false; pagina = null; manifesto = null; estado = null; carga = null; selecionada = null; iframeDoc = null; visualizando = null;
      quadro.removeAttribute("src");
      limparPainel(); listaSecoes.replaceChildren(); atualizarBarra();
    },
    get estado() { return estado; },
    destruir() { janela.removeEventListener("beforeunload", aviseAoSair); janela.removeEventListener("resize", ajustarEscala); observador?.disconnect(); },
  };
}
