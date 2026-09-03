import {
  DURACAO,
  DURACAO_REDUZIDA,
  atrasoDaCategoria,
  createTravessiaState,
  deslocamentoDaCamada,
  deslocamentoDaCamera,
  sentidoDaCamera,
} from "./travessia.js";

const FOCUSABLE_SELECTOR = "a[href], button, input, select, textarea, [tabindex]";

function setFocusable(details, enabled) {
  details.querySelectorAll?.(FOCUSABLE_SELECTOR).forEach((element) => {
    if (enabled) {
      if (element.dataset?.previousTabindex !== undefined) {
        const previous = element.dataset.previousTabindex;
        if (previous) element.setAttribute("tabindex", previous);
        else element.removeAttribute("tabindex");
        delete element.dataset.previousTabindex;
      } else {
        element.removeAttribute("tabindex");
      }
      return;
    }

    if (element.dataset && element.dataset.previousTabindex === undefined) {
      element.dataset.previousTabindex = element.getAttribute("tabindex") ?? "";
    }
    element.setAttribute("tabindex", "-1");
  });
}

function setExpanded(entry, expanded) {
  entry.section.classList[expanded ? "add" : "remove"]("is-expanded");
  const fechar = entry.section.querySelector?.("[data-region-close]");
  /* Fora do bloco aberto, o × não é alcançável pelo Tab: um botão de fechar
     num cartão fechado não fecha coisa nenhuma. */
  if (fechar) fechar.setAttribute("tabindex", expanded ? "0" : "-1");
  entry.summary.setAttribute("aria-expanded", String(expanded));
  entry.details.setAttribute("aria-hidden", String(!expanded));
  entry.details.inert = !expanded;
  if (expanded) entry.details.removeAttribute?.("inert");
  else entry.details.setAttribute?.("inert", "");
  setFocusable(entry.details, expanded);
}

export function createBlockExpansion(root, {
  /*
   * O Escape escuta o DOCUMENTO, não a jornada.
   *
   * Preso à raiz, ele só funcionava enquanto o foco estivesse dentro dela — o
   * caminho comum, porque abrir um bloco foca o resumo. Mas basta clicar no
   * fundo da página, ou voltar de um link do bloco aberto, para o foco cair no
   * body: dali o Escape não fechava mais nada, e a única saída era achar o
   * botão de novo. Medido na prévia: com foco no resumo fechava, com foco no
   * body não.
   *
   * O clique continua na raiz porque ali a delegação é a intenção; o Escape é
   * um gesto global de "desfazer o que está aberto".
   */
  keyboardTarget = root?.ownerDocument ?? root,
  /*
   * A navegação é injetável para o teste poder observá-la sem sair da página.
   * Trocar `location.href` num teste levaria o corredor inteiro junto.
   */
  navigate = (href) => { if (href) globalThis.location.assign(href); },
  /* Avisado sempre que a expansão muda, para quem precisa acompanhar por fora —
     hoje o trajeto, que anda junto com o vão quando a página abre para o lado. */
  onChange = () => {},
  /*
   * Os relógios entram por parâmetro para o teste poder fechar a linha do tempo
   * sem esperar dois segundos de verdade. É o mesmo caminho que a prévia do
   * painel já usa com `schedulePreview`.
   */
  agendar = (retorno, atraso) => globalThis.setTimeout(retorno, atraso),
  cancelar = (id) => globalThis.clearTimeout(id),
} = {}) {
  if (!root) throw new TypeError("root é obrigatório para controlar os blocos");

  const entries = [...root.querySelectorAll(".journey-region")]
    .map((section) => ({
      id: section.dataset.regionId,
      section,
      summary: section.querySelector(".region-summary"),
      details: section.querySelector(".region-details"),
    }))
    .filter(({ id, summary, details }) => id && summary && details);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  let activeId = null;
  let fimDaTravessia = 0;

  const documento = root.ownerDocument || globalThis.document;
  const corpo = documento?.body;
  const reduzido = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  const duracao = reduzido ? DURACAO_REDUZIDA : DURACAO;
  const travessia = createTravessiaState();

  /*
   * As distâncias são medidas na largura de agora, e recalculadas ao
   * redimensionar. Fixá-las na montagem faria a câmera de um monitor continuar
   * valendo depois de a janela virar meia tela.
   */
  function medirCamera(lado) {
    if (!corpo?.style) return;
    const base = reduzido ? 0 : deslocamentoDaCamera({ viewportWidth: globalThis.innerWidth || 1440 });
    /* O bloco da esquerda estende a paisagem para a esquerda, e o da direita
       para a direita: a cena abre do lado de quem chamou. */
    corpo.style.setProperty("--travessia-sentido", String(sentidoDaCamera(lado)));
    corpo.style.setProperty("--travessia-camera", `${base}px`);
    corpo.style.setProperty("--travessia-fundo", `${deslocamentoDaCamada("fundo", base)}px`);
    corpo.style.setProperty("--travessia-frente", `${deslocamentoDaCamada("frente", base)}px`);
    corpo.style.setProperty("--travessia-interface", `${deslocamentoDaCamada("interface", base)}px`);
    corpo.style.setProperty("--travessia-total", `${duracao}ms`);
  }

  /*
   * O stagger é escrito em cada elemento revelado.
   *
   * O CSS sozinho não sabe quantas categorias existem, e um passo fixo empurra
   * a última para depois do fim da linha do tempo quando são muitas. O atraso
   * vem da mesma conta conferida no teste.
   */
  function escalonar(entry) {
    const itens = [...(entry.details.querySelectorAll?.(":scope > *") || [])];
    itens.forEach((item, indice) => {
      item.style?.setProperty?.(
        "--travessia-passo",
        `${atrasoDaCategoria(indice, itens.length, duracao)}ms`,
      );
    });
  }

  function encenar(entry, estado) {
    entry.section.dataset.travessia = estado;
    if (corpo) corpo.dataset.travessiaAtiva = estado === "initial" ? "false" : "true";
  }

  medirCamera();
  globalThis.addEventListener?.("resize", medirCamera);

  entries.forEach((entry) => setExpanded(entry, false));

  /*
   * `encena` separa o fechamento do visitante do fechamento interno.
   *
   * Trocar de bloco fecha o anterior por dentro, e rodar a volta inteira ali
   * travaria a máquina no exato instante em que o bloco novo precisa abrir —
   * a troca simplesmente não acontecia.
   */
  function close({ restoreFocus = false, encena = true } = {}) {
    if (!activeId) return false;
    const current = byId.get(activeId);
    activeId = null;
    if (!current) return false;
    setExpanded(current, false);

    /*
     * Fechar durante a travessia interrompe, e não é recusado.
     *
     * A trava existe para impedir uma segunda linha do tempo, não para impedir
     * a saída. Recusando, o Escape no meio da animação deixava a paisagem
     * estendida PARA SEMPRE e o trajeto sumido: o estado do corpo nunca voltava
     * a `false`, e nada na tela dava a entender o que tinha acontecido.
     */
    if (encena) travessia.interromper();

    if (encena && travessia.fechar()) {
      /* A volta usa a MESMA linha do tempo, no sentido inverso: o estado vai
         para `transitioning` e só chega em `initial` no fim. */
      encenar(current, "transitioning");
      cancelar(fimDaTravessia);
      fimDaTravessia = agendar(() => {
        travessia.concluir("initial");
        delete current.section.dataset.travessia;
        if (corpo) corpo.dataset.travessiaAtiva = "false";
      }, duracao);
    } else {
      /* O atributo do corpo volta em QUALQUER caminho de fechamento. Ele é o
         que governa a paisagem e o trajeto; esquecê-lo aqui prende os dois no
         estado estendido. */
      delete current.section.dataset.travessia;
      if (corpo) corpo.dataset.travessiaAtiva = "false";
    }

    if (restoreFocus) current.summary.focus?.();
    onChange(null);
    return true;
  }

  function open(id) {
    const next = byId.get(id);
    if (!next) return false;
    if (activeId === id) return true;
    /*
     * A trava recusa o clique repetido.
     *
     * Sem ela, um segundo clique no meio do caminho dispara uma segunda linha
     * do tempo por cima da primeira e a cena fica a meio caminho de dois
     * lugares diferentes.
     */
    /*
     * A trava recusa o clique repetido no MESMO bloco. Trocar de bloco é outro
     * pedido, e recusá-lo por dois segundos faria a jornada parecer travada.
     */
    if (travessia.travado && activeId === id) return false;
    travessia.interromper();
    cancelar(fimDaTravessia);
    close({ encena: false });
    medirCamera(next.section.dataset?.side);
    escalonar(next);
    setExpanded(next, true);
    travessia.abrir();
    encenar(next, "transitioning");
    activeId = id;

    /*
     * Dois relógios diferentes, e é essa separação que faz a sequência ler como
     * uma coisa só.
     *
     * O ESTADO VISUAL vira `revealed` imediatamente, porque são os atrasos do
     * CSS que escalonam título e categorias — esperar o fim da duração para
     * marcar `revealed` faria tudo aparecer de uma vez, depois de a paisagem já
     * ter parado.
     *
     * A TRAVA só cai no fim da duração inteira. É ela que recusa o clique
     * repetido, e soltá-la junto com o estado visual deixaria alguém disparar
     * uma segunda linha do tempo com a primeira ainda correndo.
     *
     * A virada NÃO usa requestAnimationFrame. Numa aba em segundo plano o rAF é
     * estrangulado, e quem trocasse de aba no meio da travessia voltaria para um
     * bloco permanentemente invisível, esperando um quadro que nunca chega.
     *
     * Ler `offsetWidth` força o navegador a calcular o estilo de
     * `transitioning` agora. Sem essa leitura, os dois estados cairiam no mesmo
     * quadro e a transição não teria de onde partir: o conteúdo apareceria
     * pronto, sem revelação nenhuma.
     */
    void next.section.offsetWidth;
    encenar(next, "revealed");
    cancelar(fimDaTravessia);
    fimDaTravessia = agendar(() => travessia.concluir("revealed"), duracao);

    onChange(next);
    return true;
  }

  function onClick(event) {
    /* O × fecha, e precisa ser lido ANTES do resumo: ele vive dentro do mesmo
       cartão, e sem esta ordem o clique nele contaria como clique no bloco. */
    if (event.target?.closest?.("[data-region-close]")) {
      event.preventDefault?.();
      close({ restoreFocus: true });
      return;
    }

    const summary = event.target?.closest?.(".region-summary");

    /*
     * Clique fora de qualquer bloco fecha o que estiver aberto.
     *
     * Isto passou a ser necessário quando o segundo clique virou navegação: sem
     * ele, quem abriu um bloco sem querer no telefone não teria como fechá-lo —
     * tocar de novo levaria para outra página, e Escape não existe no toque. A
     * única saída seria abrir outro bloco.
     */
    if (!summary) {
      /*
       * `[data-keeps-expansion]` é a saída para quem abre blocos de fora.
       *
       * O menu das seções vive dentro da mesma raiz, então o clique nele
       * borbulha até aqui: ele abria o bloco pedido e este ramo o fechava no
       * mesmo gesto, sem erro nenhum — o menu simplesmente não funcionava. O
       * atributo é genérico de propósito, para a expansão não precisar
       * conhecer o menu pelo nome.
       */
      const preserva = event.target?.closest?.("[data-keeps-expansion]");
      if (activeId && !preserva && !event.target?.closest?.(".region-content")) close();
      return;
    }

    const entry = entries.find(({ section }) => section.contains(summary));
    if (!entry) return;

    /*
     * O PRIMEIRO clique abre; o SEGUNDO leva ao destino.
     *
     * A regra aprovada era não redirecionar ao primeiro toque — alguém que só
     * quer ler o resumo não pode ser jogado para outra página. Ela continua de
     * pé: o primeiro clique abre e o texto completo aparece ali mesmo. O
     * segundo é uma escolha já informada, feita com o conteúdo à vista.
     *
     * O link explícito dentro da área expandida continua existindo: é ele que
     * anuncia o destino a quem usa leitor de tela, e é dele que sai o endereço
     * usado aqui — para não haver duas verdades sobre para onde o bloco leva.
     */
    if (activeId === entry.id) {
      /*
       * Durante a travessia, nem navegar.
       *
       * A trava vale para TODO clique, e não só para o que reabre: sem esta
       * linha, um segundo toque no meio da animação cortava a cena e levava a
       * pessoa para outra página antes de ela ter visto o conteúdo que a
       * travessia estava revelando — o oposto da escolha informada que o
       * segundo clique existe para ser.
       */
      if (travessia.travado) return;
      navigate(entry.details.querySelector?.(".region-link")?.getAttribute?.("href"));
      return;
    }

    open(entry.id);
  }

  function onKeydown(event) {
    if (event.key !== "Escape" || !activeId) return;
    event.preventDefault?.();
    close({ restoreFocus: true });
  }

  root.addEventListener("click", onClick);
  keyboardTarget.addEventListener("keydown", onKeydown);

  return {
    open,
    close,
    destroy() {
      root.removeEventListener("click", onClick);
      keyboardTarget.removeEventListener("keydown", onKeydown);
      globalThis.removeEventListener?.("resize", medirCamera);
      /*
       * Desmontar não pode deixar a cena estendida.
       *
       * `close()` encena a volta e agenda a limpeza, mas o relógio dispararia
       * depois de este controlador já não existir — e até lá a paisagem fica
       * deslocada e o trajeto luminoso sumido, sem ninguém para desfazer.
       * Aqui a volta é imediata, porque não há mais animação para assistir.
       */
      close({ encena: false });
      cancelar(fimDaTravessia);
      if (corpo) corpo.dataset.travessiaAtiva = "false";
    },
    get activeId() {
      return activeId;
    },
  };
}

