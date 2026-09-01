import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const CSS_DIR = new URL("../../outputs/css/", import.meta.url);

/**
 * Declarações soltas fora de qualquer regra.
 *
 * O navegador as descarta em silêncio: nenhum erro no console, nenhum teste
 * falhando, e a página simplesmente perde aquelas propriedades. Foi assim que
 * o menu das seções perdeu `bottom`, `left` e o fundo de uma vez — a barra
 * saiu do rodapé e foi parar no fim do documento, e só a medição de posição
 * acusou.
 *
 * A varredura é grosseira de propósito: percorre o arquivo contando chaves e
 * só olha o que está em profundidade zero, onde nada além de seletores,
 * comentários e regras-at pode aparecer.
 */
function declaracoesForaDeRegra(css) {
  const semComentarios = css.replace(/\/\*[\s\S]*?\*\//g, (bloco) => bloco.replace(/[^\n]/g, " "));
  const achados = [];
  let profundidade = 0;
  let linha = 1;
  let pendente = "";

  for (const caractere of semComentarios) {
    if (caractere === "\n") linha += 1;
    if (caractere === "{") {
      profundidade += 1;
      pendente = "";
      continue;
    }
    if (caractere === "}") {
      profundidade = Math.max(0, profundidade - 1);
      pendente = "";
      continue;
    }
    if (profundidade > 0) continue;

    if (caractere === ";") {
      // No topo do arquivo, um ponto e vírgula só é legítimo depois de uma
      // regra-at sem bloco (@import, @charset).
      const texto = pendente.trim();
      if (texto && !texto.startsWith("@")) achados.push({ linha, texto: texto.slice(0, 60) });
      pendente = "";
      continue;
    }
    pendente += caractere;
  }

  return achados;
}

test("nenhuma declaração CSS fica fora de uma regra", async () => {
  const arquivos = (await readdir(CSS_DIR)).filter((nome) => nome.endsWith(".css"));
  assert.ok(arquivos.length > 0);

  for (const nome of arquivos) {
    const css = await readFile(new URL(nome, CSS_DIR), "utf8");
    const soltas = declaracoesForaDeRegra(css);
    assert.deepEqual(
      soltas,
      [],
      `${nome} tem declarações fora de regra (silenciosamente descartadas): ${JSON.stringify(soltas)}`,
    );
  }
});

test("as chaves fecham na mesma conta em que abrem", async () => {
  const arquivos = (await readdir(CSS_DIR)).filter((nome) => nome.endsWith(".css"));

  for (const nome of arquivos) {
    const css = (await readFile(new URL(nome, CSS_DIR), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
    let profundidade = 0;
    for (const caractere of css) {
      if (caractere === "{") profundidade += 1;
      if (caractere === "}") profundidade -= 1;
      assert.ok(profundidade >= 0, `${nome} fecha uma chave que não foi aberta`);
    }
    assert.equal(profundidade, 0, `${nome} deixa ${profundidade} chave(s) abertas`);
  }
});
