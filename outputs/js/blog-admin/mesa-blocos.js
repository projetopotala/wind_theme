/*
 * OS BLOCOS DO EDITOR.
 *
 * Cada bloco é editado no lugar, parecido com o que o leitor vai ver: o
 * parágrafo em serifa, o título grande, a citação em itálico. As opções de um
 * bloco aparecem só quando ele está selecionado, e só as dele — o editor não
 * tem um painel genérico com todas as opções de todos os tipos.
 */
import { icone } from "../admin/icones.js";
import { enderecoDoVideo } from "../blog/article-renderer.js";
import { esc } from "./mesa-ui.js";

export const TIPOS_DE_BLOCO = Object.freeze([
  { tipo: "paragraph", rotulo: "Texto", descricao: "Parágrafo corrido", icone: "type" },
  { tipo: "heading", rotulo: "Título", descricao: "Abre uma parte do texto", icone: "heading" },
  { tipo: "image", rotulo: "Imagem", descricao: "Foto com legenda", icone: "image" },
  { tipo: "gallery", rotulo: "Galeria", descricao: "Várias fotos juntas", icone: "images" },
  { tipo: "quote", rotulo: "Citação", descricao: "Frase em destaque", icone: "quote" },
  { tipo: "callout", rotulo: "Destaque", descricao: "Nota, dica ou aviso", icone: "sticky-note" },
  { tipo: "video", rotulo: "Vídeo", descricao: "YouTube ou Vimeo", icone: "video" },
  { tipo: "list", rotulo: "Lista", descricao: "Itens um por linha", icone: "list" },
  { tipo: "divider", rotulo: "Separador", descricao: "Uma pausa visual", icone: "minus" },
]);

const POR_TIPO = new Map(TIPOS_DE_BLOCO.map((item) => [item.tipo, item]));
export const rotuloDoBloco = (tipo) => POR_TIPO.get(tipo)?.rotulo || "Bloco";

let sequencia = 0;
export const novoIdDeBloco = () => `bloco-${Date.now().toString(36)}-${(sequencia += 1).toString(36)}`;

export function blocoNovo(tipo) {
  const base = { id: novoIdDeBloco(), type: tipo };
  if (["paragraph", "heading", "quote", "callout"].includes(tipo)) base.text = "";
  if (tipo === "callout") base.tone = "nota";
  if (tipo === "image") Object.assign(base, { src: "", alt: "", caption: "" });
  if (tipo === "gallery") Object.assign(base, { images: [], caption: "" });
  if (tipo === "video") Object.assign(base, { url: "", caption: "" });
  if (tipo === "list") base.items = [];
  return base;
}

export function duplicarBloco(bloco) {
  return { ...structuredClone(bloco), id: novoIdDeBloco() };
}

/* Um campo de texto que cresce com o conteúdo: escrever, não rolar dentro de caixinhas. */
const area = (campo, valor, { classe = "", placeholder = "", rotulo = "" } = {}) => `<textarea class="mesa-campo-livre ${classe}" data-bloco-campo="${campo}" rows="1" placeholder="${esc(placeholder)}" aria-label="${esc(rotulo || placeholder)}">${esc(valor)}</textarea>`;
const linha = (campo, valor, rotulo, placeholder = "") => `<label class="mesa-opcao"><span>${esc(rotulo)}</span><input type="text" data-bloco-campo="${campo}" value="${esc(valor)}" placeholder="${esc(placeholder)}"></label>`;
const escolha = (campo, valor, rotulo, opcoes) => `<label class="mesa-opcao"><span>${esc(rotulo)}</span><select data-bloco-campo="${campo}">${opcoes.map(([chave, texto]) => `<option value="${esc(chave)}" ${String(valor) === String(chave) ? "selected" : ""}>${esc(texto)}</option>`).join("")}</select></label>`;
const vazioDeImagem = (acao, texto) => `<button type="button" class="mesa-bloco__imagem-vazia" data-bloco-acao="${acao}">${icone("image", { classe: "mesa-icone" })}<span>${esc(texto)}</span></button>`;

function corpoDoBloco(bloco) {
  switch (bloco.type) {
    case "paragraph":
      return area("text", bloco.text, { classe: `mesa-texto${bloco.size === "lead" ? " is-abertura" : ""}${bloco.align === "center" ? " is-centro" : ""}`, placeholder: "Escreva aqui…", rotulo: "Texto" });
    case "heading":
      return area("text", bloco.text, { classe: `mesa-titulo-bloco${Number(bloco.level) === 3 ? " is-sub" : ""}`, placeholder: "Título da parte", rotulo: "Título" });
    case "quote":
      return `${area("text", bloco.text, { classe: "mesa-citacao", placeholder: "A frase que merece destaque", rotulo: "Citação" })}${bloco.cite ? `<p class="mesa-citacao__autoria">— ${esc(bloco.cite)}</p>` : ""}`;
    case "callout":
      return `<div class="mesa-destaque mesa-destaque--${esc(bloco.tone || "nota")}">${icone("sticky-note", { classe: "mesa-icone" })}${area("text", bloco.text, { placeholder: "Uma nota que o leitor não pode perder", rotulo: "Destaque" })}</div>`;
    case "image":
      return bloco.src
        ? `<figure class="mesa-figura${bloco.width === "full" ? " is-total" : ""}"><img src="${esc(bloco.src)}" alt="${esc(bloco.alt)}">${bloco.caption ? `<figcaption>${esc(bloco.caption)}</figcaption>` : ""}</figure>`
        : vazioDeImagem("escolher-imagem", "Escolher ou enviar uma imagem");
    case "gallery":
      return `<div class="mesa-galeria">${(bloco.images || []).map((imagem, indice) => `<figure><img src="${esc(imagem.src)}" alt="${esc(imagem.alt)}"><button type="button" data-bloco-acao="remover-da-galeria" data-indice="${indice}" aria-label="Tirar esta foto da galeria">${icone("x", { classe: "mesa-icone" })}</button></figure>`).join("")}
        <button type="button" class="mesa-galeria__mais" data-bloco-acao="adicionar-a-galeria">${icone("plus", { classe: "mesa-icone" })}<span>Foto</span></button></div>${bloco.caption ? `<p class="mesa-legenda">${esc(bloco.caption)}</p>` : ""}`;
    case "video": {
      const video = enderecoDoVideo(bloco.url);
      const miniatura = video?.tipo === "youtube" ? `https://i.ytimg.com/vi/${video.src.split("/").pop()}/hqdefault.jpg` : "";
      return video
        ? `<div class="mesa-video">${miniatura ? `<img src="${esc(miniatura)}" alt="">` : ""}<span>${icone("video", { classe: "mesa-icone" })}${video.tipo === "youtube" ? "YouTube" : "Vimeo"}${bloco.caption ? ` · ${esc(bloco.caption)}` : ""}</span></div>`
        : `<div class="mesa-video is-vazio">${icone("video", { classe: "mesa-icone" })}<span>${bloco.url ? "Endereço não reconhecido. Use um link do YouTube ou do Vimeo." : "Cole o endereço do vídeo nas opções abaixo."}</span></div>`;
    }
    case "list":
      return area("items", (bloco.items || []).join("\n"), { classe: `mesa-lista${bloco.ordered ? " is-numerada" : ""}`, placeholder: "Um item por linha", rotulo: "Lista" });
    case "divider":
      return '<hr class="mesa-separador">';
    default:
      return "";
  }
}

const FORMATACAO = `<span class="mesa-formatacao" role="group" aria-label="Formatação">
  <button type="button" data-bloco-formatar="negrito" title="Negrito (Ctrl+B)">${icone("bold", { classe: "mesa-icone" })}<span class="sr-only">Negrito</span></button>
  <button type="button" data-bloco-formatar="italico" title="Itálico (Ctrl+I)">${icone("italic", { classe: "mesa-icone" })}<span class="sr-only">Itálico</span></button>
  <button type="button" data-bloco-formatar="link" title="Link">${icone("link", { classe: "mesa-icone" })}<span class="sr-only">Link</span></button>
</span>`;

function opcoesDoBloco(bloco) {
  switch (bloco.type) {
    case "paragraph":
      return `${FORMATACAO}${escolha("size", bloco.size || "normal", "Estilo", [["normal", "Normal"], ["lead", "Abertura (maior)"]])}${escolha("align", bloco.align || "start", "Alinhamento", [["start", "À esquerda"], ["center", "Centralizado"]])}`;
    case "heading":
      return escolha("level", bloco.level || 2, "Nível", [[2, "Título"], [3, "Subtítulo"]]);
    case "quote":
      return `${FORMATACAO}${linha("cite", bloco.cite || "", "Autoria", "Quem disse (opcional)")}`;
    case "callout":
      return `${FORMATACAO}${escolha("tone", bloco.tone || "nota", "Tipo", [["nota", "Nota"], ["dica", "Dica"], ["aviso", "Aviso"]])}`;
    case "image":
      return `<button type="button" class="mesa-botao mesa-botao--contorno mesa-botao--pequeno" data-bloco-acao="escolher-imagem">${icone("image", { classe: "mesa-icone" })}${bloco.src ? "Trocar imagem" : "Escolher imagem"}</button>
        ${linha("caption", bloco.caption, "Legenda", "Aparece embaixo da foto")}
        ${linha("alt", bloco.alt, "Descrição para leitores de tela", "O que a foto mostra")}
        ${escolha("width", bloco.width || "text", "Largura", [["text", "Largura do texto"], ["full", "Tela inteira"]])}`;
    case "gallery":
      return `${linha("caption", bloco.caption, "Legenda da galeria", "Opcional")}<p class="mesa-dica">Até 12 fotos. Clique em uma foto para tirá-la.</p>`;
    case "video":
      return `${linha("url", bloco.url, "Endereço do vídeo", "https://www.youtube.com/watch?v=…")}${linha("caption", bloco.caption, "Legenda", "Opcional")}`;
    case "list":
      return `${FORMATACAO}${escolha("ordered", bloco.ordered ? "1" : "", "Marcadores", [["", "Com marcadores"], ["1", "Numerada"]])}`;
    default:
      return '<p class="mesa-dica">Uma pausa visual entre partes do texto.</p>';
  }
}

/*
 * A barra e as opções vão em todo bloco e só aparecem no selecionado (CSS):
 * trocar a seleção não redesenha nada, e o cursor não sai do lugar.
 */
export function blocoHtml(bloco, { indice = 0, total = 1 } = {}) {
  return `<div class="mesa-bloco" data-bloco-id="${esc(bloco.id)}" data-tipo="${esc(bloco.type)}">
    <button type="button" class="mesa-bloco__alca" draggable="true" data-bloco-acao="arrastar" aria-label="Arrastar ${esc(rotuloDoBloco(bloco.type))} (ou use Alt + setas)" title="Arraste para mudar a ordem">${icone("grip-vertical", { classe: "mesa-icone" })}</button>
    <div class="mesa-bloco__barra" role="toolbar" aria-label="Ações do bloco ${esc(rotuloDoBloco(bloco.type))}">
      <span class="mesa-bloco__tipo">${icone(POR_TIPO.get(bloco.type)?.icone || "type", { classe: "mesa-icone" })}${esc(rotuloDoBloco(bloco.type))}</span>
      <button type="button" data-bloco-acao="subir" ${indice === 0 ? "disabled" : ""} title="Subir (Alt+↑)">${icone("arrow-up", { classe: "mesa-icone" })}<span class="sr-only">Subir</span></button>
      <button type="button" data-bloco-acao="descer" ${indice === total - 1 ? "disabled" : ""} title="Descer (Alt+↓)">${icone("arrow-down", { classe: "mesa-icone" })}<span class="sr-only">Descer</span></button>
      <button type="button" data-bloco-acao="duplicar" title="Duplicar">${icone("copy", { classe: "mesa-icone" })}<span class="sr-only">Duplicar</span></button>
      <button type="button" data-bloco-acao="remover" class="is-perigo" title="Remover">${icone("trash-2", { classe: "mesa-icone" })}<span class="sr-only">Remover</span></button>
    </div>
    <div class="mesa-bloco__corpo">${corpoDoBloco(bloco)}</div>
    <div class="mesa-bloco__opcoes">${opcoesDoBloco(bloco)}</div>
  </div>`;
}

export const corpoHtml = (bloco) => corpoDoBloco(bloco);

/* Entre dois blocos, um "+" discreto para inserir ali. */
export const insercaoHtml = (depoisDe) => `<div class="mesa-inserir"><button type="button" data-inserir-apos="${esc(depoisDe)}" aria-label="Adicionar bloco aqui" title="Adicionar bloco aqui">${icone("plus", { classe: "mesa-icone" })}</button></div>`;

export function menuDeBlocosHtml() {
  return `<div class="mesa-tipos" role="menu" aria-label="Tipo de bloco">${TIPOS_DE_BLOCO.map((item) => `<button type="button" role="menuitem" data-novo-bloco="${item.tipo}">
      ${icone(item.icone, { classe: "mesa-icone" })}<strong>${esc(item.rotulo)}</strong><small>${esc(item.descricao)}</small></button>`).join("")}</div>`;
}

/* Aplica um campo editado ao bloco, convertendo o que o formulário entrega. */
export function aplicarCampo(bloco, campo, valor) {
  if (campo === "items") return { ...bloco, items: String(valor).split("\n") };
  if (campo === "level") return { ...bloco, level: Number(valor) === 3 ? 3 : 2 };
  if (campo === "ordered") return { ...bloco, ordered: Boolean(valor) };
  if (campo === "size") return { ...bloco, size: valor === "lead" ? "lead" : undefined };
  if (campo === "align") return { ...bloco, align: valor === "center" ? "center" : undefined };
  if (campo === "width") return { ...bloco, width: valor === "full" ? "full" : undefined };
  return { ...bloco, [campo]: valor };
}

/*
 * Negrito, itálico e link com as marcas que o Caderno entende (**, * e
 * [texto](endereço)). Devolve o texto novo e onde o cursor deve ficar.
 */
export function formatarSelecao(texto, inicio, fim, formato) {
  const antes = texto.slice(0, inicio);
  const meio = texto.slice(inicio, fim) || (formato === "link" ? "texto do link" : "texto");
  const depois = texto.slice(fim);
  if (formato === "link") {
    const novo = `${antes}[${meio}](https://)${depois}`;
    const posicaoDoEndereco = antes.length + meio.length + 3;
    return { texto: novo, inicio: posicaoDoEndereco, fim: posicaoDoEndereco + 8 };
  }
  const marca = formato === "negrito" ? "**" : "*";
  return { texto: `${antes}${marca}${meio}${marca}${depois}`, inicio: antes.length + marca.length, fim: antes.length + marca.length + meio.length };
}
