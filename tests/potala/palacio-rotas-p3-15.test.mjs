import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ler = (caminho) => readFile(new URL(`../../outputs/${caminho}`, import.meta.url), "utf8");

/* O Palacio e servido hoje so como /palacio.html, onde o documento base e a
   raiz. Se um alias /palacio/ for criado, todo caminho relativo passaria a
   apontar para /palacio/... e daria 404 — foi assim que /blog/ e /admin/
   quebraram. Ancorar na raiz remove o risco antes que ele apareca. */
test("o Palacio nao depende do diretorio do documento", async () => {
  const html = await ler("palacio.html");

  for (const atributo of [/href="(?!\/|https?:|#|mailto:)[^"]+"/g, /src="(?!\/|https?:|data:)[^"]+"/g]) {
    assert.deepEqual(html.match(atributo) || [], [], `recurso relativo em palacio.html: ${atributo}`);
  }
  assert.match(html, /href="\/css\/palacio\.css"/);
  assert.match(html, /src="\/js\/palacio\/palace-controller\.js"/);
  assert.match(html, /href="\/media\/palacio-master\.webp"/);
  assert.match(html, /src="\/media\/palacio-master\.webp"/);
  assert.match(html, /href="\/transcender\.html"/);
});

test("as texturas da cena 3D sao carregadas a partir da raiz", async () => {
  const perfil = await ler("js/palacio/palace-profile.js");
  assert.match(perfil, /imageUrl: "\/media\/palacio-master\.webp"/);
  assert.match(perfil, /depthUrl: "\/media\/palacio-depth\.webp"/);
  assert.match(perfil, /mistMaskUrl: "\/media\/palacio-light-mask\.webp"/);
  /* skyMaskUrl e waterMaskUrl sao vazios de proposito neste perfil. */
  assert.match(perfil, /skyMaskUrl: ""/);
});

/* O destino e ancorado no call-site. transition-handoff.js e compartilhado com
   outras paginas e seu padrao continua sendo atendimentos-conceito.html. */
test("a transicao do Palacio aponta para a raiz sem alterar o modulo compartilhado", async () => {
  const [controlador, handoff] = await Promise.all([
    ler("js/palacio/palace-controller.js"), ler("js/chegada/transition-handoff.js"),
  ]);
  assert.match(controlador, /crossTo\(\{ destination: "\/transcender\.html"/);
  assert.doesNotMatch(controlador, /destination: "transcender\.html"/);
  assert.match(handoff, /destination = "atendimentos-conceito\.html"/);
  assert.doesNotMatch(handoff, /destination = "\/atendimentos-conceito\.html"/);
});
