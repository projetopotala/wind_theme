import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { caminhoDaJornada } from "../../outputs/js/atendimentos-conceito.js";
import { mensagemDaSaude, proximoIndice } from "../../outputs/js/atendimentos-materia.js";
import { DEFAULT_BLOG_POSTS } from "../../outputs/js/blog/blog-data.js";

const html = readFileSync(new URL("../../outputs/transcendido.html", import.meta.url), "utf8");
const MATERIAS = ["saude", "vivemos", "investigar", "caminhos-do-cuidado"];

const secao = (id) => {
  const m = new RegExp(`<section[^>]*id="${id}"[^>]*>[\\s\\S]*?</section>`).exec(html);
  assert.ok(m, `seção ausente: ${id}`);
  return m[0];
};

test("cada matéria abre com prévia grande, capitular e slides de imagens ao lado", () => {
  for (const id of MATERIAS) {
    const bloco = secao(id);
    assert.match(bloco, /data-materia/, `${id}: sem matéria`);
    assert.match(bloco, /<em class="materia-abertura">/, `${id}: sem abertura em letra artística`);
    assert.match(bloco, /data-reading-action>Continuar a leitura</, `${id}: sem convite para expandir`);
    assert.match(bloco, /data-materia-recolher/, `${id}: sem como recolher a leitura`);

    const slides = [...bloco.matchAll(/<figure class="materia-slide[^"]*" data-slide-item="(\d+)"/g)].map((item) => Number(item[1]));
    assert.ok(slides.length >= 3, `${id}: só ${slides.length} slides`);
    assert.deepEqual(slides, slides.map((_, i) => i), `${id}: slides fora de ordem`);
    assert.equal((bloco.match(/materia-slide is-ativo/g) || []).length, 1, `${id}: precisa começar com um slide em cena`);
    for (const [, alt] of bloco.matchAll(/<span class="materia-slide__foto"><img [^>]*alt="([^"]*)"/g)) {
      assert.ok(alt.trim().length > 8, `${id}: imagem sem descrição`);
    }

    /* Todo parágrafo aponta para uma imagem que existe: a leitura nunca fica sem par. */
    const referencias = [...bloco.matchAll(/<p data-slide="(\d+)">/g)].map((item) => Number(item[1]));
    assert.ok(referencias.length > 5, `${id}: texto integral ausente`);
    for (const indice of referencias) assert.ok(indice < slides.length, `${id}: parágrafo aponta para o slide ${indice}`);
    assert.ok(new Set(referencias).size >= Math.min(3, slides.length), `${id}: a imagem quase não acompanha a leitura`);
  }
});

test("depois do texto vem um instante com a pessoa e, ao lado, para onde ir", () => {
  const slugs = new Set(DEFAULT_BLOG_POSTS.map((post) => post.slug));
  const interacoes = { saude: "data-saude-check", vivemos: "data-reflexao-leve", investigar: "data-anotacoes", reflexao: "data-reflection-feedback" };
  for (const [id, marca] of Object.entries(interacoes)) {
    const bloco = secao(id);
    assert.match(bloco, /class="conexao[ "]/, `${id}: sem conexão`);
    assert.ok(bloco.includes(marca), `${id}: sem a interação ${marca}`);
    assert.match(bloco, /conexao__rotulo">Indicações</, `${id}: sem indicações`);
    assert.match(bloco, /conexao__rotulo">No Blog</, `${id}: sem o Blog`);
    const artigos = [...bloco.matchAll(/href="artigo\.html\?post=([\w-]+)"/g)].map((item) => item[1]);
    assert.ok(artigos.length >= 2, `${id}: poucas leituras indicadas`);
    for (const slug of artigos) assert.ok(slugs.has(slug), `${id}: artigo inexistente no Blog: ${slug}`);
  }
  /* As três interações novas são diferentes entre si: nada de repetir o mesmo componente. */
  assert.equal(new Set(Object.values(interacoes)).size, 4);
});

test("a resposta sobre saúde acolhe e orienta, sem diagnosticar", () => {
  assert.deepEqual(mensagemDaSaude({}), { texto: "", recepcao: false });
  const atencao = mensagemDaSaude({ sono: "atencao", movimento: "atencao", alimentacao: "bem" });
  assert.equal(atencao.recepcao, true);
  assert.match(atencao.texto, /^Sono e movimento pedem atenção\./);
  const oscila = mensagemDaSaude({ vinculos: "oscila" });
  assert.equal(oscila.recepcao, false);
  assert.match(oscila.texto, /^Vínculos oscila\./);
  assert.match(mensagemDaSaude({ sono: "bem", alimentacao: "bem", movimento: "bem", vinculos: "bem" }).texto, /^Tudo em dia/);
  assert.match(mensagemDaSaude({ sono: "bem" }).texto, /^Até aqui, em dia/);
  for (const resposta of [atencao, oscila]) assert.doesNotMatch(resposta.texto, /diagnóstico|doença|você tem/i);
});

test("os slides dão a volta nos dois sentidos", () => {
  assert.equal(proximoIndice(3, 4, 1), 0);
  assert.equal(proximoIndice(0, 4, -1), 3);
  assert.equal(proximoIndice(2, 4, 0), 2);
  assert.equal(proximoIndice(5, 0, 1), 0);
});

test("a linha é a mesma a cada visita, varia as curvas e sai e volta da tela", () => {
  const medidas = { largura: 1280, altura: 12000, passo: 800 };
  const desenho = caminhoDaJornada(medidas);
  assert.equal(desenho, caminhoDaJornada(medidas), "a mesma semente desenha a mesma linha");
  assert.equal(caminhoDaJornada({ largura: 0, altura: 100 }), "");

  const pontos = [...desenho.matchAll(/C [-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+ ([-\d.]+) ([-\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.ok(pontos.length > 8, "curvas de menos para uma página longa");
  assert.ok(pontos.some(([x]) => x < 0), "a linha nunca sai pela esquerda");
  assert.ok(pontos.some(([x]) => x > medidas.largura), "a linha nunca sai pela direita");
  assert.ok(pontos.filter(([x]) => x >= 0 && x <= medidas.largura).length > pontos.length / 2, "a linha passa mais tempo fora do que dentro");
  for (let i = 1; i < pontos.length; i += 1) assert.ok(pontos[i][1] > pontos[i - 1][1], "a linha sempre desce");

  const distancias = pontos.slice(1).map(([, y], i) => Math.round(y - pontos[i][1]));
  assert.ok(new Set(distancias).size > distancias.length / 2, "as curvas têm o mesmo tamanho: parece senoide, não caminho");
});

test("no celular a linha sai da tela com menos frequência", () => {
  const conta = (estreito) => [...caminhoDaJornada({ largura: 390, altura: 12000, passo: 700, estreito }).matchAll(/C [-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+ ([-\d.]+) /g)]
    .filter((m) => Number(m[1]) < 0 || Number(m[1]) > 390).length;
  assert.ok(conta(true) < conta(false));
});
