import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { DESTINOS_SEM_CONTEUDO, INTENCOES, PAGINAS_DO_ASSISTENTE, extrairPagina, linkPermitido, normalizar, pontuar, termos } from "../../outputs/js/assistente/conhecimento.js";
import * as servidor from "../../supabase/functions/assistente-potala/conhecimento.ts";
import {
  ErroDoAssistente, criarTransporteReal, criarTransporteSimulado, lerSessao, linksSeguros, mensagensParaEnvio, resolverBackend, salvarSessao,
} from "../../outputs/js/assistente/assistente-cliente.js";
import { montarConhecimento } from "../../scripts/prepare-ia-conhecimento.mjs";

globalThis.__POTALA_TESTE__ = true;
const { decidirModo } = await import("../../outputs/js/assistente/assistente-boot.js");
const ler = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");
const BASE = JSON.parse(ler("outputs/ia/conhecimento.json"));

test("base de conhecimento versionada está atualizada (regenere com node scripts/prepare-ia-conhecimento.mjs)", async () => {
  assert.deepEqual(await montarConhecimento(), BASE);
});

test("base contém só páginas públicas; nada de admin, Mesa, conta, sala ou recuperação de senha", () => {
  const urls = BASE.paginas.map((p) => p.url);
  for (const privada of ["admin.html", "blog-admin.html", "sala-atendimento.html", "confirmar-conta.html", "redefinir-senha.html", "index.html"]) assert.ok(!urls.includes(privada), privada);
  assert.equal(BASE.paginas.find((p) => p.url === "meu-potala.html").texto, "", "Meu Potala só como destino, sem conteúdo pessoal");
  assert.ok(BASE.paginas.every((p) => p.texto.length <= 9000));
  assert.doesNotMatch(JSON.stringify(BASE), /sb_secret|service_role|sk-[A-Za-z0-9]{10}|exemplo\.invalid/i);
  assert.equal(new Set(BASE.paginas.map((p) => p.titulo)).size, BASE.paginas.length, "cada página com título próprio nos links");
  for (const essencial of ["cursos.html", "atendimentos.html", "recepcao.html", "blog.html", "atividades.html", "quem-somos.html"]) assert.ok(urls.includes(essencial), essencial);
});

test("regras do navegador e do servidor são idênticas (páginas, normalização, pontuação, links)", () => {
  assert.deepEqual(servidor.PAGINAS_DO_ASSISTENTE, [...PAGINAS_DO_ASSISTENTE]);
  assert.deepEqual(servidor.DESTINOS_SEM_CONTEUDO, Object.keys(DESTINOS_SEM_CONTEUDO));
  const perguntas = ["Quais cursos de meditação vocês têm?", "Como agendar acupuntura?", "artigos sobre respiração", "Onde fica o Instituto?", "Ateliê de desenho para crianças", "xyz"];
  const docs = BASE.paginas.map((p) => ({ ...p, tipo: "pagina" }));
  for (const p of perguntas) {
    assert.equal(servidor.normalizar(p), normalizar(p));
    assert.deepEqual(servidor.termos(p), termos(p));
    assert.deepEqual(servidor.pontuar(p, docs).map((d) => d.url), pontuar(p, docs).map((d) => d.url), p);
  }
  for (const url of ["cursos.html", "/cursos.html", "admin.html", "https://x.invalid", "artigo.html", "artigo.html?post=a-b", "artigo.html?nome=a", "escritor.html?nome=lin", "cursos.html?x=1", "javascript:alert(1)", "artigo.html?post=A_B", "meu-potala.html", "artigo.html?post=a?post=b"]) {
    assert.equal(servidor.linkPermitido(url), linkPermitido(url), url);
  }
});

test("intenções de navegação levam às páginas canônicas (navegador e servidor iguais)", () => {
  const docs = BASE.paginas.map((p) => ({ ...p, tipo: "pagina" }));
  const casos = {
    "Quero agendar uma consulta.": ["atendimentos.html", "recepcao.html", "meu-potala.html"],
    "Quero acessar um curso.": ["cursos.html", "meu-potala.html"],
    "Quais cursos estão disponíveis?": ["cursos.html"],
    "Quero falar com a recepção.": ["recepcao.html"],
    "Quero conhecer os profissionais.": ["profissionais.html", "especialistas.html"],
    "Quero ler os artigos do blog.": ["blog.html"],
  };
  for (const [pergunta, esperadas] of Object.entries(casos)) {
    const top = pontuar(pergunta, docs).slice(0, esperadas.length).map((d) => d.url);
    assert.deepEqual(top, esperadas, pergunta);
    assert.deepEqual(servidor.pontuar(pergunta, docs).map((d) => d.url), pontuar(pergunta, docs).map((d) => d.url), pergunta);
  }
  assert.deepEqual(servidor.INTENCOES, INTENCOES);
  for (const { paginas } of INTENCOES) for (const u of paginas) assert.equal(linkPermitido(u), u, "página de intenção precisa ser link permitido: " + u);
});

test("busca acha as páginas certas para perguntas típicas", () => {
  const top = (p) => pontuar(p, BASE.paginas).slice(0, 4).map((d) => d.url);
  assert.ok(top("Quais cursos o Instituto oferece?").includes("cursos.html"));
  assert.ok(top("Quero agendar um atendimento").some((u) => u.startsWith("atendimentos")));
  assert.ok(top("Tem aula de desenho?").includes("atividades.html"));
  assert.ok(top("Quem são os especialistas e professores?").some((u) => u === "especialistas.html" || u === "profissionais.html"));
  assert.deepEqual(top("ok"), []);
});

test("links aceitos: só páginas do portal, artigo e escritor com slug válido", () => {
  assert.equal(linkPermitido("/cursos.html"), "cursos.html");
  assert.equal(linkPermitido("artigo.html?post=respirar-devagar"), "artigo.html?post=respirar-devagar");
  assert.equal(linkPermitido("escritor.html?nome=marina-alves"), "escritor.html?nome=marina-alves");
  for (const ruim of ["admin.html", "blog-admin.html", "https://evil.invalid", "//evil.invalid/x.html", "javascript:alert(1)", "artigo.html", "artigo.html?post=<x>", "cursos.html?utm=1", "../admin.html"]) {
    assert.equal(linkPermitido(ruim), "", ruim);
  }
  assert.deepEqual(linksSeguros([{ url: "cursos.html", titulo: " Cursos " }, { url: "admin.html", titulo: "x" }, { url: "cursos.html", titulo: "dup" }, { url: "blog.html", titulo: "" }]), [{ url: "cursos.html", titulo: "Cursos" }]);
});

test("backend por origem: Production fixo; LAB/local pelo arquivo de ambiente; Preview sem backend", async () => {
  const prod = await resolverBackend("https://wind-theme.vercel.app");
  assert.equal(prod.url, "https://gotrumwuimpoeggwamut.supabase.co/functions/v1/assistente-potala");
  assert.match(prod.chave, /^sb_publishable_/);
  const lab = await resolverBackend("https://wind-theme-m2-lab-preview.vercel.app", async () => ({ AMBIENTE_LAB: { url: "https://hmspabllgxqfzzricijv.supabase.co", publishableKey: "sb_publishable_lab" } }));
  assert.equal(lab.url, "https://hmspabllgxqfzzricijv.supabase.co/functions/v1/assistente-potala");
  const labSemArquivo = await resolverBackend("https://wind-theme-m2-lab-preview.vercel.app", async () => { throw new Error("404"); });
  assert.equal(labSemArquivo.url, "");
  const preview = await resolverBackend("https://wind-theme-abc123-potala.vercel.app");
  assert.deepEqual(preview, { tipo: "desconhecido", url: "", chave: "" });
  const forjado = await resolverBackend("http://localhost:3000", async () => ({ AMBIENTE_LOCAL: { url: "https://evil.invalid", publishableKey: "sb_secret_x" } }));
  assert.equal(forjado.url, "", "só aceita supabase.co + chave publicável");
});

test("modo: Production só mostra a bolinha com backend ativo; fora dela cai no modo de demonstração", async () => {
  const real = (ativo) => () => ({ modo: "real", ativo: async () => ativo });
  assert.equal((await decidirModo({ origem: "https://wind-theme.vercel.app", real: real(true) })).modo, "real");
  assert.equal((await decidirModo({ origem: "https://wind-theme.vercel.app", real: real(false) })).modo, "indisponivel", "Production sem backend: bolinha em modo indisponivel");
  assert.equal((await decidirModo({ origem: "https://wind-theme-abc-potala.vercel.app", real: real(false) })).modo, "simulado");
});

test("transporte real: chave publicável, só {mensagens}, erros traduzidos, links revalidados", async () => {
  const chamadas = [];
  const t = criarTransporteReal({ url: "https://abc.supabase.co/functions/v1/assistente-potala", chave: "sb_publishable_x" }, async (url, init) => {
    chamadas.push(init);
    if (init.method === "GET") return Response.json({ ativo: true });
    return Response.json({ resposta: "Veja os cursos.", links: [{ titulo: "Cursos", url: "cursos.html" }, { titulo: "Mau", url: "https://evil.invalid" }] });
  });
  assert.equal(await t.ativo(), true);
  const r = await t.perguntar([{ papel: "usuario", texto: "cursos?" }]);
  assert.deepEqual(r, { resposta: "Veja os cursos.", links: [{ url: "cursos.html", titulo: "Cursos" }] });
  assert.equal(chamadas[1].headers.apikey, "sb_publishable_x");
  assert.deepEqual(JSON.parse(chamadas[1].body), { mensagens: [{ papel: "usuario", texto: "cursos?" }] });
  const limite = criarTransporteReal({ url: "u", chave: "k" }, async () => new Response(JSON.stringify({ mensagem: "Você fez muitas perguntas em pouco tempo." }), { status: 429 }));
  await assert.rejects(limite.perguntar([{ papel: "usuario", texto: "x" }]), (e) => e instanceof ErroDoAssistente && e.status === 429 && /muitas perguntas/.test(e.message));
  const rede = criarTransporteReal({ url: "u", chave: "k" }, async () => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(rede.perguntar([{ papel: "usuario", texto: "x" }]), /Sem conexão com o assistente/);
  assert.equal(await criarTransporteReal({ url: "u", chave: "k" }, async () => { throw new Error("x"); }).ativo(), false);
});

test("modo de demonstração: sem IA, rotulado, com links reais do portal", async () => {
  const t = criarTransporteSimulado({ carregarBase: async () => BASE });
  const r = await t.perguntar([{ papel: "usuario", texto: "Quais cursos vocês oferecem?" }]);
  assert.match(r.resposta, /^Modo de demonstração \(sem IA\)/);
  assert.ok(r.links.some((l) => l.url === "cursos.html"));
  const nada = await t.perguntar([{ papel: "usuario", texto: "zzz qqq" }]);
  assert.deepEqual(nada.links.map((l) => l.url), ["recepcao.html"]);
});

test("modo indispon\u00edvel: avisa, n\u00e3o chama a rede nem a IA, e leva \u00e0s p\u00e1ginas certas", async () => {
  const { criarTransporteIndisponivel, ATALHOS } = await import("../../outputs/js/assistente/assistente-cliente.js");
  const base = JSON.parse((await import("node:fs")).readFileSync(new URL("../../outputs/ia/conhecimento.json", import.meta.url), "utf8"));
  const t = criarTransporteIndisponivel({ carregarBase: async () => base });
  const esperado = {
    "Quero agendar uma consulta": ["atendimentos.html", "recepcao.html"],
    "Quero acessar um curso": ["cursos.html"],
    "Quero falar com algu\u00e9m": ["recepcao.html"],
    "Quero conhecer os profissionais": ["profissionais.html", "especialistas.html"],
    "Quero ler o blog": ["blog.html", "revista.html"],
  };
  for (const [pergunta, paginas] of Object.entries(esperado)) {
    const r = await t.perguntar([{ papel: "usuario", texto: pergunta }]);
    assert.match(r.resposta, /temporariamente indispon\u00edveis/);
    assert.doesNotMatch(r.resposta, /agendei|inscrevi|paguei|confirmado/i);
    const urls = r.links.map((l) => l.url);
    for (const p of paginas) assert.ok(urls.includes(p), pergunta + " deveria apontar para " + p + " (veio " + urls.join(",") + ")");
  }
  for (const a of ATALHOS) assert.ok(base.paginas.some((p) => p.url === a.url), "atalho para p\u00e1gina inexistente: " + a.url);
});

test("sessão: só nesta aba, até 12 mensagens, links revalidados ao ler; envio limitado a 8, sem links", () => {
  const mem = new Map();
  const arm = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const msgs = Array.from({ length: 15 }, (_, i) => ({ papel: i % 2 ? "assistente" : "usuario", texto: `m${i}`, links: [{ url: "admin.html", titulo: "x" }, { url: "cursos.html", titulo: "Cursos" }] }));
  salvarSessao({ mensagens: msgs, aberto: true }, arm);
  const lida = lerSessao(arm);
  assert.equal(lida.mensagens.length, 12);
  assert.equal(lida.aberto, true);
  const resposta = lida.mensagens.find((m) => m.papel === "assistente");
  assert.deepEqual(resposta.links, [{ url: "cursos.html", titulo: "Cursos" }]);
  assert.ok(lida.mensagens.filter((m) => m.papel === "usuario").every((m) => m.links.length === 0));
  assert.deepEqual(lerSessao({ getItem: () => "{lixo" }), { mensagens: [], aberto: false });
  assert.deepEqual(lerSessao({ getItem: () => { throw new Error("bloqueado"); } }), { mensagens: [], aberto: false });
  const envio = mensagensParaEnvio(lida.mensagens);
  assert.equal(envio.length, 8);
  assert.ok(envio.every((m) => Object.keys(m).join() === "papel,texto"));
});

test("interface: nada vira HTML; textContent, links validados, acessibilidade e sem chave no navegador", () => {
  const ui = ler("outputs/js/assistente/assistente-ui.js");
  const cliente = ler("outputs/js/assistente/assistente-cliente.js");
  for (const fonte of [ui, cliente, ler("outputs/js/assistente/assistente-boot.js")]) {
    assert.doesNotMatch(fonte, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/);
    assert.doesNotMatch(fonte, /OPENAI|api\.openai\.com|sk-|sb_secret|service_role/);
  }
  assert.doesNotMatch(cliente, /^import [^;]*config\.js/m, "não importa config.js (bloquearia Previews)");
  for (const a11y of [/aria-expanded/, /aria-controls/, /role: "dialog"/, /role: "log"/, /"aria-live": "polite"/, /Escape/, /label/, /maxlength: LIMITE_PERGUNTA/]) assert.match(ui, a11y);
  assert.match(ui, /inteligência artificial/);
  const css = ler("outputs/css/assistente-flutuante.css");
  for (const regra of [/position: fixed/, /safe-area-inset-bottom/, /@media \(max-width: 560px\)/, /prefers-reduced-motion/, /@media print/, /forced-colors/]) assert.match(css, regra);
});

test("a bolinha está em todas as páginas públicas e em nenhuma página privada", () => {
  const TAG = '<script type="module" src="/js/assistente/assistente-boot.js"></script>';
  for (const pagina of [...PAGINAS_DO_ASSISTENTE, "artigo.html"]) assert.equal(ler(`outputs/${pagina}`).split(TAG).length - 1, 1, pagina);
  for (const privada of ["admin.html", "blog-admin.html", "meu-potala.html", "sala-atendimento.html", "confirmar-conta.html", "redefinir-senha.html", "index.html"]) {
    assert.doesNotMatch(ler(`outputs/${privada}`), /assistente-boot\.js/, privada);
  }
});

test("base de conhecimento: avisos de estado da página ficam fora; conteúdo de status e noscript útil fica", () => {
  const html = `<body><p class="s" role="status">Carregando os textos publicados…</p><p data-x hidden>Nenhum texto encontrado neste caminho.</p>
    <span data-n role="status" aria-live="polite">16 especialistas · 22 aulas</span><noscript><p>Ative o JavaScript para ver os textos.</p></noscript>
    <noscript><a href="cursos.html">Cursos</a></noscript><p>Texto real.</p></body>`;
  const { texto } = extrairPagina("escritor.html", html);
  assert.doesNotMatch(texto, /Carregando|Nenhum texto encontrado|Ative o JavaScript/);
  assert.match(texto, /16 especialistas/);
  assert.match(texto, /Cursos/);
  assert.match(texto, /Texto real/);
  for (const p of BASE.paginas) assert.doesNotMatch(p.texto, /Carregando os textos|Ative o JavaScript|Nenhum texto encontrado/, p.url);
});
