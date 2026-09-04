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

/*
 * A ampliação que faz o painel crescer A PARTIR do cartão.
 *
 * O painel troca de coluna do grid ao abrir, e grid não interpola: a mudança de
 * tamanho é instantânea. Para o olho ver o bloco AMPLIANDO, o painel começa
 * reduzido ao tamanho do cartão, na posição do cartão, e cresce até o seu
 * tamanho de página.
 *
 * A escala tem DOIS fatores, um por eixo, e a primeira versão errou aqui.
 *
 * Com um fator só, o retângulo de partida casava a largura do cartão e não a
 * altura: medido a 1024×700, a animação nascia com 358×249 onde o cartão tem
 * 358×346. Quase cem pixels de diferença embaixo — a caixa não encaixava no
 * cartão, e o crescimento parecia começar de outro lugar.
 *
 * O fator único existia para não deformar o texto. Era um receio mal calibrado:
 * a escala inicial é de 0,35, e nela o corpo do texto tem uns seis pixels.
 * Ninguém lê aquilo; o que se vê é a FORMA. Uma forma que encaixa no cartão vale
 * mais que a proporção correta de um texto ilegível — ainda mais durante um
 * segundo de percurso.
 */
export function ampliacaoDoCartao(cartao, pagina, raioDoCartao = 0) {
  if (!cartao || !pagina) return null;
  const larguraDaPagina = pagina.right - pagina.left;
  const alturaDaPagina = pagina.bottom - pagina.top;
  if (!(larguraDaPagina > 0) || !(alturaDaPagina > 0)) return null;

  const larguraDoCartao = cartao.right - cartao.left;
  const alturaDoCartao = cartao.bottom - cartao.top;
  if (!(larguraDoCartao > 0) || !(alturaDoCartao > 0)) return null;

  const escalaX = larguraDoCartao / larguraDaPagina;
  const escalaY = alturaDoCartao / alturaDaPagina;
  return {
    escalaX,
    escalaY,
    x: cartao.left - pagina.left,
    y: cartao.top - pagina.top,
    /*
     * O raio é escalado junto com o resto, e com dois fatores ele viraria uma
     * elipse. Dividido pelo MENOR deles, o canto nunca fica mais fechado que o
     * do cartão — arredondar de menos passa despercebido, arredondar de mais
     * deixa a quina redonda demais bem no quadro em que ela deveria imitar o
     * cartão.
     */
    raio: (Number(raioDoCartao) || 0) / Math.min(escalaX, escalaY),
  };
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

/*
 * `visual` separa o que se VÊ do que se ANUNCIA.
 *
 * `is-expanded` é o que faz o painel ser a página; aria, inert e foco são o que
 * o leitor de tela e o teclado enxergam. Ao fechar, os dois andavam juntos e a
 * saída não tinha o que animar: o painel voltava a ser cartão de um quadro para
 * o outro, o véu sumia junto e a paisagem reaparecia com um estalo.
 *
 * Agora a semântica vira na hora — quem pediu para sair já saiu — e o visual
 * espera o fim da linha do tempo.
 */
/*
 * Escreve no painel de onde ele cresce — e para onde ele encolhe.
 *
 * Uma animação só lê estas variáveis: a entrada parte daqui e a saída é ela
 * invertida. Por isso elas ficam no elemento até a saída terminar.
 */
function escreverAmpliacao(painel, cartao, pagina, raio) {
  if (!painel?.style) return;
  const a = ampliacaoDoCartao(cartao, pagina, parseFloat(raio) || 0);
  if (!a) return;

  painel.style.setProperty("--zoom-escala-x", String(a.escalaX));
  painel.style.setProperty("--zoom-escala-y", String(a.escalaY));
  painel.style.setProperty("--zoom-x", `${Math.round(a.x)}px`);
  painel.style.setProperty("--zoom-y", `${Math.round(a.y)}px`);
  painel.style.setProperty("--zoom-raio", `${Math.round(a.raio)}px`);
}

/*
 * Mede onde o cartão está — ou onde ele VAI estar — e escreve a ampliação.
 *
 * O truque é tirar `is-expanded` por um cálculo de layout e devolvê-la. Dentro
 * de uma mesma tarefa nada é pintado, então ninguém vê o bloco piscar de volta
 * ao tamanho de cartão; o navegador só é obrigado a responder onde ele ficaria.
 *
 * É o único jeito de a SAÍDA acertar. As medidas são coordenadas de tela, e não
 * sobrevivem a nada que mova o bloco entre abrir e fechar — rolagem, o palco
 * grudando em outra posição, a janela mudando de tamanho.
 *
 * `data-medindo` entra e `data-travessia` FICA. Apagar o estado da travessia
 * parecia limpar a medida e fazia o contrário: é ele que mantém o palco
 * congelado, e sem ele o palco volta a animar o próprio recuo — a medida pega o
 * palco ainda no recuo do estado aberto. A marca anula só o passo de câmera,
 * pelo CSS, sem mexer no que o palco precisa.
 */
function medirAmpliacaoPadrao(entry) {
  const secao = entry.section;
  const painel = secao.querySelector?.(".region-content");
  if (!painel?.getBoundingClientRect) return;

  /*
   * A PÁGINA é lida ANTES da troca, e isso não é preciosismo.
   *
   * Ela era lida depois de repor `is-expanded`, e ali o painel ainda não tinha
   * voltado a ser página: a caixa devolvida era a do cartão. As duas medidas
   * saíam iguais, a escala dava 1 e o deslocamento zero — o painel "ampliava"
   * de si mesmo para si mesmo, ou seja, não animava e depois saltava. Medido no
   * fechamento: `escala=1 x=0px y=0px`.
   *
   * Tirar a classe tem efeito imediato na leitura seguinte; repô-la não tem. Em
   * vez de brigar com isso, a página é capturada enquanto ela ainda é o que se
   * vê — o que vale tanto na entrada quanto na saída, já que nos dois casos o
   * painel chega aqui ocupando a tela.
   */
  const pagina = painel.getBoundingClientRect();

  const expandido = secao.classList?.contains?.("is-expanded");
  if (expandido) secao.classList.remove("is-expanded");
  if (secao.dataset) secao.dataset.medindo = "";
  void secao.offsetWidth;

  const cartao = painel.getBoundingClientRect();
  const raio = painel.ownerDocument?.defaultView?.getComputedStyle?.(painel)?.borderRadius;

  if (expandido) secao.classList.add("is-expanded");
  if (secao.dataset) delete secao.dataset.medindo;
  void secao.offsetWidth;

  escreverAmpliacao(painel, cartao, pagina, raio);
}

function limparAmpliacao(painel) {
  if (!painel?.style) return;
  for (const nome of ["escala-x", "escala-y", "x", "y", "raio"]) {
    painel.style.removeProperty(`--zoom-${nome}`);
  }
}

function setExpanded(entry, expanded, { visual = true } = {}) {
  if (visual) entry.section.classList[expanded ? "add" : "remove"]("is-expanded");
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
  /* Injetável pelo mesmo motivo de `ajustarPainel`: sem navegador não há
     retângulo nenhum para medir, e o teste observa quando a medida é pedida. */
  medirRecorte = medirAmpliacaoPadrao,
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
  /*
   * O bloco cujo painel ainda está na tela por causa da animação de saída.
   *
   * Ele depende de um relógio para ser retirado — e `open` CANCELA esse
   * relógio, porque é o mesmo que solta a trava da travessia. Sem esta
   * referência, fechar um bloco e abrir outro dentro dos dois segundos deixava
   * o primeiro com `is-expanded` para sempre: dois painéis de página inteira
   * empilhados, e nada mais para retirar o de baixo.
   */
  let saindo = null;
  let rastroDaSaida = 0;

  function encerrarSaida() {
    if (!saindo) return;
    saindo.section.classList.remove("is-expanded");
    delete saindo.section.dataset.travessia;
    /* A ampliação só some agora: a saída inteira a usou para saber para onde
       encolher. */
    limparAmpliacao(saindo.section.querySelector?.(".region-content"));
    saindo = null;
  }

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
    /* Com encenação, a classe fica até o fim da animação: é ela que dá corpo ao
       que está saindo. Sem encenação — troca de bloco, desmontagem — não há
       animação para esperar, e segurá-la deixaria um painel órfão na tela. */
    setExpanded(current, false, { visual: !encena });
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
      /*
       * A saída REAPROVEITA a medida da abertura, e isso é uma decisão.
       *
       * Medir de novo aqui parecia mais correto e se mostrou frágil: o painel é
       * página, e para ver onde o cartão fica é preciso tirar `is-expanded` e
       * repô-la. Tirar tem efeito na leitura seguinte; repor não tem. A caixa da
       * página saía com o tamanho do cartão, escala e deslocamento davam 1 e
       * zero, e o painel "encolhia" de si para si — ou seja, não animava e
       * depois saltava.
       *
       * Reaproveitar é seguro porque o cartão mal tem como se mexer enquanto o
       * bloco está aberto: rolar mais que 18% da tela fecha o bloco
       * (`shouldCloseOnScroll`), e o palco fica congelado durante toda a
       * travessia. O que sobra é ruído de poucos pixels.
       */
      encenar(current, "transitioning");
      saindo = current;
      cancelar(fimDaTravessia);
      fimDaTravessia = agendar(() => {
        travessia.concluir("initial");
        if (corpo) corpo.dataset.travessiaAtiva = "false";

        /*
         * A entrega tem DOIS tempos, e o segundo existe por causa de um piscar.
         *
         * A saída fecha em opacidade zero — é isso que esconde a troca de um
         * painel de página inteira por um cartão pequeno. Retirando a classe e o
         * estado no mesmo instante, porém, capturado a 60fps, a opacidade
         * saltava de 0,000 para 1,000 num quadro: os dois cartões do par
         * apareciam do nada, a irmã inclusive, que volta junto.
         *
         * Primeiro tempo: o painel devolve o lugar ao cartão. O estado FICA, e é
         * ele que dá ao par a volta à vista. Segundo tempo, um rastro depois: o
         * estado sai.
         */
        saindo?.section.classList.remove("is-expanded");
        cancelar(rastroDaSaida);
        rastroDaSaida = agendar(encerrarSaida, Math.round(duracao * 0.3));
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
    /* Antes de tudo: o painel que ainda estava saindo sai agora. Os relógios que
       o retirariam acabaram de ser cancelados — ou são cancelados aqui. */
    cancelar(rastroDaSaida);
    encerrarSaida();
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

    /*
     * A medida vem AGORA, com o painel já em página inteira e o layout
     * calculado, e PRECISA estar escrita antes de `revealed` — é ele que dispara
     * a animação, e ela lê os valores ao começar.
     */
    medirRecorte(next, "entrada");

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
      cancelar(rastroDaSaida);
      encerrarSaida();
      if (corpo) corpo.dataset.travessiaAtiva = "false";
    },
    get activeId() {
      return activeId;
    },
  };
}

