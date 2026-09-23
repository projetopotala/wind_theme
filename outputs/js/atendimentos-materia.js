/*
 * AS MATÉRIAS DE ATENDIMENTOS.
 *
 * Cada matéria tem três momentos:
 *
 * 1. Prévia — título e abertura grandes, com as imagens da pauta passando
 *    devagar ao lado.
 * 2. Leitura — ao abrir, o texto corre à esquerda e a imagem à direita
 *    acompanha o parágrafo que está sendo lido. Os slides deixam de passar
 *    sozinhos: quem manda agora é a leitura.
 * 3. Conexão — um instante com a pessoa (uma pergunta, uma reflexão, perguntas
 *    para levar) e, ao lado, para onde ir no Portal.
 *
 * Nada aqui sai do aparelho: não há rede, não há armazenamento. As respostas
 * existem só enquanto a página está aberta.
 */

const consulta = (pergunta) => globalThis.matchMedia?.(pergunta) || { matches: false };
const menosMovimento = consulta("(prefers-reduced-motion: reduce)");
const INTERVALO_DOS_SLIDES = 7000;

export function proximoIndice(atual, total, passo = 1) {
  if (!total) return 0;
  return (((atual + passo) % total) + total) % total;
}

/* ------------------------------------------------------------------
 * Slides
 * ------------------------------------------------------------------ */

export function montarSlides(raiz) {
  const slides = [...raiz.querySelectorAll("[data-slide-item]")];
  const pontos = [...raiz.querySelectorAll("[data-slide-ir]")];
  let atual = Math.max(0, slides.findIndex((slide) => slide.classList.contains("is-ativo")));
  let relogio = 0;
  let pausado = false;
  let conduzido = false;
  let visivel = false;

  function ir(indice) {
    const alvo = proximoIndice(indice, slides.length, 0);
    if (alvo === atual && slides[alvo]?.classList.contains("is-ativo")) return;
    atual = alvo;
    slides.forEach((slide, i) => {
      const ativo = i === atual;
      slide.classList.toggle("is-ativo", ativo);
      if (ativo) slide.removeAttribute("aria-hidden");
      else slide.setAttribute("aria-hidden", "true");
    });
    pontos.forEach((ponto, i) => {
      if (i === atual) ponto.setAttribute("aria-current", "true");
      else ponto.removeAttribute("aria-current");
    });
  }

  function agendar() {
    clearTimeout(relogio);
    if (menosMovimento.matches || pausado || conduzido || !visivel || slides.length < 2 || document.hidden) return;
    relogio = setTimeout(() => {
      ir(atual + 1);
      agendar();
    }, INTERVALO_DOS_SLIDES);
  }

  raiz.querySelector("[data-slide-anterior]")?.addEventListener("click", () => { ir(atual - 1); agendar(); });
  raiz.querySelector("[data-slide-proximo]")?.addEventListener("click", () => { ir(atual + 1); agendar(); });
  pontos.forEach((ponto) => ponto.addEventListener("click", () => { ir(Number(ponto.dataset.slideIr)); agendar(); }));

  /* Quem está olhando para a imagem, ou navegando nela pelo teclado, não é interrompido. */
  const pausar = () => { pausado = true; clearTimeout(relogio); };
  const retomar = () => { pausado = false; agendar(); };
  raiz.addEventListener("pointerenter", pausar);
  raiz.addEventListener("pointerleave", retomar);
  raiz.addEventListener("focusin", pausar);
  raiz.addEventListener("focusout", (evento) => { if (!raiz.contains(evento.relatedTarget)) retomar(); });
  document.addEventListener("visibilitychange", agendar);

  if ("IntersectionObserver" in globalThis) {
    new IntersectionObserver(([entrada]) => {
      visivel = entrada.isIntersecting;
      agendar();
    }, { threshold: 0.35 }).observe(raiz);
  }

  return {
    ir,
    get atual() { return atual; },
    /* Durante a leitura quem escolhe a imagem é o texto, não o relógio. */
    conduzir(ligado) {
      conduzido = ligado;
      agendar();
    },
  };
}

/* ------------------------------------------------------------------
 * Leitura: a imagem acompanha o parágrafo
 * ------------------------------------------------------------------ */

export function montarLeitura(materia) {
  const leitura = materia.querySelector("details.source-reading");
  const slidesRaiz = materia.querySelector("[data-slides]");
  if (!leitura || !slidesRaiz) return null;
  const slides = montarSlides(slidesRaiz);
  const paragrafos = [...leitura.querySelectorAll("[data-slide]")];
  let observador = null;

  function acompanhar() {
    observador?.disconnect();
    if (!leitura.open || !("IntersectionObserver" in globalThis)) return;
    /* A faixa central da tela é a linha de leitura. */
    observador = new IntersectionObserver((entradas) => {
      const lido = entradas.filter((entrada) => entrada.isIntersecting).at(-1);
      if (lido) slides.ir(Number(lido.target.dataset.slide));
    }, { rootMargin: "-42% 0px -48% 0px" });
    paragrafos.forEach((paragrafo) => observador.observe(paragrafo));
  }

  leitura.addEventListener("toggle", () => {
    slides.conduzir(leitura.open);
    acompanhar();
  });

  materia.querySelector("[data-materia-recolher]")?.addEventListener("click", () => {
    leitura.open = false;
    const resumo = leitura.querySelector("summary");
    resumo?.scrollIntoView({ behavior: menosMovimento.matches ? "auto" : "smooth", block: "start" });
    resumo?.focus({ preventScroll: true });
  });

  return slides;
}

/* ------------------------------------------------------------------
 * Conexões
 * ------------------------------------------------------------------ */

const DIMENSOES = { sono: "sono", alimentacao: "alimentação", movimento: "movimento", vinculos: "vínculos" };
const juntar = (itens) => (itens.length > 1 ? `${itens.slice(0, -1).join(", ")} e ${itens.at(-1)}` : itens[0] || "");
const maiuscula = (texto) => texto.charAt(0).toLocaleUpperCase("pt-BR") + texto.slice(1);

/*
 * A resposta é uma frase de cuidado, nunca um diagnóstico: o que pede atenção
 * leva a uma conversa; o que oscila, a observar; o que está em dia, a
 * reconhecer. A Recepção só aparece quando alguma coisa pede atenção.
 */
export function mensagemDaSaude(respostas = {}) {
  const respondidas = Object.entries(respostas).filter(([chave, valor]) => DIMENSOES[chave] && valor);
  if (!respondidas.length) return { texto: "", recepcao: false };
  const com = (estado) => respondidas.filter(([, valor]) => valor === estado).map(([chave]) => DIMENSOES[chave]);
  const atencao = com("atencao");
  const oscila = com("oscila");
  if (atencao.length) {
    return {
      texto: `${maiuscula(juntar(atencao))} ${atencao.length > 1 ? "pedem" : "pede"} atenção. Se isso já dura algum tempo, uma conversa pode ajudar a entender o próximo passo.`,
      recepcao: true,
    };
  }
  if (oscila.length) {
    return {
      texto: `${maiuscula(juntar(oscila))} ${oscila.length > 1 ? "oscilam" : "oscila"}. Oscilar faz parte — vale observar o que mudou nas últimas semanas.`,
      recepcao: false,
    };
  }
  return {
    texto: respondidas.length < 4
      ? "Até aqui, em dia. Perceber o que já funciona também é cuidado."
      : "Tudo em dia. Perceber o que já funciona também é cuidado.",
    recepcao: false,
  };
}

function montarChecagemDeSaude(formulario) {
  const resposta = formulario.querySelector("[data-saude-resposta]");
  formulario.addEventListener("change", () => {
    const respostas = Object.fromEntries(
      [...formulario.querySelectorAll("[data-dimensao]")].map((grupo) => [grupo.dataset.dimensao, grupo.querySelector("input:checked")?.value || ""]),
    );
    const { texto, recepcao } = mensagemDaSaude(respostas);
    resposta.replaceChildren(texto);
    if (recepcao) {
      const link = document.createElement("a");
      link.href = "recepcao.html";
      link.textContent = "Conversar com a Recepção ↗";
      resposta.append(" ", link);
    }
  });
  formulario.addEventListener("submit", (evento) => evento.preventDefault());
}

async function copiar(texto) {
  try {
    await globalThis.navigator?.clipboard?.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

function montarReflexao(caixa) {
  const frase = caixa.querySelector("[data-reflexao-frase]");
  const status = caixa.querySelector("[data-reflexao-status]");
  const frases = [...(caixa.querySelector("[data-reflexao-frases]")?.content.querySelectorAll("p") || [])].map((p) => p.textContent.trim());
  let atual = Math.max(0, frases.indexOf(frase.textContent.trim()));

  caixa.querySelector("[data-reflexao-outra]")?.addEventListener("click", () => {
    atual = proximoIndice(atual, frases.length, 1);
    frase.textContent = frases[atual];
    status.textContent = "";
  });
  caixa.querySelector("[data-reflexao-copiar]")?.addEventListener("click", async () => {
    status.textContent = await copiar(`“${frase.textContent.trim()}” — Instituto Potala`)
      ? "Copiada. Leve com você."
      : "Não foi possível copiar aqui. Você pode selecionar a frase e copiar.";
  });
}

function montarAnotacoes(formulario) {
  const status = formulario.querySelector("[data-anotacoes-status]");
  formulario.addEventListener("submit", (evento) => evento.preventDefault());
  formulario.querySelector("[data-anotacoes-copiar]")?.addEventListener("click", async () => {
    const marcadas = [...formulario.querySelectorAll("input:checked")].map((item) => `• ${item.value}`);
    if (!marcadas.length) {
      status.textContent = "Marque ao menos uma pergunta para levar.";
      return;
    }
    status.textContent = await copiar(["Para levar a uma conversa:", ...marcadas].join("\n"))
      ? `${marcadas.length === 1 ? "Pergunta copiada" : `${marcadas.length} perguntas copiadas`}. Leve para a conversa.`
      : "Não foi possível copiar aqui. Você pode anotar as perguntas marcadas.";
  });
}

export function montarMaterias(documento = document) {
  const controles = [...documento.querySelectorAll("[data-materia]")].map(montarLeitura).filter(Boolean);
  documento.querySelectorAll("[data-saude-check]").forEach(montarChecagemDeSaude);
  documento.querySelectorAll("[data-reflexao-leve]").forEach(montarReflexao);
  documento.querySelectorAll("[data-anotacoes]").forEach(montarAnotacoes);
  return controles;
}

if (typeof document !== "undefined") montarMaterias(document);
