import assert from "node:assert/strict";
import test from "node:test";

import { DadosIndisponiveis, ErroDeConta, mensagemDoErro } from "../../outputs/js/conta/mensagens.js";
import {
  criarAutenticacaoSupabase,
  criarDadosSupabase,
  paraLinha,
  paraModelo,
  usuarioDoSupabase,
} from "../../outputs/js/conta/adaptadores/supabase.js";
import { criarAutenticacaoDemonstracao, criarDadosDemonstracao } from "../../outputs/js/conta/adaptadores/demonstracao.js";
import { criarSalvo } from "../../outputs/js/conta/modelos.js";

const UUID = "3f2b8a6e-1c4d-4e5f-9a7b-2c8d1e0f3a4b";

/* Um construtor de consulta falso que registra cada chamada e resolve com o resultado dado. */
function consulta(resultado, registro) {
  const construtor = {};
  for (const metodo of ["select", "order", "eq", "not", "insert", "upsert", "update", "delete", "maybeSingle"]) {
    construtor[metodo] = (...argumentos) => {
      registro.push([metodo, ...argumentos]);
      return construtor;
    };
  }
  construtor.then = (ok, falha) => Promise.resolve(resultado).then(ok, falha);
  return construtor;
}

function clienteFalso({ auth = {}, resultado = { data: [], error: null } } = {}) {
  const registro = [];
  const chamadas = { signUp: [], ouvinte: null, desinscritos: 0, tabelas: [] };
  return {
    registro,
    chamadas,
    auth: {
      async getSession() {
        return { data: { session: null }, error: null };
      },
      async signInWithPassword({ email }) {
        return { data: { user: { id: "u1", email, user_metadata: {} } }, error: null };
      },
      async signUp(parametros) {
        chamadas.signUp.push(parametros);
        return { data: { user: { id: "u2", email: parametros.email, user_metadata: parametros.options.data }, session: null }, error: null };
      },
      async signOut() {
        return { error: null };
      },
      onAuthStateChange(ouvinte) {
        chamadas.ouvinte = ouvinte;
        return { data: { subscription: { unsubscribe() { chamadas.desinscritos += 1; } } } };
      },
      ...auth,
    },
    from(tabela) {
      chamadas.tabelas.push(tabela);
      return consulta(resultado, registro);
    },
  };
}

/* ------------------------------------------------------------------
 * Linhas e modelos
 * ------------------------------------------------------------------ */

test("a linha enviada ao banco nunca carrega user_id", () => {
  /*
   * O banco preenche user_id com auth.uid() e a RLS confere. Mandar o id daqui
   * seria convidar um navegador adulterado a gravar em nome de outra pessoa.
   */
  const salvo = criarSalvo({ id: UUID, usuarioId: "outra-pessoa", tipo: "blog", ref: "a", titulo: "A", href: "/a.html" });
  const linha = paraLinha("salvos", salvo);
  assert.equal(Object.hasOwn(linha, "user_id"), false);
  assert.equal(linha.id, UUID);
  assert.equal(linha.item_type, "blog");
});

test("ids que nao sao UUID ficam para o banco gerar", () => {
  const salvo = criarSalvo({ id: "demo-salvo-1", tipo: "blog", ref: "a", titulo: "A", href: "/a.html" });
  assert.equal(Object.hasOwn(paraLinha("salvos", salvo), "id"), false);
});

test("uma linha do banco vira modelo validado", () => {
  const modelo = paraModelo("salvos", {
    id: UUID,
    user_id: "u1",
    item_type: "blog",
    item_ref: "oraculo",
    title: "Oráculo de hoje",
    href: "artigo.html?post=oraculo",
    image_url: null,
    saved_at: "2026-09-14T10:00:00.000Z",
  });
  assert.equal(modelo.usuarioId, "u1");
  assert.equal(modelo.href, "/artigo.html?post=oraculo");
  assert.throws(() => paraModelo("salvos", { item_type: "blog", item_ref: "x", title: "X", href: "javascript:alert(1)" }), /endereço/);
});

test("o usuario do Supabase vira modelo com o nome do cadastro", () => {
  const usuario = usuarioDoSupabase({ id: "u1", email: "a@exemplo.com", user_metadata: { full_name: "Ana Clara" }, created_at: "2026-09-01T12:00:00Z" });
  assert.equal(usuario.nome, "Ana Clara");
  assert.equal(usuarioDoSupabase(null), null);
});

/* ------------------------------------------------------------------
 * Autenticacao Supabase
 * ------------------------------------------------------------------ */

test("o cadastro manda o nome e o retorno para a confirmacao publica, mesmo aberto localmente", async () => {
  const cliente = clienteFalso();
  const autenticacao = criarAutenticacaoSupabase({
    client: cliente,
    origem: "http://127.0.0.1:4173",
    config: {
      url: "https://exemplo.supabase.co",
      publishableKey: "sb_publishable_teste",
      siteUrl: "https://portal.exemplo.com",
    },
  });
  const resposta = await autenticacao.criarConta({ nome: "Ana Clara", email: "ana@exemplo.com", senha: "segredo-longo" });

  assert.equal(resposta.aguardandoConfirmacao, true);
  const [parametros] = cliente.chamadas.signUp;
  assert.equal(parametros.options.data.full_name, "Ana Clara");
  assert.equal(parametros.options.emailRedirectTo, "https://portal.exemplo.com/confirmar-conta");
});

test("recuperacao de senha e Google tambem nunca voltam para o servidor local", async () => {
  const pedidos = { reset: [], oauth: [] };
  const cliente = clienteFalso({
    auth: {
      async resetPasswordForEmail(email, options) {
        pedidos.reset.push({ email, options });
        return { error: null };
      },
      async signInWithOAuth(options) {
        pedidos.oauth.push(options);
        return { error: null };
      },
    },
  });
  const autenticacao = criarAutenticacaoSupabase({
    client: cliente,
    origem: "http://127.0.0.1:4173",
    config: {
      url: "https://exemplo.supabase.co",
      publishableKey: "sb_publishable_teste",
      siteUrl: "https://portal.exemplo.com/",
    },
  });

  await autenticacao.recuperarSenha("ana@exemplo.com");
  await autenticacao.entrarComGoogle();

  assert.equal(pedidos.reset[0].options.redirectTo, "https://portal.exemplo.com/meu-potala/configuracoes");
  assert.match(pedidos.oauth[0].options.redirectTo, /^https:\/\/portal\.exemplo\.com\//);
  assert.doesNotMatch(pedidos.oauth[0].options.redirectTo, /127\.0\.0\.1|localhost/);
});

test("a recusa do login vira erro com o motivo certo", async () => {
  const autenticacao = criarAutenticacaoSupabase({
    client: clienteFalso({ auth: { async signInWithPassword() { return { data: {}, error: { code: "invalid_credentials", message: "Invalid login credentials" } }; } } }),
    origem: "",
  });
  await assert.rejects(autenticacao.entrar({ email: "a@exemplo.com", senha: "x" }), (erro) => {
    assert.ok(erro instanceof ErroDeConta);
    assert.equal(erro.codigo, "invalid_credentials");
    return true;
  });
  /* Versoes antigas do Auth mandam so a mensagem. */
  assert.match(mensagemDoErro({ message: "User already registered" }), /Já existe uma conta/);
});

test("o aviso de sessao sai da pilha do Supabase antes de chegar a quem escuta", async () => {
  /*
   * Chamar o Supabase de dentro do retorno do onAuthStateChange pode travar, e
   * quem escuta carrega o perfil — uma consulta. O repasse espera o laco.
   */
  const cliente = clienteFalso();
  const autenticacao = criarAutenticacaoSupabase({ client: cliente, origem: "" });
  let recebidos = 0;
  const desligar = autenticacao.aoMudar(() => {
    recebidos += 1;
  });

  cliente.chamadas.ouvinte("SIGNED_IN", { user: { id: "u1", email: "a@exemplo.com" } });
  assert.equal(recebidos, 0, "o repasse foi sincrono");
  await new Promise((pronto) => setTimeout(pronto, 5));
  assert.equal(recebidos, 1);

  desligar();
  assert.equal(cliente.chamadas.desinscritos, 1);
});

test("o botao do Google so existe se o provedor estiver ligado", async () => {
  const pedidos = [];
  const buscar = (ligado, ok = true) => async (url, opcoes) => {
    pedidos.push([url, opcoes]);
    return { ok, json: async () => ({ external: { google: ligado } }) };
  };
  const config = { url: "https://exemplo.supabase.co", publishableKey: "sb_publishable_teste" };
  const cliente = clienteFalso();

  assert.deepEqual(await criarAutenticacaoSupabase({ client: cliente, config, buscar: buscar(true) }).provedores(), { google: true });
  assert.deepEqual(await criarAutenticacaoSupabase({ client: cliente, config, buscar: buscar(false) }).provedores(), { google: false });
  assert.deepEqual(await criarAutenticacaoSupabase({ client: cliente, config, buscar: buscar(true, false) }).provedores(), { google: false });
  assert.equal(pedidos[0][0], "https://exemplo.supabase.co/auth/v1/settings");
  assert.equal(pedidos[0][1].headers.apikey, "sb_publishable_teste");
});

/* ------------------------------------------------------------------
 * Dados Supabase
 * ------------------------------------------------------------------ */

test("tabela ausente vira DadosIndisponiveis; permissao negada, nao", async () => {
  const semTabela = criarDadosSupabase({ client: clienteFalso({ resultado: { data: null, error: { code: "PGRST205" } } }) });
  await assert.rejects(semTabela.listar("salvos", "u1"), (erro) => erro instanceof DadosIndisponiveis);

  const semPermissao = criarDadosSupabase({ client: clienteFalso({ resultado: { data: null, error: { code: "42501" } } }) });
  await assert.rejects(semPermissao.listar("salvos", "u1"), (erro) => erro instanceof ErroDeConta && !(erro instanceof DadosIndisponiveis));
});

test("salvar de novo o mesmo item atualiza em vez de duplicar", async () => {
  const cliente = clienteFalso({
    resultado: {
      data: { id: UUID, user_id: "u1", item_type: "blog", item_ref: "oraculo", title: "Oráculo", href: "/artigo.html?post=oraculo", image_url: null, saved_at: "2026-09-14T10:00:00.000Z" },
      error: null,
    },
  });
  const dados = criarDadosSupabase({ client: cliente });
  const salvo = await dados.gravar("salvos", criarSalvo({ id: UUID, tipo: "blog", ref: "oraculo", titulo: "Oráculo", href: "/artigo.html?post=oraculo" }), "u1");

  const upsert = cliente.registro.find(([metodo]) => metodo === "upsert");
  assert.ok(upsert, "salvos deveriam usar upsert");
  assert.equal(upsert[2].onConflict, "user_id,item_type,item_ref");
  assert.equal(Object.hasOwn(upsert[1], "user_id"), false);
  assert.equal(Object.hasOwn(upsert[1], "id"), false, "o id mudaria a chave de uma linha existente");
  assert.equal(salvo.ref, "oraculo");
});

test("marcar um aviso como lido so toca read_at", async () => {
  const cliente = clienteFalso({ resultado: { data: null, error: null } });
  await criarDadosSupabase({ client: cliente }).marcarLida(UUID, "2026-09-14T10:00:00.000Z");
  const update = cliente.registro.find(([metodo]) => metodo === "update");
  assert.deepEqual(Object.keys(update[1]), ["read_at"]);
  assert.deepEqual(cliente.chamadas.tabelas, ["notifications"]);
});

/* ------------------------------------------------------------------
 * Demonstracao
 * ------------------------------------------------------------------ */

function armazenamentoFalso() {
  const mapa = new Map();
  return {
    mapa,
    getItem: (chave) => (mapa.has(chave) ? mapa.get(chave) : null),
    setItem: (chave, valor) => mapa.set(chave, String(valor)),
    removeItem: (chave) => mapa.delete(chave),
  };
}

test("a demonstracao nunca guarda a senha", async () => {
  const armazenamento = armazenamentoFalso();
  const autenticacao = criarAutenticacaoDemonstracao({ armazenamento });
  await autenticacao.entrar({ email: "ana.clara@exemplo.com", senha: "segredo-que-nao-pode-ficar" });

  for (const valor of armazenamento.mapa.values()) {
    assert.ok(!valor.includes("segredo-que-nao-pode-ficar"), "a senha foi parar no armazenamento");
  }
  const { usuario } = await autenticacao.sessaoAtual();
  assert.equal(usuario.nome, "Ana Clara");

  await autenticacao.sair();
  assert.equal((await autenticacao.sessaoAtual()).usuario, null);
  await assert.rejects(autenticacao.entrar({ email: "a@exemplo.com", senha: "" }), (erro) => erro.codigo === "CAMPOS_OBRIGATORIOS");
});

test("os dados de demonstracao nascem na primeira leitura e respeitam a identidade de cada item", async () => {
  const dados = criarDadosDemonstracao({ armazenamento: armazenamentoFalso(), agora: () => new Date(2026, 8, 14, 15) });

  const salvos = await dados.listar("salvos", "u1");
  assert.ok(salvos.length > 0, "a semente nao foi plantada");

  const repetido = salvos[0];
  await dados.gravar("salvos", { ...repetido, id: "outro-id" }, "u1");
  assert.equal((await dados.listar("salvos", "u1")).length, salvos.length, "salvar o mesmo tipo+ref duplicou");

  await dados.limpar("historico", "u1");
  assert.deepEqual(await dados.listar("historico", "u1"), []);

  const [aviso] = (await dados.listar("notificacoes", "u1")).filter((item) => !item.lidaEm);
  await dados.marcarLida(aviso.id, "2026-09-14T16:00:00.000Z", "u1");
  const depois = (await dados.listar("notificacoes", "u1")).find((item) => item.id === aviso.id);
  assert.equal(depois.lidaEm, "2026-09-14T16:00:00.000Z");
});

test("com o armazenamento bloqueado, a demonstracao segue na memoria", async () => {
  const bloqueado = {
    getItem() { throw new Error("bloqueado"); },
    setItem() { throw new Error("bloqueado"); },
    removeItem() { throw new Error("bloqueado"); },
  };
  const dados = criarDadosDemonstracao({ armazenamento: bloqueado });
  const antes = (await dados.listar("salvos", "u1")).length;
  await dados.remover("salvos", (await dados.listar("salvos", "u1"))[0].id, "u1");
  assert.equal((await dados.listar("salvos", "u1")).length, antes - 1);
});
