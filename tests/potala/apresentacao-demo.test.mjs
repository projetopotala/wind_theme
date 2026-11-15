import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import {
  AVISO_DA_AGENDA, PASSOS, confirmar, escolher, estadoInicial, podeAvancar, profissionaisDoServico, resumoDaSimulacao, servicosDeAtendimento,
} from "../../outputs/js/apresentacao/agenda-demo-modelo.js";

const raiz = new URL("../../outputs/", import.meta.url);
const ler = (c) => readFileSync(new URL(c, raiz), "utf8");
const catalogo = JSON.parse(ler("ofertas/catalogo-demonstracao.json"));
const ofertas = catalogo.ofertas;

test("agenda simulada: serviços e profissionais vêm do catálogo, sem inventar ninguém", () => {
  const servicos = servicosDeAtendimento(ofertas);
  assert.ok(servicos.length >= 4);
  for (const s of servicos) {
    const profs = profissionaisDoServico(s);
    assert.equal(profs.length, 1);
    assert.equal(profs[0].nome, s.responsavel);
  }
  assert.deepEqual(profissionaisDoServico(null), []);
});

test("agenda simulada: percorre os seis passos e termina em confirmação com protocolo demonstrativo", () => {
  assert.deepEqual([...PASSOS], ["servico", "profissional", "data", "horario", "resumo", "confirmacao"]);
  const [servico] = servicosDeAtendimento(ofertas);
  let e = estadoInicial();
  assert.equal(podeAvancar(e), false);
  e = escolher(e, "servico", servico);
  assert.equal(podeAvancar(e), true);
  e = { ...e, indice: 1 };
  e = escolher(e, "profissional", profissionaisDoServico(servico)[0]);
  e = escolher({ ...e, indice: 2 }, "data", { id: "2026-11-17", rotulo: "Terça, 17/11" });
  e = escolher({ ...e, indice: 3 }, "horario", { id: "09:00", rotulo: "9h", disponivel: true });
  assert.equal(resumoDaSimulacao(e).servico, servico.titulo);
  const fim = confirmar({ ...e, indice: 4 }, 1760000000000, 0.5);
  assert.equal(PASSOS[fim.indice], "confirmacao");
  assert.match(fim.protocolo, /^DEMO-/);
  assert.match(AVISO_DA_AGENDA, /^SIMULAÇÃO/);
});

test("agenda simulada: trocar uma escolha anterior descarta as seguintes e impede confirmar incompleto", () => {
  const [a, b] = servicosDeAtendimento(ofertas);
  let e = escolher(estadoInicial(), "servico", a);
  e = escolher(e, "profissional", profissionaisDoServico(a)[0]);
  e = escolher(e, "data", { id: "x", rotulo: "x" });
  e = escolher(e, "servico", b);
  assert.equal(e.profissional, null);
  assert.equal(e.data, null);
  assert.equal(resumoDaSimulacao(e), null);
  assert.throws(() => confirmar(e), /Escolha serviço/);
});

test("vitrine de cursos: itens marcados têm imagem do próprio portal que existe e texto alternativo", () => {
  const cursos = ofertas.filter((o) => String(o.vitrine || "").split(",").includes("cursos"));
  assert.ok(cursos.length >= 4);
  assert.ok(cursos.some((o) => o.modalidade === "curso"));
  for (const o of cursos) {
    assert.match(o.imagem, /^media\/[\w.-]+\.(webp|jpe?g|png)$/, o.id);
    assert.ok(existsSync(new URL(o.imagem, raiz)), o.imagem);
    assert.ok(o.imagemAlt && o.responsavel && o.quando, o.id);
  }
  /* preço nunca é inventado: vem do catálogo ou é omitido */
  for (const o of cursos) assert.ok(o.precoCentavos === null || Number.isInteger(o.precoCentavos), o.id);
});

test("páginas da apresentação: sem banco, sem login, marcadas como demonstração e fora dos buscadores", () => {
  for (const pagina of ["agendar-demo.html", "cursos-catalogo.html", "apresentacao.html", "mesa-demo.html"]) {
    const h = ler(pagina);
    assert.match(h, /noindex/, pagina);
    assert.doesNotMatch(h, /vendor\/supabase|supabase\/config|ambiente-e2e/, pagina);
    assert.match(h, /imula|emonstra/, pagina);
  }
  const mesa = ler("mesa-demo.html");
  assert.match(mesa, /mesa-demo-entry\.js/);
  assert.doesNotMatch(mesa, /blog-admin-entry\.js/);
  for (const arquivo of readdirSync(new URL("js/apresentacao/", raiz))) {
    const js = ler(`js/apresentacao/${arquivo}`);
    assert.doesNotMatch(js, /supabase\/(config|client)|createClient|fetch\(["'`]https?:/, arquivo);
  }
});

test("mesa de demonstração: usa só o repositório do navegador, outra chave de armazenamento e nunca o banco", () => {
  const js = ler("js/apresentacao/mesa-demo-entry.js");
  assert.match(js, /criarBlogDeDemonstracao/);
  assert.match(js, /potala\.blog\.apresentacao\.v1/);
  assert.doesNotMatch(js, /criarBlogAdministrativo|getSupabaseClient|createAdminAuth/);
});

test("blog-remoto não carrega a configuração do banco na importação (só no envio de imagem)", () => {
  const js = ler("js/blog/blog-remoto.js");
  assert.doesNotMatch(js, /^import .*supabase\/config\.js/m);
  assert.match(js, /await import\("\.\.\/supabase\/config\.js"\)/);
});

test("agenda e vitrine: nenhum texto de oferta entra como HTML", () => {
  for (const arquivo of ["js/apresentacao/agenda-demo.js", "js/ofertas/ofertas.js"]) {
    assert.doesNotMatch(ler(arquivo), /innerHTML|insertAdjacentHTML|document\.write/, arquivo);
  }
});

test("ambiente de apresentação: só abre sem banco em Preview da Vercel do projeto, com a marca do ramo", async () => {
  const { escolherAmbiente, ehOrigemDeApresentacao } = await import("../../outputs/js/supabase/ambiente.js");
  const marca = { apresentacao: true };
  for (const origem of ["https://wind-theme-git-demo-apresentacao-16-11-potala.vercel.app", "https://wind-theme-abc123xyz-potala.vercel.app"]) {
    const perfil = escolherAmbiente({ origem, overlayApresentacao: marca });
    assert.equal(perfil.ambiente, "apresentacao");
    assert.equal(perfil.semBanco, true);
    assert.equal(perfil.url, "");
    assert.equal(perfil.publishableKey, "");
    assert.equal(perfil.appointments.admin, false);
    assert.equal(perfil.appointments.publicRequests, false);
    assert.throws(() => escolherAmbiente({ origem }), /Origem não autorizada/, "sem a marca do ramo continua bloqueado");
    assert.throws(() => escolherAmbiente({ origem, overlayApresentacao: { apresentacao: false } }), /Origem não autorizada/);
  }
  for (const origem of [
    "https://wind-theme.vercel.app", "https://wind-theme.vercel.app:8443", "http://wind-theme-abc123-potala.vercel.app",
    "https://wind-theme-m2-lab-preview.vercel.app", "https://wind-theme-m2-lab-preview-abc123-potala.vercel.app",
    "http://127.0.0.1:4173", "https://exemplo.com", "https://wind-theme-abc123-potala.vercel.app.exemplo.com",
    "https://evil-wind-theme-abc123-potala.vercel.app", "",
  ]) {
    assert.equal(ehOrigemDeApresentacao(origem), false, origem);
    let ambiente = "erro";
    try { ambiente = escolherAmbiente({ origem, overlayApresentacao: marca }).ambiente; } catch { /* bloqueada */ }
    assert.notEqual(ambiente, "apresentacao", origem);
  }
});

test("a marca da apresentação não tem URL nem chave de banco e o sem-banco não faz requisição", async () => {
  const marca = ler("js/preview/apresentacao.js");
  assert.doesNotMatch(marca, /supabase\.co|sb_publishable_|service_role/);
  const { criarRestPublico } = await import("../../outputs/js/supabase/rest.js");
  let chamadas = 0;
  const rest = criarRestPublico({ config: { semBanco: true, url: "", publishableKey: "" }, fetchImpl: () => { chamadas += 1; return Promise.resolve({ ok: true }); } });
  await assert.rejects(() => rest.ler("blog_posts", {}), /Sem conexão/);
  assert.equal(chamadas, 0);
});

test("guarda de build: a marca da apresentação derruba Production e Preview de outra branch", async () => {
  const { apresentacaoPermitida, BRANCH_APRESENTACAO } = await import("../../scripts/ambiente-supabase.mjs");
  assert.equal(apresentacaoPermitida({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: BRANCH_APRESENTACAO }), false);
  assert.equal(apresentacaoPermitida({ VERCEL_ENV: "production" }), false);
  assert.equal(apresentacaoPermitida({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "main" }), false);
  assert.equal(apresentacaoPermitida({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "demo/apresentacao-16-11-x" }), false);
  assert.equal(apresentacaoPermitida({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: BRANCH_APRESENTACAO }), true);
  assert.equal(apresentacaoPermitida({}), true, "build local sem variáveis da Vercel");
});

test("modo demonstração das ofertas: rótulos ilustrativos e nenhum link externo real", () => {
  const js = ler("js/ofertas/ofertas.js");
  assert.match(js, /data-ofertas-demo/);
  for (const pagina of ["cursos-catalogo.html", "ofertas.html"]) assert.match(ler(pagina), /data-ofertas-demo/, pagina);
  for (const pagina of ["apresentacao.html", "cursos-catalogo.html", "agendar-demo.html"]) {
    const h = ler(pagina);
    assert.match(h, /ilustrativ/, pagina);
    assert.doesNotMatch(h, /wa\.me|href="meu-potala\.html"/, pagina);
  }
});

test("roteiro: todo link interno existe e o único externo é o Blog oficial, aberto em nova aba", () => {
  const h = ler("apresentacao.html");
  const hrefs = [...h.matchAll(/<a [^>]*href="([^"]+)"[^>]*>/g)].map((m) => m[1]);
  assert.ok(hrefs.length >= 8);
  const externos = hrefs.filter((x) => /^https?:/.test(x));
  assert.deepEqual(externos, ["https://wind-theme.vercel.app/blog.html"]);
  assert.match(h, /href="https:\/\/wind-theme\.vercel\.app\/blog\.html" target="_blank" rel="noopener noreferrer"/);
  for (const href of hrefs.filter((x) => !/^https?:/.test(x))) assert.ok(existsSync(new URL(href.split("#")[0], raiz)), href);
  for (const pagina of ["cursos-catalogo.html", "agendar-demo.html", "mesa-demo.html"]) {
    for (const m of ler(pagina).matchAll(/<a [^>]*href="([^"#]+)"/g)) if (!/^https?:/.test(m[1])) assert.ok(existsSync(new URL(m[1].replace(/^\//, ""), raiz)), `${pagina}: ${m[1]}`);
  }
});

test("mesa de demonstração: reiniciar só apaga as chaves da própria demonstração", () => {
  const js = ler("js/apresentacao/mesa-demo-entry.js");
  assert.match(js, /data-reiniciar-demo/);
  assert.match(js, /removeItem\(CHAVE\)/);
  assert.doesNotMatch(js, /localStorage\.clear|\.clear\(\)/);
});
