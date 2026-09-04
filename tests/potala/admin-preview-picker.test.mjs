import assert from "node:assert/strict";
import test from "node:test";

import { createMediaPicker } from "../../outputs/js/admin/admin-media-picker.js";
import {
  LARGURAS,
  clampZoom,
  createAdminPreview,
  frameGeometry,
  nextZoom,
} from "../../outputs/js/admin/admin-preview.js";

/* ---------- seletor de imagem ---------- */

function montarSeletor() {
  const ouvintes = new Map();
  const grade = {
    innerHTML: "",
    hidden: true,
    addEventListener(tipo, fn) { ouvintes.set(`grade:${tipo}`, fn); },
    removeEventListener(tipo) { ouvintes.delete(`grade:${tipo}`); },
  };
  const abrir = {
    addEventListener(tipo, fn) { ouvintes.set(`abrir:${tipo}`, fn); },
    removeEventListener(tipo) { ouvintes.delete(`abrir:${tipo}`); },
  };
  const root = {
    querySelector: (seletor) =>
      (seletor === "[data-admin-media-grid]" ? grade
        : seletor === "[data-admin-image-pick]" ? abrir : null),
  };
  return { root, grade, abrir, ouvintes };
}

/*
 * O manifesto pode simplesmente não existir: basta o script de build não ter
 * rodado. A grade é conveniência, e o campo de caminho continua funcionando —
 * derrubar o painel por isso seria trocar um incômodo por uma parede.
 */
test("manifesto ausente deixa a grade vazia, sem derrubar o painel", async () => {
  const { root, grade } = montarSeletor();
  const seletor = createMediaPicker({
    root,
    fetchManifest: () => Promise.reject(new Error("404")),
  });

  await seletor.open();

  assert.match(grade.innerHTML, /admin-media-empty/);
  assert.match(grade.innerHTML, /build:media-manifest/);
});

test("a grade lista o que o manifesto traz", async () => {
  const { root, grade } = montarSeletor();
  const seletor = createMediaPicker({
    root,
    fetchManifest: async () => ({ imagens: [{ arquivo: "a.webp" }, { arquivo: "b.png" }] }),
  });

  await seletor.open();

  assert.match(grade.innerHTML, /data-arquivo="a\.webp"/);
  assert.match(grade.innerHTML, /src="media\/b\.png"/);
  assert.equal(grade.hidden, false);
});

test("escolher uma imagem devolve o caminho pronto e fecha a grade", async () => {
  const { root, grade, ouvintes } = montarSeletor();
  const escolhidos = [];
  const seletor = createMediaPicker({
    root,
    fetchManifest: async () => ({ imagens: [{ arquivo: "a.webp" }] }),
    onPick: (caminho) => escolhidos.push(caminho),
  });
  await seletor.open();

  ouvintes.get("grade:click")({
    target: { closest: () => ({ dataset: { arquivo: "a.webp" } }) },
  });

  assert.deepEqual(escolhidos, ["media/a.webp"]);
  assert.equal(grade.hidden, true);
});

/* ---------- prévia ---------- */

test("o dispositivo escolhe a largura da página, não da caixa", () => {
  assert.equal(frameGeometry({ device: "desktop", available: 460 }).width, LARGURAS.desktop);
  assert.equal(frameGeometry({ device: "mobile", available: 460 }).width, LARGURAS.mobile);
});

/*
 * A asserção que justifica `frameGeometry` existir.
 *
 * Diminuir a escala não pode mudar a largura que a página acredita ter, ou o
 * modo telefone deixaria de disparar quando alguém afastasse o zoom. O que a
 * escala muda é quanto de página cabe na coluna.
 */
test("metade do zoom mostra o dobro da página, sem mexer no que ela acredita", () => {
  const cheio = frameGeometry({ device: "desktop", zoom: 1, available: 1000 });
  const metade = frameGeometry({ device: "desktop", zoom: 0.5, available: 1000 });

  assert.equal(metade.width, cheio.width);
  assert.equal(metade.scale, cheio.scale / 2);
  assert.equal(metade.visible, cheio.visible * 2);
});

/*
 * 100% quer dizer "cabe na coluna", e não "um pixel para cada pixel".
 *
 * Na leitura literal, 1280px de página numa coluna de 460 mostravam o canto
 * superior esquerdo e mais nada — foi exatamente o que apareceu na tela: a
 * prévia cortada.
 */
test("a 100% a largura do dispositivo cabe inteira na coluna", () => {
  const desktop = frameGeometry({ device: "desktop", zoom: 1, available: 460 });
  assert.equal(desktop.visible, 1280, "a largura visível é a do dispositivo");
  assert.equal(Math.round(desktop.width * desktop.scale), 460, "e ela ocupa a coluna toda");

  /*
   * O TELEFONE NAO SE ESTICA ATE A COLUNA — e a regra vale so para o desktop.
   *
   * "Cabe na coluna" e certo para uma janela de desktop, que nao tem altura
   * propria: ve-se a largura inteira e rola-se o resto. Um telefone tem as
   * DUAS medidas, e esticar so a largura devolvia um aparelho de 460 por 271:
   * mais largo que alto, uma proporcao que nenhum telefone tem. A prévia
   * mostrava o layout de telefone numa tela que nao existe.
   */
  const mobile = frameGeometry({ device: "mobile", zoom: 1, available: 460, height: 320 });
  assert.ok(mobile.width * mobile.scale <= 460, "o telefone estourou a coluna");
  assert.ok(mobile.frameHeight * mobile.scale <= 320, "o telefone estourou a altura da caixa");
});

/*
 * A ALTURA DO TELEFONE E DO TELEFONE, E NAO DA COLUNA DO PAINEL.
 *
 * O iframe recebia `altura da caixa / escala`. A pagina passava a acreditar
 * numa tela de 390 por 271 — e a Home decide muita coisa por `svh`: a altura do
 * palco, quantos blocos cabem, se o titulo ainda tem espaco. Nada disso podia
 * ser conferido, porque nada disso estava sendo mostrado.
 */
test("o telefone tem a altura de um telefone, e nao a da coluna", () => {
  const baixa = frameGeometry({ device: "mobile", zoom: 1, available: 460, height: 320 });
  const alta = frameGeometry({ device: "mobile", zoom: 1, available: 460, height: 900 });

  assert.equal(baixa.frameHeight, 844);
  assert.equal(alta.frameHeight, 844, "a coluna mais alta mudou a tela do aparelho");
});

test("a tela inteira do telefone cabe na caixa, com a proporcao certa", () => {
  const g = frameGeometry({ device: "mobile", zoom: 1, available: 460, height: 700 });
  const largura = g.width * g.scale;
  const altura = g.frameHeight * g.scale;

  assert.ok(largura <= 460 + 0.5 && altura <= 700 + 0.5, "a tela nao coube na caixa");
  /* Um dos dois lados encosta: sobrando folga nos dois, a previa estaria menor
     do que podia sem motivo. */
  assert.ok(Math.abs(largura - 460) < 0.5 || Math.abs(altura - 700) < 0.5);
  assert.ok(Math.abs(largura / altura - 390 / 844) < 0.001, "a proporcao nao e a de um telefone");
});

/* Escalar o iframe encolhe a altura junto. Sem compensar, sobra uma faixa
   morta embaixo da prévia com o mesmo tamanho do que foi encolhido. */
test("a altura do iframe compensa a escala", () => {
  const geometria = frameGeometry({ device: "desktop", zoom: 1, available: 460, height: 320 });
  assert.equal(Math.round(geometria.frameHeight * geometria.scale), 320);
});

/* 390px tem de continuar 390px em qualquer coluna: alargar para preencher o
   espaço faria a Home renderizar o layout de desktop dentro do modo telefone. */
test("o modo telefone não é alargado para caber na coluna", () => {
  assert.equal(frameGeometry({ device: "mobile", zoom: 1, available: 900 }).width, 390);
  assert.equal(frameGeometry({ device: "mobile", zoom: 1, available: 200 }).width, 390);
});

test("o zoom fica entre 50% e 150%", () => {
  assert.equal(clampZoom(0.1), 0.5);
  assert.equal(clampZoom(9), 1.5);
  assert.equal(clampZoom("abc"), 1);
  assert.equal(nextZoom(1, 1), 1.25);
  assert.equal(nextZoom(1.5, 1), 1.5);
  assert.equal(nextZoom(0.5, -1), 0.5);
});

function montarPrevia() {
  const ouvintes = new Map();
  /*
   * `dataset` e `style.setProperty` existem em qualquer elemento real, e
   * faltavam aqui. O duble mais magro que o original nao prova nada sobre o
   * original: ele quebra onde o navegador nao quebraria.
   */
  const alvo = (chave) => ({
    style: { propriedades: new Map(), setProperty(nome, valor) { this.propriedades.set(nome, valor); } },
    dataset: {},
    src: "transcendido.html",
    hidden: false,
    addEventListener(tipo, fn) { ouvintes.set(`${chave}:${tipo}`, fn); },
    removeEventListener(tipo) { ouvintes.delete(`${chave}:${tipo}`); },
  });
  const frame = alvo("frame");
  const erro = alvo("erro");
  erro.hidden = true;
  const recarregar = alvo("recarregar");
  const dispositivos = alvo("dispositivos");
  const botoes = [
    { dataset: { device: "desktop" }, atributos: new Map(), setAttribute(n, v) { this.atributos.set(n, v); } },
    { dataset: { device: "mobile" }, atributos: new Map(), setAttribute(n, v) { this.atributos.set(n, v); } },
  ];
  dispositivos.querySelectorAll = () => botoes;
  const zoomGrupo = alvo("zoom");
  const zoomValor = { textContent: "" };
  /* A caixa da previa e um elemento como os outros: tem `dataset` e `style`, e
     e nela que o tamanho ja escalado do aparelho e escrito. */
  const caixa = {
    clientWidth: 460,
    clientHeight: 700,
    dataset: {},
    style: { propriedades: new Map(), setProperty(nome, valor) { this.propriedades.set(nome, valor); } },
  };

  const root = {
    querySelector(seletor) {
      if (seletor === "[data-admin-preview]") return frame;
      if (seletor === "[data-admin-preview-frame]") return caixa;
      if (seletor === "[data-admin-preview-error]") return erro;
      if (seletor === "[data-admin-preview-reload]") return recarregar;
      if (seletor === "[data-admin-preview-device]") return dispositivos;
      if (seletor === "[data-admin-preview-zoom]") return zoomGrupo;
      if (seletor === "[data-admin-zoom-value]") return zoomValor;
      return null;
    },
  };
  return { root, frame, erro, ouvintes, botoes, zoomValor, caixa };
}

test("trocar o dispositivo marca o botão e mede o iframe", () => {
  const { root, frame, botoes, ouvintes } = montarPrevia();
  createAdminPreview({ root });

  ouvintes.get("dispositivos:click")({
    target: { closest: () => ({ dataset: { device: "mobile" } }) },
  });

  assert.equal(frame.style.width, "390px");
  assert.equal(botoes[1].atributos.get("aria-pressed"), "true");
  assert.equal(botoes[0].atributos.get("aria-pressed"), "false");
});

test("trocar para o telefone da a caixa o tamanho de um telefone", () => {
  const { root, frame, ouvintes, caixa } = montarPrevia();
  createAdminPreview({ root });

  ouvintes.get("dispositivos:click")({
    target: { closest: () => ({ dataset: { device: "mobile" } }) },
  });

  /*
   * `transform` nao muda o espaco que o elemento ocupa. Sem escrever o tamanho
   * final na caixa, o aparelho ficava encostado no canto de um retangulo do
   * tamanho da coluna, em vez de aparecer centrado como um telefone.
   */
  assert.equal(caixa.dataset.device, "mobile");
  assert.equal(frame.style.height, "844px", "a pagina nao acredita numa tela de telefone");
  const largura = Number(String(caixa.style.propriedades.get("--previa-largura")).replace("px", ""));
  const altura = Number(String(caixa.style.propriedades.get("--previa-altura")).replace("px", ""));
  assert.ok(Math.abs(largura / altura - 390 / 844) < 0.01, "a caixa nao tem a proporcao do aparelho");
});

test("o zoom aparece em porcentagem", () => {
  const { root, zoomValor, ouvintes } = montarPrevia();
  createAdminPreview({ root });

  ouvintes.get("zoom:click")({ target: { closest: () => ({ dataset: { zoom: "-1" } }) } });

  assert.equal(zoomValor.textContent, "75%");
});

/* Um retângulo vazio não diz se a prévia quebrou ou se a página está em branco.
   O aviso diz, e o botão de recarregar dá o que fazer com a informação. */
test("prévia que não carrega mostra o motivo, e recarregar o esconde", () => {
  const { root, erro, ouvintes } = montarPrevia();
  createAdminPreview({ root });

  ouvintes.get("frame:error")();
  assert.equal(erro.hidden, false);

  ouvintes.get("recarregar:click")();
  assert.equal(erro.hidden, true);
});

test("carregar com sucesso esconde o aviso e avisa quem espera", () => {
  const { root, erro, ouvintes } = montarPrevia();
  let publicou = 0;
  createAdminPreview({ root, onPublish: () => { publicou += 1; } });

  ouvintes.get("frame:error")();
  ouvintes.get("frame:load")();

  assert.equal(erro.hidden, true);
  assert.equal(publicou, 1);
});

/* Recarregar precisa reatribuir o endereço, e não só esconder o aviso: sem a
   reatribuição o iframe fica exatamente como estava e o botão engana. */
test("recarregar reatribui o endereço da prévia", () => {
  const { root, frame, ouvintes } = montarPrevia();
  createAdminPreview({ root });

  frame.src = "";
  ouvintes.get("recarregar:click")();

  assert.equal(frame.src, "transcendido.html");
});
