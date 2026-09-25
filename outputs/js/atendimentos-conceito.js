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
 * Um traço simples que acompanha a leitura. Ele nasce logo abaixo das
 * boas-vindas, contorna os textos, sai da tela de vez em quando e volta, e cada
 * curva tem outra abertura — como um caminho, e não como uma senoide.
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

/*
 * Onde há texto, a linha não passa — e ela nunca dobra em quina.
 *
 * O fio desce sempre mais do que anda de lado: entre dois pontos, o desvio
 * lateral cabe no `alcance` da descida (inclinação de no máximo 0,8, e menos
 * ainda nas descidas curtas, que pedem curvas mais abertas). Assim ele nunca
 * corre na horizontal nem vira de repente.
 *
 * `desvios` são retângulos da página ({ topo, base, esquerda, direita }). Os
 * que se tocam na vertical formam um trecho; em cada trecho o fio anda por um
 * corredor sem texto — um vão ao lado dele ou, se não houver vão que se
 * alcance, fora da tela — e entra e sai de lá na vertical. Os trilhos de todos
 * os trechos são escolhidos juntos, para que cada um alcance o seguinte.
 */
const INCLINACAO = 0.8;

function alcanceDe(passo) {
  const curta = passo * 0.45;
  return (dy) => (dy <= 0 ? 0 : INCLINACAO * dy * Math.min(1, dy / curta));
}

const prender = (x, a, b) => Math.min(b, Math.max(a, x));

function agruparDesvios(desvios, inicio, altura) {
  const grupos = [];
  for (const zona of [...desvios].sort((a, b) => a.topo - b.topo)) {
    const topo = Math.max(inicio, zona.topo);
    const base = Math.min(altura, zona.base);
    if (base <= topo) continue;
    const ultimo = grupos.at(-1);
    if (ultimo && topo <= ultimo.base) {
      ultimo.base = Math.max(ultimo.base, base);
      ultimo.faixas.push([zona.esquerda, zona.direita]);
      ultimo.opcional = ultimo.opcional && Boolean(zona.opcional);
    } else {
      grupos.push({ topo, base, faixas: [[zona.esquerda, zona.direita]], opcional: Boolean(zona.opcional) });
    }
  }
  return grupos;
}

/* Os corredores de um trecho: cada vão largo o bastante entre os textos (um
   pouco recolhido das bordas deles) e, sempre, as duas faixas fora da tela. */
function corredores(faixas, largura, estreito = false) {
  const margem = estreito ? 2 : largura * 0.04;
  const recuo = estreito ? 1 : 10;
  /* O intervalo entre os dois textos da abertura mede perto de 100 px em
     notebook; exigir 8% da tela o descartava e expulsava todo o fio. O vão
     entre a foto e o texto das cenas (76 px livres) também precisa caber —
     e ainda cabe quando duas cenas vizinhas se encostam e o vão comum a
     elas encolhe um pouco (sem movimento, perto de 68 px). */
  const minimo = estreito ? 6 : Math.max(48, Math.min(64, largura * 0.05));
  const lista = [];
  let inicio = margem;
  for (const [a, b] of [...faixas].sort((p, q) => p[0] - q[0])) {
    const fim = Math.min(a, largura - margem);
    if (fim - inicio >= minimo) lista.push({ a: inicio + recuo, b: fim - recuo, fora: false });
    inicio = Math.max(inicio, b);
  }
  if (largura - margem - inicio >= minimo) lista.push({ a: inicio + recuo, b: largura - margem, fora: false });
  lista.push({ a: -largura * 0.16, b: -largura * 0.08, fora: true });
  lista.push({ a: largura * 1.08, b: largura * 1.16, fora: true });
  return lista;
}

/* Dentro de um trecho o fio passa por pontos a cada ~0,8 passo; quanto ele
   pode ir de um lado a outro do corredor sem sair do limite de inclinação. */
function partesDoTrecho(alto, passo) {
  return Math.max(1, Math.round(alto / (passo * 0.28)));
}

function movimentoDentro(alto, passo, alcance) {
  const partes = partesDoTrecho(alto, passo);
  return alcance(alto / partes) / Math.min(1, 1.5 / partes);
}

/* Escolhe, para cada trecho, o corredor e os pontos de entrada e de saída: o
   fio fica à vista o máximo possível, e cada saída alcança a entrada seguinte. */
function escolherTrilhos(grupos, { largura, passo, alcance, r, estreito }) {
  const opcoes = grupos.map((grupo) => {
    const alto = grupo.base - grupo.topo;
    return corredores(grupo.faixas, largura, estreito).flatMap((c) => {
      /* As bordas do vão também são opções: textos em lados alternados
         podem deixar um corredor comum estreito entre duas cenas. */
      const fracoes = c.fora ? [0.5] : [0.02, 0.12, 0.3, 0.5, 0.7, 0.88, 0.98];
      return fracoes.map((t) => ({
        x: c.a + (c.b - c.a) * t,
        c,
        custo: c.fora ? alto : alto * (0.04 * Math.abs(t - 0.5) + 0.03 * r()),
      }));
    });
  });

  const tabelas = [];
  grupos.forEach((grupo, g) => {
    const dentro = movimentoDentro(grupo.base - grupo.topo, passo, alcance);
    const vao = g ? alcance(grupo.topo - grupos[g - 1].base) : Infinity;
    const antes = tabelas[g - 1];
    /* Melhor chegada a cada ponto de entrada. */
    const entradas = opcoes[g].map((o) => {
      if (!antes) return { custo: o.custo, de: -1 };
      let melhor = { custo: Infinity, de: -1 };
      antes.forEach((s, k) => {
        if (s.custo < melhor.custo && Math.abs(opcoes[g - 1][k].x - o.x) <= vao) melhor = { custo: s.custo, de: k };
      });
      return { custo: melhor.custo + o.custo, de: melhor.de };
    });
    /* Melhor saída: do mesmo corredor, ao alcance da entrada. */
    tabelas.push(opcoes[g].map((o) => {
      let melhor = { custo: Infinity, de: -1, entrada: -1 };
      entradas.forEach((e, i) => {
        const outra = opcoes[g][i];
        if (outra.c === o.c && Math.abs(outra.x - o.x) <= dentro && e.custo < melhor.custo) melhor = { custo: e.custo, de: e.de, entrada: i };
      });
      return melhor;
    }));
  });

  const ultima = tabelas.at(-1);
  let saida = ultima.reduce((m, s, i) => (s.custo < ultima[m].custo ? i : m), 0);
  const trilhos = [];
  for (let g = grupos.length - 1; g >= 0; g -= 1) {
    const escolha = tabelas[g][saida];
    trilhos[g] = { entrada: opcoes[g][escolha.entrada].x, saida: opcoes[g][saida].x, c: opcoes[g][saida].c };
    saida = escolha.de;
  }
  return trilhos;
}

function pontosComDesvios(pontos, desvios, { largura, altura, inicio, passo, r, alcance, estreito }) {
  /* Uma área `opcional` fica acima da linha, com fundo (os blocos da
     abertura): contorná-la só serve para manter o fio à vista. Sem vão para
     isso, a linha passa por trás dela — mandar esse trecho para fora da tela
     arrastaria junto todas as cenas seguintes. */
  const grupos = agruparDesvios(desvios, inicio, altura)
    .filter((grupo) => !grupo.opcional || corredores(grupo.faixas, largura, estreito).some((c) => !c.fora));
  if (!grupos.length) return pontos;
  const trilhos = escolherTrilhos(grupos, { largura, passo, alcance, r, estreito });

  const fixos = [];
  grupos.forEach((grupo, g) => {
    const { entrada, saida, c } = trilhos[g];
    const alto = grupo.base - grupo.topo;
    const partes = partesDoTrecho(alto, passo);
    /* O fio entra sob a borda da fotografia e reaparece no vão ao lado do
       texto. A curva só usa o espaço livre do corredor. */
    const folgaDeBalanco = Math.max(0, alcance(alto / partes) - Math.abs(saida - entrada) * Math.min(1, 1.5 / partes));
    const direcao = (c.a + c.b) / 2 < largura / 2 ? -1 : 1;
    const espacoLateral = direcao < 0 ? Math.min(entrada, saida) - c.a : c.b - Math.max(entrada, saida);
    const balanco = Math.max(0, Math.min(folgaDeBalanco * 0.8, espacoLateral * 0.8, largura * 0.09));
    for (let i = 0; i <= partes; i += 1) {
      const t = i / partes;
      const suave = t * t * (3 - 2 * t);
      const desvio = Math.sin(Math.PI * t) * balanco * direcao;
      fixos.push([prender(entrada + (saida - entrada) * suave + desvio, c.a, c.b), grupo.topo + alto * t, true]);
    }
  });

  /* Os pontos livres ficam fora dos trechos, longe o bastante deles para a
     curva abrir, e presos ao que o fio alcança dali. */
  const perto = passo * 0.3;
  const livres = pontos.filter(([, y], k) => {
    const ponta = k === 0 || k === pontos.length - 1;
    return !grupos.some((grupo) => y > grupo.topo - (ponta ? 1 : perto) && y < grupo.base + (ponta ? 1 : perto));
  });
  const todos = [...livres, ...fixos].sort((p, q) => p[1] - q[1] || (q[2] ? 1 : 0) - (p[2] ? 1 : 0));
  const resultado = [];
  todos.forEach((ponto, k) => {
    const [x, y, fixo] = ponto;
    const ultimo = resultado.at(-1);
    if (ultimo && y - ultimo[1] < 1) return;
    if (fixo) {
      /* Um ponto livre colado antes do trecho sai: o fixo toma o lugar dele. */
      if (ultimo && !ultimo[2] && resultado.length > 1 && y - ultimo[1] < perto) resultado.pop();
      resultado.push(ponto);
      return;
    }
    const seguinte = todos.slice(k + 1).find((p) => p[2]);
    const ponta = !ultimo || y >= altura;
    if (!ponta && y - ultimo[1] < perto) return;
    let menor = ultimo ? ultimo[0] - alcance(y - ultimo[1]) : -Infinity;
    let maior = ultimo ? ultimo[0] + alcance(y - ultimo[1]) : Infinity;
    if (seguinte) {
      menor = Math.max(menor, seguinte[0] - alcance(seguinte[1] - y));
      maior = Math.min(maior, seguinte[0] + alcance(seguinte[1] - y));
    }
    if (menor <= maior) resultado.push([prender(x, menor, maior), y, false]);
    else if (ponta) resultado.push([seguinte && !ultimo ? seguinte[0] : ultimo[0], y, false]);
  });
  const fim = resultado.at(-1);
  if (fim[1] < altura) resultado.push([fim[0], altura, false]);
  return resultado;
}

function caminhoDaJornada({ largura, altura, passo = 760, semente = 11, estreito = false, desvios = [], inicio = 0 } = {}) {
  if (!(largura > 0) || !(altura > inicio)) return "";
  const r = sementeira(semente);
  const alcance = alcanceDe(passo);
  let pontos = [[largura * (inicio > 0 ? 0.5 : 0.78), inicio]];
  const saiACada = estreito ? 6 : 3;
  let y = inicio;
  let lado = 1;
  let curva = 0;
  while (y < altura) {
    const descida = Math.min(altura, y + passo * (0.55 + r() * 0.45)) - y;
    y += descida;
    curva += 1;
    lado = -lado;
    /* De tempos em tempos o fio sai da tela pelo lado em que já está — sem
       atravessá-la de uma vez — e volta por ele mesmo. */
    const sai = curva % saiACada === 0;
    const desejado = sai
      ? (lado < 0 ? largura * (1.1 + r() * 0.14) : -largura * (0.1 + r() * 0.14))
      : (lado > 0 ? largura * (0.58 + r() * 0.34) : largura * (0.05 + r() * 0.34));
    const antes = pontos.at(-1)[0];
    pontos.push([prender(desejado, antes - alcance(descida), antes + alcance(descida)), y, false]);
  }
  /* Em uma coluna (celular e tablet), a alternância entre margens passava pelo
     meio das fotografias. O conteúdo deixa uma faixa livre à direita (34 px,
     com a foto terminando 30 px antes da borda): quando todas as áreas de
     texto a respeitam, o fio chega a ela antes da primeira cena e acompanha a
     leitura por ali, no meio da faixa. */
  const primeiroTexto = Math.min(...desvios.map((zona) => zona.topo));
  const trilhoNaMargem = estreito && desvios.length > 0
    && primeiroTexto - inicio >= 220
    && desvios.every((zona) => zona.opcional || zona.direita <= largura - 18);
  if (trilhoNaMargem) {
    const x = largura - 15;
    pontos = [[largura * 0.5, inicio, false], [x, primeiroTexto - 30, true]];
    let alternancia = 0;
    for (let alturaAtual = primeiroTexto - 30 + passo * 0.55; alturaAtual < altura; alturaAtual += passo * 0.55) {
      pontos.push([largura - (alternancia++ % 2 ? 9 : 22), alturaAtual, true]);
    }
    pontos.push([x, altura, true]);
  } else if (desvios.length) {
    pontos = pontosComDesvios(pontos, desvios, { largura, altura, inicio, passo, r, alcance, estreito });
  }

  /* Tangentes: vertical nos pontos fixos, nas pontas e onde o fio muda de
     lado; no meio de uma travessia, a direção dela, amortecida. */
  const inclinacoes = pontos.map(([, , fixo], k) => {
    if (fixo || k === 0 || k === pontos.length - 1) return 0;
    const antes = (pontos[k][0] - pontos[k - 1][0]) / (pontos[k][1] - pontos[k - 1][1]);
    const depois = (pontos[k + 1][0] - pontos[k][0]) / (pontos[k + 1][1] - pontos[k][1]);
    if (antes * depois <= 0) return 0;
    return ((2 * antes * depois) / (antes + depois)) * (0.5 + r() * 0.35);
  });

  const f = (n) => Math.round(n * 10) / 10;
  let desenho = `M ${f(pontos[0][0])} ${f(pontos[0][1])}`;
  for (let k = 1; k < pontos.length; k += 1) {
    const [x0, y0] = pontos[k - 1];
    const [x1, y1] = pontos[k];
    const dy = y1 - y0;
    /* A abertura de cada lado varia: cada curva tem outro desenho. */
    const a0 = 0.34 + r() * 0.1;
    const a1 = 0.34 + r() * 0.1;
    const c1 = [x0 + inclinacoes[k - 1] * a0 * dy, y0 + a0 * dy];
    const c2 = [x1 - inclinacoes[k] * a1 * dy, y1 - a1 * dy];
    desenho += ` C ${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(x1)} ${f(y1)}`;
  }
  return desenho;
}

function setupJourneyThread(documentRef = document, windowRef = documentRef.defaultView) {
  const svg = documentRef.querySelector("[data-journey-thread]");
  const path = svg?.querySelector("[data-journey-path]");
  const ponta = svg?.querySelector("[data-journey-tip]");
  /* Halo largo sob o traço e aura sob a ponta: a linha se destaca em fundo claro e escuro. */
  const halo = svg?.querySelector("[data-journey-halo]");
  const aura = svg?.querySelector("[data-journey-aura]");
  const recorteDasFotos = svg?.querySelector("[data-journey-photo-clip]");
  const pagina = svg?.parentElement;
  if (!svg || !path || !pagina || !windowRef || typeof path.getTotalLength !== "function") return;

  const reducedMotion = windowRef.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  let comprimento = 0;
  let mapa = [];
  let atual = 0;
  let alvo = 0;
  let quadro = 0;
  let medida = "";

  function atualizarRecortes() {
    if (!recorteDasFotos) return;
    const largura = pagina.clientWidth;
    // A altura do SVG não pode entrar na própria medição da página.
    const altura = pagina.clientHeight || pagina.scrollHeight;
    const base = pagina.getBoundingClientRect();
    const fotos = [];
    const intersecao = (a, b) => {
      const parte = { esquerda: Math.max(a.esquerda, b.esquerda), topo: Math.max(a.topo, b.topo), direita: Math.min(a.direita, b.direita), base: Math.min(a.base, b.base) };
      return parte.direita > parte.esquerda && parte.base > parte.topo ? parte : null;
    };
    const area = (caixa) => ({ esquerda: caixa.left - base.left, topo: caixa.top - base.top, direita: caixa.right - base.left, base: caixa.bottom - base.top });
    const limite = { esquerda: 0, topo: 0, direita: largura, base: altura };
    const emVista = (caixa) => caixa.bottom >= -40 && caixa.top <= windowRef.innerHeight + 40;
    const adicionar = (caixa, palco) => {
      let visivel = intersecao(caixa, area(palco));
      if (visivel) visivel = intersecao(visivel, limite);
      if (!visivel) return;
      /* O clip-path usa paridade: retângulos sobrepostos abririam novamente
         o fio. Retiramos as partes já cobertas antes de acrescentar cada foto. */
      let partes = [visivel];
      for (const foto of fotos) {
        partes = partes.flatMap((parte) => {
          const comum = intersecao(parte, foto);
          if (!comum) return [parte];
          return [
            { esquerda: parte.esquerda, topo: parte.topo, direita: parte.direita, base: comum.topo },
            { esquerda: parte.esquerda, topo: comum.base, direita: parte.direita, base: parte.base },
            { esquerda: parte.esquerda, topo: comum.topo, direita: comum.esquerda, base: comum.base },
            { esquerda: comum.direita, topo: comum.topo, direita: parte.direita, base: comum.base },
          ].filter((p) => p.direita > p.esquerda && p.base > p.topo);
        });
      }
      fotos.push(...partes);
    };

    documentRef.querySelectorAll(".hero[data-essay-scene]").forEach((cena) => {
      const palco = cena.querySelector(".hero-stage");
      const imagem = cena.querySelector(".hero-visual > img");
      const caixa = palco?.getBoundingClientRect();
      if (caixa && emVista(caixa) && imagem) adicionar(area(imagem.getBoundingClientRect()), caixa);
    });
    const comMovimento = documentRef.documentElement.classList.contains("has-essay-motion");
    documentRef.querySelectorAll(".home-scene").forEach((cena) => {
      const palco = cena.querySelector(".home-scene__stage");
      const imagem = cena.querySelector(".home-scene__main-image");
      if (!palco || !imagem) return;
      const caixa = palco.getBoundingClientRect();
      if (!emVista(caixa)) return;
      if (comMovimento) {
        const estilos = windowRef.getComputedStyle(cena);
        const porcentagem = (nome, reserva) => {
          const valor = parseFloat(estilos.getPropertyValue(nome));
          return Number.isFinite(valor) ? valor : reserva;
        };
        adicionar({
          esquerda: caixa.left - base.left + caixa.width * porcentagem("--essay-window-left", 6) / 100,
          direita: caixa.left - base.left + caixa.width * porcentagem("--essay-window-right", 53) / 100,
          topo: caixa.top - base.top + caixa.height * porcentagem("--essay-window-top", 90) / 100,
          base: caixa.top - base.top + caixa.height * porcentagem("--essay-window-bottom", 163) / 100,
        }, caixa);
      } else {
        adicionar(area(imagem.getBoundingClientRect()), caixa);
      }
      const detalhe = cena.querySelector(".home-scene__detail-image");
      if (detalhe && Number(windowRef.getComputedStyle(detalhe).opacity) > 0.02) adicionar(area(detalhe.getBoundingClientRect()), caixa);
    });
    const f = (valor) => Math.round(valor * 10) / 10;
    const buracos = fotos.map((foto) => `M ${f(foto.esquerda)} ${f(foto.topo)} H ${f(foto.direita)} V ${f(foto.base)} H ${f(foto.esquerda)} Z`).join(" ");
    const d = `M 0 0 H ${largura} V ${altura} H 0 Z ${buracos}`;
    if (recorteDasFotos.getAttribute("d") !== d) recorteDasFotos.setAttribute("d", d);
  }

  function montar() {
    const largura = pagina.clientWidth;
    const altura = pagina.clientHeight || pagina.scrollHeight;
    const chave = `${largura}x${altura}`;
    if (chave === medida) return;
    medida = chave;
    /* Até 980 px o ensaio fica em uma coluna (css/home-editorial-essay.css). */
    const estreito = largura <= 980;
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
      inicio: inicioDaLinha(),
      desvios: zonasDeTexto(),
    }));
    halo?.setAttribute("d", path.getAttribute("d"));
    comprimento = path.getTotalLength();
    path.style.strokeDasharray = `${comprimento}`;
    halo?.style.setProperty("stroke-dasharray", `${comprimento}`);
    /* Tabela altura → comprimento: a ponta do traço fica na altura da leitura. */
    mapa = [];
    const amostras = 480;
    /* Sem traço (a página ainda não passa do início da linha), não há o que
       amostrar: getPointAtLength falha num caminho vazio. */
    for (let i = 0; comprimento && i <= amostras; i += 1) {
      const trecho = (comprimento * i) / amostras;
      mapa.push([trecho, path.getPointAtLength(trecho).y]);
    }
    if (reducedMotion) {
      path.style.strokeDashoffset = "0";
      halo?.style.setProperty("stroke-dashoffset", "0");
      if (ponta) ponta.style.display = "none";
      if (aura) aura.style.display = "none";
      atualizarRecortes();
    } else {
      atual = Math.min(atual, comprimento);
      pintar();
    }
  }

  /*
   * As áreas de texto que a linha deve contornar, em coordenadas da página.
   * Nas cenas de palco preso (sticky), o texto fica parado na tela enquanto a
   * página anda: a área cobre todo o trecho em que ele está à vista.
   */
  const folga = 28;
  function zonasDeTexto() {
    const base = pagina.getBoundingClientRect();
    const zonas = [];
    const adicionar = (bloco, palco, cena, opcional = false) => {
      const caixa = bloco.getBoundingClientRect();
      if (!caixa.width || !caixa.height) return;
      let topo = caixa.top - base.top;
      let fundo = caixa.bottom - base.top;
      const preso = palco && cena && windowRef.getComputedStyle(palco).position === "sticky";
      const palcoCaixa = palco?.getBoundingClientRect();
      if (preso) {
        const cenaTopo = cena.getBoundingClientRect().top - base.top;
        const percurso = Math.max(0, cena.offsetHeight - palco.offsetHeight);
        topo = cenaTopo + (caixa.top - palcoCaixa.top);
        fundo = cenaTopo + percurso + (caixa.bottom - palcoCaixa.top);
      }
      /* No celular a coluna já tem margens pequenas; a folga horizontal
         precisa caber nelas para o fio poder aparecer junto à borda. */
      const folgaLateral = pagina.clientWidth <= 980 ? 4 : folga;
      zonas.push({ topo: topo - folga, base: fundo + folga, esquerda: caixa.left - base.left - folgaLateral, direita: caixa.right - base.left + folgaLateral, opcional });
    };
    documentRef.querySelectorAll(".home-scene").forEach((cena) => {
      const palco = cena.querySelector(".home-scene__stage");
      cena.querySelectorAll(".home-scene__copy").forEach((bloco) => adicionar(bloco, palco, cena));
    });
    documentRef.querySelectorAll(".hero[data-essay-scene]").forEach((cena) => {
      const palco = cena.querySelector(".hero-stage");
      /* Os blocos da abertura têm fundo e ficam acima da linha: evitá-los é
         bom, mas não obrigatório (ver `opcional` em pontosComDesvios). */
      cena.querySelectorAll(".hero-copy, .hero-card").forEach((bloco) => adicionar(bloco, palco, cena, true));
    });
    return zonas;
  }

  /* A linha nasce logo abaixo das boas-vindas: a tela de entrada fica só com elas. */
  function inicioDaLinha() {
    const entrada = documentRef.querySelector(".entrada__conteudo");
    if (!entrada) return 0;
    return Math.max(0, entrada.getBoundingClientRect().bottom - pagina.getBoundingClientRect().top + folga);
  }

  function comprimentoNaAltura(y) {
    for (const [trecho, altura] of mapa) if (altura >= y) return trecho;
    return comprimento;
  }

  function pintar() {
    quadro = 0;
    atualizarRecortes();
    const topo = pagina.getBoundingClientRect().top + windowRef.scrollY;
    const linhaDeLeitura = windowRef.scrollY + windowRef.innerHeight * 0.72 - topo;
    alvo = comprimentoNaAltura(linhaDeLeitura);
    /* A ponta chega um pouco depois do scroll: calma, não arrasto. */
    atual += (alvo - atual) * 0.16;
    if (Math.abs(alvo - atual) < 0.5) atual = alvo;
    path.style.strokeDashoffset = `${comprimento - atual}`;
    halo?.style.setProperty("stroke-dashoffset", `${comprimento - atual}`);
    if (ponta && comprimento) {
      const ponto = path.getPointAtLength(atual);
      ponta.setAttribute("cx", String(ponto.x));
      ponta.setAttribute("cy", String(ponto.y));
      aura?.setAttribute("cx", String(ponto.x));
      aura?.setAttribute("cy", String(ponto.y));
    }
    if (atual !== alvo) quadro = windowRef.requestAnimationFrame(pintar);
  }

  const pedir = () => {
    if (quadro) return;
    if (reducedMotion) {
      quadro = windowRef.requestAnimationFrame(() => { quadro = 0; atualizarRecortes(); });
      return;
    }
    quadro = windowRef.requestAnimationFrame(pintar);
  };

  montar();
  /* As áreas de texto também mudam sem mudar o tamanho da página: quando o
     ensaio liga (ou desliga) o movimento — ao carregar, ele roda depois deste
     arquivo — e quando as fontes chegam. Aí a linha é medida de novo. */
  const remedir = () => {
    medida = "";
    windowRef.requestAnimationFrame(montar);
  };
  documentRef.addEventListener("ensaio:composicao", remedir);
  documentRef.fonts?.ready?.then(remedir);
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
