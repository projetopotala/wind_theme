import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manifesto = JSON.parse(
  await readFile(new URL("../../outputs/media/manifest.json", import.meta.url), "utf8"),
);

test("o manifesto lista as imagens com dimensão e tamanho", () => {
  assert.ok(Array.isArray(manifesto.imagens));
  assert.ok(manifesto.imagens.length > 0, "nenhuma imagem encontrada");
  for (const imagem of manifesto.imagens) {
    assert.match(imagem.arquivo, /\.(webp|png|jpg|jpeg)$/i);
    assert.ok(Number.isInteger(imagem.largura) && imagem.largura > 0, imagem.arquivo);
    assert.ok(Number.isInteger(imagem.altura) && imagem.altura > 0, imagem.arquivo);
    assert.ok(Number.isInteger(imagem.bytes) && imagem.bytes > 0, imagem.arquivo);
  }
});

/* Ordenado para que duas execuções do script produzam o mesmo arquivo. Sem
   isso, cada build vira um diff no git sem nenhuma mudança real. */
test("a ordem é estável", () => {
  const nomes = manifesto.imagens.map((imagem) => imagem.arquivo);
  assert.deepEqual(nomes, [...nomes].sort());
});

test("o próprio manifesto não se lista", () => {
  assert.ok(!manifesto.imagens.some((imagem) => imagem.arquivo === "manifest.json"));
});

/*
 * A parte que decide o conteúdo do manifesto, conferida direto.
 *
 * Olhar só a saída do script não serve: `readdir` já devolve ordenado em
 * alguns sistemas de arquivos e não em outros, então um teste sobre a saída
 * passaria aqui e falharia na máquina de outra pessoa.
 */
test("a seleção filtra o que não é imagem e devolve em ordem", async () => {
  const { manifestEntries } = await import("../../scripts/build-media-manifest.mjs");

  assert.deepEqual(
    manifestEntries(["zebra.webp", "manifest.json", "abelha.PNG", "notas.txt", "foto.jpeg"]),
    ["abelha.PNG", "foto.jpeg", "zebra.webp"],
  );
  assert.deepEqual(manifestEntries([]), []);
});
