import assert from "node:assert/strict";
import test from "node:test";
import { criarDadosSupabase } from "../../outputs/js/conta/adaptadores/supabase.js";
import { ErroDeConta } from "../../outputs/js/conta/mensagens.js";

/* Cliente falso: a tabela antiga devolve `antigas`; a RPC devolve `rpc` (dados ou erro). */
function cliente({ antigas = [], rpc = { data: [], error: null }, erroTabela = null } = {}) {
  const chamadas = { rpc: [], tabelas: [] };
  const construtor = (tabela) => {
    chamadas.tabelas.push(tabela);
    const c = {};
    for (const m of ["select", "order", "eq"]) c[m] = () => c;
    c.then = (ok, falha) => Promise.resolve({ data: erroTabela ? null : antigas, error: erroTabela }).then(ok, falha);
    return c;
  };
  return {
    chamadas,
    from: construtor,
    async rpc(nome, args) {
      chamadas.rpc.push([nome, args]);
      return rpc;
    },
  };
}

const DA_OPERACAO = {
  id: "enr-1", course_ref: "off-1", course_title: "Meditação Intensiva", teacher_name: "Profa. Lia",
  modality: "Online", status: "proximo_encontro", next_session_at: "2099-01-01T12:00:00Z", enrolled_at: "2026-11-01T10:00:00Z",
};
const ANTIGA = { id: "old-1", user_id: "u1", course_ref: "curso-antigo", course_title: "Curso antigo", status: "inscrito" };

test("inscrições vêm da função da operação, sem parâmetro de conta, e ainda mostram as antigas", async () => {
  const c = cliente({ antigas: [ANTIGA], rpc: { data: [DA_OPERACAO], error: null } });
  const dados = criarDadosSupabase({ client: c });
  const lista = await dados.listar("inscricoes", "u1");
  assert.deepEqual(c.chamadas.rpc, [["my_course_enrollments", undefined]], "uma chamada, sem identificador de conta");
  assert.equal(lista.length, 2);
  assert.equal(lista[0].cursoRef, "off-1", "a operação vem primeiro");
  assert.ok(lista.some((i) => i.cursoRef === "curso-antigo"));
});

test("mesma turma na operação e na tabela antiga não duplica", async () => {
  const c = cliente({ antigas: [{ ...ANTIGA, course_ref: "off-1" }], rpc: { data: [DA_OPERACAO], error: null } });
  const lista = await criarDadosSupabase({ client: c }).listar("inscricoes", "u1");
  assert.equal(lista.length, 1);
  assert.equal(lista[0].id, "enr-1");
});

test("função ainda não aplicada (PGRST202 ou 42883): cai para a tabela antiga sem quebrar", async () => {
  for (const code of ["PGRST202", "42883"]) {
    const c = cliente({ antigas: [ANTIGA], rpc: { data: null, error: { code } } });
    const lista = await criarDadosSupabase({ client: c }).listar("inscricoes", "u1");
    assert.equal(lista.length, 1, code);
    assert.equal(lista[0].cursoRef, "curso-antigo");
  }
});

test("outro erro da função não é escondido", async () => {
  const c = cliente({ antigas: [ANTIGA], rpc: { data: null, error: { code: "42501", message: "negado" } } });
  await assert.rejects(criarDadosSupabase({ client: c }).listar("inscricoes", "u1"), ErroDeConta);
});

test("resposta inesperada da função vira lista vazia e mantém as antigas", async () => {
  const c = cliente({ antigas: [ANTIGA], rpc: { data: null, error: null } });
  const lista = await criarDadosSupabase({ client: c }).listar("inscricoes", "u1");
  assert.equal(lista.length, 1);
});

test("outras coleções não chamam a função de inscrições", async () => {
  const c = cliente({ antigas: [] });
  await criarDadosSupabase({ client: c }).listar("salvos", "u1");
  assert.equal(c.chamadas.rpc.length, 0);
});
