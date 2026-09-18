/*
 * A MESA DO CADERNO: a casca que junta as telas.
 *
 * Rotas pelo endereço (#/visao, #/posts, #/novo, #/editar/<id>,
 * #/comentarios, #/configuracoes), para que voltar, recarregar e abrir em
 * outra aba funcionem como se espera. A "loja" guarda o que a mesa leu do
 * banco; toda gravação passa por aqui e atualiza a loja com a resposta do
 * banco — a tela nunca finge um status que o banco não confirmou.
 */
import { definirCategorias, rotuloDaCategoria } from "../blog/article-renderer.js";
import { carregarDadosDaMesa } from "./blog-desk.js";
import { createBlogEditor, mergeDraftPosts, postPreview } from "./blog-editor.js";
import { criarBiblioteca } from "./mesa-midia.js";
import { enderecoLivre, textoAtual } from "./mesa-modelo.js";
import { criarAvisos, criarConfirmacao, criarMenu, criarPaleta, esc } from "./mesa-ui.js";
import { criarComentarios, criarConfiguracoes, criarListaDePosts, criarVisaoGeral } from "./mesa-visoes.js";

const TELAS = ["visao", "posts", "comentarios", "configuracoes"];

export function lerRota(hash) {
  const [caminho = "", busca = ""] = String(hash || "").replace(/^#\/?/, "").split("?");
  const [tela = "", id = ""] = caminho.split("/").filter(Boolean);
  const parametros = Object.fromEntries(new URLSearchParams(busca));
  if (tela === "editar" && id) return { tela: "editor", id: decodeURIComponent(id), parametros };
  if (tela === "novo") return { tela: "editor", id: "", parametros };
  return { tela: TELAS.includes(tela) ? tela : "visao", parametros };
}

export const novoIdDePost = (agora = new Date()) => `post-${agora.toISOString().replace(/\D/g, "").slice(0, 14)}-${Math.random().toString(36).slice(2, 6)}`;

export function criarMesa({ raiz, repositorio }) {
  const $ = (seletor) => raiz.querySelector(seletor);
  const tela = (nome) => raiz.querySelector(`[data-mesa-view="${nome}"]`);
  const conteudo = $("[data-mesa-conteudo]");
  const loja = {
    registros: [], categorias: [], comentarios: [], leituras: {}, inscritos: 0, configuracao: null,
    falhas: [], falhaDosComentarios: "", demonstracao: false, carregado: false,
  };
  const avisos = criarAvisos($("[data-mesa-avisos]"));
  const confirmar = criarConfirmacao($("[data-mesa-confirmar]"));
  const menu = criarMenu($("[data-mesa-menu]"));
  const paleta = criarPaleta($("[data-mesa-paleta]"));
  let ativa = false;
  let rotaAtual = null;
  let previaPendente = null;
  let roteando = Promise.resolve();

  const ctx = {
    loja,
    repositorio,
    usuario: null,
    avisos,
    confirmar,
    menu,
    rotuloDaCategoria,
    navegar(destino) {
      if (globalThis.location.hash === destino) rotear();
      else globalThis.location.hash = destino;
    },
    executar: executarAcao,
    salvarRegistro,
    excluirRegistro,
    atualizarContadores,
    categoriasMudaram() { definirCategorias(loja.categorias); },
    recarregar: () => carregar().then(() => mostrar(rotaAtual || lerRota(globalThis.location.hash))),
    aoCriar(id) {
      globalThis.history.replaceState(null, "", `#/editar/${encodeURIComponent(id)}`);
      rotaAtual = lerRota(globalThis.location.hash);
    },
    definirPrevia(fornecedor) { previaPendente = fornecedor; },
    menuAberto: () => !$("[data-mesa-menu]").hidden,
  };
  ctx.biblioteca = criarBiblioteca({ dialogo: $("[data-mesa-biblioteca]"), repositorio, avisos });

  const telas = {
    visao: criarVisaoGeral(tela("visao"), ctx),
    posts: criarListaDePosts(tela("posts"), ctx),
    comentarios: criarComentarios(tela("comentarios"), ctx),
    configuracoes: criarConfiguracoes(tela("configuracoes"), ctx),
  };
  const editor = createBlogEditor({ root: tela("editor"), ctx });

  /* ---------------- dados ---------------- */

  async function carregar() {
    raiz.dataset.carregando = "true";
    try {
      const dados = await carregarDadosDaMesa(repositorio);
      Object.assign(loja, dados, {
        demonstracao: Boolean(repositorio.demonstracao),
        carregado: true,
        falhaDosComentarios: dados.falhas.some((falha) => falha.contexto === "blog.comentarios") ? "Não foi possível ler os comentários." : "",
      });
      definirCategorias(loja.categorias);
      atualizarContadores();
    } finally {
      delete raiz.dataset.carregando;
    }
  }

  async function salvarRegistro(documento, acao, opcoes = {}) {
    const registro = await repositorio.salvar(documento, acao, opcoes);
    const indice = loja.registros.findIndex((item) => item.id === registro.id);
    if (indice >= 0) loja.registros[indice] = registro;
    else loja.registros.unshift(registro);
    if (registro.post.featured && acao !== "pendente") {
      for (const outro of loja.registros) {
        if (outro.id !== registro.id && outro.post.featured) outro.post = { ...outro.post, featured: false };
      }
    }
    return registro;
  }

  async function excluirRegistro(id) {
    await repositorio.remover(id);
    loja.registros = loja.registros.filter((item) => item.id !== id);
  }

  function atualizarContadores() {
    const pendentes = loja.comentarios.filter((item) => item.status === "pending").length;
    for (const selo of raiz.querySelectorAll("[data-mesa-selo-comentarios]")) {
      selo.textContent = pendentes > 99 ? "99+" : String(pendentes);
      selo.hidden = !pendentes;
    }
    const link = $('[data-mesa-nav="comentarios"]');
    link?.setAttribute("aria-label", pendentes ? `Comentários, ${pendentes} aguardando` : "Comentários");
  }

  /* ---------------- ações sobre um texto (menu "⋯") ---------------- */

  function abrirPrevia(dados) {
    previaPendente = () => dados;
    globalThis.open(`artigo.html?preview=1&post=${encodeURIComponent(dados.slug)}`, "_blank");
  }

  async function executarAcao(acao, registro) {
    const post = textoAtual(registro);
    const redesenhar = () => { if (rotaAtual?.tela && telas[rotaAtual.tela]) (telas[rotaAtual.tela].redesenhar || telas[rotaAtual.tela].desenhar)(); };
    try {
      if (acao === "editar") { ctx.navegar(`#/editar/${encodeURIComponent(registro.id)}`); return; }
      if (acao === "agendar") { ctx.navegar(`#/editar/${encodeURIComponent(registro.id)}?agendar=1`); return; }
      if (acao === "visualizar") {
        if (registro.status === "published") globalThis.open(`artigo.html?post=${encodeURIComponent(registro.post.slug)}`, "_blank", "noopener");
        else abrirPrevia({ posts: mergeDraftPosts(loja.registros.map(textoAtual), { ...post, status: "published" }), slug: post.slug });
        return;
      }
      if (acao === "duplicar") {
        const titulo = `${post.title} (cópia)`;
        const copia = { ...JSON.parse(JSON.stringify(post)), id: novoIdDePost(), title: titulo, slug: enderecoLivre(titulo, loja.registros), featured: false };
        const nova = await salvarRegistro(copia, "rascunho", { registrar: true, resumo: `Cópia de “${post.title}”` });
        redesenhar();
        avisos.mostrar("Cópia criada como rascunho.", { acao: { rotulo: "Abrir", executar: () => ctx.navegar(`#/editar/${encodeURIComponent(nova.id)}`) } });
        return;
      }
      if (acao === "despublicar") {
        const agendado = registro.status === "scheduled";
        const ok = await confirmar(agendado
          ? { titulo: "Cancelar o agendamento?", texto: `“${post.title}” não será mais publicado sozinho e volta a ser rascunho.`, confirmar: "Cancelar agendamento" }
          : { titulo: "Tirar este texto do ar?", texto: `“${post.title}” sai do Blog agora e volta a ser rascunho.`, confirmar: "Tirar do ar", perigo: true });
        if (!ok) return;
        await salvarRegistro(post, "despublicar", { registrar: true, resumo: agendado ? "Agendamento cancelado" : "Tirado do ar" });
        redesenhar();
        avisos.mostrar(agendado ? "Agendamento cancelado. O texto voltou a ser rascunho." : "O texto saiu do ar e voltou a ser rascunho.");
        return;
      }
      if (acao === "arquivar") {
        const ok = await confirmar({ titulo: "Arquivar este texto?", texto: registro.status === "published" ? `“${post.title}” sai do Blog e fica guardado no arquivo.` : `“${post.title}” vai para o arquivo.`, confirmar: "Arquivar" });
        if (!ok) return;
        await salvarRegistro(post, "arquivar", { registrar: true, resumo: "Arquivado" });
        redesenhar();
        avisos.mostrar("Texto arquivado.");
        return;
      }
      if (acao === "restaurar") {
        await salvarRegistro(post, "despublicar", { registrar: true, resumo: "Tirado do arquivo" });
        redesenhar();
        avisos.mostrar("O texto voltou a ser rascunho.");
        return;
      }
      if (acao === "excluir") {
        const ok = await confirmar({ titulo: "Excluir este texto?", texto: `“${post.title}” é apagado de vez, com o histórico. Se quiser só tirá-lo de circulação, arquive.`, confirmar: "Excluir", perigo: true });
        if (!ok) return;
        await excluirRegistro(registro.id);
        redesenhar();
        avisos.mostrar("Texto excluído.");
      }
    } catch (erro) {
      avisos.mostrar(`Não foi possível concluir: ${erro.message}`, { tipo: "erro" });
    }
  }

  /* ---------------- rotas ---------------- */

  function marcarNavegacao(nome) {
    for (const link of raiz.querySelectorAll("[data-mesa-nav]")) {
      const atual = link.dataset.mesaNav === nome || (nome === "editor" && link.dataset.mesaNav === "posts");
      if (atual) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
  }

  function mostrarErroGeral(erro) {
    const alvo = tela(rotaAtual?.tela === "editor" ? "posts" : rotaAtual?.tela || "visao");
    for (const secao of raiz.querySelectorAll("[data-mesa-view]")) secao.hidden = secao !== alvo;
    alvo.innerHTML = `<div class="mesa-vazio is-erro" role="alert"><p>Não foi possível carregar a mesa: ${esc(erro.message)}</p><button type="button" class="mesa-botao mesa-botao--contorno" data-mesa-recarregar>Tentar de novo</button></div>`;
  }

  function mostrar(rota) {
    rotaAtual = rota;
    raiz.dataset.tela = rota.tela;
    fecharGaveta();
    menu.fechar();
    marcarNavegacao(rota.tela);
    if (rota.tela === "editor") {
      if (!editor.abrir(rota.id, { agendar: rota.parametros.agendar === "1" })) {
        avisos.mostrar("Esse texto não foi encontrado. Ele pode ter sido excluído.", { tipo: "erro", duracao: 5000 });
        globalThis.history.replaceState(null, "", "#/posts");
        mostrar(lerRota("#/posts"));
        return;
      }
      for (const secao of raiz.querySelectorAll("[data-mesa-view]")) secao.hidden = secao.dataset.mesaView !== "editor";
      document.title = `${editor.registro ? textoAtual(editor.registro).title : "Novo post"} — Mesa do Caderno`;
      return;
    }
    for (const secao of raiz.querySelectorAll("[data-mesa-view]")) secao.hidden = secao.dataset.mesaView !== rota.tela;
    telas[rota.tela].desenhar(rota.parametros);
    document.title = `${telas[rota.tela].titulo} — Mesa do Caderno`;
    if (conteudo) conteudo.scrollTop = 0;
    tela(rota.tela).querySelector(".mesa-titulo")?.focus({ preventScroll: true });
  }

  async function rotearAgora() {
    if (!ativa) return;
    const rota = lerRota(globalThis.location.hash);
    const mesmoTexto = rota.tela === "editor" && rotaAtual?.tela === "editor" && rota.id && rota.id === editor.registro?.id;
    if (mesmoTexto && rota.parametros.agendar !== "1") return;
    /* Sair do editor (ou reabrir o mesmo texto para agendar) grava antes o que falta. */
    if (rotaAtual?.tela === "editor") {
      const ok = await editor.sair();
      if (!ok) {
        const sair = await confirmar({ titulo: "Sair sem salvar?", texto: "As últimas alterações não foram salvas. Se sair agora, elas se perdem.", confirmar: "Sair sem salvar", perigo: true });
        if (!sair) {
          globalThis.history.replaceState(null, "", editor.registro ? `#/editar/${encodeURIComponent(editor.registro.id)}` : "#/novo");
          return;
        }
      }
    }
    if (!loja.carregado) {
      try {
        await carregar();
      } catch (erro) {
        rotaAtual = rota;
        mostrarErroGeral(erro);
        return;
      }
    }
    mostrar(rota);
  }

  function rotear() {
    roteando = roteando.then(rotearAgora, rotearAgora);
    return roteando;
  }

  /* ---------------- gaveta (celular) ---------------- */

  const gaveta = $("[data-mesa-trilho]");
  const botaoDaGaveta = $("[data-mesa-gaveta]");
  function abrirGaveta() {
    raiz.dataset.gaveta = "aberta";
    botaoDaGaveta?.setAttribute("aria-expanded", "true");
    gaveta?.querySelector("a, button")?.focus();
  }
  function fecharGaveta({ devolverFoco = false } = {}) {
    if (raiz.dataset.gaveta !== "aberta") return;
    delete raiz.dataset.gaveta;
    botaoDaGaveta?.setAttribute("aria-expanded", "false");
    if (devolverFoco) botaoDaGaveta?.focus();
  }

  /* ---------------- paleta e atalhos ---------------- */

  function comandosGerais() {
    const recentes = [...loja.registros].sort((a, b) => (Date.parse(b.atualizadoEm) || 0) - (Date.parse(a.atualizadoEm) || 0));
    return [
      { grupo: "Ir para", rotulo: "Novo post", icone: "plus", executar: () => ctx.navegar("#/novo") },
      { grupo: "Ir para", rotulo: "Visão geral", icone: "layout-dashboard", executar: () => ctx.navegar("#/visao") },
      { grupo: "Ir para", rotulo: "Posts", icone: "file-text", executar: () => ctx.navegar("#/posts") },
      { grupo: "Ir para", rotulo: "Buscar no blog", icone: "search", executar: async () => { ctx.navegar("#/posts"); await roteando; tela("posts").querySelector("[data-posts-busca]")?.focus(); } },
      { grupo: "Ir para", rotulo: "Comentários", icone: "message-circle", executar: () => ctx.navegar("#/comentarios") },
      { grupo: "Ir para", rotulo: "Configurações", icone: "settings", executar: () => ctx.navegar("#/configuracoes") },
      { grupo: "Ir para", rotulo: "Abrir o Blog público", icone: "external-link", executar: () => globalThis.open("blog.html", "_blank", "noopener") },
      ...recentes.map((registro) => ({ grupo: "Textos", rotulo: textoAtual(registro).title, icone: "pencil", executar: () => ctx.navegar(`#/editar/${encodeURIComponent(registro.id)}`) })),
    ];
  }

  document.addEventListener("keydown", (evento) => {
    if (!ativa) return;
    const modificador = evento.ctrlKey || evento.metaKey;
    const tecla = evento.key.toLowerCase();
    if (modificador && tecla === "k") {
      evento.preventDefault();
      if ($("[data-mesa-paleta]").open) return;
      paleta.abrir([...(rotaAtual?.tela === "editor" ? editor.comandos() : []), ...comandosGerais()]);
      return;
    }
    if (modificador && tecla === "s") {
      evento.preventDefault();
      if (rotaAtual?.tela === "editor") editor.salvarAgora();
      else avisos.mostrar("Aqui não há nada a salvar: o editor salva sozinho.", { tipo: "info" });
      return;
    }
    if (evento.key === "Escape" && raiz.dataset.gaveta === "aberta") fecharGaveta({ devolverFoco: true });
  });

  raiz.addEventListener("click", (evento) => {
    if (evento.target.closest("[data-mesa-gaveta]")) {
      if (raiz.dataset.gaveta === "aberta") fecharGaveta({ devolverFoco: true });
      else abrirGaveta();
      return;
    }
    if (evento.target.closest("[data-mesa-veu]")) { fecharGaveta({ devolverFoco: true }); return; }
    if (evento.target.closest("[data-mesa-paleta-abrir]")) {
      paleta.abrir([...(rotaAtual?.tela === "editor" ? editor.comandos() : []), ...comandosGerais()]);
      return;
    }
    if (evento.target.closest("[data-mesa-recarregar]")) {
      carregar().then(() => mostrar(rotaAtual || lerRota(globalThis.location.hash))).catch(mostrarErroGeral);
      return;
    }
    if (evento.target.closest("[data-mesa-trilho] a")) fecharGaveta();
  });

  globalThis.addEventListener("hashchange", () => rotear());
  globalThis.addEventListener("beforeunload", (evento) => {
    if (!ativa || rotaAtual?.tela !== "editor" || !editor.temMudancas()) return;
    editor.guardar();
    evento.preventDefault();
    evento.returnValue = "";
  });
  document.addEventListener("visibilitychange", () => {
    if (ativa && document.visibilityState === "hidden" && rotaAtual?.tela === "editor" && editor.temMudancas()) editor.guardar();
  });

  /* A prévia (no quadro ou em outra aba) avisa quando está pronta e recebe o texto. */
  globalThis.addEventListener("message", (evento) => {
    if (evento.origin !== globalThis.location.origin || evento.data?.type !== "potala:blog-preview-pronto") return;
    const fornecedor = rotaAtual?.tela === "editor" && (!previaPendente || evento.source === tela("editor").querySelector("[data-previa-quadro]")?.contentWindow)
      ? editor.dadosDaPrevia
      : previaPendente;
    const dados = fornecedor?.();
    if (dados) postPreview(evento.source, dados.posts, dados.slug, globalThis.location.origin);
  });

  return {
    /* Entra (ou volta) na mesa: relê tudo do repositório atual. */
    async entrar({ usuario = null } = {}) {
      ativa = true;
      ctx.usuario = usuario;
      loja.carregado = false;
      rotaAtual = null;
      const perfil = $("[data-mesa-perfil]");
      if (perfil) {
        perfil.textContent = usuario?.iniciais || "T";
        perfil.title = usuario?.nome ? `Conectado como ${usuario.nome}` : "Acesso de teste";
      }
      raiz.dataset.demonstracao = String(Boolean(repositorio.demonstracao));
      await rotear();
    },
    sair() {
      ativa = false;
      rotaAtual = null;
    },
  };
}
