/*
 * O FUNDO QUE ANDA COM A ROLAGEM.
 *
 * A paisagem da jornada é uma imagem parada. Aqui ela ganha movimento: o mesmo
 * `--journey-scroll-progress` que o controlador já calcula vira o instante do
 * vídeo, então descer a página adianta a câmera e subir a rebobina.
 *
 * O vídeo é um LUXO, e o código trata assim. Ele pesa 7,3 MB contra os 206 KB
 * da webp que já está lá — trinta e cinco vezes mais, na home. Por isso carrega
 * depois do primeiro desenho, some em várias situações, e em TODAS elas o que
 * fica é exatamente o fundo de hoje. Não existe caminho em que a página fique
 * pior do que está sem ele.
 */

/* Abaixo disto o fundo é a webp RETRATO, enquadrada para a tela em pé. Um vídeo
   16:9 coberto num telefone vira uma tira do meio, e a composição se perde. */
const LARGURA_MINIMA = 720;

const CONEXOES_LENTAS = new Set(["slow-2g", "2g"]);

/*
 * O instante do vídeo para um dado progresso da rolagem.
 *
 * Encostar na duração exata pede um quadro que não existe: o vídeo dispara
 * `ended` e alguns navegadores rebobinam para zero — o fundo piscaria de volta
 * ao começo justo quando a pessoa chega ao pé da jornada. A margem é pequena o
 * bastante para ninguém notar que o último quadro não foi mostrado.
 */
const MARGEM_DO_FIM = 0.05;

export function instanteDoProgresso(progresso, duracao) {
  if (!(duracao > 0)) return null;
  const p = Math.min(1, Math.max(0, Number(progresso) || 0));
  return Math.min(duracao - MARGEM_DO_FIM, p * duracao);
}

/*
 * Se vale a pena carregar o vídeo.
 *
 * `conexao` ausente NÃO é tratado como restrição: Safari não expõe
 * `navigator.connection`, e recusar por isso tiraria o vídeo justamente do
 * desktop onde ele roda bem.
 */
export function videoVale({ largura, movimentoReduzido, conexao } = {}) {
  if (movimentoReduzido) return false;
  if (!(largura >= LARGURA_MINIMA)) return false;
  if (conexao?.saveData) return false;
  if (conexao?.effectiveType && CONEXOES_LENTAS.has(conexao.effectiveType)) return false;
  return true;
}

/*
 * Liga o vídeo à rolagem.
 *
 * `lerProgresso` entra por parâmetro porque o valor já existe: o controlador o
 * escreve em `--journey-scroll-progress` a cada rolagem, e reler a variável é
 * mais barato — e sempre coerente com o resto da página — do que recalcular a
 * altura do documento aqui.
 */
export function createLandscapeVideo(paisagem, {
  janela = globalThis,
  documento = paisagem?.ownerDocument,
  lerProgresso = () => Number.parseFloat(
    documento?.documentElement?.style?.getPropertyValue("--journey-scroll-progress") || "0",
  ),
} = {}) {
  const video = paisagem?.querySelector?.("video");
  if (!video) return { setProgress() {}, destroy() {} };

  const reduzido = janela.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  if (!videoVale({
    largura: janela.innerWidth,
    movimentoReduzido: reduzido,
    conexao: janela.navigator?.connection,
  })) {
    /* Sem o `src`, o navegador nunca pede o arquivo. Deixar o elemento no DOM e
       só escondê-lo por CSS baixaria sete megabytes para não mostrar nada. */
    return { setProgress() {}, destroy() {} };
  }

  let pronto = false;

  /*
   * Quem manda no ritmo é o CONTROLADOR, e não este módulo.
   *
   * A primeira versão escutava `scroll` e agendava por `requestAnimationFrame`.
   * Funcionava, e era um segundo cano para a mesma água: o controlador já
   * escuta a rolagem, já calcula o progresso e já o distribui — é ele que move
   * o trajeto pelo mesmo valor. Dois caminhos para o mesmo número podem
   * discordar em qualquer quadro, e o mais lento é o que aparece.
   *
   * Aqui o vídeo só recebe. Nada de ouvinte próprio, nada de agendamento
   * próprio, e o fundo passa a andar exatamente junto do trajeto.
   */
  function setProgress(progresso) {
    if (!pronto) return;

    /*
     * Com um bloco aberto, o vídeo PARA de ser rebobinado.
     *
     * O véu cobre a paisagem a 80%, então mexer nele ali quase não se vê. E é
     * exatamente esse o instante em que o painel está ampliando de zero até a
     * tela inteira — a animação mais pesada da página. Rebobinar um vídeo de
     * 2048px de largura no mesmo quadro disputa o mesmo orçamento, e quem perde
     * é a animação, que está em primeiro plano.
     *
     * Nada se perde: rolar mais que 18% da tela já fecha o bloco, então o fundo
     * mal teria para onde andar.
     */
    if (documento?.querySelector?.(".journey-region.is-expanded")) return;

    const instante = instanteDoProgresso(progresso, video.duration);
    if (instante === null) return;

    /*
     * Só escreve se mudou de quadro.
     *
     * `currentTime` não é uma atribuição barata: cada escrita agenda uma busca.
     * A 10fps o quadro dura 0,1s, e escrever de novo dentro do mesmo quadro
     * pede ao decodificador um trabalho que não muda um pixel.
     */
    if (Math.abs(video.currentTime - instante) < 0.05) return;
    video.currentTime = instante;
  }

  function aoCarregar() {
    pronto = true;
    paisagem.dataset.videoPronto = "true";
    /* O primeiro quadro certo vem do progresso de agora: quem chega pelo meio da
       página, por um link com âncora ou recarregando, não deve ver o começo. */
    setProgress(lerProgresso());
  }

  function aoFalhar() {
    /* Um vídeo que não carrega não deixa buraco: a webp está por baixo, e o
       atributo que a esconderia nunca chega a ser posto. */
    delete paisagem.dataset.videoPronto;
  }

  video.addEventListener("loadeddata", aoCarregar);
  video.addEventListener("error", aoFalhar);

  /*
   * O `src` só entra AGORA, e não no HTML.
   *
   * No HTML, o navegador começaria a baixar os sete megabytes junto com o resto
   * da página, disputando banda com o que a pessoa precisa ver primeiro. Aqui
   * ele parte depois de a home já estar de pé.
   */
  const fonte = video.dataset.src;
  if (fonte) {
    /*
     * `preload="none"` no HTML e `load()` aqui, nesta ordem.
     *
     * O atributo é o que impede o navegador de sair baixando sete megabytes
     * junto com a página. Mas ele impede DEMAIS: com `none`, pôr o `src` não
     * inicia carregamento nenhum — o vídeo fica esperando um `play()` que nunca
     * vem, porque este vídeo não toca, só é rebobinado. Medido: o elemento no
     * lugar, o `src` definido, e `duration` seguindo `NaN`.
     */
    video.preload = "auto";
    video.src = fonte;
    video.load();
  }

  return {
    setProgress,
    destroy() {
      video.removeEventListener("loadeddata", aoCarregar);
      video.removeEventListener("error", aoFalhar);
      delete paisagem.dataset.videoPronto;
    },
  };
}
