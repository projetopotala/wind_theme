import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  applyElement, areaDestacada, createPageElementsRepository, ehPrevia, escalaDaPrevia, fetchPublicPageElements, filtrarSecoes,
  numeroDaSecao, urlDaPrevia, validMediaUrl,
} from "../../outputs/js/home/page-editor.js";

test("a página encolhe ao lado do painel: a prévia é a própria página, na largura da tela, reduzida", async () => {
  /* A prévia é a mesma página, marcada para não montar o editor dentro dela. */
  assert.equal(urlDaPrevia("https://potala.example/atendimentos-conceito.html#ensaio-cursos"),
    "https://potala.example/atendimentos-conceito.html?previa-editor=1");
  assert.equal(ehPrevia("https://potala.example/atendimentos-conceito.html?previa-editor=1"), true);
  assert.equal(ehPrevia("https://potala.example/atendimentos-conceito.html"), false);
  /* No computador ela guarda a largura da tela (mesma composição) e reduz a
     escala para caber no espaço que sobra. */
  assert.deepEqual(escalaDaPrevia({ larguraDaTela: 1280, alturaDaTela: 800, area: { width: 760, height: 800 } }),
    { largura: 1280, altura: 1347, escala: 0.594, empilhada: false });
  /* No celular e no tablet ela fica em cima do painel, em tamanho real e com
     a altura da tela: uma prévia baixa demais faria a página esconder as
     fotos (a janela da cena fecha quando não há altura para foto e texto). */
  assert.deepEqual(escalaDaPrevia({ larguraDaTela: 390, alturaDaTela: 844, area: { width: 390, height: 304 } }),
    { largura: 390, altura: 780, escala: 1, empilhada: true });
  assert.deepEqual(escalaDaPrevia({ larguraDaTela: 820, alturaDaTela: 1180, area: { width: 820, height: 1116 } }),
    { largura: 820, altura: 1116, escala: 1, empilhada: true });

  const js = await readFile(new URL("../../outputs/js/home/page-editor.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../../outputs/css/home-page-editor.css", import.meta.url), "utf8");
  assert.match(js, /<iframe class="page-editor-previa" title="Prévia da página"/);
  assert.doesNotMatch(js, /page-editor-backdrop/, "nada cobre mais a página: ela fica ao lado");
  assert.match(js, /ehPrevia\(/);
  assert.match(js, /applyElement\(camposDaPrevia\.get\(record\.element_key\), record, documentoDaPrevia\)/, "o que é salvo aparece na prévia");
  assert.match(css, /\.page-editor-overlay \{[^}]*display: grid;[^}]*grid-template-columns: minmax\(0, 1fr\) min\(100%, 520px\);/);
  assert.match(css, /\.page-editor-previa \{[^}]*transform-origin: 0 0;/);
  assert.match(css, /@media \(max-width: 980px\) \{[\s\S]*?\.page-editor-overlay \{[^}]*grid-template-rows:/);
  /* Empilhada, um botão abre a prévia inteira e outro volta aos campos. */
  assert.match(js, /data-editor-ver-previa/);
  assert.match(css, /\.page-editor-overlay\.is-previa-inteira \{[^}]*grid-template-rows:/);
});

test("as seções do painel têm número e se encontram pela busca, sem depender de acento ou maiúscula", () => {
  const secoes = [
    { id: "inicio", label: "Abertura · Recepção" },
    { id: "ensaio-saude-integrativa", label: "Saúde integrativa" },
    { id: "ensaio-cultura", label: "Arte e cultura" },
    { id: "ensaio-programacao", label: "Programação" },
  ];
  assert.equal(numeroDaSecao(0), "01");
  assert.equal(numeroDaSecao(13), "14");
  assert.deepEqual(filtrarSecoes(secoes, "").map((s) => s.id), secoes.map((s) => s.id));
  assert.deepEqual(filtrarSecoes(secoes, "saude").map((s) => s.id), ["ensaio-saude-integrativa"]);
  assert.deepEqual(filtrarSecoes(secoes, "PROGRAMAÇÃO").map((s) => s.id), ["ensaio-programacao"]);
  assert.deepEqual(filtrarSecoes(secoes, "recepcao").map((s) => s.id), ["inicio"]);
  /* O número também encontra: "03" leva à terceira seção. */
  assert.deepEqual(filtrarSecoes(secoes, "03").map((s) => s.id), ["ensaio-cultura"]);
});

test("o destaque cobre só a parte da seção que está na tela", () => {
  assert.deepEqual(areaDestacada({ top: -300, bottom: 500 }, 800), { top: 0, height: 500 });
  assert.deepEqual(areaDestacada({ top: 200, bottom: 1400 }, 800), { top: 200, height: 600 });
  assert.equal(areaDestacada({ top: 900, bottom: 1500 }, 800), null, "fora da tela, sem destaque");
  assert.equal(areaDestacada({ top: -900, bottom: -10 }, 800), null);
});

test("o painel lista as seções em vez de um menu, destaca a escolhida e mantém Salvar sempre à vista", async () => {
  const js = await readFile(new URL("../../outputs/js/home/page-editor.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../../outputs/css/home-page-editor.css", import.meta.url), "utf8");
  assert.doesNotMatch(js, /<select data-editor-section>/, "o menu suspenso de seções saiu");
  assert.match(js, /data-editor-busca/);
  assert.match(js, /data-editor-secoes/);
  assert.match(js, /aria-current/);
  assert.match(js, /page-editor-destaque/);
  assert.match(js, /scrollTo\(\{ top: /, "escolher uma seção leva a página até ela");
  assert.match(js, /class="page-editor-footer"/);
  /* Cabeçalho, lista e rodapé fixos; só os campos rolam. */
  assert.match(css, /\.page-editor-panel \{[^}]*display: flex;[^}]*flex-direction: column;/);
  assert.match(css, /\.page-editor-body \{[^}]*overflow-y: auto;/);
  assert.match(css, /\.page-editor-destaque \{[^}]*position: fixed;[^}]*box-shadow: 0 0 0 100vmax/);
});

test("URLs de mídia aceitam caminhos e HTTPS, mas não scripts ou protocolos embutidos", () => {
  assert.equal(validMediaUrl("media/ensaio.webp", "https://potala.example/"), true);
  assert.equal(validMediaUrl("https://cdn.example.org/video.mp4"), true);
  assert.equal(validMediaUrl("javascript:alert(1)"), false);
  assert.equal(validMediaUrl("data:text/html,<script>"), false);
  assert.equal(validMediaUrl("//outro-site.example/x.webp"), false);
});

test("texto vindo do banco é aplicado como texto, sem injetar HTML", () => {
  const node = { textContent: "Título antigo" };
  const field = { kind: "text", selector: "h2", root: { querySelector: () => node } };
  assert.equal(applyElement(field, { kind: "text", value: "<script>não executar</script>" }, {}), true);
  assert.equal(node.textContent, "<script>não executar</script>");
});

test("persistência usa a tabela da página e associa a escrita ao usuário autenticado", async () => {
  const calls = [];
  const client = {
    from(table) {
      calls.push(["table", table]);
      return {
        select(columns) { calls.push(["select", columns]); return { eq: async (...args) => {
          calls.push(["eq", ...args]); return { data: [{ element_key: "inicio:title", kind: "text", value: "Novo" }], error: null };
        } }; },
        upsert(rows, options) { calls.push(["upsert", rows, options]); return Promise.resolve({ error: null }); },
      };
    },
  };
  const repository = createPageElementsRepository(client);
  assert.equal((await repository.list())[0].value, "Novo");
  await repository.save([{ element_key: "inicio:title", kind: "text", value: "Novo", media_type: null, alt_text: "" }], "user-123");
  assert.deepEqual(calls.find(([name]) => name === "eq"), ["eq", "page_slug", "atendimentos-conceito"]);
  const row = calls.find(([name]) => name === "upsert")[1][0];
  assert.equal(row.updated_by, "user-123");
  assert.equal(row.element_key, "inicio:title");
});

test("leitura pública usa somente a chave publicável e filtra a página", async () => {
  let request;
  const rows = await fetchPublicPageElements({
    config: { url: "https://potala.supabase.co", publishableKey: "sb_publishable_test" },
    fetcher: async (url, options) => { request = { url, options }; return { ok: true, json: async () => [] }; },
  });
  assert.deepEqual(rows, []);
  assert.equal(request.url.searchParams.get("page_slug"), "eq.atendimentos-conceito");
  assert.equal(request.options.headers.apikey, "sb_publishable_test");
  assert.equal(request.options.headers.Authorization, undefined);
});

test("migration protege a escrita no banco e habilita vídeo e imagem no Storage", async () => {
  const sql = await readFile(new URL("../../supabase/migrations/202609250001_editor_home_ensaio.sql", import.meta.url), "utf8");
  assert.match(sql, /create table if not exists public\.page_elements/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /public\.is_portal_admin\(\)/i);
  assert.match(sql, /updated_by = \(select auth\.uid\(\)\)/i);
  assert.match(sql, /lower\(email\) = 'projetopotala@gmail\.com'/i);
  assert.match(sql, /'video\/mp4', 'video\/webm'/i);
});

test("Home oferece edição apenas pelo botão inicialmente oculto", async () => {
  const html = await readFile(new URL("../../outputs/atendimentos-conceito.html", import.meta.url), "utf8");
  assert.match(html, /data-page-edit-button hidden/);
  assert.match(html, /js\/home\/page-editor\.js/);
  assert.doesNotMatch(html, /projetopotala@gmail\.com/i);
});
