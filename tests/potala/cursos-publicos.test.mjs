import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { prepararCurso, renderizarCatalogo, montarCartao, textoDeData } from "../../outputs/js/cursos/catalogo-publico.js";

const ler = (caminho) => readFileSync(new URL(`../../${caminho}`, import.meta.url), "utf8");

/* DOM minimo: o suficiente para provar que texto vai por textContent e que os estados aparecem. */
function criarDoc() {
  class No {
    constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.className = ""; this._text = ""; this.listeners = {}; }
    get firstChild() { return this.children[0] || null; }
    set textContent(v) { this._text = String(v); this.children = []; }
    get textContent() { return this._text + this.children.map((c) => c.textContent).join(""); }
    appendChild(c) { this.children.push(c); return c; }
    removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    addEventListener(t, fn) { this.listeners[t] = fn; }
    find(pred, acc = []) { if (pred(this)) acc.push(this); this.children.forEach((c) => c.find && c.find(pred, acc)); return acc; }
  }
  const doc = { createElement: (t) => new No(t), createTextNode: (t) => { const n = new No("#text"); n._text = String(t); return n; } };
  return { doc, raiz: Object.assign(new No("section"), { ownerDocument: doc }) };
}

const CURSO = {
  id: "off-1", title: "Curso Yoaga", summary: "Práticas e respiração.", kind: "course", mode: "online",
  capacity: 2, spots_left: 1, availability: "aberta", price_text: "R$ 120", image: "media/cursos/yoga.jpg",
  teacher_name: "Profissional Oficial", next_session: { starts_at: "2026-12-01T13:00:00Z", ends_at: "2026-12-01T14:00:00Z", mode: "online" },
};

test("prepararCurso: disponibilidade e campos oficiais", () => {
  const c = prepararCurso(CURSO, "America/Sao_Paulo");
  assert.equal(c.titulo, "Curso Yoaga");
  assert.equal(c.disponibilidade, "1 vaga restante");
  assert.equal(c.modalidade, "Online");
  assert.equal(c.imagem, "media/cursos/yoga.jpg");
  assert.match(c.proxima, /10:00/);
  assert.equal(prepararCurso({ ...CURSO, availability: "esgotado", spots_left: 0 }).disponibilidade, "Turma lotada");
  assert.equal(prepararCurso({ ...CURSO, capacity: null, spots_left: null }).disponibilidade, "Vagas abertas");
  assert.equal(prepararCurso({ ...CURSO, spots_left: 3 }).disponibilidade, "3 vagas restantes");
});

test("prepararCurso: descarta linha invalida e imagem fora de media/", () => {
  assert.equal(prepararCurso(null), null);
  assert.equal(prepararCurso({ id: "x", title: "  " }), null);
  for (const imagem of ["https://exemplo.com/a.jpg", "javascript:alert(1)", "media/../segredo.png", "/media/a.jpg", "data:image/png;base64,AA"]) {
    assert.equal(prepararCurso({ ...CURSO, image: imagem }).imagem, "", imagem);
  }
  assert.equal(textoDeData("lixo"), "");
});

test("cartao usa textContent: HTML do titulo nao vira marcacao", () => {
  const { doc } = criarDoc();
  const cartao = montarCartao(doc, prepararCurso({ ...CURSO, title: "<img src=x onerror=alert(1)>", summary: "<script>x</script>" }));
  assert.match(cartao.textContent, /<img src=x onerror=alert\(1\)>/);
  assert.equal(cartao.find((n) => n.tag === "img").length, 1); /* so a imagem do curso, nunca a injetada */
  assert.equal(cartao.find((n) => n.tag === "script").length, 0);
  const contato = cartao.find((n) => n.tag === "a")[0];
  assert.equal(contato.attrs.href, "recepcao.html");
});

test("estados: lista, vazio e erro com nova tentativa", async () => {
  const a = criarDoc();
  assert.equal(await renderizarCatalogo(a.raiz, { buscar: async () => [CURSO] }), 1);
  assert.equal(a.raiz.find((n) => n.tag === "article").length, 1);

  const b = criarDoc();
  assert.equal(await renderizarCatalogo(b.raiz, { buscar: async () => [] }), 0);
  assert.match(b.raiz.textContent, /não há turmas abertas/);
  assert.equal(b.raiz.find((n) => n.tag === "article").length, 0);

  const c = criarDoc();
  let tentativas = 0;
  const buscar = async () => { tentativas += 1; if (tentativas === 1) throw new Error("rede"); return [CURSO]; };
  assert.equal(await renderizarCatalogo(c.raiz, { buscar }), -1);
  assert.match(c.raiz.textContent, /Não foi possível carregar/);
  const botao = c.raiz.find((n) => n.tag === "button")[0];
  botao.listeners.click();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(c.raiz.find((n) => n.tag === "article").length, 1);
});

test("pagina Cursos carrega o catalogo real e nao tem turmas escritas na pagina", () => {
  const html = ler("outputs/cursos.html");
  assert.match(html, /data-catalogo-publico/);
  assert.match(html, /js\/cursos\/catalogo-publico\.js/);
  assert.match(html, /css\/catalogo-publico\.css/);
  assert.doesNotMatch(html, /data-ofertas|catalogo-demonstracao|TESTE INTERNO/);
});

test("formulario da turma: Owner marca divulgacao e descricao", () => {
  const js = ler("outputs/js/admin/operations/controller.js");
  assert.match(js, /name="published" value="true"/);
  assert.match(js, /published:v\.published==='true'/);
  assert.match(js, /summary:String\(v\.summary/);
});

test("migration: leitura publica minima, sem dados de aluno", () => {
  const sql = ler("supabase/migrations/202611160001_cursos_publicos.sql");
  const codigo = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  assert.match(codigo, /create or replace function public\.list_public_courses\(\)/);
  assert.match(codigo, /security definer/);
  assert.match(codigo, /set search_path = ''/);
  assert.match(codigo, /\bstable\b/);
  assert.match(codigo, /o\.document ->> 'published' = 'true'/);
  assert.match(codigo, /in \('course', 'workshop', 'lecture', 'event', 'cultural'\)/);
  assert.match(codigo, /revoke all on function public\.list_public_courses\(\) from public, anon, authenticated/);
  assert.match(codigo, /grant execute on function public\.list_public_courses\(\) to anon, authenticated/);
  /* nada que identifique aluno ou exponha acesso privado */
  for (const proibido of ["online_url", "email", "phone", "profile_id'", "idempotency", "contact"]) {
    assert.ok(!codigo.includes(proibido), `nao pode devolver ${proibido}`);
  }
  /* apenas as colunas de leitura de op_records, nenhum insert/update/delete/ddl de dados */
  assert.doesNotMatch(codigo, /\b(insert|update|delete|alter table|create table|create policy|disable row level)\b/i);
  /* inscricoes entram so como contagem */
  assert.match(codigo, /select count\(\*\)::integer as n/);
});

test("rollback remove apenas a funcao", () => {
  const sql = ler("supabase/rollbacks/202611160001_rollback_cursos_publicos.sql");
  const codigo = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  assert.match(codigo, /drop function if exists public\.list_public_courses\(\)/);
  assert.doesNotMatch(codigo, /\b(delete|truncate|drop table|update)\b/i);
});
