import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { itensDoMenu } from "../../outputs/js/blog-admin/mesa-visoes.js";
import { permissoesDaMesa, permissoesDaSessao } from "../../outputs/js/blog-admin/mesa-modelo.js";
import {
  ErroDeSessao, criarGuardaDeSessao, decidirSaida, identidadeDaSessao, identidadeMudou, protegerRepositorio, textoParaCopia,
} from "../../outputs/js/blog-admin/mesa-sessao.js";

const escritor = permissoesDaMesa(permissoesDaSessao({ role: "blog_editor", user: { id: "w" }, permissions: { read: true, edit: true, publish: false } }));
const editor = permissoesDaMesa(permissoesDaSessao({ role: "blog_editor", user: { id: "e" }, permissions: { read: true, edit: true, publish: true } }));
const owner = permissoesDaMesa(permissoesDaSessao({ role: "owner", user: { id: "o" } }));
const ids = (status, permissoes) => itensDoMenu({ id: "x", status, post: {} }, permissoes).filter((i) => i !== "separador").map((i) => i.id);
const rotulos = (status, permissoes) => itensDoMenu({ id: "x", status, post: {} }, permissoes).filter((i) => i !== "separador").map((i) => i.rotulo);

/* ---------------- 1. menus por podePublicar ---------------- */

test("menu: Escritor nao ve despublicar, cancelar agendamento, voltar a rascunho, agendar nem arquivar", () => {
  for (const status of ["published", "scheduled", "review", "draft", "archived"]) {
    const itens = ids(status, escritor);
    for (const proibido of ["despublicar", "restaurar", "agendar", "arquivar"]) {
      assert.ok(!itens.includes(proibido), `${status}: Escritor nao pode ver ${proibido}`);
    }
  }
  assert.ok(!rotulos("scheduled", escritor).includes("Cancelar agendamento"));
  assert.ok(!rotulos("published", escritor).includes("Despublicar"));
});

test("menu: Escritor mantem as acoes permitidas (editar, ver/pre-visualizar, duplicar, excluir)", () => {
  for (const status of ["published", "scheduled", "review", "draft", "archived"]) {
    const itens = ids(status, escritor);
    for (const permitido of ["editar", "visualizar", "duplicar", "excluir"]) {
      assert.ok(itens.includes(permitido), `${status}: Escritor deve manter ${permitido}`);
    }
  }
});

test("menu: Editor e Owner continuam com todas as acoes de publicacao", () => {
  for (const perfil of [editor, owner]) {
    assert.ok(ids("published", perfil).includes("despublicar"));
    assert.ok(ids("published", perfil).includes("arquivar"));
    assert.ok(rotulos("scheduled", perfil).includes("Cancelar agendamento"));
    assert.ok(ids("scheduled", perfil).includes("agendar"));
    assert.ok(ids("draft", perfil).includes("agendar"));
    assert.ok(ids("archived", perfil).includes("restaurar"));
  }
});

test("painel e botao do editor tambem respeitam podePublicar (fonte)", () => {
  const src = readFileSync(new URL("../../outputs/js/blog-admin/blog-editor.js", import.meta.url), "utf8");
  assert.match(src, /status === "review" && publica\(\) \?/);
  assert.match(src, /\$\{publica\(\) \? `<button[^`]*data-editor-acao="despublicar">[^`]*Despublicar/);
  assert.match(src, /Cancelar agendamento<\/button>` : ""\}` : ""\}/);
  assert.match(src, /status === "archived"\) return \{ acao: "revisao", rotulo: "Restaura[^"]*", icone: "rotate-ccw", desativado: true \}/);
});

/* ---------------- 2. guarda de sessao ---------------- */

const adiavel = () => {
  let liberar;
  const promessa = new Promise((resolve) => { liberar = resolve; });
  return { promessa, liberar };
};

test("guarda: gravacao normal aplica o resultado", async () => {
  const g = criarGuardaDeSessao();
  g.adotar("a");
  const aplicados = [];
  const r = await g.gravar(async () => "ok", (v) => aplicados.push(v));
  assert.equal(r, "ok");
  assert.deepEqual(aplicados, ["ok"]);
});

test("guarda: congelada nao escreve nada (nem chama o repositorio)", async () => {
  const g = criarGuardaDeSessao();
  g.adotar("a");
  g.congelar();
  let chamou = false;
  await assert.rejects(g.gravar(async () => { chamou = true; }), ErroDeSessao);
  assert.equal(chamou, false, "nenhuma escrita com identidade que nao e a do texto");
});

test("guarda: gravacao em andamento durante a troca de conta e descartada, nao entra na conta nova", async () => {
  const g = criarGuardaDeSessao();
  g.adotar("escritor");
  const espera = adiavel();
  const aplicados = [];
  const gravacao = g.gravar(() => espera.promessa, (v) => aplicados.push(v));
  g.congelar(); /* outra aba entrou com outra conta */
  g.adotar("editor");
  espera.liberar("texto-do-escritor");
  await assert.rejects(gravacao, ErroDeSessao);
  assert.deepEqual(aplicados, [], "resultado da conta anterior nao pode aparecer na conta nova");
  /* e a conta nova segue gravando normalmente */
  assert.equal(await g.gravar(async () => "novo", (v) => aplicados.push(v)), "novo");
  assert.deepEqual(aplicados, ["novo"]);
});

test("guarda: renovacao da mesma conta nao invalida nada (editor nao reinicia)", async () => {
  const g = criarGuardaDeSessao();
  g.adotar("editor");
  const geracao = g.geracao;
  const espera = adiavel();
  const aplicados = [];
  const gravacao = g.gravar(() => espera.promessa, (v) => aplicados.push(v));
  assert.equal(g.adotar("editor"), false, "mesma conta: nao e troca");
  assert.equal(g.geracao, geracao);
  espera.liberar("ok");
  assert.equal(await gravacao, "ok");
  assert.deepEqual(aplicados, ["ok"]);
});

test("guarda: Escritor -> Editor -> Owner: cada troca invalida a anterior", () => {
  const g = criarGuardaDeSessao();
  const geracoes = [];
  for (const id of ["w", "e", "o"]) {
    assert.equal(g.adotar(id), true);
    geracoes.push(g.geracao);
  }
  assert.equal(new Set(geracoes).size, 3);
});

/* ---------------- 3. identidade e saida ---------------- */

test("identidadeMudou: so conta conhecida e diferente conta como troca", () => {
  assert.equal(identidadeMudou("a", "b"), true);
  assert.equal(identidadeMudou("a", "a"), false);
  assert.equal(identidadeMudou("a", null), false, "logout e tratado a parte");
  assert.equal(identidadeMudou(null, "b"), false, "primeiro login");
  assert.equal(identidadeDaSessao({ user: { id: "u" } }), "u");
  assert.equal(identidadeDaSessao({ session: { user: { id: "s" } } }), "s");
  assert.equal(identidadeDaSessao(null), null);
});

test("decidirSaida: sem pendencia ou salvo sai; pendencia nao salva pede confirmacao", () => {
  assert.equal(decidirSaida({ temMudancas: false, salvou: false }), "sair");
  assert.equal(decidirSaida({ temMudancas: true, salvou: true }), "sair");
  assert.equal(decidirSaida({ temMudancas: true, salvou: false }), "confirmar");
});

test("textoParaCopia reune titulo e blocos; sem texto devolve vazio", () => {
  const texto = textoParaCopia({
    title: "Titulo", subtitle: "Sub",
    content: [
      { type: "paragraph", text: "Primeiro" },
      { type: "list", items: ["a", "b"] },
      { type: "quote", text: "Citacao", cite: "Autor" },
      { type: "image", caption: "Legenda" },
      { type: "video", url: "https://youtu.be/x", caption: "Video" },
      null,
    ],
  });
  for (const trecho of ["Titulo", "Sub", "Primeiro", "a\nb", "Citacao", "Autor", "Legenda", "https://youtu.be/x"]) assert.ok(texto.includes(trecho), trecho);
  assert.equal(textoParaCopia(null), "");
  assert.equal(textoParaCopia({ content: [] }), "");
});

/* ---------------- 4. fiacao ---------------- */

const ler = (nome) => readFileSync(new URL(`../../outputs/js/blog-admin/${nome}`, import.meta.url), "utf8");

test("fiacao do editor: descartar nao grava e invalida gravacoes em andamento", () => {
  const src = ler("blog-editor.js");
  const descartar = src.slice(src.indexOf("    descartar() {"), src.indexOf("    textoPendente"));
  assert.match(descartar, /geracao \+= 1/);
  assert.match(descartar, /clearTimeout\(espera\)/);
  assert.match(descartar, /post = null/);
  assert.match(descartar, /campo\.value = ""/);
  assert.match(descartar, /data-editor-blocos/);
  assert.doesNotMatch(descartar, /folha\.replaceChildren/, "a estrutura fixa da folha nao pode ser destruida");
  assert.doesNotMatch(descartar, /salvar\(|salvarRegistro/, "descartar nunca grava");
  assert.match(src, /if \(!post\) return false;\r?\n\s+const minha = geracao;/);
  assert.equal((src.match(/minha !== geracao/g) || []).length >= 4, true);
});

test("fiacao da mesa: gravar/excluir passam pela guarda; sair e isolar limpam e congelam", () => {
  const src = ler("mesa-app.js");
  assert.match(src, /guarda\.gravar\(\(\) => repositorio\.salvar\(/);
  assert.match(src, /guarda\.gravar\(\(\) => repositorio\.remover\(/);
  const isolar = src.slice(src.indexOf("  function isolar() {"), src.indexOf("  async function carregar()"));
  assert.match(isolar, /guarda\.congelar\(\)/);
  assert.match(isolar, /editor\.descartar\(\)/);
  assert.match(isolar, /registros: \[\]/);
  assert.match(src, /async prepararSaida\(\)/);
  assert.match(src, /extra: \{\s+rotulo: "Copiar texto"/);
  assert.match(src, /identidade !== guarda\.identidade/);
  assert.match(src, /await editor\.sair\(\)\.catch\(\(\) => false\)/);
});

test("fiacao da entrada: logout grava antes, troca em outra aba isola, sessao renovada nao reinicia", () => {
  const src = ler("blog-admin-entry.js");
  assert.match(src, /client\.auth\.onAuthStateChange\(/);
  assert.match(src, /identidadeMudou\(identidadeAtual,/);
  assert.match(src, /mesa\.prepararSaida\(\)/);
  assert.match(src, /saidaLiberada = true;\s+botao\.click\(\)/);
  assert.match(src, /identidade: demo \? "demonstracao" : identidadeAtual/);
  /* a renovacao da mesma conta segue pela decisao de entrada, sem reabrir */
  assert.match(src, /entradaAoAutorizar\(/);
});

test("nada de autorizacao no banco foi tocado por esta correcao", () => {
  const src = ler("mesa-sessao.js");
  assert.doesNotMatch(src, /supabase|rpc\(|has_portal_permission/);
});

/* ---------------- 5. repositorio protegido e respostas de sessao antiga ---------------- */

test("repositorio protegido: resposta de sessao antiga e descartada, nada chega a sessao nova", async () => {
  const g = criarGuardaDeSessao();
  g.adotar("escritor");
  const espera = adiavel();
  const bruto = { listar: () => espera.promessa, lerConfiguracao: async () => "cfg", reset() {} };
  Object.defineProperty(bruto, "demonstracao", { get: () => false });
  const repo = protegerRepositorio(bruto, g);
  const carga = repo.listar(); /* carga iniciada pela conta do Escritor */
  g.congelar();
  g.adotar("editor"); /* troca de conta antes da resposta */
  espera.liberar(["rascunho-privado-do-escritor"]);
  await assert.rejects(carga, ErroDeSessao);
  assert.equal(await repo.lerConfiguracao(), "cfg", "a conta nova usa o repositorio normalmente");
  assert.equal(repo.demonstracao, false, "propriedades passam adiante");
});

test("repositorio protegido: sessao congelada nem chega a chamar o servidor", async () => {
  const g = criarGuardaDeSessao();
  g.adotar("a");
  g.congelar();
  let chamadas = 0;
  const repo = protegerRepositorio({ salvar: async () => { chamadas += 1; }, remover: async () => { chamadas += 1; }, moderar: async () => { chamadas += 1; } }, g);
  for (const metodo of ["salvar", "remover", "moderar"]) await assert.rejects(repo[metodo](), ErroDeSessao);
  assert.equal(chamadas, 0);
});

test("repositorio protegido: mesma conta com sessao renovada segue normal", async () => {
  const g = criarGuardaDeSessao();
  g.adotar("editor");
  const repo = protegerRepositorio({ listar: async () => [1] }, g);
  const pendente = repo.listar();
  g.adotar("editor");
  assert.deepEqual(await pendente, [1]);
});

test("fiacao: a Mesa so enxerga o repositorio protegido; carga antiga nao preenche; telas e perfil sao limpos", () => {
  const src = ler("mesa-app.js");
  assert.match(src, /repositorio: repositorioBruto/);
  assert.match(src, /const repositorio = protegerRepositorio\(repositorioBruto, guarda\)/);
  const carregar = src.slice(src.indexOf("  async function carregar()"), src.indexOf("  async function salvarRegistro"));
  assert.match(carregar, /const minha = guarda\.geracao/);
  assert.match(carregar, /minha !== guarda\.geracao\) throw new ErroDeSessao\(\)/);
  assert.match(src, /if \(erro instanceof ErroDeSessao\) return;/);
  const isolar = src.slice(src.indexOf("  function isolar() {"), src.indexOf("  async function carregar()"));
  assert.match(isolar, /secao\.replaceChildren\(\)/);
  assert.match(isolar, /mesaView !== "editor"/);
  assert.match(isolar, /data-mesa-perfil/);
  assert.match(isolar, /menu\.fechar\(\)/);
  assert.match(src, /guarda\.gravar\(\(\) => repositorio\.salvar\(/);
  assert.match(src, /guarda\.gravar\(\(\) => repositorio\.remover\(/);
});
