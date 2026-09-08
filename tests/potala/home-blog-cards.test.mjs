import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { NOVIDADES_PADRAO } from "../../outputs/js/home/journey-data.js";
import { mountJourney, renderRegion } from "../../outputs/js/home/home-scenes.js";

test("a Home abre com as quatro notícias mais recentes do Caderno", () => {
  assert.deepEqual(NOVIDADES_PADRAO.map(({ title }) => title), [
    "Oráculo de hoje: a carta da Ponte",
    "Novos profissionais chegaram ao Instituto",
    "O que a borra de café ainda tem a dizer",
    "Onde a ansiedade se instala no corpo",
  ]);
});

test("as notícias usam as capas fotográficas e abrem o artigo completo", () => {
  const expectedCovers = [
    "media/journey-inspiracao.webp",
    "media/home-travessia.webp",
    "media/chegada-landscape.webp",
    "media/saude-integrativa-escuta.webp",
  ];
  assert.deepEqual(NOVIDADES_PADRAO.map(({ image }) => image), expectedCovers);
  for (const post of NOVIDADES_PADRAO) assert.match(post.href, /^artigo\.html\?post=/);

  const card = renderRegion(NOVIDADES_PADRAO[0], 0, null, new Map());
  assert.match(card, /class="region-capa"/);
  assert.match(card, /<img[^>]+journey-inspiracao\.webp/);
  assert.match(card, /class="region-news-meta"/);
});

test("os grupos recebem uma entrada editorial curta, não um título solto", () => {
  const target = { innerHTML:"", querySelectorAll:() => [], querySelector:() => null };
  mountJourney(target, {
    regions:[
      { id:"n1", title:"N1", href:"#", tags:["recente"] },
      { id:"n2", title:"N2", href:"#", tags:["recente"] },
      { id:"s1", title:"S1", href:"#", tags:[] },
      { id:"s2", title:"S2", href:"#", tags:[] },
    ],
    discoveries:[],
  });
  assert.match(target.innerHTML, /Caderno de Travessia/);
  assert.match(target.innerHTML, /Acontece no Potala/);
  assert.match(target.innerHTML, /Ecossistema Potala/);
  assert.match(target.innerHTML, /Caminhos para conhecer/);
});

test("no celular o cabeçalho e os dois cards ocupam três linhas distintas", async () => {
  const css = await readFile(new URL("../../outputs/css/home-journey.css", import.meta.url), "utf8");
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.region-stage:has\(\.journey-trecho\)[\s\S]*?grid-template-rows: auto repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.region-stage:has\(\.journey-trecho\) \.region-content \{ grid-row: auto; \}/);
  assert.match(css, /\[data-card-kind="novidade"\]:not\(\.is-expanded\) \.region-content[\s\S]*?aspect-ratio: 4 \/ 3/);
});
