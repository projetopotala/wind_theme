/*
 * A prévia ao vivo: iframe, dispositivo e zoom.
 *
 * O mecanismo de tempo real já existia e não muda — `postMessage` para o
 * iframe, agendado por quadro. O que entra aqui é o enquadramento: largura de
 * dispositivo e zoom, mais o caminho para quando a prévia não carrega.
 */

/*
 * Um dispositivo tem DUAS medidas, e o telefone precisava das duas.
 *
 * Só a largura estava aqui, e a altura do iframe vinha da coluna do painel. A
 * página passava a acreditar numa tela de 390 por 271 — mais larga que alta,
 * proporção que nenhum telefone tem. E a Home decide muita coisa por `svh`: a
 * altura do palco, quantos blocos cabem, se o título ainda tem espaço. Nada
 * disso podia ser conferido no modo telefone, porque nada disso aparecia.
 *
 * 390 × 844 é a tela de um iPhone 14/15 em pontos, e serve de aparelho médio.
 * O desktop mantém uma altura nominal só para completar o par; quem manda no
 * enquadramento dele continua sendo a coluna.
 */
export const DISPOSITIVOS = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 390, height: 844 },
};

/* Mantida porque o resto do painel e os testes falam em largura de
   dispositivo, e trocar o nome não muda nada do que ela diz. */
export const LARGURAS = {
  desktop: DISPOSITIVOS.desktop.width,
  mobile: DISPOSITIVOS.mobile.width,
};
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
export function frameGeometry({ device = "desktop", zoom = 1, available = 460, height = 320 } = {}) {
  const aparelho = DISPOSITIVOS[device] ?? DISPOSITIVOS.desktop;
  const width = aparelho.width;
  const fator = clampZoom(zoom);

  /*
   * O TELEFONE É UM APARELHO INTEIRO; O DESKTOP É UMA JANELA.
   *
   * Uma janela de desktop não tem altura própria — vê-se a largura toda e
   * rola-se o resto, e por isso a caixa é que dita a altura dela.
   *
   * Um telefone tem as duas medidas, e é a tela inteira que se quer ver de uma
   * vez: 390 por 844 encaixados na caixa, o lado mais apertado mandando. Sem
   * isso, o modo telefone mostrava o layout de telefone numa tela que não
   * existe, e o que ele provava não valia para nenhum aparelho.
   */
  if (device === "mobile") {
    const cabe = Math.min(available / width, height / aparelho.height);
    const scale = cabe * fator;
    return {
      width,
      scale,
      /* Fixa: é a altura que a PÁGINA acredita ter, e é dela que saem as
         media queries e todo cálculo em `svh`. */
      frameHeight: aparelho.height,
      cssWidth: width * scale,
      cssHeight: aparelho.height * scale,
      visible: width / fator,
    };
  }

  /*
   * 100% quer dizer "a largura do dispositivo cabe na coluna", e não "um pixel
   * da página para cada pixel da tela".
   *
   * Na leitura literal, 1280px de página numa coluna de 460 mostrava o canto
   * superior esquerdo e mais nada — foi o que apareceu na tela: a prévia
   * cortada. Numa coluna de prévia, o que se quer ver é a página inteira.
   */
  const scale = (available / width) * fator;
  return {
    width,
    scale,
    /* O iframe também precisa ser mais ALTO na mesma proporção, senão a escala
       encolhe a altura e sobra uma faixa morta embaixo. */
    frameHeight: height / scale,
    cssWidth: available * fator,
    cssHeight: height,
    visible: width / fator,
  };
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
    const altura = caixa?.clientHeight || 320;
    const geometria = frameGeometry({ device, zoom, available: largura, height: altura });
    frame.style.width = `${geometria.width}px`;
    frame.style.height = `${Math.round(geometria.frameHeight)}px`;
    frame.style.transform = `scale(${geometria.scale})`;
    /*
     * A caixa recebe o tamanho JÁ ESCALADO do aparelho.
     *
     * O iframe é escalado por `transform`, e transform não muda o espaço que o
     * elemento ocupa: sem dizer à caixa o tamanho final, o telefone ficava
     * encostado no canto de um retângulo do tamanho da coluna, em vez de
     * aparecer centrado como um aparelho. */
    if (caixa) {
      caixa.dataset.device = device;
      caixa.style.setProperty("--previa-largura", `${Math.round(geometria.cssWidth)}px`);
      caixa.style.setProperty("--previa-altura", `${Math.round(geometria.cssHeight)}px`);
    }
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

  /*
   * A ESCALA SAI DO TAMANHO DA CAIXA, ENTÃO PRECISA SER REFEITA QUANDO ELE MUDA.
   *
   * A caixa é medida em `svh`: ela muda de tamanho quando a janela muda, quando
   * o painel cruza um breakpoint e na primeira pintura, quando o layout ainda
   * não assentou. Medida uma vez só, a escala ficava calculada para uma caixa
   * que já não existia — no telefone, isso corta o aparelho embaixo.
   *
   * `ResizeObserver` vigia a caixa, e não a janela: a coluna também muda de
   * largura quando a prévia é recolhida, sem a janela mexer.
   */
  const observador = typeof ResizeObserver === "function" && caixa
    ? new ResizeObserver(() => aplicar())
    : null;
  observador?.observe(caixa);

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
      observador?.disconnect();
    },
  };
}
