function setupMural(documentRef = document) {
  const form = documentRef.querySelector("#muralForm");
  const feedback = documentRef.querySelector("#muralFeedback");
  if (!form || !feedback) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = form.elements.name.value.trim();
    const intention = form.elements.intent.value.trim();
    if (!name && !intention) {
      feedback.textContent = "Escreva um nome ou uma intenção para acender este gesto simbólico.";
      return;
    }
    feedback.textContent = "Sua intenção foi acolhida nesta experiência local.";
    form.reset();
  });
}

function setupDemoSchedule(documentRef = document) {
  const form = documentRef.querySelector("#bookForm");
  const button = documentRef.querySelector("#bookContinue");
  const summary = documentRef.querySelector("#bookSummary");
  if (!form || !button || !summary) return;

  button.addEventListener("click", () => {
    const values = Object.fromEntries(new FormData(form));
    const selection = [
      values.atendimento,
      values.profissional,
      values.modalidade,
      values.data,
      values.horario,
      values.investimento,
    ]
      .filter(Boolean)
      .join(" · ");
    summary.replaceChildren();
    const title = documentRef.createElement("strong");
    title.textContent = "Resumo demonstrativo";
    const text = documentRef.createElement("span");
    text.textContent = selection || "Escolha as opções acima para montar um resumo.";
    const note = documentRef.createElement("p");
    note.textContent = "Nenhum agendamento foi criado. A disponibilidade real deve ser confirmada com a Recepção.";
    summary.append(title, text, note);
    summary.hidden = false;
    summary.focus();
  });
}

function setupReadingLabels(documentRef = document) {
  documentRef.querySelectorAll(".source-reading").forEach((details) => {
    const summary = details.querySelector("summary");
    const symbol = details.querySelector("summary span:last-child");
    const action = details.querySelector("[data-reading-action]");
    if (!symbol) return;

    const update = () => {
      symbol.textContent = details.open ? "−" : "＋";
      if (action) action.textContent = details.open ? "Fechar leitura" : "Continuar a leitura";
      summary?.setAttribute("aria-expanded", String(details.open));
    };

    update();
    details.addEventListener("toggle", update);
  });
}

function journeyProgress(scrollY, maxScroll) {
  const total = Number(maxScroll);
  const current = Number(scrollY);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(current)) return 0;
  return Math.min(1, Math.max(0, current / total));
}

/*
 * A LINHA DA JORNADA.
 *
 * Um traço simples que acompanha a leitura. Ele passa por trás de textos e
 * imagens, sai da tela por um lado e volta pelo outro, e cada curva tem outra
 * abertura — como um caminho, e não como uma senoide.
 *
 * O desenho nasce de números com semente: a curva é a mesma a cada visita e
 * não depende do conteúdo. Abrir uma matéria alonga a página, mas a parte da
 * linha que já estava acima não muda de lugar.
 */
function sementeira(semente) {
  let estado = semente >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function caminhoDaJornada({ largura, altura, passo = 760, semente = 11, estreito = false } = {}) {
  if (!(largura > 0) || !(altura > 0)) return "";
  const r = sementeira(semente);
  const pontos = [[largura * 0.78, 0]];
  const saiACada = estreito ? 4 : 3;
  let y = 0;
  let lado = 1;
  let curva = 0;
  while (y < altura) {
    y = Math.min(altura, y + passo * (0.7 + r() * 0.65));
    curva += 1;
    lado = -lado;
    /* De tempos em tempos o fio sai da tela e volta pelo mesmo lado. */
    const sai = curva % saiACada === 0;
    const x = sai
      ? (lado > 0 ? largura * (1.1 + r() * 0.14) : -largura * (0.1 + r() * 0.14))
      : (lado > 0 ? largura * (0.58 + r() * 0.34) : largura * (0.05 + r() * 0.34));
    pontos.push([x, y]);
  }

  const f = (n) => Math.round(n * 10) / 10;
  let desenho = `M ${f(pontos[0][0])} ${f(pontos[0][1])}`;
  let alavanca = null;
  for (let k = 1; k < pontos.length; k += 1) {
    const [x0, y0] = pontos[k - 1];
    const [x1, y1] = pontos[k];
    const dy = y1 - y0;
    /* Continuidade sem quina: a alavanca de saída espelha a de chegada, com força variada. */
    const forca = 0.6 + r() * 0.8;
    const c1 = alavanca
      ? [x0 + (x0 - alavanca[0]) * forca, y0 + (y0 - alavanca[1]) * forca]
      : [x0 + (r() - 0.5) * largura * 0.14, y0 + dy * (0.28 + r() * 0.4)];
    const c2 = [x1 + (r() - 0.5) * largura * 0.16, y1 - dy * (0.26 + r() * 0.42)];
    desenho += ` C ${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(x1)} ${f(y1)}`;
    alavanca = c2;
  }
  return desenho;
}

function setupJourneyThread(documentRef = document, windowRef = documentRef.defaultView) {
  const svg = documentRef.querySelector("[data-journey-thread]");
  const path = svg?.querySelector("[data-journey-path]");
  const ponta = svg?.querySelector("[data-journey-tip]");
  const pagina = svg?.parentElement;
  if (!svg || !path || !pagina || !windowRef || typeof path.getTotalLength !== "function") return;

  const reducedMotion = windowRef.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  let comprimento = 0;
  let mapa = [];
  let atual = 0;
  let alvo = 0;
  let quadro = 0;
  let medida = "";

  function montar() {
    const largura = pagina.clientWidth;
    const altura = pagina.scrollHeight;
    const chave = `${largura}x${altura}`;
    if (chave === medida) return;
    medida = chave;
    const estreito = largura < 760;
    svg.setAttribute("viewBox", `0 0 ${largura} ${altura}`);
    svg.setAttribute("width", String(largura));
    svg.setAttribute("height", String(altura));
    svg.style.width = `${largura}px`;
    svg.style.height = `${altura}px`;
    path.setAttribute("d", caminhoDaJornada({
      largura,
      altura,
      passo: Math.max(520, Math.min(900, windowRef.innerHeight * 0.95)),
      estreito,
    }));
    comprimento = path.getTotalLength();
    path.style.strokeDasharray = `${comprimento}`;
    /* Tabela altura → comprimento: a ponta do traço fica na altura da leitura. */
    mapa = [];
    const amostras = 480;
    for (let i = 0; i <= amostras; i += 1) {
      const trecho = (comprimento * i) / amostras;
      mapa.push([trecho, path.getPointAtLength(trecho).y]);
    }
    if (reducedMotion) {
      path.style.strokeDashoffset = "0";
      if (ponta) ponta.style.display = "none";
    } else {
      atual = Math.min(atual, comprimento);
      pintar();
    }
  }

  function comprimentoNaAltura(y) {
    for (const [trecho, altura] of mapa) if (altura >= y) return trecho;
    return comprimento;
  }

  function pintar() {
    quadro = 0;
    const topo = pagina.getBoundingClientRect().top + windowRef.scrollY;
    const linhaDeLeitura = windowRef.scrollY + windowRef.innerHeight * 0.72 - topo;
    alvo = comprimentoNaAltura(linhaDeLeitura);
    /* A ponta chega um pouco depois do scroll: calma, não arrasto. */
    atual += (alvo - atual) * 0.16;
    if (Math.abs(alvo - atual) < 0.5) atual = alvo;
    path.style.strokeDashoffset = `${comprimento - atual}`;
    if (ponta && comprimento) {
      const ponto = path.getPointAtLength(atual);
      ponta.setAttribute("cx", String(ponto.x));
      ponta.setAttribute("cy", String(ponto.y));
    }
    if (atual !== alvo) quadro = windowRef.requestAnimationFrame(pintar);
  }

  const pedir = () => {
    if (reducedMotion || quadro) return;
    quadro = windowRef.requestAnimationFrame(pintar);
  };

  montar();
  windowRef.addEventListener("scroll", pedir, { passive: true });
  windowRef.addEventListener("resize", () => windowRef.requestAnimationFrame(montar));
  /* Abrir e fechar matérias muda a altura da página: a linha acompanha. */
  if ("ResizeObserver" in windowRef) new windowRef.ResizeObserver(() => windowRef.requestAnimationFrame(montar)).observe(pagina);
}

const reflectionMessages = {
  pausa: "Talvez o primeiro cuidado seja devolver algum espaço ao corpo e ao tempo.",
  compreender: "Uma pergunta bem observada pode abrir um caminho mais consciente.",
  encontro: "Você não precisa organizar tudo sozinho antes de procurar uma conversa.",
};

function setupReflection(documentRef = document) {
  const feedback = documentRef.querySelector("[data-reflection-feedback]");
  const choices = [...documentRef.querySelectorAll("[data-reflection-choice]")];
  if (!feedback || !choices.length) return;

  choices.forEach((choice) => {
    choice.addEventListener("click", () => {
      choices.forEach((item) => item.setAttribute("aria-pressed", String(item === choice)));
      feedback.textContent = reflectionMessages[choice.dataset.reflectionChoice] || reflectionMessages.compreender;
    });
  });
}

function mountConceptEnhancements(documentRef = document) {
  setupMural(documentRef);
  setupDemoSchedule(documentRef);
  setupReadingLabels(documentRef);
  setupJourneyThread(documentRef);
  setupReflection(documentRef);
}

async function setupAccount() {
  const { montarConta } = await import("./conta/conta.js");
  return montarConta();
}

if (typeof document !== "undefined") {
  mountConceptEnhancements(document);
  setupAccount().catch((error) => console.warn("Conta indisponível.", error));
}

export {
  caminhoDaJornada,
  journeyProgress,
  mountConceptEnhancements,
  setupDemoSchedule,
  setupJourneyThread,
  setupMural,
  setupReadingLabels,
  setupReflection,
};
