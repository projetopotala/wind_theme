/*
 * MP-04 — DADOS REAIS NUNCA SE MISTURAM COM DADOS DE DEMONSTRAÇÃO.
 *
 * Os testes usam a sessão real (criarSessao) e o adaptador Supabase real
 * (criarDadosSupabase) com um cliente falso que responde como o PostgREST:
 * sucesso, tabela ausente (PGRST205), falha de rede e permissão negada.
 * Em nenhum caso a resposta pode trazer dado de demonstração.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { criarSessao } from "../../outputs/js/conta/sessao.js";
import * as sessaoModulo from "../../outputs/js/conta/sessao.js";
import { criarDadosSupabase } from "../../outputs/js/conta/adaptadores/supabase.js";
import { DadosIndisponiveis, ErroDeConta, mensagemDoErro } from "../../outputs/js/conta/mensagens.js";
import { querDemonstracao } from "../../outputs/js/conta/conta.js";
import { criarUsuario } from "../../outputs/js/conta/modelos.js";

const USUARIO = criarUsuario({ id: "11111111-1111-4111-8111-111111111111", email: "pessoa@exemplo.com", nome: "Pessoa Real" });

function autenticacao(usuario = USUARIO) {
  return {
    demonstracao: false,
    async sessaoAtual() {
      return { usuario };
    },
    aoMudar() {
      return () => {};
    },
  };
}

/* Um cliente que responde como o PostgREST, por tabela. */
function clienteFalso(respostas = {}) {
  const pedidos = [];
  const consulta = (tabela) => {
    const resposta = () => {
      const r = respostas[tabela] ?? { data: [], error: null };
      if (r instanceof Error) return Promise.reject(r);
      return Promise.resolve(r);
    };
    const encadear = {
      select: () => encadear,
      order: () => resposta(),
      eq: () => encadear,
      maybeSingle: () => resposta(),
    };
    return encadear;
  };
  return {
    pedidos,
    from(tabela) {
      pedidos.push(tabela);
      return consulta(tabela);
    },
  };
}

const SALVO_REAL = {
  id: "22222222-2222-4222-8222-222222222222",
  user_id: USUARIO.id,
  item_type: "artigo",
  item_ref: "texto-real",
  title: "Texto que a pessoa salvou de verdade",
  href: "/artigo.html?post=texto-real",
  saved_at: "2026-10-24T12:00:00.000Z",
};

async function sessaoReal(respostas) {
  const client = clienteFalso({ profiles: { data: null, error: null }, ...respostas });
  const sessao = criarSessao({ autenticacao: autenticacao(), dados: criarDadosSupabase({ client }) });
  await sessao.iniciar();
  return { sessao, client };
}

test("MP-04: a costura que trocava o banco pela demonstração não existe mais", () => {
  assert.equal("comReserva" in sessaoModulo, false);
});

test("MP-04: com o banco respondendo, a pessoa vê só o que é dela", async () => {
  const { sessao } = await sessaoReal({ saved_items: { data: [SALVO_REAL], error: null } });
  const salvos = await sessao.colecao("salvos").listar();
  assert.deepEqual(salvos.map((item) => item.titulo), ["Texto que a pessoa salvou de verdade"]);
  assert.equal(sessao.obter().demonstracao, false);
  assert.equal(sessao.obter().dadosEmReserva, false);
});

test("MP-04: tabela ausente vira erro controlado, nunca dados de demonstração", async () => {
  const { sessao } = await sessaoReal({ saved_items: { data: null, error: { code: "PGRST205", message: "relation not found" } } });
  const erro = await sessao.colecao("salvos").listar().then(() => null, (falha) => falha);
  assert.ok(erro instanceof DadosIndisponiveis, "a falha precisa subir, não ser trocada por dados fictícios");
  assert.match(mensagemDoErro(erro), /ainda não está disponível/);
  assert.equal(sessao.obter().dadosEmReserva, false);

  /* E a próxima leitura de outra coleção continua indo ao banco, sem "travar" na demonstração. */
  const outra = await sessao.colecao("historico").listar();
  assert.deepEqual(outra, []);
});

test("MP-04: tabela ausente numa gravação também falha — nada vai para o navegador como se fosse do banco", async () => {
  const client = clienteFalso({ profiles: { data: null, error: null } });
  client.from = (tabela) => ({
    upsert: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: { code: "42P01" } }) }) }),
    insert: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: { code: "42P01" } }) }) }),
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    tabela,
  });
  const sessao = criarSessao({ autenticacao: autenticacao(), dados: criarDadosSupabase({ client }) });
  await sessao.iniciar();
  await assert.rejects(
    sessao.colecao("salvos").gravar({ tipo: "artigo", ref: "x", titulo: "X", href: "/artigo.html?post=x" }),
    (erro) => erro instanceof DadosIndisponiveis,
  );
});

test("MP-04: falha de rede e permissão negada sobem como erro, sem dados substitutos", async () => {
  const rede = await sessaoReal({ saved_items: new TypeError("Failed to fetch") });
  const erroRede = await rede.sessao.colecao("salvos").listar().then(() => null, (falha) => falha);
  assert.ok(erroRede, "falha de rede não pode virar lista");
  assert.match(mensagemDoErro(erroRede), /Confira sua conexão|Algo não saiu/);

  const negada = await sessaoReal({ saved_items: { data: null, error: { code: "42501", message: "permission denied" } } });
  const erroNegado = await negada.sessao.colecao("salvos").listar().then(() => null, (falha) => falha);
  assert.ok(erroNegado instanceof ErroDeConta && !(erroNegado instanceof DadosIndisponiveis));
});

test("MP-04: sem sessão, nenhuma coleção pessoal é pedida ao banco", async () => {
  const client = clienteFalso({ saved_items: { data: [SALVO_REAL], error: null } });
  const sessao = criarSessao({ autenticacao: autenticacao(null), dados: criarDadosSupabase({ client }) });
  await sessao.iniciar();
  assert.equal(sessao.obter().status, "visitante");
  await assert.rejects(sessao.colecao("salvos").listar(), (erro) => erro instanceof ErroDeConta && erro.codigo === "SEM_SESSAO");
  assert.deepEqual(client.pedidos, [], "o visitante não pode disparar leitura de dado privado");
});

test("MP-04: a demonstração só liga quando pedida, e o modo real não usa os dados dela", async () => {
  const memoria = () => {
    const mapa = new Map();
    return { getItem: (k) => mapa.get(k) ?? null, setItem: (k, v) => mapa.set(k, String(v)), removeItem: (k) => mapa.delete(k) };
  };
  assert.equal(querDemonstracao({ search: "" }, memoria()), false, "sem pedido, é modo real");
  assert.equal(querDemonstracao({ search: "?demo=algo" }, memoria()), false);
  const aba = memoria();
  assert.equal(querDemonstracao({ search: "?demo=visita" }, aba), true);
  assert.equal(querDemonstracao({ search: "" }, aba), true, "o pedido vale para a aba");
  assert.equal(querDemonstracao({ search: "?demo=sair" }, aba), false);

  /* No código da conta, os dados de demonstração só nascem no ramo da demonstração. */
  const fonte = (await readFile(new URL("../../outputs/js/conta/conta.js", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  const ramoReal = fonte.slice(fonte.indexOf("  } else {", fonte.indexOf("if (demonstracao) {")), fonte.indexOf("sessaoGlobal.iniciar();"));
  assert.ok(ramoReal.includes("dados: principal"), "o modo real precisa usar só o adaptador do banco");
  assert.doesNotMatch(ramoReal, /criarDadosDemonstracao|reserva/, "o modo real não pode carregar dados de demonstração");
});
