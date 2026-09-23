/*
 * O MOVIMENTO DAS SEÇÕES.
 *
 * Um módulo só para a travessia de uma página: o que se revela ao entrar na
 * tela, o fio que desce ligando os capítulos, a barra de progresso, o recorte
 * da fotografia de abertura e o capítulo que está em foco.
 *
 * Por que tudo num arquivo: são cinco comportamentos que dependem do MESMO
 * dado — onde a página está. Separados, cada um instalaria o seu próprio
 * ouvinte de scroll e leria a geometria por conta própria, que é justamente o
 * que faz uma página perder quadros. Aqui há um ouvinte, um quadro por vez, e
 * a leitura de posições acontece numa passagem só.
 *
 * Nada aqui é condição para ler a página: sem JavaScript, com movimento
 * reduzido ou numa tela estreita, o conteúdo aparece inteiro e o que sobra é
 * a leitura — nunca um bloco invisível esperando um observador.
 */

const consulta = (pergunta) => globalThis.matchMedia?.(pergunta) || { matches: false, addEventListener() {}, removeEventListener() {} };
const menosMovimento = consulta("(prefers-reduced-motion: reduce)");
const telaEstreita = consulta("(max-width: 900px)");
const limitar = (valor, minimo = 0, maximo = 1) => Math.min(maximo, Math.max(minimo, valor));

/* ------------------------------------------------------------------
 * Revelação de blocos
 * ------------------------------------------------------------------ */

/*
 * `data-revelar` aceita um número: a ordem dentro do grupo. Duas linhas
 * seguidas com 0 e 1 entram com um intervalo curto entre elas — é o "reveal
 * por linhas" da referência, sem cortar o texto em pedaços no HTML.
 *
 * `data-reveal` é o atributo que as páginas editoriais já usavam. Ele continua
 * valendo: seria absurdo ter dois sistemas de revelação no mesmo site, e pior
 * ainda migrar doze páginas de uma vez só para trocar o nome de um atributo.
 * Quem observa é só este módulo; o antigo desliga onde a travessia existe.
 */
const REVELAVEIS = "[data-revelar], [data-reveal]";

export function montarRevelacoes(raiz = document) {
  const alvos = [...raiz.querySelectorAll(REVELAVEIS)];
  if (!alvos.length) return () => {};
  if (menosMovimento.matches || !("IntersectionObserver" in globalThis)) {
    alvos.forEach((alvo) => alvo.classList.add("is-revelado", "is-visible"));
    return () => {};
  }

  const observador = new IntersectionObserver((entradas) => {
    for (const entrada of entradas) {
      if (!entrada.isIntersecting) continue;
      const passo = Number(entrada.target.dataset.revelar) || 0;
      entrada.target.style.setProperty("--revelar-atraso", `${Math.min(passo, 6) * 90}ms`);
      entrada.target.classList.add("is-revelado", "is-visible");
      observador.unobserve(entrada.target);
    }
  }, { threshold: 0.14, rootMargin: "0px 0px -6% 0px" });

  alvos.forEach((alvo) => observador.observe(alvo));
  return () => observador.disconnect();
}

/* ------------------------------------------------------------------
 * Geometria do fio
 * ------------------------------------------------------------------ */

/*
 * O fio desce reto pela margem e se aproxima da altura de cada capítulo, numa
 * curva suave, antes de voltar. Ele não contorna o conteúdo (isso obrigaria a
 * remedir a página a cada quadro): a curva nasce das posições dos capítulos,
 * medidas uma vez, e o scroll só muda quanto do traço já foi desenhado.
 */
export function caminhoDoFio(alturas, { altura, margem = 34, avanco = 26 }) {
  if (!altura) return "";
  const pontos = [...alturas].sort((a, b) => a - b);
  let desenho = `M ${margem} 0`;
  let anterior = 0;
  for (const alvo of pontos) {
    const y = limitar(alvo, anterior + 40, altura);
    const curva = Math.min(110, Math.max(46, (y - anterior) / 2.4));
    desenho += ` C ${margem} ${y - curva} ${margem + avanco} ${y - curva * .7} ${margem + avanco} ${y}`;
    desenho += ` C ${margem + avanco} ${y + curva * .7} ${margem} ${y + curva} ${margem} ${Math.min(y + curva * 1.6, altura)}`;
    anterior = Math.min(y + curva * 1.6, altura);
  }
  desenho += ` L ${margem} ${altura}`;
  return desenho;
}

/* ------------------------------------------------------------------
 * A travessia da página
 * ------------------------------------------------------------------ */

export function montarTravessia(raiz = document) {
  const pagina = raiz.querySelector("[data-movimento]");
  if (!pagina) return () => {};

  const barra = raiz.querySelector("[data-leitura-progresso]");
  const fio = raiz.querySelector("[data-fio-da-jornada]");
  const trilha = fio?.querySelector(".fio-da-jornada__trilha");
  const traco = fio?.querySelector(".fio-da-jornada__traco");
  const grupoDeNos = fio?.querySelector("[data-fio-nos]");
  const capitulos = [...raiz.querySelectorAll("[data-capitulo]")];
  const links = new Map([...raiz.querySelectorAll("[data-capitulo-link]")].map((link) => [link.dataset.capituloLink, link]));
  const recortes = [...raiz.querySelectorAll("[data-recorte]")];
  const focaveis = [...raiz.querySelectorAll("[data-foco]")];

  let comprimentoDoTraco = 0;
  let nos = [];
  let alvos = [];
  let ativo = "";
  let agendado = false;
  let ultimaAltura = 0;
  let ultimaLargura = 0;

  function medir() {
    const semFio = !fio || telaEstreita.matches || !capitulos.length;
    if (fio) fio.hidden = semFio;
    if (semFio) return;
    /*
     * Remedir é caro e acontece a cada imagem que chega. Se a página tem a
     * mesma altura e a mesma largura de antes, a geometria do fio não mudou.
     */
    if (pagina.offsetHeight === ultimaAltura && globalThis.innerWidth === ultimaLargura) return;
    ultimaAltura = pagina.offsetHeight;
    ultimaLargura = globalThis.innerWidth;

    const caixaDaPagina = pagina.getBoundingClientRect();
    const alturaDaPagina = pagina.offsetHeight;
    const topoDaPagina = caixaDaPagina.top + globalThis.scrollY;
    alvos = capitulos.map((capitulo) => {
      const marcador = capitulo.querySelector("[data-fio-alvo]") || capitulo;
      const caixa = marcador.getBoundingClientRect();
      return Math.round(caixa.top + globalThis.scrollY - topoDaPagina + Math.min(caixa.height, 160) / 2);
    });

    const largura = 84;
    fio.setAttribute("viewBox", `0 0 ${largura} ${alturaDaPagina}`);
    fio.setAttribute("width", String(largura));
    fio.setAttribute("height", String(alturaDaPagina));
    fio.style.width = `${largura}px`;
    fio.style.height = `${alturaDaPagina}px`;

    const desenho = caminhoDoFio(alvos, { altura: alturaDaPagina });
    trilha?.setAttribute("d", desenho);
    traco?.setAttribute("d", desenho);
    comprimentoDoTraco = traco?.getTotalLength?.() || 0;
    if (traco && comprimentoDoTraco) {
      traco.style.strokeDasharray = `${comprimentoDoTraco}`;
      traco.style.strokeDashoffset = `${comprimentoDoTraco}`;
    }

    if (grupoDeNos) {
      grupoDeNos.innerHTML = alvos.map((y, indice) => `<circle class="fio-da-jornada__no" data-fio-no="${capitulos[indice].dataset.capitulo}" cx="60" cy="${y}" r="3"></circle>`).join("");
      nos = [...grupoDeNos.querySelectorAll("[data-fio-no]")];
    }
  }

  /*
   * PASSAGENS.
   *
   * Um capítulo entrega o próximo: o fundo do que vem começa a aparecer antes
   * do fim do que está. Escrever isso à mão em cada página significaria
   * repetir a cor do capítulo seguinte em dois arquivos e torcer para que
   * ninguém mude uma sem mudar a outra — então a cor é lida da página.
   *
   * Capítulo sem cor própria (só imagem de fundo, por exemplo) não ganha
   * passagem: inventar uma cor ali produziria uma faixa que não combina com
   * nada.
   */
  function montarPassagens() {
    const opaca = (elemento) => {
      const cor = getComputedStyle(elemento).backgroundColor;
      return /rgba?\(([^)]+)\)/.test(cor) && !/, ?0\)$/.test(cor) && cor !== "transparent" ? cor : "";
    };
    for (const capitulo of capitulos) {
      if (capitulo.dataset.semPassagem === "true") continue;
      const proximo = capitulo.nextElementSibling;
      const cor = proximo?.dataset?.capitulo !== undefined ? opaca(proximo) : "";
      const atual = opaca(capitulo);
      const existente = capitulo.querySelector(":scope > .passagem");
      if (!cor || cor === atual) {
        existente?.remove();
        continue;
      }
      const passagem = existente || capitulo.appendChild(Object.assign(document.createElement("span"), { className: "passagem" }));
      passagem.setAttribute("aria-hidden", "true");
      passagem.style.setProperty("--passagem", cor);
    }
  }

  function capituloEmFoco() {
    const meio = globalThis.scrollY + globalThis.innerHeight * 0.42;
    let escolhido = capitulos[0];
    for (const capitulo of capitulos) {
      const topo = capitulo.getBoundingClientRect().top + globalThis.scrollY;
      if (topo <= meio) escolhido = capitulo;
    }
    return escolhido?.dataset.capitulo || "";
  }

  function pintar() {
    agendado = false;
    const alturaRolavel = document.documentElement.scrollHeight - globalThis.innerHeight;
    const progresso = alturaRolavel > 0 ? limitar(globalThis.scrollY / alturaRolavel) : 0;
    barra?.style.setProperty("--progresso", progresso.toFixed(4));

    if (traco && comprimentoDoTraco && !fio.hidden) {
      const caixa = pagina.getBoundingClientRect();
      const percorrido = limitar((globalThis.scrollY - (caixa.top + globalThis.scrollY) + globalThis.innerHeight * 0.62) / pagina.offsetHeight);
      traco.style.strokeDashoffset = `${comprimentoDoTraco * (1 - percorrido)}`;
    }

    for (const alvo of recortes) {
      const caixa = alvo.getBoundingClientRect();
      const saida = limitar(-caixa.top / Math.max(caixa.height, 1));
      alvo.style.setProperty("--recorte", saida.toFixed(4));
    }

    const foco = capituloEmFoco();
    if (foco !== ativo) {
      ativo = foco;
      for (const [chave, link] of links) {
        if (chave === foco) link.setAttribute("aria-current", "true");
        else link.removeAttribute("aria-current");
      }
      for (const no of nos) no.classList.toggle("is-ativo", no.dataset.fioNo === foco);
      pagina.dataset.capituloAtivo = foco;
    }

    if (focaveis.length) destacarFoco();
  }

  /*
   * O índice do espectro: o item mais próximo do centro da tela fica em foco.
   * É leitura, não seleção — por isso nenhum texto some quando o foco muda.
   */
  function destacarFoco() {
    const meio = globalThis.innerHeight / 2;
    let escolhido = null;
    let menorDistancia = Infinity;
    for (const item of focaveis) {
      const caixa = item.getBoundingClientRect();
      if (caixa.bottom < 0 || caixa.top > globalThis.innerHeight) continue;
      const distancia = Math.abs(caixa.top + caixa.height / 2 - meio);
      if (distancia < menorDistancia) {
        menorDistancia = distancia;
        escolhido = item;
      }
    }
    for (const item of focaveis) item.classList.toggle("is-ativa", item === escolhido);
  }

  function aoRolar() {
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(pintar);
  }

  function aoRedimensionar() {
    medir();
    aoRolar();
  }

  /* Quem chega pelo teclado ou pelo ponteiro manda no foco, não o scroll. */
  function aoEntrarNoItem(evento) {
    const item = evento.target.closest?.("[data-foco]");
    if (!item) return;
    for (const outro of focaveis) outro.classList.toggle("is-ativa", outro === item);
  }

  montarPassagens();
  medir();
  pintar();
  globalThis.addEventListener("scroll", aoRolar, { passive: true });
  globalThis.addEventListener("resize", aoRedimensionar, { passive: true });
  telaEstreita.addEventListener?.("change", aoRedimensionar);
  pagina.addEventListener("focusin", aoEntrarNoItem);
  pagina.addEventListener("pointerenter", aoEntrarNoItem, true);
  /* Imagem que chega depois muda a altura da página: o fio precisa saber. */
  const observadorDeTamanho = "ResizeObserver" in globalThis ? new ResizeObserver(aoRedimensionar) : null;
  observadorDeTamanho?.observe(pagina);

  return () => {
    globalThis.removeEventListener("scroll", aoRolar);
    globalThis.removeEventListener("resize", aoRedimensionar);
    telaEstreita.removeEventListener?.("change", aoRedimensionar);
    pagina.removeEventListener("focusin", aoEntrarNoItem);
    pagina.removeEventListener("pointerenter", aoEntrarNoItem, true);
    observadorDeTamanho?.disconnect();
  };
}

export function montarMovimento(raiz = document) {
  const desmontar = [montarRevelacoes(raiz), montarTravessia(raiz)];
  return () => desmontar.forEach((encerrar) => encerrar?.());
}

if (typeof document !== "undefined" && document.querySelector("[data-movimento]")) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => montarMovimento(), { once: true });
  else montarMovimento();
}
