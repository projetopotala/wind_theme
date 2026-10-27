import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { enderecoDoSite } from "../../outputs/js/shared/endereco-do-site.js";
import { CAMINHO_MANIFESTO } from "../../outputs/js/admin/admin-media-picker.js";

const ler = (caminho) => readFile(new URL(`../../outputs/${caminho}`, import.meta.url), "utf8");

/* A central operacional e servida em /admin e em /admin/. Com a barra final o
   documento base vira /admin/, e todo caminho relativo passa a apontar para
   /admin/... e da 404: foi assim que a folha de estilo e o script de entrada
   sumiram. */
test("a central operacional nao depende da barra final em /admin/", async () => {
  const html = await ler("admin.html");

  for (const atributo of [/href="(?!\/|https?:|#|mailto:)[^"]+"/g, /src="(?!\/|https?:|data:)[^"]+"/g]) {
    assert.deepEqual(html.match(atributo) || [], [], `recurso relativo em admin.html: ${atributo}`);
  }

  assert.match(html, /href="\/css\/admin\.css"/);
  assert.match(html, /href="\/css\/admin-agenda\.css"/);
  assert.match(html, /src="\/vendor\/supabase\.js"/);
  assert.match(html, /src="\/js\/admin\/admin-entry\.js"/);
  assert.match(html, /src="\/media\/potala-mark-transparent\.png"/);
  assert.match(html, /href="\/transcendido\.html"/);
  assert.match(html, /src="\/transcendido\.html\?admin-preview=1"/);
  assert.doesNotMatch(html, /use href="media\//);
});

test("o que a central monta em tempo de execucao tambem nao depende da barra", async () => {
  const [controller, picker, blocos, icones] = await Promise.all([
    ler("js/admin/admin-controller.js"), ler("js/admin/admin-media-picker.js"),
    ler("js/admin/admin-blocks-list.js"), ler("js/admin/icones.js"),
  ]);

  assert.equal(CAMINHO_MANIFESTO, "/media/manifest.json");
  assert.doesNotMatch(controller, /fetch\("media\//);
  assert.match(icones, /SPRITE = "\/media\/icones-admin\.svg"/);
  assert.match(picker, /enderecoDoSite\(`media\/\$\{arquivo\}`\)/);
  assert.match(blocos, /enderecoDoSite\(imagem\)/);
});

/* O endereco guardado continua relativo: e o valor que vai para o campo e para
   o banco. So a leitura e ancorada. */
test("o endereco guardado da imagem continua relativo", async () => {
  const picker = await ler("js/admin/admin-media-picker.js");
  assert.match(picker, /onPick\?\.\(`media\/\$\{botao\.dataset\.arquivo\}`\)/);
});

test("enderecoDoSite ancora na raiz sem tocar no que ja e absoluto", () => {
  assert.equal(enderecoDoSite("media/capa.webp"), "/media/capa.webp");
  assert.equal(enderecoDoSite("transcendido.html"), "/transcendido.html");
  assert.equal(enderecoDoSite("/media/capa.webp"), "/media/capa.webp");
  assert.equal(enderecoDoSite("https://cdn.exemplo/c.webp"), "https://cdn.exemplo/c.webp");
  assert.equal(enderecoDoSite("//cdn.exemplo/c.webp"), "//cdn.exemplo/c.webp");
  assert.equal(enderecoDoSite("data:image/png;base64,AA"), "data:image/png;base64,AA");
  assert.equal(enderecoDoSite("#ancora"), "#ancora");
  assert.equal(enderecoDoSite(""), "");
  assert.equal(enderecoDoSite(null), "");
});
