import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { comoRegistro, criarBlogDeDemonstracao, statusEfetivo } from "../../outputs/js/blog/blog-remoto.js";
import { createBlogRepository } from "../../outputs/js/blog/blog-repository.js";
import { autorPadrao, dataAoPublicar } from "../../outputs/js/blog-admin/blog-editor.js";
import { contarPorStatus, dataDePublicacao, filtrarPosts, horaDe, instanteDe, partesDoInstante, resumoDaMesa } from "../../outputs/js/blog-admin/mesa-modelo.js";
import { criarAvisos, MAXIMO_DE_AVISOS } from "../../outputs/js/blog-admin/mesa-ui.js";

test("D-1: autor padrão nunca é o e-mail de login", () => {
  assert.equal(autorPadrao({ nome: "admin@potala.org", autor: "" }), "Instituto Potala");
  assert.equal(autorPadrao({ autor: "admin@potala.org" }), "Instituto Potala");
  assert.equal(autorPadrao(null), "Instituto Potala");
  assert.equal(autorPadrao({ autor: "  Lama Padma  " }), "Lama Padma");
});

const HORA = "2026-10-27T13:00:00Z"; // 10:00 em America/Sao_Paulo
const antes = Date.parse("2026-10-27T12:59:59Z");
const depois = Date.parse("2026-10-27T13:00:01Z");

test("D-2: statusEfetivo antes, na hora e depois do agendamento", () => {
  assert.equal(statusEfetivo("scheduled", HORA, antes), "scheduled");
  assert.equal(statusEfetivo("scheduled", HORA, Date.parse(HORA)), "published");
  assert.equal(statusEfetivo("scheduled", HORA, depois), "published");
  assert.equal(statusEfetivo("scheduled", null, depois), "scheduled");
  assert.equal(statusEfetivo("draft", HORA, depois), "draft");
});

test("D-2: registro vencido conta e filtra como publicado, mantendo o status gravado", () => {
  const vencido = comoRegistro({ status: "scheduled", publish_at: "2020-01-01T13:00:00Z", document: { id: "a", title: "A" } });
  const futuro = comoRegistro({ status: "scheduled", publish_at: "2999-01-01T13:00:00Z", document: { id: "b", title: "B" } });
  assert.equal(vencido.statusGravado, "scheduled");
  assert.equal(vencido.status, "published");
  assert.equal(futuro.status, "scheduled");
  const contagem = contarPorStatus([vencido, futuro]);
  assert.equal(contagem.published, 1);
  assert.equal(contagem.scheduled, 1);
  assert.deepEqual(filtrarPosts([vencido, futuro], { status: "scheduled" }).map((r) => r.id), ["b"]);
  const resumo = resumoDaMesa([vencido, futuro]);
  assert.equal(resumo.numeros.agendados, 1);
  assert.deepEqual(resumo.agendados.map((r) => r.id), ["b"]);
});

function mesaDemonstrativa(storage, relogio) {
  const local = createBlogRepository({ storage, defaults: [], key: "teste.posts" });
  return criarBlogDeDemonstracao({ local, storage, metadataKey: "teste.meta", relogio });
}

function armazenamentoFalso() {
  const dados = new Map();
  return {
    getItem: (chave) => dados.get(chave) ?? null,
    setItem: (chave, valor) => dados.set(chave, valor),
    removeItem: (chave) => dados.delete(chave),
  };
}

const RELOGIO = () => new Date("2026-10-27T00:00:00Z");
const HORARIOS = [
  ["2026-10-28", "00:00", "2026-10-28T03:00:00.000Z"],
  ["2026-10-28", "09:59", "2026-10-28T12:59:00.000Z"],
  ["2026-10-28", "10:00", "2026-10-28T13:00:00.000Z"],
  ["2026-10-28", "10:01", "2026-10-28T13:01:00.000Z"],
  ["2026-10-28", "09:30", "2026-10-28T12:30:00.000Z"],
  ["2026-10-28", "12:00", "2026-10-28T15:00:00.000Z"],
  ["2026-10-28", "23:59", "2026-10-29T02:59:00.000Z"],
  ["2026-10-31", "23:59", "2026-11-01T02:59:00.000Z"],
  ["2026-11-01", "00:01", "2026-11-01T03:01:00.000Z"],
];

test("D-2: data e hora persistem na demonstração depois de reload e reabertura do editor", async () => {
  for (const [dia, hora, utc] of HORARIOS) {
    const storage = armazenamentoFalso();
    const post = { id: `teste-${dia}-${hora}`, slug: "teste-agenda", title: "Teste de agenda", author: "Instituto Potala", category: "artigos", publishedAt: dia, content: [{ id: "p", type: "paragraph", text: "Conteúdo preservado" }] };
    const instante = instanteDe(dia, hora);
    assert.equal(instante.toISOString(), utc);
    const antes = mesaDemonstrativa(storage, RELOGIO);
    const salvo = await antes.salvar(post, "agendar", { quando: instante });
    assert.equal(salvo.publicarEm, utc);
    assert.deepEqual(partesDoInstante(salvo.publicarEm), { dia, hora });

    const aposReload = mesaDemonstrativa(storage, RELOGIO);
    const [reaberto] = await aposReload.listar();
    assert.equal(reaberto.publicarEm, utc, `${dia} ${hora}: instante perdido no reload`);
    assert.deepEqual(partesDoInstante(reaberto.publicarEm), { dia, hora }, `${dia} ${hora}: inputs vazios ou alterados`);
    assert.equal(horaDe(dataDePublicacao(reaberto)), hora, `${dia} ${hora}: horário da Visão geral alterado`);
    assert.equal(reaberto.status, "scheduled");
    assert.equal(reaberto.post.publishedAt, dia);
    assert.equal(reaberto.post.author, post.author);
    assert.equal(reaberto.post.content[0].text, post.content[0].text);
    assert.equal(resumoDaMesa([reaberto]).numeros.agendados, 1);
    assert.deepEqual(filtrarPosts([reaberto], { status: "scheduled" }).map(({ id }) => id), [post.id]);
  }
});

test("D-2: inputs de data e hora reabrem preenchidos após reload completo", async () => {
  const storage = armazenamentoFalso();
  const post = { id: "formulario", slug: "formulario", title: "Formulário", author: "Instituto Potala", category: "artigos", publishedAt: "2026-10-28" };
  await mesaDemonstrativa(storage, RELOGIO).salvar(post, "agendar", { quando: instanteDe("2026-10-28", "10:00") });
  const [reaberto] = await mesaDemonstrativa(storage, RELOGIO).listar();
  assert.deepEqual(partesDoInstante(reaberto.publicarEm), { dia: "2026-10-28", hora: "10:00" });
});

test("D-2: segundo salvamento e edição de texto não deslocam a agenda", async () => {
  const storage = armazenamentoFalso();
  const post = { id: "duplo", slug: "duplo", title: "Antes", author: "Instituto Potala", category: "artigos", publishedAt: "2026-10-28" };
  await mesaDemonstrativa(storage, RELOGIO).salvar(post, "agendar", { quando: instanteDe("2026-10-28", "10:00") });
  const mesa = mesaDemonstrativa(storage, RELOGIO);
  const [reaberto] = await mesa.listar();
  const campos = partesDoInstante(reaberto.publicarEm);
  const atualizado = await mesa.salvar({ ...reaberto.post, title: "Depois" }, "agendar", { quando: instanteDe(campos.dia, campos.hora) });
  assert.equal(atualizado.publicarEm, "2026-10-28T13:00:00.000Z");
  const [segundoReload] = await mesaDemonstrativa(storage, RELOGIO).listar();
  assert.deepEqual(partesDoInstante(segundoReload.publicarEm), { dia: "2026-10-28", hora: "10:00" });
  assert.equal(segundoReload.post.title, "Depois");
});

test("D-2: alterar o dia pelo editor troca o instante sem deslocamento", async () => {
  const storage = armazenamentoFalso();
  const post = { id: "alterar", slug: "alterar", title: "Alterar", category: "artigos", publishedAt: "2026-10-28" };
  await mesaDemonstrativa(storage, RELOGIO).salvar(post, "agendar", { quando: instanteDe("2026-10-28", "10:00") });
  const mesa = mesaDemonstrativa(storage, RELOGIO);
  const [anterior] = await mesa.listar();
  await mesa.salvar({ ...anterior.post, publishedAt: "2026-11-01" }, "agendar", { quando: instanteDe("2026-11-01", "09:30") });
  const [novo] = await mesaDemonstrativa(storage, RELOGIO).listar();
  assert.equal(novo.publicarEm, "2026-11-01T12:30:00.000Z");
  assert.deepEqual(partesDoInstante(novo.publicarEm), { dia: "2026-11-01", hora: "09:30" });
  assert.equal(novo.post.publishedAt, "2026-11-01");
});

test("D-2: campos vazios e datas impossíveis não geram agendamento", async () => {
  for (const [dia, hora] of [["", "10:00"], ["2026-10-28", ""], ["2026-02-30", "10:00"], ["2026-10-28", "24:00"], ["2026-10-28", "10:60"]]) {
    assert.equal(instanteDe(dia, hora), null, `${dia} ${hora}`);
  }
  const mesa = mesaDemonstrativa(armazenamentoFalso(), RELOGIO);
  await assert.rejects(() => mesa.salvar({ id: "invalido", title: "Inválido" }, "agendar", { quando: null }), /futuro/);
  assert.deepEqual(await mesa.listar(), []);
});

test("D-2: o fuso do computador não altera a hora de Brasília", () => {
  const modulo = new URL("../../outputs/js/blog-admin/mesa-modelo.js", import.meta.url).href;
  const codigo = `import { instanteDe, partesDoInstante } from ${JSON.stringify(modulo)}; const instante = instanteDe("2026-10-28", "10:00"); console.log(JSON.stringify({ utc: instante.toISOString(), campos: partesDoInstante(instante) }));`;
  for (const TZ of ["UTC", "Pacific/Honolulu", "Asia/Tokyo"]) {
    const processo = spawnSync(process.execPath, ["--input-type=module", "--eval", codigo], { encoding: "utf8", env: { ...process.env, TZ } });
    assert.equal(processo.status, 0, processo.stderr);
    assert.deepEqual(JSON.parse(processo.stdout), { utc: "2026-10-28T13:00:00.000Z", campos: { dia: "2026-10-28", hora: "10:00" } });
  }
});

test("D-2: cancelar agendamento após reload limpa o instante sem alterar conteúdo", async () => {
  const storage = armazenamentoFalso();
  const post = { id: "cancelar", slug: "cancelar", title: "Cancelar", author: "Instituto Potala", category: "artigos", publishedAt: "2026-10-28", content: [{ id: "p", type: "paragraph", text: "Permanece" }] };
  await mesaDemonstrativa(storage, RELOGIO).salvar(post, "agendar", { quando: instanteDe("2026-10-28", "10:00") });
  const mesa = mesaDemonstrativa(storage, RELOGIO);
  const [agendado] = await mesa.listar();
  const cancelado = await mesa.salvar(agendado.post, "despublicar");
  assert.equal(cancelado.status, "draft");
  assert.equal(cancelado.publicarEm, null);
  const [reaberto] = await mesaDemonstrativa(storage, RELOGIO).listar();
  assert.equal(reaberto.status, "draft");
  assert.equal(reaberto.publicarEm, null);
  assert.equal(reaberto.post.author, post.author);
  assert.equal(reaberto.post.content[0].text, "Permanece");
});

test("D-2: agendamento vencido, atualização publicada e despublicação preservam a data editorial", async () => {
  const storage = armazenamentoFalso();
  const post = { id: "vencido", slug: "vencido", title: "Original", author: "Instituto Potala", category: "artigos", publishedAt: "2026-10-28", content: [{ id: "p", type: "paragraph", text: "Original" }] };
  await mesaDemonstrativa(storage, RELOGIO).salvar(post, "agendar", { quando: instanteDe("2026-10-28", "10:00") });
  const depoisDaHora = () => new Date("2026-10-28T13:00:01Z");
  const mesa = mesaDemonstrativa(storage, depoisDaHora);
  const [vencido] = await mesa.listar();
  assert.equal(vencido.statusGravado, "scheduled");
  assert.equal(vencido.status, "published");
  assert.equal(vencido.publicarEm, "2026-10-28T13:00:00.000Z");
  assert.equal(dataAoPublicar(vencido, vencido.post.publishedAt, "2026-10-29"), "2026-10-28");

  const atualizado = await mesa.salvar({ ...vencido.post, title: "Atualizado", publishedAt: dataAoPublicar(vencido, vencido.post.publishedAt, "2026-10-29") }, "publicar");
  assert.equal(atualizado.post.publishedAt, "2026-10-28");
  const [reaberto] = await mesaDemonstrativa(storage, depoisDaHora).listar();
  assert.equal(reaberto.status, "published");
  assert.equal(reaberto.post.title, "Atualizado");
  assert.equal(reaberto.post.author, post.author);
  assert.equal(reaberto.post.content[0].text, "Original");
  assert.equal(reaberto.post.publishedAt, "2026-10-28");

  await mesa.salvar(reaberto.post, "despublicar");
  const [rascunho] = await mesaDemonstrativa(storage, depoisDaHora).listar();
  assert.equal(rascunho.status, "draft");
  assert.equal(rascunho.publicarEm, null);
  assert.equal(rascunho.post.publishedAt, "2026-10-28");
});

test("D-2: contrato remoto lê o instante UTC sem alterar a data editorial", () => {
  const registro = comoRegistro({ status: "scheduled", publish_at: "2026-10-28T13:00:00.000Z", document: { id: "remoto", title: "Remoto", author: "Instituto Potala", publishedAt: "2026-10-28" } });
  assert.equal(registro.publicarEm, "2026-10-28T13:00:00.000Z");
  assert.deepEqual(partesDoInstante(registro.publicarEm), { dia: "2026-10-28", hora: "10:00" });
  assert.equal(registro.post.publishedAt, "2026-10-28");
  assert.equal(registro.post.author, "Instituto Potala");
});

function raizFalsa() {
  const filhos = [];
  const criar = () => {
    const el = { dataset: {}, attrs: {}, innerHTML: "", ouvintes: {},
      setAttribute(k, v) { this.attrs[k] = v; },
      querySelector(sel) { return sel.includes("fechar") || (sel.includes("acao") && this.innerHTML.includes("mesa-aviso__acao")) ? { addEventListener: (_t, f) => { el.ouvintes[sel] = f; } } : null; },
      remove() { const i = filhos.indexOf(el); if (i >= 0) filhos.splice(i, 1); } };
    return el;
  };
  return { children: filhos, ownerDocument: { createElement: criar }, append(el) { filhos.push(el); } };
}

test("ER13: avisos iguais não se empilham e há no máximo 3 na tela", () => {
  const raiz = raizFalsa();
  const avisos = criarAvisos(raiz);
  avisos.mostrar("Falhou.", { tipo: "erro", duracao: 0 });
  avisos.mostrar("Falhou.", { tipo: "erro", duracao: 0 });
  assert.equal(raiz.children.length, 1);
  for (const n of [1, 2, 3, 4]) avisos.mostrar(`Erro ${n}`, { tipo: "erro", duracao: 0 });
  assert.equal(raiz.children.length, MAXIMO_DE_AVISOS);
  assert.equal(raiz.children[0].attrs.role, "alert");
});

test("ER13: erro sem ação fecha sozinho; erro com ação fica", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const raiz = raizFalsa();
  const avisos = criarAvisos(raiz);
  avisos.mostrar("Sem ação", { tipo: "erro" });
  avisos.mostrar("Com ação", { tipo: "erro", acao: { rotulo: "Tentar de novo", executar() {} } });
  t.mock.timers.tick(12000);
  assert.deepEqual(raiz.children.map((a) => a.dataset.chave), ["erro|Com ação"]);
});

test("Risco publish_at: atualizar agendado já no ar mantém a data exibida no Blog", () => {
  const vencido = comoRegistro({ status: "scheduled", publish_at: "2026-10-20T13:00:00Z", document: { id: "c", title: "C", publishedAt: "2026-10-20" } });
  assert.equal(dataAoPublicar(vencido, "2026-10-20", "2026-10-26"), "2026-10-20");
  const futuro = comoRegistro({ status: "scheduled", publish_at: "2999-01-01T13:00:00Z", document: { id: "d", title: "D", publishedAt: "2999-01-01" } });
  assert.equal(dataAoPublicar(futuro, "2999-01-01", "2026-10-26"), "2026-10-26");
  assert.equal(dataAoPublicar(null, "", "2026-10-26"), "2026-10-26");
});
