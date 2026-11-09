import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const raiz = new URL("../../outputs/", import.meta.url);
const ler = (nome) => readFileSync(new URL(nome, raiz), "utf8");
const { MENU_ITEMS, itemAtual, menuHtml, mountPortalMenu } = await import("../../outputs/js/shared/portal-menu.js");

test("o menu global oferece os nove caminhos essenciais mais o retorno a Chegada, com destinos reais", () => {
  assert.deepEqual(
    MENU_ITEMS.map((i) => i.href),
    ["/transcender.html", "travessia.html", "atendimentos.html", "transcendido.html", "profissionais.html", "cursos.html", "blog.html", "marketplace.html", "recepcao.html", "/meu-potala"],
  );
  for (const item of MENU_ITEMS) {
    if (item.href === "/meu-potala") continue;
    if (item.href.startsWith("/")) { assert.ok(existsSync(new URL(item.href.slice(1), raiz)), `destino inexistente: ${item.href}`); continue; } // rota reescrita pelo vercel.json (veja o teste abaixo)
    assert.ok(existsSync(new URL(item.href, raiz)), `destino inexistente: ${item.href}`);
    if (item.extra) assert.ok(existsSync(new URL(item.extra.href, raiz)), `destino inexistente: ${item.extra.href}`);
  }
});

test("Blog público é /blog.html (e não /blog, que é a administração) e Meu Potala usa a rota oficial", () => {
  const hrefs = MENU_ITEMS.flatMap((i) => [i.href, i.extra?.href]).filter(Boolean);
  assert.ok(hrefs.includes("blog.html"));
  assert.ok(!hrefs.some((h) => /^\/?blog\/?$/.test(h) || /blog-admin|admin/.test(h)), "o menu não pode apontar para a administração");
  const vercel = JSON.parse(ler("vercel.json"));
  assert.ok(vercel.rewrites.some((r) => r.source === "/meu-potala" && r.destination === "/meu-potala.html"));
});

test("a Loja leva à página do Marketplace do Portal, sem duplicar nem alterar o Marketplace", () => {
  const loja = MENU_ITEMS.find((i) => i.key === "loja");
  assert.equal(loja.href, "marketplace.html");
  assert.ok(existsSync(new URL("marketplace.html", raiz)));
});

test("o menu não depende de Supabase nem de dados remotos", () => {
  const js = (ler("js/shared/portal-menu.js") + ler("js/shared/portal-menu-boot.js")).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""); // sem comentários
  assert.doesNotMatch(js, /supabase|fetch\(|XMLHttpRequest|import\(\s*["']\.\.?\/(?!portal-menu)/i);
  assert.doesNotMatch(js, /^import .*(supabase|config|ambiente)/im);
});

test("o HTML do menu é acessível: navegação nomeada, diálogo rotulado e destino atual marcado", () => {
  const html = menuHtml("atendimentos");
  assert.equal((html.match(/class="potala-menu__link"/g) || []).length, 10);
  assert.match(html, /<nav aria-label="Caminhos do Portal">/);
  assert.match(html, /id="potala-menu-titulo"/);
  assert.match(html, /aria-label="Fechar menu"/);
  assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
  assert.match(html, /href="atendimentos\.html" aria-current="page"/);
});

test("itemAtual relaciona a página aberta ao item do menu", () => {
  assert.equal(itemAtual("/travessia.html"), "home");
  assert.equal(itemAtual("/transcender.html"), "chegada");
  assert.equal(itemAtual("/transcendido.html"), "materia");
  assert.equal(itemAtual("/eventos.html"), "cursos");
  assert.equal(itemAtual("/revista.html"), "blog");
  assert.equal(itemAtual("/meu-potala/agenda"), "meu-potala");
  assert.equal(itemAtual("/qualquer.html"), "");
});

test("sem documento completo o menu não monta e não quebra (cabeçalho em testes)", () => {
  assert.equal(mountPortalMenu({ documentRef: { querySelector: () => null, createElement: () => ({}), body: {} } }), null);
});

test("o menu só adiciona a Central Operacional depois da autorização confirmada", () => {
  const filhos = [];
  const lista = { appendChild(item) { filhos.push(item); } };
  const dialogo = {
    open: false,
    innerHTML: "",
    className: "",
    setAttribute() {}, addEventListener() {},
    querySelector(seletor) {
      if (seletor === ".potala-menu__list") return lista;
      if (seletor === "[data-potala-menu-admin]") return filhos.find((item) => !item.removido) || null;
      return null;
    },
  };
  const body = { appendChild() {} };
  const documentRef = {
    body,
    head: { appendChild() {} },
    documentElement: { classList: { add() {}, remove() {} } },
    defaultView: { location: { pathname: "/transcendido.html" } },
    querySelector() { return null; },
    createElement(tag) {
      if (tag === "dialog") return dialogo;
      return {
        type: "", className: "", innerHTML: "",
        setAttribute() {}, addEventListener() {}, focus() {},
        remove() { this.removido = true; },
      };
    },
  };
  const menu = mountPortalMenu({ documentRef });
  assert.equal(filhos.length, 0);
  menu.setAdminAccess(true);
  assert.equal(filhos.length, 1);
  assert.match(filhos[0].innerHTML, /href="\/admin\/"/);
  menu.setAdminAccess(false);
  assert.equal(filhos[0].removido, true);
});

test("as páginas da jornada carregam o menu e o cabeçalho das seções o monta", () => {
  for (const pagina of ["transcender.html", "travessia.html", "transcendido.html", "atendimentos-conceito.html"]) {
    const html = ler(pagina);
    assert.match(html, /<link rel="stylesheet" href="css\/portal-menu\.css">/, pagina);
    assert.match(html, /<script type="module" src="js\/shared\/portal-menu-boot\.js"><\/script>/, pagina);
  }
  assert.match(ler("js/shared/portal-header.js"), /mountPortalMenu\(\{ documentRef, host: ferramentas, antes: conta \}\)/);
});

test("CSS: alvos de 44px, foco visível, painel sem overflow e movimento reduzido respeitado", () => {
  const css = ler("css/portal-menu.css").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /\.potala-menu__trigger \{[^}]*min-height:\s*44px/);
  assert.match(css, /\.potala-menu__close \{[^}]*width:\s*44px;\s*height:\s*44px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation:\s*none/);
  assert.match(css, /overscroll-behavior:\s*contain/);
});

test("o Blog público e o Meu Potala carregam o mesmo menu, sem duplicar nem tocar na autenticação", () => {
  const blog = ler("blog.html");
  const conta = ler("meu-potala.html");
  assert.match(blog, /<script type="module" src="js\/shared\/portal-menu-boot\.js"><\/script>/);
  assert.match(blog, /href="css\/portal-menu\.css"/);
  assert.match(conta, /<script type="module" src="\/js\/shared\/portal-menu-boot\.js"><\/script>/);
  assert.match(conta, /href="\/css\/portal-menu\.css"/);
  assert.match(conta, /<script type="module" src="\/js\/conta\/spa\/app\.js"><\/script>/, "o app do Meu Potala segue carregando como antes");
  const boot = ler("js/shared/portal-menu-boot.js");
  assert.match(boot, /\.cad-cabecalho/);
  assert.match(boot, /\.mp-topo/);
  assert.doesNotMatch(boot.replace(/\/\*[\s\S]*?\*\//g, ""), /supabase|auth|fetch\(/i);
});

test("em subrotas do Meu Potala os destinos do menu são absolutos", () => {
  const html = menuHtml("meu-potala", "/");
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(hrefs.length >= 9);
  assert.ok(hrefs.every((h) => h.startsWith("/")), hrefs.join(","));
  assert.ok(!menuHtml("blog").includes('href="/transcendido.html"'), "sem base, os destinos continuam relativos");
});
