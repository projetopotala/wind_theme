import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const CSS = new URL("../../outputs/css/home-journey.css", import.meta.url);

/*
 * Largura de "Bem-vindo." dividida pelo tamanho da fonte.
 *
 * Medida no navegador, em Georgia com o letter-spacing de -.065em da regra:
 * 692px a 153,6px de fonte, e 332px a 73,6px. As duas contas dão 4,5053, o que
 * diz que a proporção não depende do tamanho — como tem de ser.
 *
 * A margem de 3% existe para arredondamento e para a fonte de fallback: se
 * Georgia faltar, Times New Roman entra no lugar com métrica própria — mais
 * estreita, na prática, mas a folga não custa quase nada.
 */
const RAZAO = 4.5053;
const MARGEM = 1.03;

/*
 * Avaliador do subconjunto de CSS que estas regras usam.
 *
 * Nada de genérico: só px, rem, vw, clamp() e min(), que é o que aparece aqui.
 * Existe para que o teste leia os valores DO ARQUIVO em vez de repeti-los —
 * repetidos, eles concordariam com o teste para sempre, inclusive depois de
 * alguém mudar o CSS e quebrar a linha de novo.
 */
function avalia(expressao, vw) {
  const texto = expressao.trim();
  const funcao = texto.match(/^(clamp|min|max)\((.*)\)$/s);
  if (funcao) {
    const partes = [];
    let profundidade = 0;
    let atual = "";
    for (const c of funcao[2]) {
      if (c === "(") profundidade += 1;
      if (c === ")") profundidade -= 1;
      if (c === "," && profundidade === 0) {
        partes.push(atual);
        atual = "";
        continue;
      }
      atual += c;
    }
    partes.push(atual);
    const valores = partes.map((p) => avalia(p, vw));
    if (funcao[1] === "min") return Math.min(...valores);
    if (funcao[1] === "max") return Math.max(...valores);
    return Math.min(Math.max(valores[0], valores[1]), valores[2]);
  }
  const unidade = texto.match(/^(-?[\d.]+)(px|rem|vw)$/);
  /*
   * A unidade é obrigatória, e esta exigência já pagou por si.
   *
   * A primeira versão caía num parseFloat solto, e um "9vw," — pedaço de um
   * clamp partido no espaço errado — passava como 9 PIXELS. A folga do palco
   * virava 9px em vez de 140px, a caixa disponível saía 890px em vez de 764px,
   * e o teste aprovava alegremente o tamanho que quebra a linha.
   */
  assert.ok(unidade, `expressão não reconhecida: ${expressao}`);
  const numero = parseFloat(unidade[1]);
  if (unidade[2] === "vw") return (numero * vw) / 100;
  if (unidade[2] === "rem") return numero * 16;
  return numero;
}

/*
 * Separa os valores de um atalho como "64px 22px" — sem partir o que está
 * dentro de parênteses, que é onde clamp() guarda as vírgulas e os espaços
 * dele.
 */
function valores(declaracaoCrua) {
  const partes = [];
  let profundidade = 0;
  let atual = "";
  for (const c of declaracaoCrua) {
    if (c === "(") profundidade += 1;
    if (c === ")") profundidade -= 1;
    if (c === " " && profundidade === 0) {
      if (atual) partes.push(atual);
      atual = "";
      continue;
    }
    atual += c;
  }
  if (atual) partes.push(atual);
  return partes;
}

/* Espaços e quebras de linha viram um espaço só. Assim os seletores multilinha
   do arquivo podem ser procurados como texto simples, e o resultado não muda
   se o arquivo chegar com CRLF em vez de LF. */
const css = (await readFile(CSS, "utf8")).replace(/\s+/g, " ");

/*
 * O corpo de uma regra, achada pelo seletor EXATO.
 *
 * Procurar ".prologue-copy h1" por substring cairia primeiro na regra
 * compartilhada com o h2 da continuação, que começa com o mesmo texto e segue
 * com vírgula. A chave logo depois do seletor é o que separa as duas.
 */
function regra(seletores, fonte = css) {
  const alvo = `${seletores.join(", ")} {`;
  const inicio = fonte.indexOf(alvo);
  assert.notEqual(inicio, -1, `regra ausente: ${alvo}`);
  const abre = inicio + alvo.length;
  const fecha = fonte.indexOf("}", abre);
  assert.notEqual(fecha, -1, `regra sem fechamento: ${alvo}`);
  return fonte.slice(abre, fecha);
}

function declaracao(corpo, propriedade) {
  const achado = corpo.match(new RegExp(`(?:^|;)\\s*${propriedade}\\s*:([^;]+);`));
  assert.ok(achado, `declaração ausente: ${propriedade}`);
  return achado[1].trim();
}

/* O bloco do telefone, do "@media" até a chave que o fecha. */
const inicioTelefone = css.indexOf("@media (max-width: 720px)");
assert.notEqual(inicioTelefone, -1, "media query do telefone ausente");
let profundidade = 0;
let fimTelefone = css.length;
for (let i = css.indexOf("{", inicioTelefone); i < css.length; i += 1) {
  if (css[i] === "{") profundidade += 1;
  if (css[i] === "}") {
    profundidade -= 1;
    if (profundidade === 0) {
      fimTelefone = i + 1;
      break;
    }
  }
}
const telefone = css.slice(inicioTelefone, fimTelefone);

const PALCO = [".journey-prologue", ".journey-continuation"];
const CAIXA = [".prologue-copy", ".journey-continuation > div"];
const TITULO = [".prologue-copy h1"];

function larguraDisponivel(vw) {
  const noTelefone = vw <= 720;
  const palco = noTelefone ? regra(PALCO, telefone) : regra(PALCO);
  const caixa = noTelefone ? regra(CAIXA, telefone) : regra(CAIXA);

  /* No telefone a folga vem do atalho "64px 22px" / "24px 12px": o segundo
     valor é o horizontal. No desktop é um valor só, igual nos quatro lados. */
  const folga = (corpo) => {
    const lados = valores(declaracao(corpo, "padding"));
    return avalia(lados.length > 1 ? lados[1] : lados[0], vw);
  };

  const maxima = avalia(declaracao(regra(CAIXA), "max-width"), vw);
  return Math.min(maxima, vw - 2 * folga(palco)) - 2 * folga(caixa);
}

function tamanhoDaFonte(vw) {
  const corpo = vw <= 720 ? regra(TITULO, telefone) : regra(TITULO);
  return avalia(declaracao(corpo, "font-size"), vw);
}

test('o hífen de "Bem-vindo." não pode quebrar a linha', () => {
  assert.match(regra(TITULO), /white-space: nowrap/);

  /*
   * E a proibição vale só para o prólogo. O h2 da continuação é uma frase
   * inteira — "Há sempre outro caminho para descobrir." — e proibir a quebra
   * ali jogaria o texto para fora da tela em vez de arrumá-lo.
   */
  assert.doesNotMatch(
    regra([".prologue-copy h1", ".journey-continuation h2"]),
    /white-space/,
  );
});

test("o título cabe numa linha só de 320px a 2560px", () => {
  /*
   * Proibir a quebra sem acertar o tamanho não arruma nada: o texto só passa
   * a transbordar em vez de dobrar. Medido antes desta conta: a 1826px a fonte
   * batia no teto de 11rem e pedia 793px numa caixa de 764px; a 375px parava
   * no piso de 4,6rem e pedia 332px numa caixa de 307px. Quebrava nas duas
   * pontas, por motivos opostos.
   */
  for (const vw of [320, 360, 375, 414, 560, 719, 720, 721, 800, 900, 1024, 1280, 1440, 1826, 2560]) {
    const disponivel = larguraDisponivel(vw);
    const pedido = tamanhoDaFonte(vw) * RAZAO * MARGEM;
    assert.ok(
      pedido <= disponivel,
      `a ${vw}px o título pede ${Math.round(pedido)}px numa caixa de ${Math.round(disponivel)}px`,
    );
  }
});
