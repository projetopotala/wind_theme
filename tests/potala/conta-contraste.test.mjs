/*
 * MP-FIX-02 — CONTRASTE DOS TEXTOS INFORMATIVOS DO MEU POTALA (WCAG 2.2, 1.4.3).
 *
 * O teste não confere só que uma classe "usa a variável certa": ele resolve as
 * cores efetivas de conta.css — tokens de :root, transparências e opacidade —
 * e calcula a razão de contraste de cada texto contra os papéis em que ele
 * aparece no Meu Potala. Um ouro trocado por um mais claro, ou uma opacidade
 * nova sobre a contagem dos filtros, reprova aqui.
 *
 * Os fundos também saem de conta.css — o papel da página e as camadas
 * translúcidas dos cartões e das pastilhas sobre ele — e conferem com os valores
 * medidos no navegador (#efe4d3, #f9f2e5 e #f9f1e4).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = (await readFile(new URL("../../outputs/css/conta.css", import.meta.url), "utf8")).replace(/\r\n/g, "\n");

function hex(valor) {
  const limpo = valor.trim().replace("#", "");
  return { r: parseInt(limpo.slice(0, 2), 16), g: parseInt(limpo.slice(2, 4), 16), b: parseInt(limpo.slice(4, 6), 16), a: 1 };
}

function rgba(valor) {
  const [r, g, b, a = 1] = valor.match(/[\d.]+/g).map(Number);
  return { r, g, b, a };
}

const TOKENS = Object.fromEntries([...css.match(/:root\s*\{([\s\S]*?)\n\}/)[1].matchAll(/(--conta-[\w-]+):\s*([^;]+);/g)].map(([, nome, valor]) => [nome, valor.trim()]));

function cor(valor) {
  const token = valor.match(/^var\((--conta-[\w-]+)\)$/)?.[1];
  const resolvido = token ? TOKENS[token] : valor;
  assert.ok(resolvido, `token sem valor: ${valor}`);
  return resolvido.startsWith("#") ? hex(resolvido) : rgba(resolvido);
}

/* O bloco de uma regra pelo seletor exato, em uma linha ou em várias. */
function regra(seletor) {
  const escapado = seletor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const achado = css.match(new RegExp(`(?:^|\\n)${escapado}\\s*\\{([^}]*)\\}`));
  assert.ok(achado, `regra não encontrada: ${seletor}`);
  return achado[1];
}

function propriedade(seletor, nome, { opcional = false } = {}) {
  if (opcional && !css.includes(`\n${seletor} {`)) return null;
  return regra(seletor).match(new RegExp(`(?:^|[;\\s])${nome}:\\s*([^;]+);`))?.[1]?.trim() ?? null;
}

const misturar = (frente, fundo) => ({
  r: frente.r * frente.a + fundo.r * (1 - frente.a),
  g: frente.g * frente.a + fundo.g * (1 - frente.a),
  b: frente.b * frente.a + fundo.b * (1 - frente.a),
  a: 1,
});

function luminancia({ r, g, b }) {
  const canal = (valor) => {
    const v = valor / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

function contraste(frente, fundo, opacidade = 1) {
  const texto = misturar({ ...frente, a: frente.a * opacidade }, fundo);
  const [claro, escuro] = [luminancia(texto), luminancia(fundo)].sort((a, b) => b - a);
  return (claro + 0.05) / (escuro + 0.05);
}

const FUNDO_DA_PAGINA = cor(TOKENS["--conta-papel-fundo"]);
const FUNDO_DO_CARTAO = misturar(cor(propriedade(".mp-cartao", "background")), FUNDO_DA_PAGINA);
const FUNDO_DO_CARTAO_EM_FOCO = misturar(cor(propriedade(".mp-cartao:hover", "background")), FUNDO_DA_PAGINA);
const FUNDO_DA_PASTILHA = misturar(cor(propriedade(".mp-pastilha", "background")), FUNDO_DA_PAGINA);
const MINIMO = 4.5;

test("MP-03: os fundos calculados de conta.css são os medidos no navegador", () => {
  const arredondar = ({ r, g, b }) => [r, g, b].map(Math.round);
  assert.deepEqual(arredondar(FUNDO_DA_PAGINA), [239, 228, 211]);
  assert.deepEqual(arredondar(FUNDO_DO_CARTAO), [249, 242, 229]);
  assert.deepEqual(arredondar(FUNDO_DA_PASTILHA), [249, 241, 228]);
});

test("MP-03: textos dourados informativos passam de 4,5:1 em todos os papéis onde aparecem", () => {
  const casos = [
    [".mp-kicker", [FUNDO_DA_PAGINA]],
    [".mp-cartao-tipo", [FUNDO_DA_PAGINA, FUNDO_DO_CARTAO, FUNDO_DO_CARTAO_EM_FOCO]],
    [".mp-linha-quando", [FUNDO_DA_PAGINA]],
    [".mp-agenda-data span", [FUNDO_DA_PAGINA]],
    [".mp-pastilha small", [FUNDO_DA_PASTILHA]],
  ];
  for (const [seletor, fundos] of casos) {
    const valor = propriedade(seletor, "color");
    assert.ok(valor, `${seletor} sem cor`);
    for (const fundo of fundos) {
      const razao = contraste(cor(valor), fundo);
      assert.ok(razao >= MINIMO, `${seletor}: ${razao.toFixed(2)}:1 com ${valor}`);
    }
  }
});

test("MP-03: o contador de avisos novos (creme sobre ouro) passa de 4,5:1", () => {
  const razao = contraste(cor(propriedade(".mp-contador", "color")), cor(propriedade(".mp-contador", "background")));
  assert.ok(razao >= MINIMO, `${razao.toFixed(2)}:1`);
});

test("MP-03: a contagem dos filtros de Salvos passa de 4,5:1, escolhido ou não", () => {
  const baseOpacidade = Number(propriedade(".mp-filtro-conta", "opacity") ?? 1);
  const escolhidoOpacidade = Number(propriedade('.mp-filtros a[aria-current="true"] .mp-filtro-conta', "opacity", { opcional: true }) ?? baseOpacidade);

  /* Não escolhido: a cor do link (tinta suave) sobre o papel da página. */
  const naoEscolhido = contraste(cor(TOKENS["--conta-tinta-suave"]), FUNDO_DA_PAGINA, baseOpacidade);
  assert.ok(naoEscolhido >= MINIMO, `filtro não escolhido: ${naoEscolhido.toFixed(2)}:1`);

  /* Escolhido: creme sobre o marrom do filtro ativo. */
  const ativo = '.mp-filtros a[aria-current="true"]';
  const escolhido = contraste(cor(propriedade(ativo, "color")), cor(propriedade(ativo, "background")), escolhidoOpacidade);
  assert.ok(escolhido >= MINIMO, `filtro escolhido: ${escolhido.toFixed(2)}:1`);
});

test("MP-03: o ouro de letra é o mesmo ouro da marca, só mais escuro", () => {
  const paraHsl = ({ r, g, b }) => {
    const [vr, vg, vb] = [r, g, b].map((v) => v / 255);
    const max = Math.max(vr, vg, vb);
    const min = Math.min(vr, vg, vb);
    const l = (max + min) / 2;
    const d = max - min;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    let h = 0;
    if (d) h = max === vr ? ((vg - vb) / d) % 6 : max === vg ? (vb - vr) / d + 2 : (vr - vg) / d + 4;
    return { h: (h * 60 + 360) % 360, s, l };
  };
  const marca = paraHsl(cor(TOKENS["--conta-ouro"]));
  const letra = paraHsl(cor(TOKENS["--conta-ouro-texto"]));
  assert.ok(Math.abs(marca.h - letra.h) < 2, `matiz mudou: ${marca.h.toFixed(1)} → ${letra.h.toFixed(1)}`);
  assert.ok(Math.abs(marca.s - letra.s) < 0.03, "saturação mudou");
  assert.ok(letra.l < marca.l, "o ouro de letra precisa ser mais escuro");
  /* O ouro velho continua nos elementos que não são texto. */
  assert.match(css, /\.mp-nav a\[aria-current="page"\] \{ border-bottom-color: var\(--conta-ouro\);/);
  assert.match(css, /\.mp-linha > li\[data-origem="instituto"\] \.mp-linha-marco \{ background: var\(--conta-ouro\); \}/);
});
