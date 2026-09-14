import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";

import { catalogoDoPortal } from "../../outputs/js/conta/catalogo.js";
import { sementeDeDemonstracao } from "../../outputs/js/conta/dados-demonstracao.js";
import { FABRICAS, criarSalvo, hrefSeguro } from "../../outputs/js/conta/modelos.js";

const outputs = new URL("../../outputs/", import.meta.url);

async function paginaExiste(href) {
  const caminho = href.split("?")[0].replace(/^\//, "");
  await access(new URL(caminho, outputs));
}

test("todo item do catalogo abre uma pagina que existe", async () => {
  /* Recomendar um link quebrado e pior do que nao recomendar. */
  const catalogo = catalogoDoPortal();
  assert.ok(catalogo.filter((item) => item.tipo === "blog").length >= 1, "o Caderno de Travessia sumiu do catalogo");
  for (const item of catalogo) {
    await assert.doesNotReject(paginaExiste(item.href), item.href);
  }
});

test("todo item do catalogo pode ser salvo", () => {
  for (const item of catalogoDoPortal()) {
    assert.doesNotThrow(() => criarSalvo(item), item.titulo);
    assert.ok(Array.isArray(item.temas), `${item.titulo} sem temas`);
  }
});

test("a demonstracao cobre toda colecao e so aponta para paginas que existem", async () => {
  /*
   * As datas sao relativas a agora: com datas fixas, a "proxima aula" viraria
   * passado em uma semana e a demonstracao pareceria quebrada.
   */
  const agora = new Date(2026, 8, 14, 15);
  const semente = sementeDeDemonstracao({ usuarioId: "u1", agora });

  for (const colecao of Object.keys(FABRICAS)) assert.ok(Array.isArray(semente[colecao]), `sem ${colecao}`);

  const proximas = semente.agenda.filter((item) => new Date(item.inicio) > agora);
  assert.equal(proximas.length, semente.agenda.length, "a agenda de demonstracao nasceu com passado");

  const enderecos = [
    ...semente.salvos.map((item) => item.href),
    ...semente.historico.map((item) => item.href),
    ...semente.inscricoes.map((item) => item.conteudoHref).filter(Boolean),
    ...semente.agenda.map((item) => item.fonteHref).filter(Boolean),
    ...semente.notificacoes.map((item) => item.href).filter((href) => href && !href.startsWith("/meu-potala")),
  ];
  for (const href of enderecos) {
    assert.equal(hrefSeguro(href), href);
    await assert.doesNotReject(paginaExiste(href), href);
  }
});
