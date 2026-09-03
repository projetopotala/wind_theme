/*
 * A prévia ao vivo: iframe, dispositivo e zoom.
 *
 * O mecanismo de tempo real já existia e não muda — `postMessage` para o
 * iframe, agendado por quadro. O que entra aqui é o enquadramento: largura de
 * dispositivo e zoom, mais o caminho para quando a prévia não carrega.
 */

export const LARGURAS = { desktop: 1280, mobile: 390 };
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.5;
const PASSO = 0.25;

/**
 * A geometria do iframe para um dispositivo e um zoom.
 *
 * São duas coisas separadas, e misturá-las foi o primeiro erro desta função.
 *
 * `width` é a largura que a PÁGINA acredita ter, e é ela que faz as media
 * queries da Home dispararem: 390px tem de continuar 390px, ou o modo telefone
 * simplesmente não acontece.
 *
 * `scale` é o tamanho na tela de quem edita. Diminuir a escala não muda o que a
 * página pensa — só faz caber mais dela na coluna, que é o que "50%" quer dizer.
 * `visible` põe isso em número: quanto de página cabe no espaço disponível.
 */
export function frameGeometry({ device = "desktop", zoom = 1, available = 460 } = {}) {
  const width = LARGURAS[device] ?? LARGURAS.desktop;
  const scale = clampZoom(zoom);
  return { width, scale, cssWidth: width * scale, visible: available / scale };
}

export function clampZoom(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, numero));
}

export function nextZoom(atual, direcao) {
  return clampZoom(clampZoom(atual) + Math.sign(Number(direcao) || 0) * PASSO);
}

export function createAdminPreview({ root, onPublish } = {}) {
  if (!root) throw new TypeError("root é obrigatório para montar a prévia.");

  const frame = root.querySelector("[data-admin-preview]");
  const caixa = root.querySelector("[data-admin-preview-frame]");
  const erro = root.querySelector("[data-admin-preview-error]");
  const recarregar = root.querySelector("[data-admin-preview-reload]");
  const dispositivos = root.querySelector("[data-admin-preview-device]");
  const zoomGrupo = root.querySelector("[data-admin-preview-zoom]");
  const zoomValor = root.querySelector("[data-admin-zoom-value]");

  let device = "desktop";
  let zoom = 1;
  /* Guardado na montagem: recarregar reatribui este endereço, e reatribuir o
     `src` do próprio iframe seria escrever nele o que ele já tem. */
  const enderecoInicial = frame?.src || "";

  function aplicar() {
    if (!frame) return;
    const largura = caixa?.clientWidth || 460;
    const geometria = frameGeometry({ device, zoom, available: largura });
    frame.style.width = `${geometria.width}px`;
    frame.style.transform = `scale(${geometria.scale})`;
    if (zoomValor) zoomValor.textContent = `${Math.round(zoom * 100)}%`;
    for (const botao of dispositivos?.querySelectorAll("[data-device]") || []) {
      botao.setAttribute("aria-pressed", botao.dataset.device === device ? "true" : "false");
    }
  }

  function mostrarErro(visivel) {
    if (erro) erro.hidden = !visivel;
  }

  function onDevice(evento) {
    const botao = evento.target?.closest?.("[data-device]");
    if (!botao) return;
    device = botao.dataset.device === "mobile" ? "mobile" : "desktop";
    aplicar();
  }

  function onZoom(evento) {
    const botao = evento.target?.closest?.("[data-zoom]");
    if (!botao) return;
    zoom = nextZoom(zoom, botao.dataset.zoom);
    aplicar();
  }

  /* Um retângulo vazio não diz se a prévia quebrou ou se a página está em
     branco. O aviso e o botão de recarregar dizem. */
  function onErro() {
    mostrarErro(true);
  }

  function onCarregou() {
    mostrarErro(false);
    onPublish?.();
  }

  function onRecarregar() {
    mostrarErro(false);
    if (frame) frame.src = enderecoInicial;
  }

  frame?.addEventListener?.("error", onErro);
  frame?.addEventListener?.("load", onCarregou);
  dispositivos?.addEventListener?.("click", onDevice);
  zoomGrupo?.addEventListener?.("click", onZoom);
  recarregar?.addEventListener?.("click", onRecarregar);

  aplicar();

  return {
    get frame() { return frame; },
    setDevice(valor) {
      device = valor === "mobile" ? "mobile" : "desktop";
      aplicar();
    },
    setZoom(valor) {
      zoom = clampZoom(valor);
      aplicar();
    },
    state() {
      return { device, zoom };
    },
    destroy() {
      frame?.removeEventListener?.("error", onErro);
      frame?.removeEventListener?.("load", onCarregou);
      dispositivos?.removeEventListener?.("click", onDevice);
      zoomGrupo?.removeEventListener?.("click", onZoom);
      recarregar?.removeEventListener?.("click", onRecarregar);
    },
  };
}
