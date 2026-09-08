import assert from "node:assert/strict";
import test from "node:test";
import { resolveRequestPath } from "../../scripts/serve-outputs.mjs";

test("mapeia a raiz para a Chegada", () => {
  assert.match(resolveRequestPath("/").replaceAll("\\", "/"), /outputs\/transcender\.html$/);
});

test("os painéis abrem sem o sufixo html", () => {
  assert.match(resolveRequestPath("/admin").replaceAll("\\", "/"), /outputs\/admin\.html$/);
  assert.match(resolveRequestPath("/blog").replaceAll("\\", "/"), /outputs\/blog-admin\.html$/);
});

test("bloqueia caminhos que escapam de outputs", () => {
  assert.equal(resolveRequestPath("/../package.json"), null);
  assert.equal(resolveRequestPath("/%2e%2e/package.json"), null);
});

test("a prévia atende pedidos de trecho, senão vídeo nenhum pode ser rebobinado", async () => {
  /*
   * O fundo da jornada é um vídeo movido pela rolagem: cada rolagem escreve
   * `currentTime`, e para isso o navegador precisa buscar dentro do arquivo.
   * Buscar é pedir um TRECHO — e um servidor que responde 200 com o arquivo
   * inteiro está dizendo que não sabe recortar.
   *
   * O sintoma não é um erro: o vídeo carrega, `readyState` chega a 4, e
   * `seekable` fica vazio. Escrever em `currentTime` é silenciosamente
   * descartado, e o fundo trava no primeiro quadro. Foi exatamente o que
   * aconteceu aqui, e custou uma investigação até o servidor virar suspeito.
   */
  const { createPreviewServer } = await import("../../scripts/serve-outputs.mjs");
  const servidor = createPreviewServer();
  await new Promise((pronto) => servidor.listen(0, "127.0.0.1", pronto));
  const porta = servidor.address().port;

  try {
    const trecho = await fetch(`http://127.0.0.1:${porta}/media/home-travessia.mp4`, {
      headers: { Range: "bytes=0-99" },
    });

    assert.equal(trecho.status, 206, "um pedido de trecho tem de ser respondido com trecho");
    assert.match(trecho.headers.get("content-range") ?? "", /^bytes 0-99\/\d+$/);
    assert.equal(trecho.headers.get("content-length"), "100");

    const inteiro = await fetch(`http://127.0.0.1:${porta}/media/home-travessia.mp4`);
    assert.equal(inteiro.status, 200, "sem cabeçalho de trecho, o arquivo vem inteiro");
    assert.equal(
      inteiro.headers.get("accept-ranges"),
      "bytes",
      "é este cabeçalho que anuncia ao navegador que dá para buscar",
    );
  } finally {
    await new Promise((pronto) => servidor.close(pronto));
  }
});
