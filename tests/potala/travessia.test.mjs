import assert from "node:assert/strict";
import test from "node:test";

import {
  CAMADAS,
  DURACAO,
  FASES,
  atrasoDaCategoria,
  createTravessiaState,
  deslocamentoDaCamada,
  deslocamentoDaCamera,
  faseEmMs,
  sentidoDaCamera,
} from "../../outputs/js/home/travessia.js";

/*
 * A faixa de 1800 a 2400 veio da referência, e na tela ela leu como atraso —
 * o cliente disse duas vezes. Num site que se visita, dois segundos entre o
 * clique e o conteúdo é tempo de espera, não de apreciação. O teto ficou onde
 * a espera ainda não vira dúvida; o piso segura o movimento no legível.
 */
test("a duração é curta o bastante para não parecer espera", () => {
  assert.ok(DURACAO >= 700, `curta demais para ler como movimento: ${DURACAO}`);
  assert.ok(DURACAO <= 1300, `longa o bastante para parecer atraso: ${DURACAO}`);
});

test("as fases cobrem a linha do tempo do começo ao fim", () => {
  assert.equal(FASES.confirmacao.inicio, 0);
  assert.equal(FASES.categorias.fim, 1);
  for (const [nome, fase] of Object.entries(FASES)) {
    assert.ok(fase.inicio < fase.fim, `${nome} não avança`);
    assert.ok(fase.inicio >= 0 && fase.fim <= 1, `${nome} sai da linha do tempo`);
  }
});

/*
 * As fatias se sobrepõem de propósito.
 *
 * Se o título só começasse depois de a câmera parar, a chegada leria como duas
 * etapas coladas: a paisagem para, e só então o texto aparece. Sobrepondo, o
 * conteúdo já vem subindo enquanto a câmera desacelera, e o movimento parece
 * uma coisa só.
 */
test("o conteúdo começa a subir antes de a câmera parar", () => {
  assert.ok(
    FASES.titulo.inicio < FASES.travessia.fim,
    "o título precisa começar antes do fim da travessia",
  );
  assert.ok(
    FASES.categorias.inicio < FASES.titulo.fim,
    "as categorias precisam começar antes do fim do título",
  );
});

test("faseEmMs converte a fatia em atraso e duração", () => {
  const travessia = faseEmMs("travessia", 2000);
  assert.equal(travessia.atraso, 160);
  assert.equal(travessia.duracao, 1240);

  /* Mudar a duração total move tudo junto: é o que impede as fases de
     descolarem quando alguém ajustar o ritmo. */
  const metade = faseEmMs("travessia", 1000);
  assert.equal(metade.atraso, 80);
  assert.equal(metade.duracao, 620);
});

test("fase desconhecida falha alto em vez de virar zero", () => {
  assert.throws(() => faseEmMs("inexistente"), RangeError);
});

/*
 * Com muitas categorias, um passo fixo empurraria a última para depois do fim
 * da linha do tempo — ela apareceria com o painel já liberado para cliques, que
 * é a costura que a travessia existe para esconder.
 */
test("o stagger cabe na linha do tempo, mesmo com muitas categorias", () => {
  for (const total of [1, 3, 6, 12]) {
    const ultima = atrasoDaCategoria(total - 1, total, DURACAO);
    assert.ok(
      ultima <= FASES.categorias.fim * DURACAO,
      `com ${total} categorias a última cai em ${ultima}ms, depois do fim`,
    );
  }
});

test("a primeira categoria não espera, e as seguintes escalonam", () => {
  assert.equal(atrasoDaCategoria(0, 3), Math.round(FASES.categorias.inicio * DURACAO));
  assert.ok(atrasoDaCategoria(1, 3) > atrasoDaCategoria(0, 3));
  assert.ok(atrasoDaCategoria(2, 3) > atrasoDaCategoria(1, 3));
});

test("índice fora da lista é preso na lista", () => {
  assert.equal(atrasoDaCategoria(99, 3), atrasoDaCategoria(2, 3));
  assert.equal(atrasoDaCategoria(-5, 3), atrasoDaCategoria(0, 3));
});

/*
 * O deslocamento é fração da largura, e não número fixo: os 320px que dão
 * sensação de câmera num monitor arrastariam a cena para fora num telefone.
 */
test("a câmera anda proporcionalmente à tela, com teto", () => {
  assert.equal(deslocamentoDaCamera({ viewportWidth: 375 }), 83);
  assert.equal(deslocamentoDaCamera({ viewportWidth: 1440 }), 317);
  assert.equal(deslocamentoDaCamera({ viewportWidth: 2560 }), 340, "o teto segura telas largas");
});

/* Passar do teto mostra a borda da imagem, e a borda denuncia que a cena
   acabou — a ilusão que a travessia existe para manter. */
test("o teto respeita a largura da paisagem disponível", () => {
  assert.equal(deslocamentoDaCamera({ viewportWidth: 4000, maximo: 120 }), 120);
});

test("as camadas distantes andam menos que as próximas", () => {
  assert.ok(CAMADAS.fundo < CAMADAS.meio);
  assert.ok(CAMADAS.meio < CAMADAS.frente);
  assert.ok(CAMADAS.frente < CAMADAS.interface);
  assert.equal(deslocamentoDaCamada("fundo", 300), 105);
  assert.equal(deslocamentoDaCamada("meio", 300), 300);
  assert.equal(deslocamentoDaCamada("frente", 300), 405);
});

test("camada desconhecida falha alto", () => {
  assert.throws(() => deslocamentoDaCamada("nuvem", 300), RangeError);
});

/*
 * A trava é o que impede o clique repetido de disparar uma segunda linha do
 * tempo por cima da primeira. Sem ela, dois cliques deixam a cena a meio
 * caminho de dois lugares diferentes.
 */
test("clique repetido não inicia uma segunda travessia", () => {
  const estados = [];
  const maquina = createTravessiaState({ onChange: (e) => estados.push(e) });

  assert.equal(maquina.abrir(), true);
  assert.equal(maquina.abrir(), false, "o segundo clique não pode passar");
  assert.equal(maquina.abrir(), false);
  assert.deepEqual(estados, ["transitioning"]);
  assert.equal(maquina.travado, true);
});

test("concluir libera os cliques e fixa o estado final", () => {
  const maquina = createTravessiaState();
  maquina.abrir();
  maquina.concluir("revealed");

  assert.equal(maquina.estado, "revealed");
  assert.equal(maquina.travado, false);
});

test("já revelado, abrir de novo não faz nada", () => {
  const maquina = createTravessiaState();
  maquina.abrir();
  maquina.concluir("revealed");
  assert.equal(maquina.abrir(), false);
});

test("a volta usa a mesma linha do tempo, no sentido inverso", () => {
  const estados = [];
  const maquina = createTravessiaState({ onChange: (e) => estados.push(e) });
  maquina.abrir();
  maquina.concluir("revealed");

  assert.equal(maquina.fechar(), true);
  assert.equal(maquina.travado, true, "a volta também tranca");
  maquina.concluir("initial");

  assert.deepEqual(estados, ["transitioning", "revealed", "transitioning", "initial"]);
});

/*
 * A trava recusa o clique repetido no mesmo bloco, e não a jornada inteira.
 *
 * Quem clica em OUTRO bloco no meio da travessia está pedindo outra coisa, e
 * ignorá-lo por dois segundos faz o site parecer travado.
 */
test("interromper permite começar outra travessia sem esperar a primeira", () => {
  const maquina = createTravessiaState();
  maquina.abrir();
  assert.equal(maquina.abrir(), false, "o mesmo bloco continua recusado");

  maquina.interromper();

  assert.equal(maquina.travado, false);
  assert.equal(maquina.estado, "transitioning", "interromper não desfaz o estado, só a trava");
});

/*
 * O destino distingue "atravessando para abrir" de "atravessando para voltar".
 *
 * Sem ele, fechar no meio da travessia tentava entrar no estado em que a
 * máquina já estava — `transitioning` — e era recusado. Na tela isso aparecia
 * como a paisagem estendida para sempre e o trajeto luminoso sumido.
 */
test("fechar no meio da travessia é aceito, porque o destino muda", () => {
  const maquina = createTravessiaState();
  maquina.abrir();
  assert.equal(maquina.destino, "revealed");

  maquina.interromper();

  assert.equal(maquina.fechar(), true, "a volta precisa ser aceita mesmo já em transitioning");
  assert.equal(maquina.destino, "initial");
});

test("fechar duas vezes seguidas não reinicia a volta", () => {
  const maquina = createTravessiaState();
  maquina.abrir();
  maquina.concluir("revealed");

  assert.equal(maquina.fechar(), true);
  maquina.interromper();
  assert.equal(maquina.fechar(), false, "já estamos indo para initial");
});

/*
 * A cena abre do lado de quem chamou.
 *
 * Com um sentido fixo, metade dos blocos abria para o lado contrário ao seu e o
 * movimento contradizia o clique: apertar o bloco da esquerda e ver a paisagem
 * correr para a direita lê como o site tendo entendido outra coisa.
 */
test("o bloco da esquerda estende a paisagem para a esquerda", () => {
  assert.equal(sentidoDaCamera("left"), 1);
  assert.equal(sentidoDaCamera("right"), -1);
});

/* Sem lado declarado, o padrão acompanha o bloco da esquerda — que é o primeiro
   da jornada. Um zero aqui deixaria a paisagem parada sem ninguém notar. */
test("lado ausente não paralisa a câmera", () => {
  assert.equal(sentidoDaCamera(undefined), 1);
  assert.equal(sentidoDaCamera(""), 1);
});
