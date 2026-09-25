import { carregarSdk, montarConta } from "../conta/conta.js";
import { getSupabaseClient } from "../supabase/client.js";
import { SUPABASE_CONFIG } from "../supabase/config.js";
import { getAdminAccess } from "../admin/admin-auth.js";

const PAGE = "atendimentos-conceito";
const BUCKET = "portal-editor-media";
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MIME_EXTENSIONS = Object.freeze({
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif",
  "video/mp4": "mp4", "video/webm": "webm",
});

export function validMediaUrl(value, base = globalThis.location?.href || "https://potala.example/") {
  const raw = String(value || "").trim();
  if (!raw || raw.startsWith("//")) return false;
  try {
    const url = new URL(raw, base);
    return ["http:", "https:"].includes(url.protocol) && ![...raw].some((character) => character.charCodeAt(0) < 32);
  } catch { return false; }
}

/* Navegação do painel: cada seção tem um número (a ordem da página) e se
   encontra pela busca sem depender de acento nem de maiúscula. */
const semAcento = (texto) => String(texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export const numeroDaSecao = (indice) => String(indice + 1).padStart(2, "0");

export function filtrarSecoes(secoes, busca) {
  const termo = semAcento(busca);
  if (!termo) return secoes;
  return secoes.filter((secao, indice) => semAcento(`${numeroDaSecao(indice)} ${secao.label}`).includes(termo));
}

/* A parte da seção que está na tela, onde vai o destaque; null quando ela
   não aparece. */
export function areaDestacada(rect, alturaTela) {
  const top = Math.max(0, rect.top);
  const bottom = Math.min(alturaTela, rect.bottom);
  return bottom - top > 0 ? { top, height: bottom - top } : null;
}

/* A PRÉVIA. Com o painel aberto, a página não fica por baixo dele: ela é
   carregada de novo ao lado, num iframe marcado com `?previa-editor=1` (onde o
   editor não é montado). No computador a prévia guarda a largura da tela —
   a mesma composição que o admin vê — e só a escala diminui para caber no
   espaço que sobra. No celular e no tablet ela fica acima do painel, em
   tamanho real e com a altura da tela (menos a barra que sobra do painel
   quando a prévia se abre inteira): numa prévia baixa, a cena fecharia a
   janela da foto por falta de altura, e a foto editada não apareceria. */
const PARAMETRO_PREVIA = "previa-editor";
const BARRA_DA_PREVIA = 64;

export function urlDaPrevia(href) {
  const url = new URL(href);
  url.hash = "";
  url.searchParams.set(PARAMETRO_PREVIA, "1");
  return url.href;
}

export function ehPrevia(href) {
  try { return new URL(href).searchParams.has(PARAMETRO_PREVIA); } catch { return false; }
}

export function escalaDaPrevia({ larguraDaTela, alturaDaTela, area }) {
  if (larguraDaTela <= 980) {
    return { largura: area.width, altura: Math.round(Math.max(area.height, alturaDaTela - BARRA_DA_PREVIA)), escala: 1, empilhada: true };
  }
  const largura = Math.max(larguraDaTela, area.width);
  const escala = area.width / largura;
  return { largura, altura: Math.round(area.height / escala), escala: Math.round(escala * 1000) / 1000, empilhada: false };
}

export function editorSections(documentRef) {
  const sections = [
    {
      id: "inicio", label: "Abertura · Recepção", root: documentRef.querySelector("#inicio"),
      fields: [
        ["eyebrow", "Chamada", ".hero-route", "text"],
        ["title", "Título", ".hero-titulo", "text"],
        ["description", "Descrição", ".hero-note", "text"],
        ["action", "Texto do botão", ".hero-recepcao", "text"],
        ["main-media", "Imagem ou vídeo principal", ".hero-visual img, .hero-visual video", "media"],
        ["card-eyebrow", "Chamada do painel", ".hero-card .eyebrow", "text"],
        ["card-title", "Título do painel", ".hero-card h3", "text"],
        ["card-description", "Texto do painel", ".hero-card .small", "text"],
        ["card-media", "Imagem ou vídeo do painel", ".hero-card__image", "media"],
      ],
    },
  ];
  documentRef.querySelectorAll(".home-scene[id]").forEach((root) => {
    sections.push({
      id: root.id, label: root.querySelector("h2")?.textContent.trim() || root.id, root,
      fields: [
        ["eyebrow", "Chamada", ".home-scene__eyebrow", "text"],
        ["title", "Título", ".home-scene__copy h2", "text"],
        ["description", "Descrição", ".home-scene__copy > p:not(.home-scene__eyebrow)", "text"],
        ["action", "Texto do link", ".home-scene__copy > a, .home-scene__links a", "text"],
        ["main-media", "Imagem ou vídeo principal", ".home-scene__main-image", "media"],
        ["detail-media", "Imagem ou vídeo de detalhe", ".home-scene__detail-image", "media"],
      ],
    });
  });
  return sections.map((section) => ({ ...section, fields: section.fields.map(([key, label, selector, kind]) => ({
    key: `${section.id}:${key}`, label, selector, kind, root: section.root,
  })) }));
}

function currentElement(field) { return field.root?.querySelector(field.selector) || null; }
function currentValue(field) {
  const node = currentElement(field);
  if (!node) return { value: "", mediaType: field.kind === "media" ? "image" : null, altText: "" };
  return field.kind === "media"
    ? { value: node.getAttribute("src") || "", mediaType: node.tagName === "VIDEO" ? "video" : "image", altText: node.getAttribute("alt") || node.getAttribute("aria-label") || "" }
    : { value: node.tagName === "A" && node.firstChild?.nodeType === 3
      ? node.firstChild.textContent.trim() : node.textContent.trim(), mediaType: null, altText: "" };
}

export function applyElement(field, record, documentRef = document) {
  if (!field) return false;
  const node = currentElement(field);
  if (!node || !record || record.kind !== field.kind) return false;
  if (field.kind === "text") {
    if (!String(record.value || "").trim()) return false;
    if (currentValue(field).value !== record.value) {
      if (node.tagName === "A" && node.firstChild?.nodeType === 3 && node.querySelector("span[aria-hidden]")) {
        node.firstChild.textContent = `${record.value} `;
      } else node.textContent = record.value;
    }
    return true;
  }
  if (!validMediaUrl(record.value, documentRef.baseURI)) return false;
  const type = record.media_type === "video" ? "video" : "image";
  if (type === "video" && !/\.(mp4|webm)(\?|#|$)/i.test(record.value)) return false;
  const replacement = documentRef.createElement(type === "video" ? "video" : "img");
  replacement.className = node.className;
  replacement.style.cssText = node.style.cssText;
  replacement.src = record.value;
  if (type === "image") {
    replacement.alt = record.alt_text || "";
    replacement.loading = node.getAttribute("loading") || "lazy";
    replacement.decoding = "async";
  } else {
    replacement.setAttribute("aria-label", record.alt_text || "Vídeo do Instituto Potala");
    replacement.controls = true;
    replacement.playsInline = true;
    replacement.preload = "metadata";
    replacement.poster = node.getAttribute("poster") || (node.tagName === "IMG" ? node.getAttribute("src") || "" : "");
  }
  node.replaceWith(replacement);
  if (replacement.parentElement?.classList?.contains("hero-visual")) {
    replacement.parentElement.style.pointerEvents = type === "video" ? "auto" : "none";
    if (type === "video") replacement.parentElement.removeAttribute("aria-hidden");
    else replacement.parentElement.setAttribute("aria-hidden", "true");
  }
  return true;
}

export function createPageElementsRepository(client) {
  return {
    async list() {
      const { data, error } = await client.from("page_elements").select("element_key, kind, value, media_type, alt_text, updated_at")
        .eq("page_slug", PAGE);
      if (error) throw error;
      return data || [];
    },
    async save(records, userId) {
      const rows = records.map((record) => ({
        page_slug: PAGE, element_key: record.element_key, kind: record.kind,
        value: record.value, media_type: record.media_type, alt_text: record.alt_text,
        updated_at: new Date().toISOString(), updated_by: userId,
      }));
      const { error } = await client.from("page_elements").upsert(rows, { onConflict: "page_slug,element_key" });
      if (error) throw error;
      return rows;
    },
    async upload(file) {
      const extension = MIME_EXTENSIONS[file.type];
      if (!extension || file.size > MAX_FILE_BYTES || file.size < 1) {
        throw new Error("Use imagem JPG, PNG, WebP ou AVIF, ou vídeo MP4/WebM, até 50 MB.");
      }
      const path = `${PAGE}/${crypto.randomUUID()}.${extension}`;
      const { error } = await client.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      return client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    },
  };
}

export async function fetchPublicPageElements({ fetcher = globalThis.fetch, config = SUPABASE_CONFIG } = {}) {
  const url = new URL("rest/v1/page_elements", `${config.url}/`);
  url.searchParams.set("select", "element_key,kind,value,media_type,alt_text,updated_at");
  url.searchParams.set("page_slug", `eq.${PAGE}`);
  const response = await fetcher(url, { headers: { apikey: config.publishableKey } });
  if (!response.ok) throw new Error(`Falha ao carregar conteúdo editorial (${response.status}).`);
  return response.json();
}

function makeControl(tag, attributes = {}) {
  const element = document.createElement(tag);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function maxTextLength(field) {
  if (field.key.endsWith(":eyebrow") || field.key.endsWith(":card-eyebrow")) return 100;
  if (field.key.endsWith(":title") || field.key.endsWith(":card-title")) return 120;
  if (field.key.endsWith(":action")) return 100;
  return 1200;
}

export function mountPageEditor({ documentRef = document, account = montarConta, clientFactory = async () => {
  const sdk = await carregarSdk(documentRef);
  return getSupabaseClient({ sdk });
} } = {}) {
  const button = documentRef.querySelector("[data-page-edit-button]");
  if (!button) return Promise.resolve(null);
  const sections = editorSections(documentRef);
  const fields = new Map(sections.flatMap((section) => section.fields.map((field) => [field.key, field])));
  let client = null;
  let repository = null;
  let editor = null;
  let currentUserId = null;
  let lastCheckedUserId = null;
  let roleRequest = 0;

  async function getRepository() {
    if (!client) client = await clientFactory();
    repository ||= createPageElementsRepository(client);
    return repository;
  }

  async function loadContent() {
    try {
      const rows = await fetchPublicPageElements();
      rows.forEach((row) => applyElement(fields.get(row.element_key), row, documentRef));
    } catch (error) {
      console.warn("Conteúdo editorial indisponível; mantendo a versão local.", error);
    }
  }

  let stopEditor = null;

  function closeEditor() {
    if (!editor) return;
    stopEditor?.();
    stopEditor = null;
    editor.remove();
    editor = null;
    documentRef.documentElement.classList.remove("page-editor-aberto");
    button.setAttribute("aria-expanded", "false");
    button.focus();
  }

  function openEditor() {
    if (!currentUserId || editor) return;
    const windowRef = documentRef.defaultView || globalThis;
    editor = makeControl("div", { class: "page-editor-overlay" });
    editor.innerHTML = `<div class="page-editor-palco">
        <iframe class="page-editor-previa" title="Prévia da página" tabindex="-1"></iframe>
        <p class="page-editor-carregando" data-editor-carregando>Carregando a prévia…</p>
        <div class="page-editor-destaque" aria-hidden="true" hidden><span></span></div>
      </div>
      <aside class="page-editor-panel" role="dialog" aria-modal="true" aria-labelledby="page-editor-title">
        <header class="page-editor-header"><div><p>Portal Potala · edição</p><h2 id="page-editor-title">Editar esta página</h2></div>
        <button type="button" class="page-editor-ver-previa" data-editor-ver-previa aria-pressed="false">Ver prévia</button>
        <button type="button" class="page-editor-close" aria-label="Fechar editor">×</button></header>
        <nav class="page-editor-nav" aria-label="Seções da página">
          <input type="search" class="page-editor-busca" data-editor-busca placeholder="Buscar seção" aria-label="Buscar seção" autocomplete="off">
          <ol class="page-editor-secoes" data-editor-secoes></ol>
        </nav>
        <form class="page-editor-form" data-editor-form>
          <div class="page-editor-body">
            <div class="page-editor-atual"><p data-editor-atual></p>
              <button type="button" class="page-editor-ir" data-editor-ir>Mostrar na prévia</button></div>
            <p class="page-editor-help">As alterações aparecem na prévia e no site depois de salvar.</p>
            <div data-editor-fields></div>
          </div>
          <footer class="page-editor-footer">
            <p class="page-editor-status" role="status" aria-live="polite"></p>
            <button class="page-editor-save" type="submit">Salvar seção</button>
          </footer>
        </form>
      </aside>`;
    /* A seção visível antes de abrir é a que se edita primeiro. */
    const visibleSection = sections.find((section) => {
      const rect = section.root?.getBoundingClientRect();
      return rect && rect.top < innerHeight * .7 && rect.bottom > innerHeight * .3;
    });
    documentRef.body.append(editor);
    documentRef.documentElement.classList.add("page-editor-aberto");
    const busca = editor.querySelector("[data-editor-busca]");
    const lista = editor.querySelector("[data-editor-secoes]");
    const palco = editor.querySelector(".page-editor-palco");
    const iframe = editor.querySelector(".page-editor-previa");
    const destaque = editor.querySelector(".page-editor-destaque");
    let selectedId = (visibleSection || sections[0]).id;
    const selected = () => sections.find((entry) => entry.id === selectedId);
    const tituloDe = (section) => `${numeroDaSecao(sections.indexOf(section))} · ${section.label}`;

    /* A prévia: mesma largura da tela, escala menor (ver escalaDaPrevia). */
    let documentoDaPrevia = null;
    let janelaDaPrevia = null;
    let camposDaPrevia = new Map();
    let escala = 1;
    function ajustarPrevia() {
      const area = palco.getBoundingClientRect();
      if (!area.width || !area.height) return;
      const medida = escalaDaPrevia({ larguraDaTela: windowRef.innerWidth, alturaDaTela: windowRef.innerHeight, area });
      escala = medida.escala;
      if (!medida.empilhada) mostrarPreviaInteira(false);
      iframe.style.width = `${medida.largura}px`;
      iframe.style.height = `${medida.altura}px`;
      iframe.style.transform = `scale(${escala})`;
    }

    /* O destaque acompanha, na prévia, a parte da seção que está à vista: o
       resto escurece, e uma moldura dourada diz o que está sendo editado. */
    let quadroDoDestaque = 0;
    function atualizarDestaque() {
      quadroDoDestaque = 0;
      const section = selected();
      const raiz = documentoDaPrevia?.getElementById(selectedId);
      const caixa = palco.getBoundingClientRect();
      /* Empilhada, a prévia é mais alta que o espaço acima do painel: o
         destaque vale só para o trecho à vista. */
      const area = raiz && janelaDaPrevia ? areaDestacada(raiz.getBoundingClientRect(), caixa.height / escala) : null;
      destaque.hidden = !area;
      if (!area) return;
      destaque.style.left = `${caixa.left}px`;
      destaque.style.width = `${caixa.width}px`;
      destaque.style.top = `${caixa.top + area.top * escala}px`;
      destaque.style.height = `${area.height * escala}px`;
      destaque.querySelector("span").textContent = `Editando · ${tituloDe(section)}`;
    }
    const pedirDestaque = () => { quadroDoDestaque ||= windowRef.requestAnimationFrame(atualizarDestaque); };

    /* No celular, "Ver prévia" recolhe o painel numa barra e deixa a página
       à vista na altura da tela; o mesmo botão volta aos campos. */
    const verPrevia = editor.querySelector("[data-editor-ver-previa]");
    function mostrarPreviaInteira(inteira) {
      editor?.classList.toggle("is-previa-inteira", inteira);
      verPrevia.setAttribute("aria-pressed", String(inteira));
      verPrevia.textContent = inteira ? "Voltar aos campos" : "Ver prévia";
      pedirDestaque();
    }
    verPrevia.addEventListener("click", () => mostrarPreviaInteira(!editor.classList.contains("is-previa-inteira")));

    function irParaSecao({ suave = true } = {}) {
      const raiz = documentoDaPrevia?.getElementById(selectedId);
      if (!raiz || !janelaDaPrevia) return;
      const semMovimento = janelaDaPrevia.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      janelaDaPrevia.scrollTo({ top: raiz.getBoundingClientRect().top + janelaDaPrevia.scrollY, behavior: suave && !semMovimento ? "smooth" : "instant" });
    }

    iframe.addEventListener("load", () => {
      documentoDaPrevia = iframe.contentDocument;
      janelaDaPrevia = iframe.contentWindow;
      if (!documentoDaPrevia || !janelaDaPrevia) return;
      camposDaPrevia = new Map(editorSections(documentoDaPrevia).flatMap((section) => section.fields.map((field) => [field.key, field])));
      editor?.querySelector("[data-editor-carregando]")?.remove();
      janelaDaPrevia.addEventListener("scroll", pedirDestaque, { passive: true });
      irParaSecao({ suave: false });
      pedirDestaque();
    });
    ajustarPrevia();
    iframe.src = urlDaPrevia(windowRef.location.href);
    const aoRedimensionar = () => { ajustarPrevia(); pedirDestaque(); };
    windowRef.addEventListener("resize", aoRedimensionar);
    stopEditor = () => {
      windowRef.removeEventListener("resize", aoRedimensionar);
      janelaDaPrevia?.removeEventListener("scroll", pedirDestaque);
      if (quadroDoDestaque) windowRef.cancelAnimationFrame(quadroDoDestaque);
      /* Ao fechar, a página volta à seção que acabou de ser editada. */
      const raiz = selected()?.root;
      if (raiz) windowRef.scrollTo({ top: raiz.getBoundingClientRect().top + windowRef.scrollY, behavior: "instant" });
    };

    function renderLista() {
      const visiveis = filtrarSecoes(sections, busca.value);
      lista.replaceChildren(...visiveis.map((section) => {
        const item = makeControl("li");
        const opcao = makeControl("button", { type: "button", "data-section-id": section.id });
        const numero = makeControl("span", { class: "page-editor-secao-numero" });
        numero.textContent = numeroDaSecao(sections.indexOf(section));
        const nome = makeControl("span", { class: "page-editor-secao-nome" });
        nome.textContent = section.label;
        opcao.append(numero, nome);
        if (section.id === selectedId) opcao.setAttribute("aria-current", "true");
        opcao.addEventListener("click", () => escolher(section.id));
        item.append(opcao);
        return item;
      }));
      if (!visiveis.length) {
        const vazio = makeControl("li", { class: "page-editor-secoes-vazio" });
        vazio.textContent = "Nenhuma seção com esse nome.";
        lista.append(vazio);
      }
      /* A escolhida fica à vista: na coluna rola para cima ou para baixo, na
         faixa do celular, para o lado. */
      const atual = lista.querySelector('[aria-current="true"]');
      if (!atual) return;
      const caixa = atual.getBoundingClientRect();
      const moldura = lista.getBoundingClientRect();
      if (caixa.top < moldura.top || caixa.bottom > moldura.bottom) lista.scrollTop += caixa.top - moldura.top - 8;
      if (caixa.left < moldura.left || caixa.right > moldura.right) lista.scrollLeft += caixa.left - moldura.left - 12;
    }

    function escolher(id) {
      selectedId = id;
      renderLista();
      renderFields();
      irParaSecao();
      pedirDestaque();
    }

    function renderFields() {
      const container = editor.querySelector("[data-editor-fields]");
      container.replaceChildren();
      const section = selected();
      editor.querySelector("[data-editor-atual]").textContent = tituloDe(section);
      section.fields.forEach((field) => {
        const value = currentValue(field);
        const group = makeControl("div", { class: "page-editor-field", "data-field-key": field.key });
        const label = makeControl("label");
        label.textContent = field.label;
        if (field.kind === "text") {
          const input = makeControl(field.key.endsWith(":description") || field.key.endsWith(":card-description") ? "textarea" : "input",
            { "data-editor-value": "", maxlength: String(maxTextLength(field)) });
          input.value = value.value;
          label.append(input);
        } else {
          const type = makeControl("select", { "data-editor-media-type": "" });
          for (const [optionValue, text] of [["image", "Imagem"], ["video", "Vídeo"]]) {
            const option = makeControl("option", { value: optionValue }); option.textContent = text; type.append(option);
          }
          type.value = value.mediaType;
          const url = makeControl("input", { type: "text", inputmode: "url", "data-editor-value": "", placeholder: "URL ou caminho da imagem/vídeo" });
          url.value = value.value;
          const alt = makeControl("input", { "data-editor-alt": "", maxlength: "300", placeholder: "Descrição da imagem ou vídeo" });
          alt.value = value.altText;
          const file = makeControl("input", { type: "file", accept: "image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm", "data-editor-file": "" });
          label.append(type, url, alt, file);
          file.addEventListener("change", () => {
            if (file.files?.[0]) type.value = file.files[0].type.startsWith("video/") ? "video" : "image";
          });
        }
        group.append(label); container.append(group);
      });
      editor.querySelector(".page-editor-status").textContent = "";
    }

    busca.addEventListener("input", renderLista);
    busca.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const primeira = filtrarSecoes(sections, busca.value)[0];
      if (primeira) escolher(primeira.id);
    });
    editor.querySelector("[data-editor-ir]").addEventListener("click", () => irParaSecao());
    editor.querySelector(".page-editor-close").addEventListener("click", closeEditor);
    editor.querySelector("[data-editor-form]").addEventListener("submit", async (event) => {
      event.preventDefault();
      const save = editor.querySelector(".page-editor-save");
      const status = editor.querySelector(".page-editor-status");
      const section = selected();
      save.disabled = true;
      status.textContent = "Salvando…";
      try {
        const repo = await getRepository();
        const records = [];
        for (const field of section.fields) {
          const group = [...editor.querySelectorAll("[data-field-key]")].find((node) => node.dataset.fieldKey === field.key);
          let value = group.querySelector("[data-editor-value]").value.trim();
          const type = field.kind === "media" ? group.querySelector("[data-editor-media-type]").value : null;
          const file = group.querySelector("[data-editor-file]")?.files?.[0];
          if (file) {
            if ((type === "video") !== file.type.startsWith("video/")) throw new Error(`Tipo de arquivo incompatível em ${field.label}.`);
            status.textContent = `Enviando ${field.label.toLowerCase()}…`;
            value = await repo.upload(file);
          }
          if (!value) throw new Error(`Preencha ${field.label.toLowerCase()}.`);
          if (field.kind === "media" && (!validMediaUrl(value, documentRef.baseURI) ||
            (type === "video" && !/\.(mp4|webm)(\?|#|$)/i.test(value)))) {
            throw new Error(`Use uma URL direta de imagem ou vídeo MP4/WebM em ${field.label}.`);
          }
          records.push({ element_key: field.key, kind: field.kind, value,
            media_type: type, alt_text: field.kind === "media" ? group.querySelector("[data-editor-alt]").value.trim() : "" });
        }
        await repo.save(records, currentUserId);
        records.forEach((record) => applyElement(fields.get(record.element_key), record, documentRef));
        /* A prévia mostra na hora o que foi salvo. */
        if (documentoDaPrevia) records.forEach((record) => applyElement(camposDaPrevia.get(record.element_key), record, documentoDaPrevia));
        const message = "Seção salva. A alteração já aparece na prévia e permanecerá após atualizar a página.";
        renderFields();
        editor.querySelector(".page-editor-status").textContent = message;
      } catch (error) {
        status.textContent = `Não foi possível salvar: ${error.message || "tente novamente"}`;
      } finally { save.disabled = false; }
    });
    renderLista();
    renderFields();
    busca.focus();
    button.setAttribute("aria-expanded", "true");
  }

  button.addEventListener("click", openEditor);
  documentRef.addEventListener("keydown", (event) => {
    if (!editor) return;
    if (event.key === "Escape") closeEditor();
    if (event.key !== "Tab") return;
    const controls = [...editor.querySelectorAll("button, input, textarea, select")]
      .filter((control) => !control.disabled && control.offsetParent !== null);
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && documentRef.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && documentRef.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  loadContent();
  return account().then((mountedAccount) => {
    if (!mountedAccount?.sessao) return null;
    const { sessao } = mountedAccount;
    async function syncRole(state) {
      if (state.demonstracao || state.status !== "autenticado" || !state.usuario?.id) {
        roleRequest += 1;
        lastCheckedUserId = null;
        currentUserId = null;
        button.hidden = true;
        closeEditor();
        return;
      }
      if (lastCheckedUserId === state.usuario.id) return;
      lastCheckedUserId = state.usuario.id;
      currentUserId = null;
      button.hidden = true;
      closeEditor();
      const request = ++roleRequest;
      try {
        await getRepository();
        const access = await getAdminAccess(client);
        if (request !== roleRequest) return;
        currentUserId = access.state === "authorized" ? state.usuario.id : null;
        button.hidden = !currentUserId;
      } catch (error) {
        lastCheckedUserId = null;
        button.hidden = true;
        console.warn("Não foi possível verificar a permissão de edição.", error);
      }
    }
    sessao.assinar(syncRole);
    syncRole(sessao.obter());
    return { destroy: closeEditor };
  });
}

if (typeof document !== "undefined" && document.body?.dataset.editorPage === PAGE) {
  if (ehPrevia(document.location.href)) {
    /* Dentro da prévia do editor: só o conteúdo salvo, sem botão nem painel. */
    const campos = new Map(editorSections(document).flatMap((section) => section.fields.map((field) => [field.key, field])));
    fetchPublicPageElements()
      .then((rows) => rows.forEach((row) => applyElement(campos.get(row.element_key), row, document)))
      .catch((error) => console.warn("Conteúdo editorial indisponível na prévia.", error));
  } else {
    mountPageEditor().catch((error) => console.warn("Editor da Home indisponível.", error));
  }
}
