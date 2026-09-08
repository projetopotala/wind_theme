/*
 * Mesa do blogueiro.
 *
 * O padrão de mercado (Ghost, WordPress, Substack, Blogger) não abre o editor
 * na entrada. A casa é uma visão: escrever, ver alcance e moderar respostas.
 * Os números abaixo são de demonstração, para a seção poder ser vista antes
 * de existir medição real.
 */

const DEMO_ACCESS = {
  "novos-profissionais": { views: 1284, likes: 96, comments: 14 },
  "oraculo-de-hoje": { views: 860, likes: 71, comments: 9 },
  "borra-de-cafe": { views: 642, likes: 48, comments: 6 },
  "ansiedade-corpo": { views: 1102, likes: 88, comments: 11 },
  "curso-desenho": { views: 390, likes: 27, comments: 3 },
  "cinema-quinta": { views: 510, likes: 34, comments: 5 },
  "meditacao-inicio": { views: 734, likes: 52, comments: 7 },
  "sono-estacoes": { views: 448, likes: 31, comments: 4 },
};

const DEMO_COMMENTS = [
  { author: "Helena Vasconcelos", post: "Oráculo de hoje: a carta da Ponte", text: "A imagem da margem me acompanhou o dia inteiro.", when: "hoje" },
  { author: "Marina Alves", post: "Novos profissionais chegaram ao Instituto", text: "Quero saber quando a constelação familiar abre agenda.", when: "ontem" },
  { author: "Leitora da casa", post: "Onde a ansiedade se instala no corpo", text: "Reconheci o ombro. Obrigado por nomear.", when: "2 dias" },
];

import { readBlogSettings, saveBlogSettings } from "../blog/blog-settings.js";

const number = new Intl.NumberFormat("pt-BR");
const escapeHtml = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function accessOf(post) {
  return DEMO_ACCESS[post.id] || { views: 0, likes: 0, comments: 0 };
}

function statusLabel(status) {
  if (status === "published") return "Publicado";
  if (status === "hidden") return "Oculto";
  return "Rascunho";
}

export function createBlogDesk({ root, repository, onWrite, onEdit } = {}) {
  if (!root || !repository) throw new TypeError("root e repository são obrigatórios");
  const form = root.querySelector("[data-blog-settings-form]");
  const preview = root.querySelector("[data-blog-cover-preview]");
  const status = root.querySelector("[data-blog-settings-status]");

  function showTab(id) {
    for (const tab of root.querySelectorAll("[data-blog-tab]")) {
      tab.setAttribute("aria-selected", String(tab.getAttribute("data-blog-tab") === id));
    }
    for (const panel of root.querySelectorAll("[data-blog-panel]")) {
      panel.hidden = panel.getAttribute("data-blog-panel") !== id;
    }
  }

  function paintSettings(settings = readBlogSettings()) {
    if (form) {
      form.elements.name.value = settings.name;
      form.elements.cover.value = settings.cover;
    }
    if (preview) {
      preview.src = settings.cover;
      preview.alt = `Imagem do blog ${settings.name}`;
    }
    const brand = root.querySelector(".blog-editor-brand small");
    if (brand) brand.textContent = settings.name;
  }

  function render() {
    const posts = repository.list();
    const totals = posts.reduce((sum, post) => {
      const access = accessOf(post);
      return {
        views: sum.views + access.views,
        likes: sum.likes + access.likes,
        comments: sum.comments + access.comments,
      };
    }, { views: 0, likes: 0, comments: 0 });

    const metrics = root.querySelector("[data-blog-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        ["Visualizações", totals.views, "últimos 30 dias"],
        ["Curtidas", totals.likes, "reações nos textos"],
        ["Comentários", totals.comments, "aguardando leitura"],
      ].map(([label, value, hint]) => `<p><small>${label}</small><strong>${number.format(value)}</strong><span>${hint}</span></p>`).join("");
    }

    const list = root.querySelector("[data-blog-desk-list]");
    if (list) {
      list.innerHTML = posts.map((post) => `<tr>
          <td><strong>${escapeHtml(post.title)}</strong><small>${escapeHtml(post.publishedAt || "")}</small></td>
          <td>${escapeHtml(statusLabel(post.status))}</td>
          <td><button type="button" data-blog-edit="${escapeHtml(post.id)}">Editar</button></td>
        </tr>`).join("");
    }

    const reach = root.querySelector("[data-blog-reach-list]");
    if (reach) {
      reach.innerHTML = posts.map((post) => {
        const access = accessOf(post);
        return `<tr>
          <td>${escapeHtml(post.title)}</td>
          <td>${number.format(access.views)}</td>
          <td>${number.format(access.likes)}</td>
          <td>${number.format(access.comments)}</td>
        </tr>`;
      }).join("");
    }

    const comments = root.querySelector("[data-blog-comments]");
    if (comments) {
      comments.innerHTML = DEMO_COMMENTS.map((item) => `<li><strong>${escapeHtml(item.author)}</strong><small>${escapeHtml(item.post)} · ${escapeHtml(item.when)}</small><p>${escapeHtml(item.text)}</p></li>`).join("");
    }
  }

  function onClick(event) {
    const tab = event.target.closest?.("[data-blog-tab]");
    if (tab) {
      showTab(tab.getAttribute("data-blog-tab"));
      return;
    }
    if (event.target.closest?.("[data-blog-write]")) {
      onWrite?.();
      return;
    }
    const edit = event.target.closest?.("[data-blog-edit]");
    if (edit) onEdit?.(edit.getAttribute("data-blog-edit"));
  }

  function onSubmit(event) {
    event.preventDefault();
    const saved = saveBlogSettings({
      name: form.elements.name.value,
      cover: form.elements.cover.value,
    });
    paintSettings(saved);
    if (status) status.textContent = "Configuração salva. O nome e a imagem passam a aparecer no topo do blog.";
  }

  function onCoverInput() {
    if (preview && form) preview.src = form.elements.cover.value;
  }

  root.addEventListener("click", onClick);
  form?.addEventListener("submit", onSubmit);
  form?.elements.cover?.addEventListener("input", onCoverInput);
  paintSettings();
  render();
  return {
    render,
    destroy() {
      root.removeEventListener("click", onClick);
      form?.removeEventListener("submit", onSubmit);
      form?.elements.cover?.removeEventListener("input", onCoverInput);
    },
  };
}
