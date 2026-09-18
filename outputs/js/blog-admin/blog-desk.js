/*
 * Mesa do blogueiro.
 *
 * O padrão de mercado (Ghost, WordPress, Substack, Blogger) não abre o editor
 * na entrada. A casa é uma visão: escrever, ver alcance e moderar respostas.
 *
 * Tudo aqui vem do banco do Portal: textos, leituras contadas na página do
 * artigo, comentários enviados pelos visitantes e inscrições nas inspirações.
 * Na mesa de demonstração o repositório é local e os números ficam zerados —
 * inventar leituras seria pior do que mostrar que ainda não há.
 */

const number = new Intl.NumberFormat("pt-BR");
const escapeHtml = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const quando = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

function statusLabel(status) {
  if (status === "published") return "Publicado";
  if (status === "hidden") return "Oculto";
  return "Rascunho";
}

const COMENTARIO = { pending: "Aguardando leitura", approved: "Publicado", rejected: "Recusado" };

export async function carregarDadosDaMesa(repository) {
  const contextos = ["blog.posts", "blog.leituras", "blog.comentarios", "blog.inscritos", "blog.configuracao"];
  const resultados = await Promise.allSettled([
    repository.list(),
    repository.leituras(),
    repository.comentarios(),
    repository.inscritos(),
    repository.lerConfiguracao(),
  ]);
  /* Posts e configuração sustentam a tela. Sem eles, o erro principal aparece. */
  if (resultados[0].status === "rejected") throw resultados[0].reason;
  if (resultados[4].status === "rejected") throw resultados[4].reason;
  const falhas = resultados.flatMap((resultado, indice) => (
    resultado.status === "rejected" ? [{ erro: resultado.reason, contexto: contextos[indice] }] : []
  ));
  return {
    posts: resultados[0].value,
    views: resultados[1].status === "fulfilled" ? resultados[1].value : {},
    comments: resultados[2].status === "fulfilled" ? resultados[2].value : [],
    subscribers: resultados[3].status === "fulfilled" ? resultados[3].value : 0,
    settings: resultados[4].value,
    falhas,
  };
}

export function createBlogDesk({ root, repository, onWrite, onEdit } = {}) {
  if (!root || !repository) throw new TypeError("root e repository são obrigatórios");
  const form = root.querySelector("[data-blog-settings-form]");
  const preview = root.querySelector("[data-blog-cover-preview]");
  const status = root.querySelector("[data-blog-settings-status]");
  const note = root.querySelector("[data-blog-reach-note]");

  function showTab(id) {
    for (const tab of root.querySelectorAll("[data-blog-tab]")) {
      tab.setAttribute("aria-selected", String(tab.getAttribute("data-blog-tab") === id));
    }
    for (const panel of root.querySelectorAll("[data-blog-panel]")) {
      panel.hidden = panel.getAttribute("data-blog-panel") !== id;
    }
  }

  function paintSettings(settings) {
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

  function paintComments(comments, slugs) {
    const target = root.querySelector("[data-blog-comments]");
    if (!target) return;
    if (!comments.length) {
      target.innerHTML = `<li class="blog-desk-empty">${repository.demonstracao ? "Na demonstração não há comentários de visitantes." : "Nenhum comentário recebido ainda."}</li>`;
      return;
    }
    target.innerHTML = comments.map((item) => {
      const onde = item.slug ? slugs.get(item.slug) || item.slug : "Conversa do Caderno";
      const acoes = item.status === "pending"
        ? `<span class="blog-desk-actions"><button type="button" data-blog-moderar="approved" data-id="${escapeHtml(item.id)}">Publicar</button><button type="button" data-blog-moderar="rejected" data-id="${escapeHtml(item.id)}">Recusar</button></span>`
        : `<span class="blog-desk-actions"><button type="button" data-blog-moderar="${item.status === "approved" ? "rejected" : "approved"}" data-id="${escapeHtml(item.id)}">${item.status === "approved" ? "Retirar" : "Publicar"}</button></span>`;
      return `<li data-comentario-status="${escapeHtml(item.status)}"><strong>${escapeHtml(item.nome)}</strong><small>${escapeHtml(onde)} · ${escapeHtml(quando(item.criadoEm))} · ${escapeHtml(COMENTARIO[item.status] || item.status)}</small><p>${escapeHtml(item.texto)}</p>${acoes}</li>`;
    }).join("");
  }

  async function render() {
    const { posts, views, comments, subscribers, settings, falhas } = await carregarDadosDaMesa(repository);
    const bySlug = new Map(posts.map((post) => [post.slug, post.title]));
    const commentsOf = (slug) => comments.filter((item) => item.slug === slug && item.status !== "rejected").length;
    const pending = comments.filter((item) => item.status === "pending").length;
    const totalViews = posts.reduce((sum, post) => sum + (views[post.slug] || 0), 0);

    const metrics = root.querySelector("[data-blog-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        ["Leituras", totalViews, "aberturas dos artigos"],
        ["Comentários", pending, "aguardando leitura"],
        ["Inscritos", subscribers, "nas inspirações"],
      ].map(([label, value, hint]) => `<p><small>${label}</small><strong>${number.format(value)}</strong><span>${hint}</span></p>`).join("");
    }
    if (note) {
      note.textContent = falhas.length
        ? "Alguns indicadores não puderam ser carregados. Atualize a página para tentar novamente."
        : repository.demonstracao
          ? "Na demonstração nada é medido: os números aparecem na mesa real."
          : "Leituras contadas a cada abertura de um artigo publicado.";
      note.setAttribute("role", falhas.length ? "alert" : "status");
    }

    const list = root.querySelector("[data-blog-desk-list]");
    if (list) {
      list.innerHTML = posts.length
        ? posts.map((post) => `<tr>
          <td><strong>${escapeHtml(post.title)}</strong><small>${escapeHtml(post.publishedAt || "")}</small></td>
          <td>${escapeHtml(statusLabel(post.status))}</td>
          <td><button type="button" data-blog-edit="${escapeHtml(post.id)}">Editar</button></td>
        </tr>`).join("")
        : '<tr><td colspan="3">Nenhum texto ainda. Comece por “Escrever novo artigo”.</td></tr>';
    }

    const reach = root.querySelector("[data-blog-reach-list]");
    if (reach) {
      reach.innerHTML = posts.map((post) => `<tr>
          <td>${escapeHtml(post.title)}</td>
          <td>${number.format(views[post.slug] || 0)}</td>
          <td>${number.format(commentsOf(post.slug))}</td>
        </tr>`).join("");
    }

    const tabBadge = root.querySelector('[data-blog-tab="comentarios"]');
    if (tabBadge) tabBadge.textContent = pending ? `Comentários (${pending})` : "Comentários";

    paintComments(comments, bySlug);
    if (!form?.contains(root.ownerDocument?.activeElement)) paintSettings(settings);
  }

  function renderSafely() {
    return render().catch((error) => {
      const list = root.querySelector("[data-blog-desk-list]");
      if (list) list.innerHTML = `<tr><td colspan="3">${escapeHtml(error.message)}</td></tr>`;
    });
  }

  async function onClick(event) {
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
    if (edit) {
      onEdit?.(edit.getAttribute("data-blog-edit"));
      return;
    }
    const moderate = event.target.closest?.("[data-blog-moderar]");
    if (moderate) {
      moderate.disabled = true;
      try {
        await repository.moderar(moderate.dataset.id, moderate.dataset.blogModerar);
        await renderSafely();
      } catch (error) {
        moderate.disabled = false;
        moderate.closest("li")?.insertAdjacentHTML("beforeend", `<p role="alert">${escapeHtml(error.message)}</p>`);
      }
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (status) status.textContent = "Salvando…";
    try {
      const saved = await repository.salvarConfiguracao({
        name: form.elements.name.value,
        cover: form.elements.cover.value,
      });
      paintSettings(saved);
      if (status) status.textContent = "Configuração salva. O nome e a imagem passam a aparecer no topo do blog.";
    } catch (error) {
      if (status) status.textContent = `Não foi possível salvar: ${error.message}`;
    }
  }

  function onCoverInput() {
    if (preview && form) preview.src = form.elements.cover.value;
  }

  root.addEventListener("click", onClick);
  form?.addEventListener("submit", onSubmit);
  form?.elements.cover?.addEventListener("input", onCoverInput);
  const pronto = renderSafely();
  return {
    pronto,
    render: renderSafely,
    destroy() {
      root.removeEventListener("click", onClick);
      form?.removeEventListener("submit", onSubmit);
      form?.elements.cover?.removeEventListener("input", onCoverInput);
    },
  };
}
