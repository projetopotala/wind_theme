import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

import { aplicarConteudo } from "../../outputs/js/site/aplicar.js";
import { PAGINAS_EDITAVEIS, PAGINAS_EM_OUTRO_MODULO, carregarManifesto, paginaEmOutroModulo, paginaPorSlug } from "../../outputs/js/site/paginas.js";
import { validarConteudo } from "../../outputs/js/site/validar.js";

/*
 * Editar site, Fase 2: mais páginas, MESMO mecanismo. Estes testes guardam os limites combinados com o Owner:
 * só conteúdo visual, nada de preço/inscrição/agendamento/pedido, links de fluxo travados e nenhuma página
 * operacional recebendo o script do editor.
 */
const RAIZ = new URL("../../outputs/", import.meta.url);
const ler = (rel) => readFileSync(new URL(rel, RAIZ), "utf8");
const NOVAS = ["pagina-inicial", "atendimentos", "cursos", "eventos", "blog", "marketplace", "mentorias", "workshops", "grupos-de-estudo",
  "programacao", "atividades", "profissionais", "especialistas", "recepcao", "experiencias-culturais", "revista"];

test("as 16 páginas novas entram no mesmo mecanismo e as 4 da Fase 1 continuam", () => {
  const slugs = PAGINAS_EDITAVEIS.map((p) => p.slug);
  for (const s of [...NOVAS, "quem-somos", "saude-integrativa", "inspiracao", "cultura"]) assert.ok(slugs.includes(s), s);
  assert.equal(slugs.length, 20);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const p of PAGINAS_EDITAVEIS) assert.match(p.slug, /^[a-z0-9][a-z0-9-]{0,63}$/, "o mesmo formato que o banco exige");
});

test("o conteúdo editado é só visual: sem preço, sem estado de carregamento e sem fluxo operacional", async () => {
  let total = 0;
  for (const slug of NOVAS) {
    const m = await carregarManifesto(slug);
    for (const el of m.elementos) {
      total += 1;
      const texto = el.original.text || "";
      assert.doesNotMatch(texto, /R\$|US\$|€/, `${slug}/${el.chave}: texto com valor em dinheiro`);
      assert.doesNotMatch(texto, /carregando|nenhum |nenhuma |tente novamente|indispon/i, `${slug}/${el.chave}: texto de estado`);
      if (el.tipo === "botao") {
        const href = el.original.href;
        const operacional = /\?/.test(href) || /^[#/]/.test(href) || /^(meu-potala|sala-atendimento|admin|blog-admin|escritor|artigo|confirmar-conta|redefinir-senha)(\.html|\/|$)/.test(href);
        if (operacional) assert.deepEqual(el.fixo, ["href"], `${slug}/${el.chave}: link de fluxo precisa ficar travado (${href})`);
      }
      if (el.fixo) { assert.deepEqual(el.fixo, ["href"]); assert.equal(el.tipo, "botao"); }
    }
  }
  assert.ok(total > 300, `esperava centenas de elementos, vieram ${total}`);
});

test("os fluxos de solicitação seguem travados: Atendimentos, Recepção e Loja", async () => {
  const atend = await carregarManifesto("atendimentos");
  const solicitar = atend.elementos.filter((e) => e.original.href === "/meu-potala/atendimentos");
  assert.ok(solicitar.length >= 2, "os botões 'Solicitar um atendimento' existem no manifesto (texto editável)");
  for (const e of solicitar) assert.deepEqual(e.fixo, ["href"]);
  const loja = await carregarManifesto("marketplace");
  for (const e of loja.elementos.filter((x) => /marketing-place-potala|vercel\.app/.test(x.original.href || ""))) assert.deepEqual(e.fixo, ["href"], "o link da loja real não é editável aqui");
  const rec = await carregarManifesto("recepcao");
  for (const e of rec.elementos.filter((x) => (x.original.href || "").startsWith("#"))) assert.deepEqual(e.fixo, ["href"]);
});

function noTexto(valor) { return { nodeType: 3, nodeValue: valor }; }
function botaoFalso(href, texto) {
  const attrs = new Map([["href", href]]);
  return { tagName: "A", childNodes: [noTexto(texto)], style: {}, getAttribute: (n) => attrs.get(n) ?? null, setAttribute: (n, v) => attrs.set(n, String(v)), removeAttribute: (n) => attrs.delete(n), get textContent() { return this.childNodes.map((c) => c.nodeValue).join(""); }, set textContent(v) { this.childNodes = [noTexto(v)]; } };
}

test("link travado: o texto muda, mas um destino vindo do banco nunca é aplicado", () => {
  const el = botaoFalso("/meu-potala/atendimentos", "Solicitar um atendimento");
  const manifesto = { elementos: [{ chave: "b", tipo: "botao", secao: "s", rotulo: "r", seletor: "#b", original: { text: "Solicitar um atendimento", href: "/meu-potala/atendimentos" }, fixo: ["href"] }] };
  const doc = { querySelector: (s) => (s === "#b" ? el : null) };
  aplicarConteudo(doc, manifesto, { b: { text: "Pedir atendimento", href: "https://exemplo.com/outro" } });
  assert.equal(el.childNodes[0].nodeValue, "Pedir atendimento");
  assert.equal(el.getAttribute("href"), "/meu-potala/atendimentos", "o fluxo continua apontando para o mesmo lugar");
  // sem a trava, o mesmo conteúdo troca o link normalmente
  const livre = botaoFalso("travessia.html", "Voltar");
  const m2 = { elementos: [{ chave: "b", tipo: "botao", secao: "s", rotulo: "r", seletor: "#b", original: { text: "Voltar", href: "travessia.html" } }] };
  aplicarConteudo({ querySelector: () => livre }, m2, { b: { href: "https://exemplo.com/ok" } });
  assert.equal(livre.getAttribute("href"), "https://exemplo.com/ok");
});

test("conteúdo de cada página nova valida no banco como as demais (mesmos campos, mesmas regras)", async () => {
  for (const slug of NOVAS) {
    const m = await carregarManifesto(slug);
    const conteudo = {};
    for (const el of m.elementos.slice(0, 12)) {
      conteudo[el.chave] = el.tipo === "imagem" ? { alt: "Descrição editada" } : { text: "Texto editado" };
    }
    assert.deepEqual(validarConteudo(conteudo), [], slug);
  }
});

test("páginas operacionais e áreas de outros módulos NÃO recebem o script do editor", () => {
  for (const arquivo of ["meu-potala.html", "admin.html", "blog-admin.html", "escritor.html", "artigo.html", "sala-atendimento.html",
    "confirmar-conta.html", "redefinir-senha.html", "travessia.html", "index.html", "palacio.html", "transcendido.html", "atendimentos-conceito.html"]) {
    assert.ok(existsSync(new URL(arquivo, RAIZ)), arquivo);
    assert.doesNotMatch(ler(arquivo), /conteudo-publico\.js|data-site-pagina/, `${arquivo} não pode carregar o conteúdo editável`);
  }
});

test("a Travessia é da Jornada: o editor só leva até lá, sem edição paralela", () => {
  assert.deepEqual(PAGINAS_EM_OUTRO_MODULO.map((p) => [p.slug, p.secaoAdmin]), [["travessia", "jornada"]]);
  assert.equal(paginaPorSlug("travessia"), null);
  assert.equal(paginaEmOutroModulo("travessia").modulo, "Jornada");
  assert.equal(paginaEmOutroModulo("quem-somos"), null);
  assert.match(ler("admin.html"), /data-section="jornada"/, "a Jornada existe no menu da Central");
  const editor = ler("js/site/editar-site.js");
  assert.match(editor, /paginaEmOutroModulo\(novo\)/);
  assert.match(editor, /abrirModulo\(outro\.secaoAdmin\)/);
  const entrada = ler("js/admin/admin-entry.js");
  assert.match(entrada, /abrirModulo: \(secao\) =>/);
  assert.match(entrada, /access\.role === "owner" && !editarSite/, "continua só para o Owner");
});

test("o banco não mudou: a Fase 2 não traz migration nova", () => {
  const migrations = readFileSync(new URL("../../supabase/migrations/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1") + "/202611170002_editar_site.sql", "utf8");
  assert.match(migrations, /site_check_page/, "o formato do identificador da página já é validado no banco");
  assert.match(migrations, /\^\[a-z0-9\]\[a-z0-9-\]\{0,63\}\$/);
});

test("o editor acha o texto editavel mesmo sob camadas sobrepostas (capas, Home cinematografica)", () => {
  const editor = ler("js/site/editar-site.js");
  assert.match(editor, /pointer-events:auto !important/, "itens marcados recebem clique mesmo quando a pagina os deixa sem pointer-events");
  assert.match(editor, /elementsFromPoint/, "o clique procura o item editavel na pilha sob o ponto");
  const home = ler("js/site/manifesto/pagina-inicial.js");
  assert.match(home, /\.cine-title__heading/, "Home usa seletores estaveis (classe), nao caminhos posicionais");
});