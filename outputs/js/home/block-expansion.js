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

/*
 * O quanto o painel aberto pode encolher antes de o texto deixar de ser texto.
 *
 * No telefone o corpo do painel é 0,73rem — perto de 11,7px. A 0,8 ele chega a
 * 9,4px, que é o limite do que ainda se lê com o telefone na mão. Mais fundo
 * que isto trocaria "ver tudo" por "não conseguir ler nada", que não é o pedido.
 */
export const PISO_DO_AJUSTE = 0.8;

/*
 * O menor aperto que faz o painel caber na caixa que ele tem.
 *
 * `medir` devolve `{ disponivel, natural }` para um dado fator, e entra por
 * parâmetro por dois motivos: o teste não precisa de um navegador, e a conta
 * PRECISA ser medida em vez de deduzida. `zoom` reflui o texto, então encolher
 * 5% costuma tirar mais de 5% da altura — uma linha inteira desaparece. Uma
 * razão pura erraria para baixo e apertaria o painel além do necessário.
 *
 * A primeira estimativa vem da razão, que é sempre um limite seguro; dali em
 * diante os passos SOBEM de volta procurando o maior fator que ainda serve.
 */
export function ajusteQueCabe(medir, { piso = PISO_DO_AJUSTE, passos = 4 } = {}) {
  const inicial = medir(1);
  if (!(inicial?.disponivel > 0) || !(inicial?.natural > 0)) return 1;
  if (inicial.natural <= inicial.disponivel) return 1;

  const estimado = Math.max(piso, inicial.disponivel / inicial.natural);
  if (estimado >= 1) return 1;

  /* Do maior para o menor: o primeiro que couber é o resposta, e o piso fecha a
     lista para que a busca sempre termine com um valor aplicável. */
  const candidatos = [];
  for (let i = 1; i <= passos; i += 1) {
    candidatos.push(estimado + ((1 - estimado) * (passos - i)) / passos);
  }

  for (const fator of candidatos) {
    const { disponivel, natural } = medir(fator);
    if (natural <= disponivel + 0.5) return fator;
  }

  return piso;
}

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

/*
 * A altura que o painel tem de verdade: o palco E a janela, o que for menor.
 *
 * O palco entra na conta porque é ele que carrega os recuos, e porque é
 * `sticky` — enquanto o par está em cena, é a caixa em que o painel vive.
 *
 * A janela entra porque o palco nem sempre cabe nela. Ele tem um piso de altura
 * de 560px, pensado para monitores; num telefone DEITADO, com 360px de altura,
 * o palco passa 200px da tela. Medido a 740×360: o painel fechava a conta
 * contra a caixa de 486 do palco, dava por resolvido, e assentava com 442px de
 * altura numa tela de 360 — o fim do texto ficava abaixo da borda, sem barra de
 * rolagem nenhuma para denunciar que havia mais.
 */
function caixaDoPalco(painel) {
  const palco = painel?.closest?.(".region-stage");
  if (!palco) return 0;
  const janela = painel.ownerDocument?.defaultView;
  const estilo = janela?.getComputedStyle?.(palco);
  if (!estilo) return 0;
  const recuo = parseFloat(estilo.paddingTop || 0) + parseFloat(estilo.paddingBottom || 0);
  const visivel = janela.innerHeight || palco.clientHeight;
  return Math.min(palco.clientHeight, visivel) - recuo;
}

/*
 * O aperto é `zoom`, e não `transform: scale()`.
 *
 * `scale` desenha o painel menor mas mantém a caixa do tamanho antigo: o
 * transbordo continua lá, invisível, empurrando o que vem depois, e os alvos de
 * toque param de coincidir com o que se vê. `zoom` reflui de verdade — o texto
 * quebra de novo, a caixa encolhe junto e o dedo acerta onde mira. Ele também
 * ganha MAIS que a proporção pedida, porque um aperto pequeno costuma eliminar
 * uma linha inteira; é por isso que a busca mede a cada passo.
 */
function ajustePadrao(entry, aberto) {
  const painel = entry.section.querySelector?.(".region-content");
  if (!painel?.style) return;

  if (!aberto) {
    painel.style.removeProperty("zoom");
    return;
  }

  /*
   * Mede-se o CONTEÚDO, não a caixa.
   *
   * Desde que o bloco aberto virou a página, o painel tem `height: 100%`: a
   * caixa dele é sempre exatamente a da tela, caiba o texto ou não. Medir por
   * `getBoundingClientRect` passou a devolver sempre "cabe", e o ajuste nunca
   * disparava — o texto simplesmente sobrava para dentro de uma barra de
   * rolagem. `scrollHeight` conta a altura que o conteúdo pediu, que é a
   * pergunta de verdade.
   *
   * Isso depende do `align-content: safe center` no CSS: centrado sem `safe`, o
   * transbordo vai metade para cima da borda, e `scrollHeight` não conta o que
   * ficou acima — a conta sairia curta pela metade do erro.
   *
   * `scrollHeight` vem em pixels do layout do painel, que o `zoom` escala: por
   * isso multiplica pelo fator, para comparar com a caixa do palco, que não é
   * escalada.
   */
  const fator = ajusteQueCabe((tentativa) => {
    if (tentativa === 1) painel.style.removeProperty("zoom");
    else painel.style.setProperty("zoom", String(tentativa));
    return { disponivel: caixaDoPalco(painel), natural: painel.scrollHeight * tentativa };
  });

  if (fator >= 1) painel.style.removeProperty("zoom");
  else painel.style.setProperty("zoom", String(fator));
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
  /*
   * O ajuste que faz o painel aberto caber sem rolar.
   *
   * Entra por parâmetro porque é a única parte da expansão que precisa MEDIR:
   * sem um navegador de verdade, `getBoundingClientRect` devolve zero e a conta
   * não existe. O teste troca a medida por um espião e observa quando ela é
   * pedida; o padrão abaixo é o que roda na página.
   */
  ajustarPainel = ajustePadrao,
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
  let segundaMedida = 0;

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

  /*
   * Redimensionar refaz a câmera E a conta do painel.
   *
   * Deitar o telefone corta a altura pela metade sem tocar em nada do DOM: um
   * painel que cabia em pé passa a transbordar por cima do que vem depois, e
   * nada mais reabriria o bloco para o aperto ser recalculado.
   */
  function aoRedimensionar() {
    medirCamera(byId.get(activeId)?.section?.dataset?.side);
    const aberto = byId.get(activeId);
    if (aberto) ajustarPainel(aberto, true);
  }

  medirCamera();
  globalThis.addEventListener?.("resize", aoRedimensionar);

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
    /* O aperto pertence ao estado aberto. Deixado para tras, o cartao fechado
       apareceria menor que os vizinhos sem motivo nenhum. */
    cancelar(segundaMedida);
    ajustarPainel(current, false);

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

    /*
     * O painel só é medido no FIM da travessia, e não ao abrir.
     *
     * A caixa que ele vai ocupar não existe ainda no instante do clique: quem
     * dá espaço ao painel aberto são regras penduradas em
     * `:has(.journey-region.is-expanded)` — a calha do trajeto que estreita, o
     * recuo do palco que cede — e essas medidas ANIMAM junto com a travessia.
     * Cronometrado na prévia a 320×568, a caixa do palco vai de 504px no clique
     * a 517 em 60ms e só chega aos 540 finais quando a cena para. Apertar no
     * clique calculava 0,8 para uma caixa que nunca existiria, e o bloco
     * assentava com 150px de sobra — encolhido à toa.
     *
     * Enquanto a cena corre, quem segura o painel é o teto do CSS. Isso não
     * custa nada ao olho: é exatamente o tempo em que o conteúdo ainda está
     * aparecendo, escalonado, e não há o que ler cortado.
     *
     * `agendar` em vez de requestAnimationFrame pelo mesmo motivo já anotado
     * acima: numa aba em segundo plano o rAF é estrangulado, e o painel voltaria
     * do descanso sem aperto nenhum.
     */
    cancelar(segundaMedida);
    segundaMedida = agendar(() => {
      if (activeId === next.id) ajustarPainel(next, true);
    }, duracao);

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
      globalThis.removeEventListener?.("resize", aoRedimensionar);
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
      cancelar(segundaMedida);
      if (corpo) corpo.dataset.travessiaAtiva = "false";
    },
    get activeId() {
      return activeId;
    },
  };
}

