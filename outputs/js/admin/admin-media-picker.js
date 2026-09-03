/*
 * A grade de imagens de "Trocar imagem".
 *
 * Lê o manifesto gerado por scripts/build-media-manifest.mjs. O painel é uma
 * página estática e não consegue listar um diretório sozinho.
 */

export const CAMINHO_MANIFESTO = "media/manifest.json";

function escapar(valor) {
  return String(valor ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export function createMediaPicker({ root, fetchManifest, onPick } = {}) {
  if (!root) throw new TypeError("root é obrigatório para montar o seletor de imagem.");

  const grade = root.querySelector("[data-admin-media-grid]");
  const abrir = root.querySelector("[data-admin-image-pick]");
  let carregado = null;

  function vazio(mensagem) {
    if (grade) grade.innerHTML = `<p class="admin-media-empty">${escapar(mensagem)}</p>`;
  }

  async function carregar() {
    if (carregado) return carregado;
    try {
      const manifesto = await fetchManifest();
      carregado = Array.isArray(manifesto?.imagens) ? manifesto.imagens : [];
    } catch {
      /*
       * Manifesto ausente ou ilegível não pode derrubar o painel. O script de
       * build pode simplesmente não ter rodado, e o campo de caminho continua
       * funcionando — a grade é uma conveniência, não o único caminho.
       */
      carregado = [];
    }
    return carregado;
  }

  async function open() {
    if (!grade) return;
    grade.hidden = false;
    const imagens = await carregar();
    if (!imagens.length) {
      vazio("Nenhuma imagem no manifesto. Rode: npm run build:media-manifest");
      return;
    }
    grade.innerHTML = imagens
      .map((imagem) => {
        const arquivo = escapar(imagem.arquivo);
        return `<button type="button" data-arquivo="${arquivo}" aria-label="Usar ${arquivo}">
          <img src="media/${arquivo}" alt="" loading="lazy">
        </button>`;
      })
      .join("");
  }

  function close() {
    if (grade) grade.hidden = true;
  }

  function onGradeClick(evento) {
    const botao = evento.target?.closest?.("[data-arquivo]");
    if (!botao) return;
    onPick?.(`media/${botao.dataset.arquivo}`);
    close();
  }

  grade?.addEventListener?.("click", onGradeClick);
  abrir?.addEventListener?.("click", open);

  return {
    open,
    close,
    destroy() {
      grade?.removeEventListener?.("click", onGradeClick);
      abrir?.removeEventListener?.("click", open);
    },
  };
}
