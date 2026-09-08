import { consumeHandoff } from "../core/travessia-state.js";
import { damp, scrollCuePosition, scrollProgressForDocument } from "../core/math.js";
import { createBlockExpansion } from "./block-expansion.js";
import {
  createHomeAdminPreview,
  readAdminPreviewSnapshot,
  writeAdminPreviewSnapshot,
} from "./admin-preview.js";
import { invitationsFor, nextInvitationIndex } from "./invitations.js";
import { createLocalContentRepository } from "./content-repository.js";
import { DEFAULT_HOME_BLOCKS, JOURNEY_DISCOVERIES, NOVIDADES_PADRAO } from "./journey-data.js";
import { comNovidadesDoCodigo, ehNovidade, novidadesPrimeiro } from "./home-novidades.js";
import { procurarBloco } from "./home-busca.js";
import { createHomePath } from "./home-path-three.js";
import { createLandscapeVideo } from "./landscape-video.js";
import { mountJourney } from "./home-scenes.js";

const clamp = (value, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));

export function holdEntryHandoff(root, {
  duration = 1800,
  schedule = setTimeout,
} = {}) {
  root.classList.add("entry-from-arrival");
  return schedule(() => {
    root.classList.remove("entry-from-arrival");
    root.classList.remove("entry-pending");
  }, duration);
}

// Mantidos como utilitários puros para páginas históricas; a nova Home usa o
// scroll nativo diretamente e não cria uma segunda posição de rolagem.
export function smoothJourneyScroll(current, target, elapsed, { reducedMotion = false } = {}) {
  return reducedMotion ? target : damp(current, target, elapsed, 150);
}

export function smoothRegionPresence(current, target, elapsed, { reducedMotion = false } = {}) {
  return reducedMotion ? target : damp(current, target, elapsed, 360);
}

export function regionIndexWithinPair({
  pairTop = 0,
  pairHeight = 1,
  scrollY = 0,
  viewportHeight = 1,
  regionCount = 1,
} = {}) {
  const count = Math.max(1, Math.trunc(regionCount));
  const focus = scrollY + Math.max(1, viewportHeight) * .5;
  const progress = clamp((focus - pairTop) / Math.max(1, pairHeight), 0, .999999);
  return Math.min(count - 1, Math.floor(progress * count));
}

/**
 * O caminho pertence à jornada, não ao prólogo. Seu zero é a primeira dupla
 * de cartões; assim o “Bem-vindo” permanece limpo e a curva ainda alcança o
 * fim exatamente quando a página termina.
 */
export function pathProgressAfterPrologue({
  scrollTop = 0,
  journeyStart = 0,
  scrollHeight = 1,
  viewportHeight = 1,
} = {}) {
  const current = Math.max(0, Number(scrollTop) || 0);
  const start = Math.max(0, Number(journeyStart) || 0);
  if (current < start) return { active: false, progress: 0 };

  const end = Math.max(start + 1, (Number(scrollHeight) || 1) - Math.max(1, Number(viewportHeight) || 1));
  return {
    active: true,
    progress: clamp((current - start) / (end - start)),
  };
}

export function motionOffsetForRegion({
  roadSide,
  signedDistance,
  viewportWidth,
  viewportHeight,
  reducedMotion = false,
}) {
  if (reducedMotion || signedDistance === 0) return { x: 0, y: 0 };
  const movement = clamp(Math.abs(signedDistance) / Math.max(1, viewportHeight));
  const amplitude = movement * Math.min(viewportWidth * 0.035, 48);
  if (roadSide === "left") return { x: -amplitude, y: 0 };
  if (roadSide === "right") return { x: amplitude, y: 0 };
  if (roadSide === "top") return { x: 0, y: -amplitude };
  if (roadSide === "bottom") return { x: 0, y: amplitude };
  return { x: 0, y: 0 };
}

function mountSoundResume(root, enabled) {
  if (!enabled) return () => {};
  const audio = document.createElement("audio");
  audio.src = "musica-fundo.mp3";
  audio.loop = true;
  audio.preload = "none";
  const button = document.createElement("button");
  button.className = "journey-sound";
  button.type = "button";
  button.textContent = "Retomar som";
  button.setAttribute("aria-pressed", "false");
  root.after(audio, button);

  const toggle = async () => {
    if (!audio.paused) {
      audio.pause();
      button.textContent = "Retomar som";
      button.setAttribute("aria-pressed", "false");
      return;
    }
    try {
      audio.volume = 0.24;
      await audio.play();
      button.textContent = "Silenciar";
      button.setAttribute("aria-pressed", "true");
    } catch {
      button.textContent = "Som indisponível";
    }
  };

  button.addEventListener("click", toggle);
  return () => {
    button.removeEventListener("click", toggle);
    audio.pause();
    button.remove();
    audio.remove();
  };
}

function createPresenceObserver(regions, { reducedMotion = false } = {}) {
  if (typeof IntersectionObserver === "undefined") {
    regions.forEach((region) => {
      region.style.setProperty("--region-presence", "1");
      region.classList.add("is-present");
    });
    return { disconnect() {} };
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const ratio = clamp(entry.intersectionRatio);
      const presence = reducedMotion ? (entry.isIntersecting ? 1 : 0) : ratio;
      entry.target.style.setProperty("--region-presence", presence.toFixed(4));
      entry.target.classList.toggle("is-present", entry.isIntersecting && presence > 0.08);
    });
  }, { threshold: [0, 0.15, 0.35, 0.6, 0.85] });

  regions.forEach((region) => observer.observe(region));
  return observer;
}

/**
 * Rolar o bastante para dizer "segui em frente" fecha o bloco aberto.
 *
 * O limiar existe para separar decisão de tremor: um toque no trackpad, o
 * repique de uma rolagem por inércia ou o ajuste de meia linha não podem
 * fechar o que a pessoa está lendo. Uma fração da altura da tela mede isso
 * melhor que um número fixo — a mesma distância que é um empurrão num monitor
 * é meia página num celular.
 */
export function shouldCloseOnScroll({
  openedAt = 0,
  scrollTop = 0,
  viewportHeight = 1,
  fraction = 0.18,
  minimum = 90,
} = {}) {
  const limiar = Math.max(minimum, Math.max(1, Number(viewportHeight) || 1) * fraction);
  return Math.abs(Number(scrollTop) - Number(openedAt)) > limiar;
}

/*
 * As relações vêm dos dados da jornada, não do que está gravado.
 *
 * O conteúdo editável vive no banco, e o banco não tem coluna para relações —
 * uma Home lendo de lá recebia todo bloco com a lista vazia, e a seção de
 * caminhos do painel não aparecia em nenhum deles. Medido: dez blocos, zero
 * listas.
 *
 * Casadas por id na hora de montar, elas independem da origem do bloco: banco,
 * armazenamento local ou os próprios padrões.
 */
export function comRelacoes(blocks = []) {
  const porId = new Map(DEFAULT_HOME_BLOCKS.map((bloco) => [bloco.id, bloco]));
  return blocks.map((bloco) => {
    const padrao = porId.get(bloco.id);
    if (!padrao) return bloco;
    return {
      ...bloco,
      relatedContent: bloco.relatedContent?.length ? bloco.relatedContent : padrao.relatedContent,
    };
  });
}

export function createHomeController({
  root,
  canvas,
  blocks = DEFAULT_HOME_BLOCKS,
  pathFactory = createHomePath,
} = {}) {
  if (!root || !canvas) throw new TypeError("root e canvas são obrigatórios");

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  /*
   * As descobertas precisam CHEGAR aqui.
   *
   * A lista estava fixa em vazia, e com ela o mapa de descobertas nascia vazio:
   * os caminhos laterais e a lista de "caminhos a partir daqui" nunca tinham de
   * onde tirar título, descrição ou endereço, e simplesmente não apareciam — sem
   * erro, sem espaço vazio, sem nada que indicasse a ausência.
   */
  /*
   * AS NOVIDADES SOBEM AO TOPO, e a reordenação acontece AQUI.
   *
   * Não no banco e não no painel: lá a ordem é a que o editor arrastou, e ela
   * precisa continuar sendo dele. O que a Home faz é uma leitura — mostrar
   * primeiro o que mudou — e uma leitura não deve reescrever a fonte.
   *
   * Fazer isso na montagem também é o que permite marcar um bloco pelo painel e
   * vê-lo subir sem tocar em código: `novidadesPrimeiro` só olha as tags.
   *
   * `path` recebe a MESMA lista, e não a original. A estrada é desenhada a
   * partir das posições dos blocos; com duas ordens diferentes, os cartões
   * apareceriam num lugar e a curva da estrada em outro.
   */
  /* As novidades do código entram ANTES de ordenar: elas não estão no banco, e
     sem isto a Home e a prévia mostrariam só as onze linhas de lá. */
  const emOrdem = novidadesPrimeiro(comNovidadesDoCodigo(blocks, NOVIDADES_PADRAO));
  const mounted = mountJourney(root, { regions: comRelacoes(emOrdem), discoveries: JOURNEY_DISCOVERIES });
  const path = pathFactory(canvas, { blocks: emOrdem, reducedMotion });
  /**
   * Quanto o vão do trajeto saiu do centro da tela, em pixels.
   *
   * A medida sai da própria grade já resolvida pelo navegador, e não de uma
   * segunda cópia da conta no JavaScript: quando a página abre para um lado,
   * as colunas mudam no CSS, e recalcular isso aqui criaria duas verdades que
   * envelhecem separadas. Basta ler as larguras usadas.
   */
  function gutterOffsetFor(section) {
    const stage = section?.closest?.(".region-stage");
    if (!stage) return 0;
    const estilo = getComputedStyle(stage);
    const colunas = estilo.gridTemplateColumns.split(" ").map(parseFloat);
    /* No telefone a grade tem duas colunas — vão e conteúdo — e o vão não sai
       do lugar ao abrir. Ler a segunda coluna ali seria medir o conteúdo, e a
       câmera andaria atrás de um deslocamento que não aconteceu. */
    if (colunas.length < 3) return 0;
    const [esquerda, vao] = colunas;
    if (!Number.isFinite(esquerda) || !Number.isFinite(vao)) return 0;
    const caixa = stage.getBoundingClientRect();
    const centroDoVao = caixa.left + parseFloat(estilo.paddingLeft) + esquerda + vao / 2;
    return centroDoVao - innerWidth / 2;
  }

  /*
   * A linha segue a ANIMAÇÃO do CSS, medindo-a a cada quadro.
   *
   * A alternativa seria repetir a curva de easing em JavaScript e animar a
   * câmera em paralelo. Duas curvas que precisam coincidir acabam divergindo —
   * basta alguém ajustar o tempo de um lado — e a divergência aparece
   * exatamente como o defeito que se quer evitar: a linha chegando antes ou
   * depois do vão que deveria ocupar.
   *
   * Lendo a grade interpolada, não há segunda curva: a linha está onde o vão
   * está, quadro a quadro, por construção. A leitura de layout por quadro é
   * limitada à duração da transição, e não ao tempo todo.
   */
  let shiftFrame = 0;
  let shiftUntil = 0;

  function followGutter(section) {
    shiftFrame = 0;
    if (destroyed) return;
    path.setLateralShift?.(section ? gutterOffsetFor(section) : 0);
    if (performance.now() < shiftUntil) shiftFrame = requestAnimationFrame(() => followGutter(section));
  }

  /*
   * De onde a rolagem começou a contar, e quando ela não deve contar.
   *
   * O menu e o convite ABREM um bloco e rolam até ele: sem a trégua, essa
   * própria rolagem fecharia o bloco que o clique acabou de trazer. Enquanto a
   * rolagem programada está em curso, a origem acompanha o movimento; ela só
   * congela quando os eventos param de chegar, e é daí em diante que o gesto
   * do visitante passa a valer.
   */
  let openScrollY = 0;
  let settleTimer = 0;
  let awaitingScroll = false;

  function armAutoClose({ programmatic = false } = {}) {
    openScrollY = scrollY;
    awaitingScroll = programmatic;
    clearTimeout(settleTimer);
    if (!programmatic) return;
    settleTimer = setTimeout(() => { awaitingScroll = false; }, 260);
  }

  /*
   * O fundo em movimento. Ele se vira sozinho: lê o mesmo
   * `--journey-scroll-progress` que este controlador já escreve, e decide por
   * conta própria se vale carregar. Se não valer, devolve um objeto vazio e a
   * paisagem segue sendo a imagem de sempre.
   */
  const landscapeVideo = createLandscapeVideo(document.getElementById("journey-landscape"));

  const expansion = createBlockExpansion(root, {
    onChange: (entry) => {
      if (shiftFrame) cancelAnimationFrame(shiftFrame);
      shiftFrame = 0;
      // A janela cobre a transição do CSS com uma folga curta, e só ela.
      shiftUntil = performance.now() + (reducedMotion ? 0 : 820);
      followGutter(entry?.section ?? null);
      if (entry) armAutoClose();
    },
  });
  /*
   * A presença é medida no PAR, não no bloco.
   *
   * O bloco agora vive dentro de um palco fixo, então suas bordas praticamente
   * não se mexem em relação à tela — observá-lo devolveria presença constante e
   * o aparecer/desaparecer sumiria. É o par que atravessa a tela, e a
   * propriedade herda dele para os dois blocos, que assim entram e saem juntos.
   */
  const presenceObserver = createPresenceObserver(mounted.pairs, { reducedMotion });
  /*
   * O menu leva ao PAR, e abre o bloco pedido.
   *
   * Rolar até a região não funcionaria: com `display: contents` ela não tem
   * caixa própria, então não há posição para onde rolar. Quem tem geometria é
   * o par — e chegar lá mostrando os dois blocos sem dizer qual foi pedido
   * deixaria o clique pela metade, por isso o bloco também abre.
   */
  function goToSection(id) {
    const region = root.querySelector(`.journey-region[data-region-id="${CSS.escape(id)}"]`);
    const pair = region?.closest(".journey-pair");
    if (!pair) return;
    /*
     * `scrollTo` nesta janela, não `scrollIntoView` no elemento.
     *
     * `scrollIntoView` rola TODOS os contêineres ancestrais até o alvo aparecer
     * — e quando esta página roda dentro do iframe da prévia do painel, o
     * documento pai é um deles. O efeito era o painel saltar para baixo, até a
     * prévia, cada vez que um bloco era criado ou editado: a rolagem atravessava
     * a fronteira do iframe.
     *
     * `scrollTo` só move a janela em que é chamado. Na Home o resultado é o
     * mesmo; dentro da prévia, a rolagem para na borda do iframe.
     */
    const alvo = pair.getBoundingClientRect().top + scrollY;
    scrollTo({ top: alvo, behavior: reducedMotion ? "auto" : "smooth" });
    /*
     * `abrirCentralizado` e não `open`: abrindo direto, o painel nascia com o
     * par ainda a meio caminho — a rolagem acima é suave e não terminou — e
     * sobravam faixas de paisagem em cima e embaixo dele. É o mesmo defeito que
     * o clique num cartão já não tem, e a mesma correção.
     */
    expansion.abrirCentralizado(id);
    // A rolagem que o próprio clique disparou não pode fechar o que ele abriu.
    armAutoClose({ programmatic: true });
  }

  /*
   * O menu nasce recolhido e o ícone o traz.
   *
   * `inert` acompanha a visibilidade porque opacidade zero não tira nada da
   * ordem de tabulação: recolhido sem ele, o menu continuaria recebendo foco —
   * nove paradas invisíveis antes de qualquer coisa que se veja na tela.
   */
  const menuNav = root.querySelector(".journey-menu");
  const menuToggle = root.querySelector("[data-menu-toggle]");
  const menuViewport = root.querySelector(".journey-menu-viewport");
  const desktopMenu = matchMedia("(min-width: 901px)");

  /*
   * A roleta rola até a POSIÇÃO DO ITEM, e não até `índice × altura da linha`.
   *
   * A conta funcionava enquanto a lista era só de blocos, todos da mesma
   * altura. Com os títulos de grupo ("Recentes", "Seções") entre eles, o
   * enésimo bloco deixou de estar na enésima linha: a roleta parava sempre
   * alguns itens acima, e o item ativo ficava fora do centro sem que nada
   * indicasse a causa.
   *
   * Perguntar ao próprio elemento onde ele está também sobrevive a linhas de
   * alturas diferentes, que é o que um título de grupo é.
   */
  /* A posição do bloco na jornada inteira, para o contador "05 / 15" continuar
     contando blocos e não linhas da roleta — que agora são menos. */
  function indiceDoBloco(id) {
    return emOrdem.findIndex((bloco) => bloco.id === id);
  }

  function rolarRoletaAte(linha) {
    if (!menuViewport || !linha) return;
    menuViewport.scrollTo?.({
      /* Centrado, pelo mesmo motivo do item ativo: a roleta conta o caminho
         inteiro, e no topo ela só contaria a metade que falta. */
      top: menuViewport.scrollTop
        + (linha.getBoundingClientRect().top - menuViewport.getBoundingClientRect().top)
        - (menuViewport.clientHeight - linha.offsetHeight) / 2,
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }

  function setMenuWheelIndex(index, { animate = true } = {}) {
    if (!menuViewport || index < 0) return;
    const linha = mounted.menuItems[index]?.closest?.("li");
    menuViewport.dataset.currentIndex = String(index);
    /*
     * A distância sai da diferença entre os RETÂNGULOS, e não de `offsetTop`.
     *
     * `offsetTop` é medido contra o `offsetParent`, e o da linha não é o mesmo
     * da roleta — a conta dava um deslocamento de umas seis linhas, e o item
     * ativo parava fora da vista. A diferença de retângulos somada à rolagem
     * atual não depende de quem é pai de quem.
     */
    /*
     * O item ativo fica no CENTRO da roleta, não no topo.
     *
     * Encostado no topo, ele tinha a lista inteira embaixo e nada em cima: não
     * dava para ver de onde se veio, só para onde se vai. No centro, a roleta
     * mostra os dois lados do caminho — que é o que ela existe para contar.
     */
    const destino = linha
      ? menuViewport.scrollTop
        + (linha.getBoundingClientRect().top - menuViewport.getBoundingClientRect().top)
        - (menuViewport.clientHeight - linha.offsetHeight) / 2
      : index * 38;
    menuViewport.scrollTo?.({
      top: destino,
      behavior: animate && !reducedMotion ? "smooth" : "auto",
    });
  }

  const onMenuWheelFocus = (event) => {
    const link = event.target.closest?.("[data-menu-target]");
    const index = mounted.menuItems.indexOf(link);
    setMenuWheelIndex(index);
  };
  menuViewport?.addEventListener("focusin", onMenuWheelFocus);

  function setMenuOpen(open) {
    if (!menuNav || !menuToggle) return;
    const next = desktopMenu.matches || Boolean(open);
    menuToggle.setAttribute("aria-expanded", String(next));
    menuToggle.setAttribute("aria-label", next ? "Fechar navegação" : "Abrir navegação");
    menuNav.classList.toggle("is-open", next);
    document.body.classList.toggle("is-journey-menu-open", next && !desktopMenu.matches);
    if (next) menuNav.removeAttribute("inert");
    else menuNav.setAttribute("inert", "");
  }

  const onMenuToggle = () => {
    setMenuOpen(menuToggle?.getAttribute("aria-expanded") !== "true");
  };
  menuToggle?.addEventListener("click", onMenuToggle);

  const onMenuClick = (event) => {
    const link = event.target.closest?.("[data-menu-target]");
    if (!link) return;
    setMenuOpen(false);
  };
  menuNav?.addEventListener("click", onMenuClick);

  const onMenuBreakpoint = () => setMenuOpen(desktopMenu.matches);
  desktopMenu.addEventListener?.("change", onMenuBreakpoint);
  setMenuOpen(desktopMenu.matches);

  const onMenuKeydown = (event) => {
    if (event.key !== "Escape" || desktopMenu.matches || !menuNav?.classList.contains("is-open")) return;
    setMenuOpen(false);
    menuToggle?.focus();
  };
  document.addEventListener("keydown", onMenuKeydown);

  let menuPairBounds = [];
  let pathJourneyStart = 0;

  function measureMenuPairs() {
    menuPairBounds = mounted.pairs.map((pair) => {
      const rect = pair.getBoundingClientRect();
      return {
        /* O elemento vai junto: é a classe `is-present` dele que diz se há
           cartão na tela, e o retângulo sozinho não conta isso. */
        element: pair,
        top: rect.top + scrollY,
        height: rect.height,
        ids: [...pair.querySelectorAll(".journey-region")]
          .map((region) => region.dataset.regionId),
      };
    });
    pathJourneyStart = menuPairBounds[0]?.top ?? 0;
  }

  function updateCurrentMenuItem() {
    if (!menuPairBounds.length) return;
    const focus = scrollY + innerHeight * .5;
    const pair = menuPairBounds.reduce((closest, candidate) => {
      const bottom = candidate.top + candidate.height;
      const distance = focus < candidate.top
        ? candidate.top - focus
        : focus > bottom ? focus - bottom : 0;
      return !closest || distance < closest.distance ? { ...candidate, distance } : closest;
    }, null);
    const localIndex = regionIndexWithinPair({
      pairTop: pair.top,
      pairHeight: pair.height,
      scrollY,
      viewportHeight: innerHeight,
      regionCount: pair.ids.length,
    });
    const activeId = pair.ids[localIndex];
    /*
     * O trecho atual — novidades ou seções — governa três coisas de uma vez: o
     * título no alto da Home, a linha "Recentes" da roleta e a rolagem dela.
     *
     * As novidades NÃO têm linha própria na roleta: as quatro compartilham uma.
     * Por isso a busca por `data-menu-target` não as encontra, e sem este
     * caminho separado o `activeIndex < 0` abaixo simplesmente devolvia — a
     * roleta congelava nos quatro primeiros cartões, e o título não aparecia.
     */
    const blocoAtivo = emOrdem.find((bloco) => bloco.id === activeId);
    const emNovidades = Boolean(blocoAtivo && ehNovidade(blocoAtivo));

    const linhaRecentes = root.querySelector("[data-menu-recentes]");
    const linhaDestacado = root.querySelector("[data-menu-destacado]");
    /*
     * `data-atual`, e não `aria-current`.
     *
     * O marcador diz em que GRUPO se está; o item da lista diz em que SEÇÃO. Os
     * dois acesos ao mesmo tempo com `aria-current` davam duas "posições
     * atuais" na mesma navegação, e um leitor de tela anuncia as duas sem ter
     * como dizer que uma contém a outra.
     */
    linhaRecentes?.setAttribute("data-atual", emNovidades ? "true" : "false");
    linhaDestacado?.setAttribute("data-atual", emNovidades ? "false" : "true");

    const activeIndex = mounted.menuItems.findIndex((item) => item.dataset.menuTarget === activeId);

    mounted.menuItems.forEach((item, index) => {
      item.setAttribute("aria-current", index === activeIndex ? "true" : "false");
    });
    const counter = root.querySelector("[data-journey-current]");
    if (counter) counter.textContent = String(indiceDoBloco(activeId) + 1).padStart(2, "0");

    /* Nas novidades a roleta para na linha "Recentes"; nas seções, na linha da
       seção. Sem isto ela ficava presa onde estava quando a jornada abriu. */
    if (emNovidades && linhaRecentes) rolarRoletaAte(linhaRecentes);
    else if (activeIndex >= 0) setMenuWheelIndex(activeIndex);
  }

  /* ---------------------------------------------------------------
   * A busca da barra lateral
   *
   * Ela NÃO redireciona. Encontra o bloco que responde ao que foi digitado,
   * desce até ele e o abre — e para por aí. Buscar "tai chi" e ser jogado para
   * outra página tiraria da pessoa a chance de ver que ao lado há as práticas
   * orientais, adiante os cursos e depois a programação. A busca abre uma porta
   * na jornada; não atravessa a porta por ninguém.
   * --------------------------------------------------------------- */
  const formaDeBusca = root.querySelector("[data-journey-busca]");
  const campoDeBusca = root.querySelector("[data-journey-busca-campo]");
  const avisoDeBusca = root.querySelector("[data-journey-busca-aviso]");
  const abrirBusca = root.querySelector("[data-journey-abrir-busca]");

  function mostrarBusca() {
    if (!formaDeBusca) return;
    formaDeBusca.hidden = false;
    /* O menu fecha: ele cumpriu o papel de revelar a busca, e aberto por cima
       dela cobriria justamente o campo que se acabou de pedir. */
    abrirBusca?.closest?.("details")?.removeAttribute?.("open");
    campoDeBusca?.focus?.();
  }

  const onAbrirBusca = () => mostrarBusca();
  abrirBusca?.addEventListener("click", onAbrirBusca);

  /*
   * O ÍNDICE DAS SEÇÕES chega na PRIMEIRA busca, e não no carregamento.
   *
   * São 22 KB que a esmagadora maioria das visitas nunca vai usar: quem percorre
   * a jornada não abre a busca. Baixá-lo junto com a Home cobraria isso de todo
   * mundo pelo benefício de alguns.
   *
   * A promessa é guardada, não o resultado: duas buscas seguidas antes de a
   * primeira responder pediriam o arquivo duas vezes.
   */
  let indiceDasSecoes = null;

  function carregarIndice() {
    if (!indiceDasSecoes) {
      indiceDasSecoes = fetch("busca-indice.json")
        .then((resposta) => (resposta.ok ? resposta.json() : null))
        /*
         * Falhar aqui NÃO pode quebrar a busca.
         *
         * Sem o índice ela continua encontrando pelo texto dos blocos, que é o
         * que ela sempre soube fazer. Uma busca que responde menos é melhor que
         * uma que não responde.
         */
        .catch(() => null);
    }
    return indiceDasSecoes;
  }

  const onBuscar = async (evento) => {
    evento.preventDefault?.();
    const termo = campoDeBusca?.value ?? "";
    const indice = await carregarIndice();
    const achado = procurarBloco(emOrdem, termo, indice);

    if (!achado) {
      /*
       * Dizer que não achou, em vez de abrir um bloco qualquer.
       *
       * Levar a pessoa ao primeiro da lista faria o site parecer ter entendido
       * — e ela leria o bloco errado procurando o que pediu.
       */
      if (avisoDeBusca) {
        avisoDeBusca.textContent = termo.trim()
          ? "Nada na jornada responde a isso."
          : "Escreva o que procura.";
      }
      return;
    }

    if (avisoDeBusca) avisoDeBusca.textContent = "";
    formaDeBusca.hidden = true;
    goToSection(achado.id);
  };

  formaDeBusca?.addEventListener("submit", onBuscar);

  const handoff = consumeHandoff();
  const removeSound = mountSoundResume(root, handoff.soundEnabled === true);
  let frameId = 0;
  let entryTimer = 0;
  let destroyed = false;

  /*
   * O convite gira, mas para quando alguém olha.
   *
   * Texto que se troca sozinho é conteúdo em movimento: quem está lendo pode
   * ser interrompido no meio da frase. Pausar no ponteiro e no foco é o mínimo
   * — e com `prefers-reduced-motion` ele não gira de jeito nenhum, mostrando um
   * convite só. A alternativa (girar mais devagar) não resolve: continuaria
   * trocando sob os olhos de quem pediu para nada se mexer.
   */
  const invite = mounted.invite;
  const inviteTexto = invite?.querySelector?.("[data-invite-text]") ?? null;
  const convites = invitationsFor(blocks);
  let inviteIndex = 0;
  let inviteTimer = 0;
  let invitePausado = false;

  function showInvitation(index) {
    const convite = convites[index];
    if (!convite || !invite || !inviteTexto) return;
    inviteIndex = index;
    invite.dataset.inviteTarget = convite.id;
    // A troca acontece com o texto já apagado: escrever antes de sair faria a
    // frase nova aparecer por um quadro no lugar da antiga, antes da animação.
    invite.classList.add("is-swapping");
    setTimeout(() => {
      inviteTexto.textContent = convite.text;
      invite.classList.remove("is-swapping");
    }, reducedMotion ? 0 : 260);
  }

  function scheduleInvitation() {
    if (reducedMotion || convites.length < 2 || destroyed) return;
    clearTimeout(inviteTimer);
    inviteTimer = setTimeout(() => {
      if (!invitePausado) showInvitation(nextInvitationIndex(inviteIndex, convites.length));
      scheduleInvitation();
    }, 4600);
  }

  const pauseInvitation = () => { invitePausado = true; };
  const resumeInvitation = () => { invitePausado = false; };
  const onInviteClick = () => {
    if (invite?.dataset.inviteTarget) goToSection(invite.dataset.inviteTarget);
  };

  if (invite) {
    invite.addEventListener("pointerenter", pauseInvitation);
    invite.addEventListener("pointerleave", resumeInvitation);
    invite.addEventListener("focus", pauseInvitation);
    invite.addEventListener("blur", resumeInvitation);
    invite.addEventListener("click", onInviteClick);
    scheduleInvitation();
  }


  if (handoff.entry) entryTimer = holdEntryHandoff(document.documentElement);

  function update() {
    frameId = 0;
    if (destroyed || document.hidden) return;

    if (expansion.activeId) {
      if (awaitingScroll) {
        // Rolagem programada em curso: a origem anda junto e o relógio de
        // repouso recomeça a cada quadro que ainda se mexe.
        openScrollY = scrollY;
        clearTimeout(settleTimer);
        settleTimer = setTimeout(() => { awaitingScroll = false; }, 260);
      } else if (shouldCloseOnScroll({
        openedAt: openScrollY,
        scrollTop: scrollY,
        viewportHeight: innerHeight,
      })) {
        expansion.close();
      }
    }
    const progress = scrollProgressForDocument({
      scrollTop: scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: innerHeight,
    });
    document.documentElement.style.setProperty("--journey-scroll-progress", progress.toFixed(4));
    document.documentElement.style.setProperty(
      "--journey-scroll-position",
      scrollCuePosition({ progress, movable: true }),
    );
    updateCurrentMenuItem();
    const pathState = pathProgressAfterPrologue({
      scrollTop: scrollY,
      journeyStart: pathJourneyStart,
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: innerHeight,
    });
    path.setActive?.(pathState.active);
    path.setProgress(pathState.progress);
    /* O fundo anda pelo MESMO número que move o trajeto — daí os dois nunca
       saírem de sincronia. */
    landscapeVideo.setProgress(pathState.progress);
  }

  function requestUpdate() {
    if (!frameId && !destroyed && !document.hidden) frameId = requestAnimationFrame(update);
  }

  function onResize() {
    measureMenuPairs();
    path.resize();
    requestUpdate();
  }

  function onVisibilityChange() {
    if (document.hidden) {
      path.pause();
      return;
    }
    path.resume();
    requestUpdate();
  }

  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", onResize, { passive: true });
  document.addEventListener("visibilitychange", onVisibilityChange);
  document.body.classList.add("is-ready");
  measureMenuPairs();
  requestUpdate();

  return {
    mounted,
    path,
    goToSection,
    restore() {
      path.resume();
      path.resize();
      requestUpdate();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(entryTimer);
      presenceObserver.disconnect();
      if (shiftFrame) cancelAnimationFrame(shiftFrame);
      menuViewport?.removeEventListener("focusin", onMenuWheelFocus);
      menuNav?.removeEventListener("click", onMenuClick);
      menuToggle?.removeEventListener("click", onMenuToggle);
      desktopMenu.removeEventListener?.("change", onMenuBreakpoint);
      document.removeEventListener("keydown", onMenuKeydown);
      document.body.classList.remove("is-journey-menu-open");
      clearTimeout(inviteTimer);
      clearTimeout(settleTimer);
      invite?.removeEventListener("pointerenter", pauseInvitation);
      invite?.removeEventListener("pointerleave", resumeInvitation);
      invite?.removeEventListener("focus", pauseInvitation);
      invite?.removeEventListener("blur", resumeInvitation);
      invite?.removeEventListener("click", onInviteClick);
      abrirBusca?.removeEventListener("click", onAbrirBusca);
      formaDeBusca?.removeEventListener("submit", onBuscar);
      expansion.destroy();
      landscapeVideo.destroy();
      path.destroy();
      removeSound();
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    },
  };
}

let activeController;

export async function mountHomeJourney({
  repository,
  elements,
  controllerFactory = createHomeController,
  lifecycle = true,
} = {}) {
  activeController?.destroy();
  const contentRepository = repository || createLocalContentRepository({ defaults: DEFAULT_HOME_BLOCKS });
  const previewMode = typeof location !== "undefined"
    && new URLSearchParams(location.search).get("admin-preview") === "1";
  const previewSnapshot = previewMode
    ? readAdminPreviewSnapshot(globalThis.sessionStorage)
    : null;
  const blocks = previewSnapshot?.blocks
    ?? await contentRepository.list({ publishedOnly: true });
  const resolvedElements = elements || {
    root: document.getElementById("journey-root"),
    canvas: document.getElementById("journey-road"),
  };
  activeController = controllerFactory({ ...resolvedElements, blocks });

  if (!lifecycle) return activeController;

  let previewChannel = null;
  if (previewMode) {
    document.documentElement.classList.add("is-admin-preview");
    previewChannel = createHomeAdminPreview({
      root: resolvedElements.root,
      initialBlocks: blocks,
      onSnapshot(payload) {
        writeAdminPreviewSnapshot(globalThis.sessionStorage, payload);
      },
      onStructureChange() {
        // Uma mudança estrutural (novo bloco, ordem, lado ou publicação) também
        // altera a curva Three.js. Um único reload reconstrói DOM e caminho;
        // as próximas teclas voltam a atualizar apenas o bloco, sem novo loop.
        globalThis.location?.reload?.();
      },
      onFocus(id) {
        activeController?.goToSection?.(id);
      },
    });
    if (previewSnapshot?.focusId) {
      const schedule = globalThis.requestAnimationFrame
        ? globalThis.requestAnimationFrame.bind(globalThis)
        : globalThis.setTimeout.bind(globalThis);
      schedule(() => activeController?.goToSection?.(previewSnapshot.focusId));
    }
  }

  const onPageHide = (event) => {
    if (!event.persisted) activeController?.destroy();
    else activeController?.path?.pause();
  };
  const onPageShow = (event) => {
    if (!event.persisted) return;
    delete document.documentElement.dataset.transitioning;
    document.documentElement.classList.remove("is-crossing");
    document.body.classList.remove("is-arrival-transitioning");
    activeController?.restore?.();
  };
  const destroy = activeController.destroy.bind(activeController);
  activeController.destroy = () => {
    previewChannel?.destroy();
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("pageshow", onPageShow);
    destroy();
  };
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", onPageShow);
  return activeController;
}
