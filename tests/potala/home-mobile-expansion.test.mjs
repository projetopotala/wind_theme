import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const CSS = new URL("../../outputs/css/home-journey.css", import.meta.url);

/**
 * Especificidade de um seletor, no nível de detalhe que este arquivo exige.
 *
 * `:has()` é o motivo do cálculo existir: ele NÃO pesa como uma pseudoclasse
 * comum, e sim como o argumento que carrega dentro. Foi exatamente aí que a
 * regra do telefone perdeu na primeira tentativa — escrita sem `[data-side]`,
 * ela pesava menos que a do desktop, que traz `[data-side="left"]` no `:has()`,
 * e o navegador seguia montando a grade em três colunas sem avisar ninguém.
 */
function especificidade(seletor) {
  const plano = seletor.replace(/:has\(([^)]*)\)/g, " $1 ");
  const ids = plano.match(/#[\w-]+/g)?.length ?? 0;
  const classes = plano.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g)?.length ?? 0;
  const elementos = plano.match(/(^|[\s>+~])[a-z][\w-]*/g)?.length ?? 0;
  return [ids, classes, elementos];
}

function compara(a, b) {
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

const css = await readFile(CSS, "utf8");

/* O bloco do telefone: a partir da abertura da media query até a chave que a
   fecha, contando as chaves internas para não parar na primeira regra. */
function blocoDaMediaQuery(fonte, condicao) {
  const inicio = fonte.indexOf(condicao);
  assert.notEqual(inicio, -1, `media query ausente: ${condicao}`);
  let profundidade = 0;
  for (let i = fonte.indexOf("{", inicio); i < fonte.length; i += 1) {
    if (fonte[i] === "{") profundidade += 1;
    if (fonte[i] === "}") {
      profundidade -= 1;
      if (profundidade === 0) return { inicio, fim: i + 1, texto: fonte.slice(inicio, i + 1) };
    }
  }
  throw new Error(`media query sem fechamento: ${condicao}`);
}

const telefone = blocoDaMediaQuery(css, "@media (max-width: 720px)");

const ABERTURA = /\.journey-pair:has\([^)]*is-expanded[^)]*\)\s+\.region-stage/g;

test("o telefone desfaz as três colunas da abertura lateral", () => {
  const todas = [...css.matchAll(ABERTURA)];
  assert.ok(todas.length >= 2, "faltam as regras de abertura do bloco");

  /* Só o que está DENTRO do bloco do telefone: a prévia do painel tem uma
     regra parecida, com `.is-admin-preview` na frente, e ela não responde por
     este defeito. */
  const noTelefone = todas.filter((m) => m.index > telefone.inicio && m.index < telefone.fim);
  assert.equal(noTelefone.length, 1, "o telefone precisa de uma — e só uma — regra que desfaça a abertura lateral");

  const doDesktop = todas.filter((m) => m.index < telefone.inicio);
  assert.ok(doDesktop.length >= 2, "as regras de abertura do desktop sumiram");

  /* Vencer por ordem só vale depois de empatar em peso: uma regra mais leve
     perde onde quer que esteja escrita. */
  for (const regra of doDesktop) {
    assert.ok(
      compara(especificidade(noTelefone[0][0]), especificidade(regra[0])) >= 0,
      `a regra do telefone pesa menos que "${regra[0]}" e seria descartada`,
    );
    assert.ok(noTelefone[0].index > regra.index, "a regra do telefone precisa vir depois da do desktop");
  }
});

test("no telefone o palco aberto continua com uma coluna de conteúdo", () => {
  const regra = telefone.texto.match(/\.journey-pair:has\([^)]*is-expanded[^)]*\)\s+\.region-stage\s*\{([^}]*)\}/);
  assert.ok(regra, "a regra do telefone não declara nada");
  const colunas = regra[1].match(/grid-template-columns:\s*([^;]+);/);
  assert.ok(colunas, "a regra do telefone não redefine as colunas");
  assert.equal(
    colunas[1].split(/\s+(?![^(]*\))/).filter(Boolean).length,
    2,
    "abrir para o lado precisa de dois lados; no telefone há uma coluna de conteúdo só",
  );
});

test("no telefone o bloco aberto não passa da faixa dele", () => {
  const regra = telefone.texto.match(/\.journey-region\.is-expanded\s+\.region-content\s*\{([^}]*)\}/);
  assert.ok(regra, "falta a regra do bloco aberto no telefone");
  assert.match(
    regra[1],
    /max-height:\s*100%/,
    "sem teto na faixa, o bloco aberto desce por cima do bloco de baixo",
  );
});
