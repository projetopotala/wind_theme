import assert from "node:assert/strict";
import test from "node:test";

import { createBlockExpansion } from "../../outputs/js/home/block-expansion.js";

function createAttributeNode(initial = {}) {
  const attributes = new Map(Object.entries(initial).map(([key, value]) => [key, String(value)]));
  return {
    attributes,
    focused: false,
    inert: false,
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
    focus() {
      this.focused = true;
    },
    querySelectorAll() {
      return [];
    },
  };
}

function createSection(id) {
  const summary = createAttributeNode({ "aria-expanded": "false" });
  const details = createAttributeNode({ "aria-hidden": "true" });
  const classes = new Set();
  return {
    dataset: { regionId: id },
    summary,
    details,
    classList: {
      add(value) { classes.add(value); },
      remove(value) { classes.delete(value); },
      contains(value) { return classes.has(value); },
    },
    querySelector(selector) {
      if (selector === ".region-summary") return summary;
      if (selector === ".region-details") return details;
      return null;
    },
    contains(node) {
      return node === summary || node === details;
    },
  };
}

function createRoot(ids) {
  const sections = ids.map(createSection);
  const listeners = new Map();
  return {
    sections,
    querySelectorAll(selector) {
      return selector === ".journey-region" ? sections : [];
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    emit(type, event) {
      listeners.get(type)?.(event);
    },
  };
}

test("abrir um bloco fecha o anterior", () => {
  const root = createRoot(["quem-somos", "atendimentos"]);
  const expansion = createBlockExpansion(root);

  expansion.open("quem-somos");
  expansion.open("atendimentos");

  assert.equal(expansion.activeId, "atendimentos");
  assert.equal(root.sections[0].summary.getAttribute("aria-expanded"), "false");
  assert.equal(root.sections[0].details.getAttribute("aria-hidden"), "true");
  assert.equal(root.sections[1].summary.getAttribute("aria-expanded"), "true");
  assert.equal(root.sections[1].details.getAttribute("aria-hidden"), "false");
});

test("Escape fecha o bloco ativo e devolve o foco ao resumo", () => {
  const root = createRoot(["quem-somos"]);
  const expansion = createBlockExpansion(root);
  let prevented = false;

  expansion.open("quem-somos");
  root.emit("keydown", {
    key: "Escape",
    preventDefault() { prevented = true; },
  });

  assert.equal(expansion.activeId, null);
  assert.equal(root.sections[0].summary.focused, true);
  assert.equal(prevented, true);
});

test("destroy remove os listeners e fecha a expansão", () => {
  const root = createRoot(["quem-somos"]);
  const expansion = createBlockExpansion(root);
  expansion.open("quem-somos");

  expansion.destroy();
  root.emit("keydown", { key: "Escape", preventDefault() {} });

  assert.equal(expansion.activeId, null);
  assert.equal(root.sections[0].summary.getAttribute("aria-expanded"), "false");
});


test("Escape fecha mesmo com o foco fora da jornada", () => {
  /*
   * Medido na prévia antes da correção: com o foco no botão de resumo o Escape
   * fechava; com o foco no body, não fechava nada. Basta clicar no fundo da
   * página, ou voltar de um link de dentro do bloco aberto, para cair nesse
   * segundo caso — e aí a única saída era procurar o botão de novo.
   */
  const root = createRoot(["quem-somos"]);
  const documento = {
    ouvintes: new Map(),
    addEventListener(type, listener) { this.ouvintes.set(type, listener); },
    removeEventListener(type, listener) {
      if (this.ouvintes.get(type) === listener) this.ouvintes.delete(type);
    },
  };

  const expansion = createBlockExpansion(root, { keyboardTarget: documento });
  expansion.open("quem-somos");

  // A raiz não pode mais ser o alvo do teclado: se for, o defeito voltou.
  root.emit("keydown", { key: "Escape", preventDefault() {} });
  assert.equal(expansion.activeId, "quem-somos", "a raiz não deve mais escutar o Escape");

  documento.ouvintes.get("keydown")({ key: "Escape", preventDefault() {} });
  assert.equal(expansion.activeId, null);

  // E o destroy tem de soltar do mesmo alvo em que se prendeu.
  expansion.destroy();
  assert.equal(documento.ouvintes.has("keydown"), false);
});

/**
 * Evento de clique com um alvo que responde a `closest`, como o DOM faz.
 *
 * O envelope importa: o handler lê `event.target.closest(...)`, então entregar
 * o alvo cru no lugar do evento faz todo clique cair no ramo de "fora do
 * bloco" — o teste passaria a medir outra coisa sem acusar nada.
 */
function cliqueEm({ summary = null, dentroDoBloco = false } = {}) {
  return {
    target: {
      closest(seletor) {
        if (seletor === ".region-summary") return summary;
        if (seletor === ".region-content") return summary || dentroDoBloco ? {} : null;
        return null;
      },
    },
  };
}

/*
 * Relógio imediato: fecha a linha do tempo da travessia sem esperar dois
 * segundos de verdade. Os testes abaixo se interessam pelo estado final, e não
 * pela animação — sem isto, cada um deles levaria dois segundos de relógio.
 */
const agora = { agendar: (retorno) => { retorno(); return 0; }, cancelar: () => {} };

test("o segundo clique leva ao destino em vez de fechar", () => {
  const root = createRoot(["quem-somos"]);
  const secao = root.sections[0];
  secao.details.querySelector = (seletor) => (seletor === ".region-link"
    ? { getAttribute: () => "quem-somos.html" }
    : null);

  const destinos = [];
  const expansion = createBlockExpansion(root, { navigate: (href) => destinos.push(href), ...agora });

  /*
   * A regra aprovada era não redirecionar ao primeiro toque: quem só quer ler
   * o resumo não pode ser jogado para outra página. Ela continua de pé — o
   * primeiro clique abre e o texto completo aparece ali mesmo — e o segundo é
   * uma escolha já informada, feita com o conteúdo à vista.
   */
  root.emit("click", cliqueEm({ summary: secao.summary }));
  assert.equal(expansion.activeId, "quem-somos");
  assert.deepEqual(destinos, [], "o primeiro clique não pode navegar");

  root.emit("click", cliqueEm({ summary: secao.summary }));
  assert.deepEqual(destinos, ["quem-somos.html"]);
  assert.equal(expansion.activeId, "quem-somos", "navegar não fecha o bloco antes de sair");
});

test("o endereço sai do link visível, e não de uma segunda fonte", () => {
  const root = createRoot(["quem-somos"]);
  const secao = root.sections[0];
  // Sem link declarado não há para onde ir — e o clique não pode inventar um
  // destino nem quebrar.
  secao.details.querySelector = () => null;

  const destinos = [];
  const expansion = createBlockExpansion(root, { navigate: (href) => destinos.push(href), ...agora });
  root.emit("click", cliqueEm({ summary: secao.summary }));
  root.emit("click", cliqueEm({ summary: secao.summary }));

  assert.deepEqual(destinos, [undefined]);
  assert.equal(expansion.activeId, "quem-somos");
});

test("clique fora do bloco fecha, sem navegar", () => {
  /*
   * Isto virou necessário quando o segundo clique passou a navegar: sem ele,
   * quem abrisse um bloco sem querer no telefone não teria como fechá-lo —
   * tocar de novo levaria para outra página e Escape não existe no toque.
   */
  const root = createRoot(["quem-somos"]);
  const destinos = [];
  const expansion = createBlockExpansion(root, { navigate: (href) => destinos.push(href) });

  expansion.open("quem-somos");
  root.emit("click", cliqueEm({ summary: null }));

  assert.equal(expansion.activeId, null);
  assert.deepEqual(destinos, []);
});

test("abrir e fechar avisam quem acompanha por fora", () => {
  /*
   * O trajeto é desenhado por uma câmera, não pela grade da página. Quando um
   * bloco abre, o vão do meio desliza para o lado oposto — e sem este aviso a
   * linha ficaria parada no centro da tela enquanto o vão anda, terminando por
   * baixo do bloco aberto.
   */
  const root = createRoot(["quem-somos", "atendimentos"]);
  const avisos = [];
  const expansion = createBlockExpansion(root, {
    onChange: (entry) => avisos.push(entry ? entry.id : null),
  });

  expansion.open("quem-somos");
  expansion.open("atendimentos");
  expansion.close();

  // Trocar de bloco fecha o anterior: o aviso de fechamento vem antes do novo,
  // senão quem escuta guardaria o deslocamento do bloco errado.
  assert.deepEqual(avisos, ["quem-somos", null, "atendimentos", null]);
});

test("clique vindo de quem abre blocos por fora não fecha o que acabou de abrir", () => {
  /*
   * O menu das seções vive dentro da mesma raiz, então o clique nele borbulha
   * até o fechamento por clique-fora: ele abria o bloco pedido e o mesmo gesto
   * o fechava, sem erro nenhum — o menu simplesmente não funcionava. Medido no
   * navegador antes da correção: nenhum bloco ficava aberto.
   *
   * O atributo é genérico para a expansão não precisar conhecer o menu pelo
   * nome — qualquer controle que abra blocos de fora pode se marcar assim.
   */
  const root = createRoot(["quem-somos"]);
  const expansion = createBlockExpansion(root, { navigate: () => {} });
  expansion.open("quem-somos");

  root.emit("click", {
    target: {
      closest: (seletor) => (seletor === "[data-keeps-expansion]" ? {} : null),
    },
  });

  assert.equal(expansion.activeId, "quem-somos");
});

/*
 * A trava vale para TODO clique, inclusive o que navega.
 *
 * Sem isso, um segundo toque no meio da travessia corta a cena e leva a pessoa
 * para outra página antes de ela ter visto o conteúdo que a animação estava
 * revelando — o oposto da escolha informada que o segundo clique existe para
 * ser.
 *
 * Este é o único teste de navegação que NÃO usa o relógio imediato: ele precisa
 * da travessia em curso para ter o que provar.
 */
test("o segundo clique não navega enquanto a travessia corre", () => {
  const root = createRoot(["quem-somos"]);
  const secao = root.sections[0];
  secao.details.querySelector = (seletor) => (seletor === ".region-link"
    ? { getAttribute: () => "quem-somos.html" }
    : null);

  const destinos = [];
  createBlockExpansion(root, { navigate: (href) => destinos.push(href) });

  root.emit("click", cliqueEm({ summary: secao.summary }));
  root.emit("click", cliqueEm({ summary: secao.summary }));

  assert.deepEqual(destinos, [], "a navegação precisa esperar a travessia terminar");
});

/*
 * Fechar no meio da travessia não pode ser recusado.
 *
 * A trava existe para impedir uma segunda linha do tempo, não para impedir a
 * saída. Medido no navegador antes da correção: Escape durante a animação
 * deixava a paisagem estendida para sempre e o trajeto luminoso sumido — o
 * estado do corpo nunca voltava, e nada na tela explicava o que houve.
 */
test("Escape no meio da travessia encena a volta, em vez de estalar", () => {
  const root = createRoot(["quem-somos"]);
  const corpo = { dataset: {} };
  root.ownerDocument = { body: corpo, addEventListener() {}, removeEventListener() {} };

  /*
   * Relógio que NUNCA dispara: a travessia fica em curso, que é a única
   * situação em que este defeito existe. Com o relógio imediato a animação já
   * teria acabado, a trava estaria solta, e o teste não teria o que provar.
   */
  const pendente = { agendar: () => 0, cancelar: () => {} };
  const expansion = createBlockExpansion(root, { keyboardTarget: root, ...pendente });
  expansion.open("quem-somos");
  root.emit("keydown", { key: "Escape", preventDefault() {} });

  assert.equal(expansion.activeId, null);
  assert.equal(
    root.sections[0].dataset.travessia,
    "transitioning",
    "a volta precisa ser encenada, e não estalar direto para o estado final",
  );
});

/*
 * E terminada a volta, nada pode ficar preso.
 *
 * O atributo do corpo é o que governa a paisagem e o trajeto luminoso: se ele
 * não voltar a `false`, a cena fica estendida e a linha central some para
 * sempre, sem nada na tela explicando o motivo.
 */
test("terminada a volta, a paisagem e o trajeto voltam ao normal", () => {
  const root = createRoot(["quem-somos"]);
  const corpo = { dataset: {} };
  root.ownerDocument = { body: corpo, addEventListener() {}, removeEventListener() {} };

  const expansion = createBlockExpansion(root, { keyboardTarget: root, ...agora });
  expansion.open("quem-somos");
  root.emit("keydown", { key: "Escape", preventDefault() {} });

  assert.equal(root.sections[0].dataset.travessia, undefined);
  assert.equal(corpo.dataset.travessiaAtiva, "false");
});

/*
 * Desmontar não pode deixar a cena estendida.
 *
 * `close()` encena a volta e agenda a limpeza, mas o relógio dispararia depois
 * de o controlador já não existir — e até lá a paisagem fica deslocada e o
 * trajeto luminoso sumido, sem ninguém para desfazer.
 */
test("destroy devolve a paisagem e o trajeto ao normal na hora", () => {
  const root = createRoot(["quem-somos"]);
  const corpo = { dataset: {} };
  root.ownerDocument = { body: corpo, addEventListener() {}, removeEventListener() {} };

  const pendente = { agendar: () => 0, cancelar: () => {} };
  const expansion = createBlockExpansion(root, { keyboardTarget: root, ...pendente });
  expansion.open("quem-somos");
  expansion.destroy();

  assert.equal(corpo.dataset.travessiaAtiva, "false");
  assert.equal(root.sections[0].dataset.travessia, undefined);
});

test("fechar mantém o painel na tela até a animação terminar", () => {
  /*
   * A saída precisa de alguma coisa para animar.
   *
   * `setExpanded(false)` tirava `is-expanded` no mesmo instante em que o
   * fechamento começava — e é essa classe que faz o painel ser a página. O
   * navegador nunca chegava a desenhar um quadro com o painel inteiro E o
   * estado de saída: ele voltava a ser cartão de um quadro para o outro, e só
   * então a animação corria, sobre um cartão. O véu sumia junto, e a paisagem
   * reaparecia com um estalo.
   *
   * O que a classe governa é só o VISUAL. A semântica — aria, inert, foco —
   * vira na hora, porque quem usa leitor de tela ou teclado já saiu do painel
   * no momento em que pediu para sair.
   */
  const relogios = [];
  const root = createRoot(["quem-somos"]);
  const expansion = createBlockExpansion(root, {
    agendar: (retorno) => { relogios.push(retorno); return relogios.length; },
    cancelar: () => {},
  });

  expansion.open("quem-somos");
  expansion.close();

  const secao = root.sections[0];
  assert.equal(secao.classList.contains("is-expanded"), true, "sem o painel na tela não há o que animar");
  assert.equal(secao.summary.getAttribute("aria-expanded"), "false", "a semântica não espera a animação");
  assert.equal(secao.details.getAttribute("aria-hidden"), "true");

  relogios.forEach((retorno) => retorno());
  assert.equal(secao.classList.contains("is-expanded"), false, "no fim da linha do tempo o painel sai");
});

test("fechar sem encenação some com o painel na hora", () => {
  /*
   * Trocar de bloco fecha o anterior POR DENTRO, sem linha do tempo, e desmontar
   * também. Nesses caminhos não há animação para esperar: segurar o visual
   * deixaria dois painéis abertos ao mesmo tempo, ou um painel órfão na tela
   * depois de o controlador deixar de existir.
   */
  const root = createRoot(["quem-somos", "atendimentos"]);
  const expansion = createBlockExpansion(root, { agendar: () => 0, cancelar: () => {} });

  expansion.open("quem-somos");
  expansion.open("atendimentos");
  assert.equal(root.sections[0].classList.contains("is-expanded"), false, "o bloco anterior não pode ficar aberto");

  expansion.destroy();
  assert.equal(root.sections[1].classList.contains("is-expanded"), false, "desmontar não deixa painel na tela");
});

test("abrir outro bloco no meio de um fechamento não deixa o painel anterior preso", () => {
  /*
   * O visual do bloco que sai depende de um relógio para ser retirado — e
   * `open` CANCELA esse relógio, porque ele também é o que solta a trava da
   * travessia. Sem cuidado, quem fechasse um bloco e abrisse outro dentro dos
   * dois segundos deixaria o primeiro com `is-expanded` para sempre: dois
   * painéis de página inteira empilhados, e nada mais para retirar o de baixo.
   */
  const relogios = [];
  const root = createRoot(["quem-somos", "atendimentos"]);
  const expansion = createBlockExpansion(root, {
    agendar: (retorno) => { relogios.push(retorno); return relogios.length; },
    cancelar: () => {},
  });

  expansion.open("quem-somos");
  expansion.close();
  expansion.open("atendimentos");

  assert.equal(
    root.sections[0].classList.contains("is-expanded"),
    false,
    "o painel que estava saindo tem de sair antes de outro entrar",
  );
  assert.equal(root.sections[1].classList.contains("is-expanded"), true);
});

test("o cartão volta à vista antes de o estado da travessia sumir", () => {
  /*
   * A saída fecha em opacidade zero — é isso que esconde a troca de um painel de
   * página inteira por um cartão pequeno. Só que, retirando `is-expanded` e
   * `data-travessia` no mesmo instante, o que se via era um PISCAR: capturado a
   * 60fps, aos 1110ms a opacidade saltava de 0,000 para 1,000 num quadro, e os
   * dois cartões do par apareciam do nada — inclusive a irmã, que volta junto.
   *
   * A entrega passa a ter dois tempos. Primeiro o painel devolve o lugar ao
   * cartão; o estado fica mais um instante, e é ele que dá ao cartão uma volta
   * à vista. Só depois o estado sai.
   */
  const relogios = [];
  const root = createRoot(["quem-somos"]);
  const expansion = createBlockExpansion(root, {
    agendar: (retorno) => { relogios.push(retorno); return relogios.length; },
    cancelar: () => {},
  });

  expansion.open("quem-somos");
  expansion.close();

  const secao = root.sections[0];
  relogios.splice(0).forEach((retorno) => retorno());

  assert.equal(secao.classList.contains("is-expanded"), false, "o painel já devolveu o lugar");
  assert.equal(
    secao.dataset.travessia,
    "transitioning",
    "o estado precisa sobreviver ao painel: é ele que traz o cartão de volta à vista",
  );

  relogios.splice(0).forEach((retorno) => retorno());
  assert.equal(secao.dataset.travessia, undefined, "no fim não sobra estado nenhum");
});

test("fechar reaproveita a medida da abertura em vez de refazê-la", () => {
  /*
   * Medir de novo na saída parecia mais correto e se mostrou frágil. O painel é
   * página nesse instante, e para ver onde o cartão fica é preciso tirar
   * `is-expanded` e repô-la — tirar tem efeito na leitura seguinte, repor não
   * tem. A caixa da página saía com o tamanho do cartão, escala e deslocamento
   * davam 1 e zero, e o painel "encolhia" de si para si: não animava, e depois
   * saltava.
   *
   * Reaproveitar é seguro porque o cartão mal tem como se mexer enquanto o
   * bloco está aberto — rolar mais que 18% da tela já fecha o bloco, e o palco
   * fica congelado durante toda a travessia.
   */
  const pedidos = [];
  const root = createRoot(["quem-somos"]);
  const expansion = createBlockExpansion(root, {
    agendar: () => 0,
    cancelar: () => {},
    medirRecorte: (entrada, fase) => pedidos.push(fase),
  });

  expansion.open("quem-somos");
  expansion.close();

  assert.deepEqual(pedidos, ["entrada"], "a saída anda com o que a entrada mediu");

  expansion.destroy();
});

