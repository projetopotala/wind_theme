import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  instanteDoProgresso,
  videoVale,
} from "../../outputs/js/home/landscape-video.js";

/* ------------------------------------------------------------------
 * Onde o vídeo para, dado o quanto se rolou
 * ------------------------------------------------------------------ */

test("o progresso da rolagem vira instante do vídeo", () => {
  assert.equal(instanteDoProgresso(0, 15), 0);
  assert.equal(instanteDoProgresso(0.5, 15), 7.5);
});

test("o fim do vídeo fica um pouco antes do fim de verdade", () => {
  /*
   * Pousar exatamente na duração é pedir um quadro que não existe: o vídeo
   * dispara `ended`, alguns navegadores rebobinam para zero, e o fundo pisca de
   * volta ao começo justo quando a pessoa chega ao pé da jornada.
   */
  const fim = instanteDoProgresso(1, 15);
  assert.ok(fim < 15, "não pode encostar na duração");
  assert.ok(fim > 14.8, `mas tem de chegar perto do fim, veio ${fim}`);
});

test("progresso fora da faixa é aparado", () => {
  /* A rolagem elástica do iOS devolve valores negativos e maiores que 1. Um
     `currentTime` fora da faixa é descartado pelo navegador, e o fundo trava no
     último instante válido. */
  assert.equal(instanteDoProgresso(-0.4, 15), 0);
  assert.ok(instanteDoProgresso(1.6, 15) < 15);
});

test("sem duração conhecida não há instante", () => {
  /* Antes do `loadedmetadata` a duração é `NaN`. Multiplicar por ela escreveria
     `NaN` em `currentTime`, o que zera o vídeo. */
  assert.equal(instanteDoProgresso(0.5, Number.NaN), null);
  assert.equal(instanteDoProgresso(0.5, 0), null);
});

/* ------------------------------------------------------------------
 * Quando o vídeo NÃO entra
 * ------------------------------------------------------------------ */

/*
 * O fundo de hoje é uma webp de 206 KB; o vídeo tem 7,3 MB. São 35 vezes mais,
 * na home. Ele só se justifica onde não custa caro — e em todo caso em que não
 * se justifica, o que fica é exatamente o que já existe hoje, então a página
 * nunca fica pior do que está.
 */

const AMPLA = { largura: 1440, movimentoReduzido: false, conexao: null };

test("em tela ampla, sem restrição, o vídeo entra", () => {
  assert.equal(videoVale(AMPLA), true);
});

test("movimento reduzido dispensa o vídeo", () => {
  /* Um fundo que se mexe a cada rolagem é exatamente o que quem pediu menos
     movimento está evitando. */
  assert.equal(videoVale({ ...AMPLA, movimentoReduzido: true }), false);
});

test("no telefone fica a imagem, e não é só por peso", () => {
  /*
   * O fundo do telefone é uma webp RETRATO (1080×1440), enquadrada para a tela
   * em pé. O vídeo é 16:9: coberto num telefone, sobra uma tira do meio e a
   * composição se perde. Somado aos 7,3 MB em dados móveis e ao fato de que é
   * no telefone que rebobinar vídeo custa mais caro, não compensa.
   */
  assert.equal(videoVale({ ...AMPLA, largura: 420 }), false);
  assert.equal(videoVale({ ...AMPLA, largura: 900 }), true);
});

test("economia de dados e conexão lenta dispensam o vídeo", () => {
  assert.equal(videoVale({ ...AMPLA, conexao: { saveData: true } }), false);
  assert.equal(videoVale({ ...AMPLA, conexao: { effectiveType: "2g" } }), false);
  assert.equal(videoVale({ ...AMPLA, conexao: { effectiveType: "slow-2g" } }), false);
  assert.equal(videoVale({ ...AMPLA, conexao: { effectiveType: "4g" } }), true);
});

test("navegador sem `connection` não é tratado como lento", () => {
  /* Safari não expõe `navigator.connection`. Tratar a ausência como restrição
     tiraria o vídeo de todo o Safari de desktop, que é justamente onde ele
     roda bem. */
  assert.equal(videoVale({ ...AMPLA, conexao: undefined }), true);
});

/* ------------------------------------------------------------------
 * O bloco aberto
 * ------------------------------------------------------------------ */

const css = await readFile(new URL("../../outputs/css/home-journey.css", import.meta.url), "utf8");
const html = await readFile(new URL("../../outputs/transcendido.html", import.meta.url), "utf8");

test("o vídeo mora dentro da paisagem, para atravessar junto com ela", () => {
  /*
   * A travessia desloca `.journey-landscape` para o lado quando um bloco abre, e
   * o elemento é de propósito mais largo que a tela para a borda nunca aparecer.
   * O vídeo dentro dele herda as duas coisas; um vídeo irmão, fixo por conta
   * própria, ficaria parado enquanto a cena anda.
   */
  const paisagem = html.match(/<div class="journey-landscape"[\s\S]*?<\/div>/);
  assert.ok(paisagem, "falta a paisagem");
  assert.match(paisagem[0], /<video/, "o vídeo precisa viver dentro da paisagem");
  assert.match(paisagem[0], /muted/, "sem `muted` o navegador recusa carregar sozinho");
  assert.match(paisagem[0], /playsinline/, "sem `playsinline` o iOS abre em tela cheia");
});

test("a imagem continua por trás do vídeo, e não é decoração", () => {
  /*
   * Ela é o que se vê antes de o vídeo poder pintar, e o que fica quando ele
   * não entra. Como o `.journey-landscape` mantém o `background`, não há um
   * estado em que o fundo seja um vazio.
   */
  const regra = css.match(/\.journey-landscape\s*\{([^}]*)\}/);
  assert.ok(regra, "falta a regra da paisagem");
  assert.match(regra[1], /url\("\.\.\/media\/home-travessia\.webp"\)/);
});

test("o vídeo recebe o progresso do controlador, sem escutar a rolagem por conta própria", async () => {
  /*
   * A primeira versão escutava `scroll` e agendava por `requestAnimationFrame`.
   * Funcionava, e era um segundo cano para a mesma água: o controlador já
   * escuta a rolagem, já calcula o progresso e já o distribui — é ele que move o
   * trajeto por esse mesmo valor. Esse progresso agora começa depois do prólogo:
   * assim vídeo e linha permanecem parados no “Bem-vindo” e avançam juntos.
   */
  const fonte = await readFile(new URL("../../outputs/js/home/landscape-video.js", import.meta.url), "utf8");
  assert.match(fonte, /setProgress/, "o vídeo precisa receber o progresso de fora");
  assert.ok(!/addEventListener\(\s*"scroll"/.test(fonte), "escutar a rolagem aqui duplica o que o controlador já faz");

  const controlador = await readFile(new URL("../../outputs/js/home/home-controller.js", import.meta.url), "utf8");
  assert.match(controlador, /landscapeVideo\.setProgress\(pathState\.progress\)/, "falta o controlador avisar o vídeo");
});

test("com um bloco aberto o vídeo para de ser rebobinado", async () => {
  /*
   * Duas razões, e a segunda é a que importa. O véu cobre a paisagem a 80%,
   * então mover o vídeo ali quase não se vê. E é exatamente nesse instante que o
   * painel está ampliando — a animação mais pesada da página. Rebobinar um vídeo
   * de 2048px de largura ao mesmo tempo disputa o mesmo quadro.
   *
   * O bloco também mal se move: rolar mais que 18% da tela já o fecha.
   */
  const fonte = await readFile(new URL("../../outputs/js/home/landscape-video.js", import.meta.url), "utf8");
  assert.match(fonte, /is-expanded/, "o vídeo precisa saber quando um bloco está aberto");
});
