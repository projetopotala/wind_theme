import { arteDaCapa } from "./blog-arte.js";
import {
  CATEGORIAS,
  POSTS,
  cartaDoDia,
  contarPorCategoria,
  dataLegivel,
  filtrarPorCategoria,
} from "./blog-data.js";

/*
 * O BLOG, montado no navegador.
 *
 * Desenhado por JavaScript e não escrito à mão no HTML porque o acervo vai
 * crescer e mudar de origem: hoje é uma lista neste repositório, amanhã é o
 * Supabase que o painel admin já alimenta. O que o HTML declara são os LUGARES
 * — destaque, grade, lateral, conversa — e nenhum conteúdo.
 */

const escapar = (valor) => String(valor ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

/**
 * Um cartão de publicação.
 *
 * `destaque` muda a moldura, não o conteúdo: o mesmo texto aparece grande no
 * topo e pequeno na grade, e duplicar a marcação faria as duas versões
 * divergirem no primeiro ajuste.
 */
export function cartaoDoPost(post, { destaque = false } = {}) {
  if (!post) return "";
  const { iso, texto } = dataLegivel(post.data);
  const rotulo = CATEGORIAS.find((c) => c.id === post.categoria)?.rotulo || post.categoria;
  return `
    <article class="post${destaque ? " post--destaque" : ""}">
      <a class="post-capa" href="#${escapar(post.id)}" tabindex="-1" aria-hidden="true">
        ${arteDaCapa(post.motivo)}
      </a>
      <div class="post-texto">
        <p class="post-etiqueta">${escapar(rotulo)}</p>
        <h3 class="post-titulo"><a href="#${escapar(post.id)}">${escapar(post.titulo)}</a></h3>
        <p class="post-resumo">${escapar(post.resumo)}</p>
        <p class="post-credito">
          <span>${escapar(post.autor)}</span>
          <time datetime="${escapar(iso)}">${escapar(texto)}</time>
          <span>${escapar(post.leitura)} min de leitura</span>
        </p>
      </div>
    </article>`;
}

/** A navegação editorial, com as categorias vazias desligadas. */
export function marcacaoDasCategorias(posts, ativa = "todos") {
  const contas = contarPorCategoria(posts);
  return CATEGORIAS.map((categoria) => {
    const quantos = contas[categoria.id] || 0;
    /*
     * Uma aba vazia é desabilitada, e não escondida.
     *
     * Escondê-la faria a navegação mudar de tamanho conforme o filtro, e a
     * categoria em que se acabou de clicar sumiria debaixo do cursor.
     */
    const vazia = quantos === 0;
    return `<li>
      <button type="button" data-categoria="${escapar(categoria.id)}"
        aria-pressed="${categoria.id === ativa ? "true" : "false"}"
        ${vazia ? "disabled" : ""}>${escapar(categoria.rotulo)}</button>
    </li>`;
  }).join("");
}

/*
 * Os comentários que já estão na conversa quando alguém chega.
 *
 * Uma seção de comentários vazia lê como abandono, e ninguém quer ser o
 * primeiro. Estes são fictícios, como o resto do acervo.
 */
const CONVERSA_INICIAL = [
  {
    nome: "Beatriz",
    quando: "há 2 dias",
    texto: "Li o texto sobre ansiedade depois de uma semana difícil e a parte da mandíbula travada "
      + "me pegou. Nunca tinha ligado uma coisa à outra.",
  },
  {
    nome: "Rogério M.",
    quando: "há 4 dias",
    texto: "Faço o curso de desenho desde março. É verdade que ele começa pelo olho — passei o "
      + "primeiro mês sem desenhar quase nada e foi o mês que mais mudou.",
  },
];

function comentarioEmLista({ nome, quando, texto }) {
  const inicial = String(nome || "?").trim().charAt(0).toUpperCase();
  return `
    <li class="comentario">
      <span class="comentario-inicial" aria-hidden="true">${escapar(inicial)}</span>
      <div>
        <p class="comentario-quem"><strong>${escapar(nome)}</strong> <span>${escapar(quando)}</span></p>
        <p class="comentario-texto">${escapar(texto)}</p>
      </div>
    </li>`;
}

/**
 * Valida o comentário antes de aceitá-lo.
 *
 * Separada do DOM para poder ser testada, e porque a regra é a mesma que o
 * back-end vai precisar aplicar quando existir.
 */
export function validarComentario({ nome = "", texto = "" } = {}) {
  const erros = {};
  if (!String(nome).trim()) erros.nome = "Diga como quer ser chamada ou chamado.";
  /*
   * Três caracteres, e não um. "Oi" publicado sozinho não é conversa, e o
   * limite mínimo é mais honesto do que aceitar e depois moderar.
   */
  if (String(texto).trim().length < 3) erros.texto = "Escreva ao menos algumas palavras.";
  return erros;
}

function montar(root = document) {
  const listaCategorias = root.querySelector("[data-blog-categorias]");
  const destaqueAlvo = root.querySelector("[data-blog-destaque]");
  const grade = root.querySelector("[data-blog-grade]");
  const vazio = root.querySelector("[data-blog-vazio]");
  const maisLidos = root.querySelector("[data-blog-mais-lidos]");
  if (!grade) return;

  let categoriaAtiva = "todos";

  function desenhar() {
    const visiveis = filtrarPorCategoria(POSTS, categoriaAtiva);
    /*
     * O destaque só existe em "tudo".
     *
     * Dentro de uma categoria, promover o primeiro post a manchete inventaria
     * uma hierarquia que a redação não decidiu — e com dois textos na
     * categoria, um deles ocuparia metade da tela por acaso de ordenação.
     */
    const emDestaque = categoriaAtiva === "todos"
      ? visiveis.find((post) => post.destaque) || visiveis[0]
      : null;
    const naGrade = visiveis.filter((post) => post !== emDestaque);

    if (destaqueAlvo) {
      destaqueAlvo.innerHTML = emDestaque ? cartaoDoPost(emDestaque, { destaque: true }) : "";
    }
    grade.innerHTML = naGrade.map((post) => cartaoDoPost(post)).join("");
    if (vazio) vazio.hidden = visiveis.length > 0;
    if (listaCategorias) listaCategorias.innerHTML = marcacaoDasCategorias(POSTS, categoriaAtiva);
  }

  listaCategorias?.addEventListener("click", (evento) => {
    const botao = evento.target.closest?.("[data-categoria]");
    if (!botao || botao.disabled) return;
    categoriaAtiva = botao.dataset.categoria;
    desenhar();
    /* O foco volta para o botão recém-desenhado: sem isto, redesenhar a
       navegação joga o foco no body e quem usa teclado perde o lugar. */
    listaCategorias.querySelector(`[data-categoria="${categoriaAtiva}"]`)?.focus();
  });

  if (maisLidos) {
    /* "Mais lidos" sem métrica ainda: os mais curtos entram primeiro, porque é
       um critério declarado em vez de uma ordenação inventada. */
    maisLidos.innerHTML = [...POSTS]
      .sort((a, b) => a.leitura - b.leitura)
      .slice(0, 4)
      .map((post, i) => `<li>
        <span aria-hidden="true">${String(i + 1).padStart(2, "0")}</span>
        <a href="#${escapar(post.id)}">${escapar(post.titulo)}</a>
      </li>`).join("");
  }

  /* ----------------------------- o oráculo ----------------------------- */
  const carta = cartaDoDia(new Date());
  const nome = root.querySelector("[data-oraculo-nome]");
  const arte = root.querySelector("[data-oraculo-arte]");
  const verso = root.querySelector("[data-oraculo-verso]");
  if (nome) nome.textContent = carta.nome;
  if (arte) arte.innerHTML = arteDaCapa(carta.motivo);
  if (verso) verso.textContent = carta.verso;

  /* --------------------------- os comentários --------------------------- */
  const forma = root.querySelector("[data-comentario-forma]");
  const listaComentarios = root.querySelector("[data-comentario-lista]");
  const status = root.querySelector("[data-comentario-status]");
  const contador = root.querySelector("[data-comentario-contador]");

  if (listaComentarios) {
    listaComentarios.innerHTML = CONVERSA_INICIAL.map(comentarioEmLista).join("");
  }

  const campoTexto = forma?.elements?.texto;
  campoTexto?.addEventListener("input", () => {
    if (contador) contador.textContent = String(campoTexto.value.length);
  });

  forma?.addEventListener("submit", (evento) => {
    evento.preventDefault();
    const nomeDito = forma.elements.nome.value;
    const textoDito = forma.elements.texto.value;
    const erros = validarComentario({ nome: nomeDito, texto: textoDito });

    for (const campo of ["nome", "texto"]) {
      const alvo = root.querySelector(`[data-erro-${campo}]`);
      if (alvo) alvo.textContent = erros[campo] || "";
      forma.elements[campo]?.setAttribute("aria-invalid", erros[campo] ? "true" : "false");
    }
    if (Object.keys(erros).length) {
      if (status) status.textContent = "O comentário não foi publicado: corrija os campos marcados.";
      forma.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }

    /* Entra no TOPO: quem acabou de escrever precisa ver o próprio texto sem
       procurar, e o fim de uma lista longa fica fora da tela. */
    listaComentarios?.insertAdjacentHTML("afterbegin", comentarioEmLista({
      nome: nomeDito.trim(),
      quando: "agora",
      texto: textoDito.trim(),
    }));
    forma.reset();
    if (contador) contador.textContent = "0";
    if (status) status.textContent = "Comentário publicado nesta aba. Ele não fica gravado.";
  });

  desenhar();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => montar(document), { once: true });
  } else {
    montar(document);
  }
}

export { montar };
