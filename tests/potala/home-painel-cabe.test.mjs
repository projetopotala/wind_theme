import assert from "node:assert/strict";
import test from "node:test";

import {
  PISO_DO_AJUSTE,
  ajusteQueCabe,
  createBlockExpansion,
  recorteDoCartao,
} from "../../outputs/js/home/block-expansion.js";

/*
 * O ajuste medido é a rede de segurança do painel aberto.
 *
 * O CSS aperta o bastante para a jornada de hoje caber em telas comuns, mas o
 * texto dos blocos vem do admin: ninguém pode prometer, no CSS, que o próximo
 * parágrafo escrito ainda vai caber num telefone antigo. Quando não couber, o
 * painel encolhe por inteiro em vez de transbordar por cima do bloco de baixo —
 * e continua mostrando tudo, que é o ponto.
 *
 * A medição entra por parâmetro porque `zoom` muda a QUEBRA DE LINHA: reduzir
 * 5% costuma tirar mais de 5% da altura, porque uma linha inteira desaparece.
 * Uma conta fechada só com a razão erraria para baixo, apertando mais do que o
 * necessário; medir de novo a cada passo é o que faz o painel parar no primeiro
 * tamanho que serve.
 */

/** Uma tela de mentira onde a altura cai proporcionalmente ao ajuste. */
function telaProporcional({ disponivel, natural }) {
  return (fator) => ({ disponivel, natural: natural * fator });
}

/*
 * O bloco "Recepção" num telefone de 320×568, medido na prévia.
 *
 * A tabela guarda o que a proporção não conta: de 1 para 0,95 o painel perde
 * 78px, muito mais que os 33 de uma queda proporcional, porque duas linhas de
 * texto desaparecem de uma vez. É esse ganho extra que faz um aperto leve
 * bastar onde a razão pediria o piso.
 */
const RECEPCAO_320 = new Map([[1, 651], [0.95, 573], [0.9, 522], [0.85, 485], [0.8, 444]]);

function telaMedida(tabela, disponivel) {
  return (fator) => {
    const chave = [...tabela.keys()].reduce((a, b) => (Math.abs(b - fator) < Math.abs(a - fator) ? b : a));
    return { disponivel, natural: tabela.get(chave) };
  };
}

test("painel que já cabe não é encolhido", () => {
  const medicoes = [];
  const fator = ajusteQueCabe((f) => {
    medicoes.push(f);
    return { disponivel: 700, natural: 540 };
  });

  assert.equal(fator, 1, "encolher um painel que cabe só empobrece a leitura à toa");
  assert.deepEqual(medicoes, [1], "não há por que medir de novo depois de caber");
});

test("painel que transborda encolhe até caber", () => {
  const medir = telaMedida(RECEPCAO_320, 504);
  const fator = ajusteQueCabe(medir);

  assert.ok(fator < 1, "o painel precisava encolher");
  assert.ok(fator >= PISO_DO_AJUSTE, "o ajuste não pode passar do piso de legibilidade");
  assert.ok(
    medir(fator).natural <= 504,
    `com ${fator} o painel ainda transborda por cima do que vem depois`,
  );
});

test("o ajuste para no primeiro tamanho que serve, sem apertar além", () => {
  /* Quebra de linha a favor: a 0,95 uma linha inteira some e o painel já cabe.
     Uma conta feita só pela razão pediria 0,86 e encolheria o texto sem
     necessidade. */
  const fator = ajusteQueCabe((f) => ({
    disponivel: 504,
    natural: f < 1 ? 500 : 651,
  }));

  assert.ok(fator > 0.9, `esperava um aperto leve, veio ${fator}`);
});

test("o ajuste nunca desce abaixo do piso, mesmo sem caber", () => {
  /* Um bloco impossível — texto longo num telefone deitado. Encolher até sumir
     não ajuda ninguém: o piso segura a legibilidade e o painel volta a rolar
     por dentro, que o CSS trata como último recurso. */
  const fator = ajusteQueCabe(telaProporcional({ disponivel: 200, natural: 1400 }));

  assert.equal(fator, PISO_DO_AJUSTE);
});

test("medida sem caixa conhecida não mexe no painel", () => {
  /* Antes de a jornada assentar, o palco pode medir zero. Dividir por ele
     devolveria um ajuste absurdo e o painel abriria minúsculo por um quadro. */
  assert.equal(ajusteQueCabe(() => ({ disponivel: 0, natural: 600 })), 1);
  assert.equal(ajusteQueCabe(() => ({ disponivel: 500, natural: 0 })), 1);
});

test("o piso preserva a legibilidade do texto do painel", () => {
  /* .region-details p no telefone é 0,73rem — cerca de 11,7px. Um piso mais
     fundo que este levaria o corpo do texto abaixo de 9px. */
  assert.ok(PISO_DO_AJUSTE >= 0.78, `piso ${PISO_DO_AJUSTE} deixa o texto pequeno demais`);
  assert.ok(PISO_DO_AJUSTE < 1);
});

/* ------------------------------------------------------------------
 * O ajuste ligado ao controlador
 * ------------------------------------------------------------------ */

function criarSecao(id) {
  const noh = (inicial = {}) => {
    const attrs = new Map(Object.entries(inicial));
    return {
      inert: false,
      focused: false,
      setAttribute(n, v) { attrs.set(n, String(v)); },
      getAttribute(n) { return attrs.get(n) ?? null; },
      removeAttribute(n) { attrs.delete(n); },
      focus() { this.focused = true; },
      querySelectorAll() { return []; },
    };
  };
  const summary = noh({ "aria-expanded": "false" });
  const details = noh({ "aria-hidden": "true" });
  const classes = new Set();
  return {
    dataset: { regionId: id },
    summary,
    details,
    classList: {
      add: (v) => classes.add(v),
      remove: (v) => classes.delete(v),
      contains: (v) => classes.has(v),
    },
    querySelector(sel) {
      if (sel === ".region-summary") return summary;
      if (sel === ".region-details") return details;
      return null;
    },
    contains(n) { return n === summary || n === details; },
  };
}

function criarRaiz(ids) {
  const sections = ids.map(criarSecao);
  const listeners = new Map();
  return {
    sections,
    querySelectorAll: (sel) => (sel === ".journey-region" ? sections : []),
    addEventListener: (t, l) => listeners.set(t, l),
    removeEventListener: (t, l) => { if (listeners.get(t) === l) listeners.delete(t); },
    emit: (t, e) => listeners.get(t)?.(e),
  };
}

/* O relogio corre na hora, para o teste nao esperar a travessia inteira. */
const agora = { agendar: (retorno) => { retorno(); return 0; }, cancelar: () => {} };

test("abrir um bloco manda o painel caber na tela quando a cena para", () => {
  const pedidos = [];
  const raiz = criarRaiz(["quem-somos"]);
  const expansao = createBlockExpansion(raiz, {
    ...agora,
    ajustarPainel: (entrada, aberto) => pedidos.push({ id: entrada.id, aberto }),
  });

  expansao.open("quem-somos");

  /*
   * A medida espera o fim da travessia de proposito: a caixa que o painel vai
   * ocupar cresce junto com a cena, e medir no clique aperta o bloco contra um
   * espaco que ja nao vale quando ele assenta.
   */
  assert.deepEqual(pedidos.at(-1), { id: "quem-somos", aberto: true });
  expansao.destroy();
});

test("fechar devolve o painel ao tamanho que ele tinha", () => {
  const pedidos = [];
  const raiz = criarRaiz(["quem-somos"]);
  const expansao = createBlockExpansion(raiz, {
    ...agora,
    ajustarPainel: (entrada, aberto) => pedidos.push({ id: entrada.id, aberto }),
  });

  expansao.open("quem-somos");
  expansao.close();

  /* Sem isto o bloco fechado guardaria o aperto do estado aberto, e o resumo
     apareceria menor que os vizinhos sem motivo nenhum. */
  assert.deepEqual(pedidos.at(-1), { id: "quem-somos", aberto: false });
  expansao.destroy();
});

test("girar o telefone refaz a conta do bloco que está aberto", () => {
  const pedidos = [];
  const raiz = criarRaiz(["quem-somos"]);
  const eventos = new Map();
  const anterior = globalThis.addEventListener;
  globalThis.addEventListener = (tipo, ouvinte) => eventos.set(tipo, ouvinte);

  try {
    const expansao = createBlockExpansion(raiz, {
      ...agora,
      ajustarPainel: (entrada, aberto) => pedidos.push({ id: entrada.id, aberto }),
    });
    expansao.open("quem-somos");
    const antes = pedidos.length;

    /* Deitar o telefone corta a altura pela metade: um painel que cabia em pé
       transborda deitado, e nada reabre o bloco para a conta ser refeita. */
    eventos.get("resize")?.();

    assert.ok(pedidos.length > antes, "o redimensionamento não refez a medida");
    assert.deepEqual(pedidos.at(-1), { id: "quem-somos", aberto: true });
    expansao.destroy();
  } finally {
    globalThis.addEventListener = anterior;
  }
});

/* ------------------------------------------------------------------
 * O recorte que faz o veu crescer de onde o cartao estava
 * ------------------------------------------------------------------ */

/*
 * O painel troca de coluna do grid ao abrir, e grid nao interpola: a mudanca de
 * TAMANHO e instantanea, so o deslocamento animava. Por isso a abertura lia como
 * "sumir e aparecer" em vez de crescer.
 *
 * A saida e recortar. O veu ja nasce do tamanho da pagina, com o conteudo no
 * lugar certo, e um `clip-path` o mostra primeiro apenas no retangulo onde o
 * cartao estava — abrindo dali ate a pagina inteira. Nada e escalado, entao o
 * texto nao esmaga.
 *
 * Esta funcao e a conta: o retangulo do cartao virado em recuos a partir das
 * bordas do painel, que e a forma que `inset()` pede.
 */

test("o recorte descreve o cartao como recuos das bordas do painel", () => {
  /* Um cartao de 300x200 no canto (600,100) dentro de um painel que ocupa
     1000x700 a partir da origem. */
  const r = recorteDoCartao(
    { left: 600, top: 100, right: 900, bottom: 300 },
    { left: 0, top: 0, right: 1000, bottom: 700 },
  );

  assert.deepEqual(r, { topo: 100, direita: 100, baixo: 400, esquerda: 600 });
});

test("o cartao da esquerda vira recuo pela esquerda, e o da direita pela direita", () => {
  const pagina = { left: 0, top: 0, right: 1000, bottom: 700 };
  const esquerda = recorteDoCartao({ left: 40, top: 200, right: 340, bottom: 500 }, pagina);
  const direita = recorteDoCartao({ left: 660, top: 200, right: 960, bottom: 500 }, pagina);

  /* E dai que sai a direcao: o veu se abre a partir do lado onde o cartao
     estava, sem precisar de nenhuma regra por lado. */
  assert.ok(esquerda.esquerda < esquerda.direita, "o cartao da esquerda abre pela esquerda");
  assert.ok(direita.direita < direita.esquerda, "o cartao da direita abre pela direita");
});

test("recuo negativo e aparado", () => {
  /* O cartao pode passar da borda do painel durante a travessia, quando a
     paisagem ainda esta andando. Um `inset()` negativo nao existe: ele seria
     descartado e o veu apareceria inteiro de uma vez, sem crescer. */
  const r = recorteDoCartao(
    { left: -50, top: -20, right: 1200, bottom: 900 },
    { left: 0, top: 0, right: 1000, bottom: 700 },
  );

  assert.deepEqual(r, { topo: 0, direita: 0, baixo: 0, esquerda: 0 });
});

test("sem medida utilizavel o recorte e nulo", () => {
  /* Antes de a jornada assentar os retangulos medem zero. Recortar por uma
     medida invalida esconderia o painel inteiro. */
  assert.equal(recorteDoCartao(null, { left: 0, top: 0, right: 10, bottom: 10 }), null);
  assert.equal(recorteDoCartao({ left: 0, top: 0, right: 10, bottom: 10 }, null), null);
  assert.equal(
    recorteDoCartao({ left: 0, top: 0, right: 0, bottom: 0 }, { left: 0, top: 0, right: 0, bottom: 0 }),
    null,
  );
});
