import assert from "node:assert/strict";
import test from "node:test";
import { resolveRequestPath } from "../../scripts/serve-outputs.mjs";

test("mapeia a raiz para a Chegada", () => {
  assert.match(resolveRequestPath("/").replaceAll("\\", "/"), /outputs\/transcender\.html$/);
});

test("bloqueia caminhos que escapam de outputs", () => {
  assert.equal(resolveRequestPath("/../package.json"), null);
  assert.equal(resolveRequestPath("/%2e%2e/package.json"), null);
});

test("a prévia atende pedidos de trecho", async () => {
  /*
   * Responder 200 a um pedido de trecho é dizer que não se sabe recortar, e o
   * navegador tira suas conclusões disso sem reclamar de nada.
   *
   * O caso que revelou isto foi um vídeo movido pela rolagem: ele carregava,
   * `readyState` chegava a 4, e `seekable` ficava VAZIO — escrever em
   * `currentTime` era descartado em silêncio e o fundo travava no primeiro
   * quadro. Aquele vídeo já não existe, mas a correção continua valendo: é
   * comportamento HTTP correto, e o próximo arquivo grande servido daqui vai
   * precisar dele do mesmo jeito.
   */
  const { createPreviewServer } = await import("../../scripts/serve-outputs.mjs");
  const servidor = createPreviewServer();
  await new Promise((pronto) => servidor.listen(0, "127.0.0.1", pronto));
  const porta = servidor.address().port;
  const alvo = `http://127.0.0.1:${porta}/media/home-travessia.webp`;

  try {
    const trecho = await fetch(alvo, { headers: { Range: "bytes=0-99" } });
    assert.equal(trecho.status, 206, "um pedido de trecho tem de ser respondido com trecho");
    assert.match(trecho.headers.get("content-range") ?? "", /^bytes 0-99\/\d+$/);
    assert.equal(trecho.headers.get("content-length"), "100");

    const inteiro = await fetch(alvo);
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
