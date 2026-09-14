/*
 * O ADAPTADOR SUPABASE DA CONTA.
 *
 * Duas metades, porque falham de jeitos diferentes:
 *
 * - AUTENTICAÇÃO usa o Supabase Auth como ele é. A senha nunca passa por tabela
 *   nossa: quem guarda (com bcrypt), emite a sessão, faz ela expirar, renova o
 *   token e manda o e-mail de verificação é o Auth. Nada de conferir senha por
 *   RPC — esse caminho não tem o limite de tentativas que o Auth impõe.
 *
 * - DADOS usa tabelas com RLS. Este arquivo nunca envia `user_id`: o banco
 *   preenche com auth.uid() e as políticas conferem. Um navegador adulterado que
 *   mande o id de outra pessoa não consegue nada, porque o id nem é lido daqui.
 *
 * O resto do sistema só vê os modelos de `modelos.js`. Linha do banco não sai
 * deste arquivo.
 */

import { SUPABASE_CONFIG } from "../../supabase/config.js";
import { DadosIndisponiveis, ErroDeConta, codigoDoErro } from "../mensagens.js";
import { FABRICAS, criarPerfil, criarUsuario } from "../modelos.js";

export const TABELAS = Object.freeze({
  salvos: "saved_items",
  historico: "history_items",
  acompanhando: "followed_items",
  inscricoes: "enrollments",
  progressos: "course_progress",
  agenda: "schedule_items",
  notificacoes: "notifications",
  preferencias: "notification_preferences",
});

const CAMPOS = Object.freeze({
  salvos: { id: "id", tipo: "item_type", ref: "item_ref", titulo: "title", href: "href", imagem: "image_url", salvoEm: "saved_at" },
  historico: { id: "id", tipo: "item_type", ref: "item_ref", titulo: "title", href: "href", progresso: "progress", visitadoEm: "visited_at" },
  acompanhando: { id: "id", tipo: "subject_type", ref: "subject_ref", rotulo: "label", desde: "followed_at" },
  inscricoes: { id: "id", cursoRef: "course_ref", curso: "course_title", professor: "teacher_name", modalidade: "modality", status: "status", proximaAula: "next_session_at", conteudoHref: "content_href", imagem: "image_url", inscritoEm: "enrolled_at" },
  progressos: { inscricaoId: "enrollment_id", total: "lessons_total", concluidas: "lessons_done", ultimaAulaRef: "last_lesson_ref", ultimoAcesso: "last_access_at" },
  agenda: { id: "id", tipo: "kind", titulo: "title", inicio: "starts_at", fim: "ends_at", local: "location", origem: "origin", fonteRef: "source_ref", fonteHref: "source_href" },
  notificacoes: { id: "id", tipo: "kind", titulo: "title", corpo: "body", href: "href", criadaEm: "created_at", lidaEm: "read_at" },
  preferencias: { tipo: "kind", ativa: "enabled" },
});

const ORDEM = Object.freeze({
  salvos: ["saved_at", false],
  historico: ["visited_at", false],
  acompanhando: ["followed_at", false],
  inscricoes: ["enrolled_at", false],
  progressos: ["last_access_at", false],
  agenda: ["starts_at", true],
  notificacoes: ["created_at", false],
  preferencias: ["kind", true],
});

const COLUNA_ID = Object.freeze({ progressos: "enrollment_id", preferencias: "kind" });

/* Coleções gravadas por upsert: salvar duas vezes o mesmo item não duplica. */
const CONFLITO = Object.freeze({
  salvos: "user_id,item_type,item_ref",
  acompanhando: "user_id,subject_type,subject_ref",
  preferencias: "user_id,kind",
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TABELA_AUSENTE = new Set(["PGRST205", "42P01"]);

function tabelaDe(colecao) {
  const tabela = TABELAS[colecao];
  if (!tabela) throw new TypeError(`Coleção desconhecida: ${colecao}`);
  return tabela;
}

export function paraModelo(colecao, linha = {}, usuarioId = null) {
  const mapa = CAMPOS[colecao];
  const fabrica = FABRICAS[colecao];
  if (!mapa || !fabrica) throw new TypeError(`Coleção desconhecida: ${colecao}`);
  const modelo = { usuarioId: linha.user_id ?? usuarioId };
  for (const [campo, coluna] of Object.entries(mapa)) modelo[campo] = linha[coluna];
  return fabrica(modelo);
}

/*
 * Modelo para linha, SEM `user_id`.
 *
 * O id do registro também só vai quando é um UUID de verdade: ids de
 * demonstração ("demo-...") ou gerados sem crypto.randomUUID seriam recusados
 * pela coluna uuid, e o banco sabe gerar o seu.
 */
export function paraLinha(colecao, modelo = {}) {
  const mapa = CAMPOS[colecao];
  if (!mapa) throw new TypeError(`Coleção desconhecida: ${colecao}`);
  const linha = {};
  for (const [campo, coluna] of Object.entries(mapa)) {
    if (modelo[campo] === undefined) continue;
    if (coluna === "id" && !UUID.test(String(modelo[campo]))) continue;
    linha[coluna] = modelo[campo];
  }
  return linha;
}

export function usuarioDoSupabase(user) {
  if (!user?.id) return null;
  return criarUsuario({
    id: user.id,
    email: user.email,
    nome: user.user_metadata?.full_name || "",
    emailVerificadoEm: user.email_confirmed_at || null,
    criadoEm: user.created_at || null,
  });
}

const falhouAuth = (erro) => new ErroDeConta(codigoDoErro(erro) || "AUTH", erro);

function falhouDados(erro) {
  if (TABELA_AUSENTE.has(erro?.code)) return new DadosIndisponiveis(erro);
  return new ErroDeConta(codigoDoErro(erro) || "DADOS", erro);
}

export function criarAutenticacaoSupabase({
  client,
  origem = globalThis.location?.origin || "",
  config = SUPABASE_CONFIG,
  buscar = globalThis.fetch?.bind(globalThis),
  agendar = (tarefa) => setTimeout(tarefa, 0),
} = {}) {
  if (!client?.auth) throw new TypeError("Um cliente Supabase é obrigatório.");

  return {
    demonstracao: false,

    async sessaoAtual() {
      const { data, error } = await client.auth.getSession();
      if (error) throw falhouAuth(error);
      return { usuario: usuarioDoSupabase(data?.session?.user) };
    },

    async entrar({ email, senha }) {
      const { data, error } = await client.auth.signInWithPassword({ email, password: senha });
      if (error) throw falhouAuth(error);
      return { usuario: usuarioDoSupabase(data?.user) };
    },

    /*
     * O link de confirmação volta para o Meu Potala.
     *
     * Sem `emailRedirectTo`, o Supabase usa a URL padrão do projeto, e quem
     * confirma o e-mail cai numa página que não sabe o que fazer com o token.
     * Este endereço precisa estar liberado na lista de redirecionamentos do
     * painel do Supabase, senão é ignorado.
     */
    async criarConta({ nome, email, senha }) {
      const { data, error } = await client.auth.signUp({
        email,
        password: senha,
        options: { data: { full_name: nome }, emailRedirectTo: `${origem}/meu-potala` },
      });
      if (error) throw falhouAuth(error);
      return { usuario: usuarioDoSupabase(data?.user), aguardandoConfirmacao: !data?.session };
    },

    async sair() {
      const { error } = await client.auth.signOut();
      if (error) throw falhouAuth(error);
    },

    /* O Supabase não revela se a conta existe, e a tela também não deve revelar. */
    async recuperarSenha(email) {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${origem}/meu-potala/configuracoes` });
      if (error) throw falhouAuth(error);
    },

    async definirNovaSenha(senha) {
      const { error } = await client.auth.updateUser({ password: senha });
      if (error) throw falhouAuth(error);
    },

    /*
     * O aviso sai da pilha do Supabase antes de chegar a quem escuta.
     *
     * Chamar o Supabase de dentro deste retorno pode travar, porque o cliente
     * ainda segura a trava da sessão — e quem escuta aqui carrega o perfil, que
     * é uma consulta. O repasse espera a volta do laço de eventos.
     */
    aoMudar(ouvinte) {
      const { data } = client.auth.onAuthStateChange((evento, sessao) => {
        agendar(() => ouvinte({ evento, usuario: usuarioDoSupabase(sessao?.user) }));
      });
      return () => data?.subscription?.unsubscribe?.();
    },

    /*
     * O botão do Google só aparece se o provedor estiver ligado no projeto.
     *
     * Um botão que abre uma tela de erro do Supabase é pior que botão nenhum. A
     * leitura é pública — é o mesmo endpoint que o próprio Auth usa.
     */
    async provedores() {
      if (!buscar) return { google: false };
      const resposta = await buscar(new URL("/auth/v1/settings", config.url).href, {
        headers: { apikey: config.publishableKey },
      });
      if (!resposta.ok) return { google: false };
      const corpo = await resposta.json();
      return { google: corpo?.external?.google === true };
    },

    async entrarComGoogle() {
      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${origem}${globalThis.location?.pathname || "/meu-potala"}` },
      });
      if (error) throw falhouAuth(error);
    },
  };
}

export function criarDadosSupabase({ client } = {}) {
  if (!client?.from) throw new TypeError("Um cliente Supabase é obrigatório.");

  return {
    async perfil(usuario) {
      const { data, error } = await client
        .from("profiles")
        .select("id, display_name, avatar_url, city, bio, interests, updated_at")
        .eq("id", usuario.id)
        .maybeSingle();
      if (error) throw falhouDados(error);
      if (!data) return criarPerfil({ usuarioId: usuario.id, nome: usuario.nome });
      return criarPerfil({
        usuarioId: data.id,
        nome: data.display_name || usuario.nome,
        avatarUrl: data.avatar_url,
        cidade: data.city,
        bio: data.bio,
        interesses: data.interests,
        atualizadoEm: data.updated_at,
      });
    },

    async salvarPerfil(perfil) {
      const { error } = await client.from("profiles").upsert({
        id: perfil.usuarioId,
        display_name: perfil.nome,
        avatar_url: perfil.avatarUrl,
        city: perfil.cidade,
        bio: perfil.bio,
        interests: perfil.interesses,
        updated_at: perfil.atualizadoEm,
      });
      if (error) throw falhouDados(error);
      return perfil;
    },

    async listar(colecao, usuarioId) {
      const [coluna, ascendente] = ORDEM[colecao] || ["id", true];
      const { data, error } = await client.from(tabelaDe(colecao)).select("*").order(coluna, { ascending: ascendente });
      if (error) throw falhouDados(error);
      return (data || []).map((linha) => paraModelo(colecao, linha, usuarioId));
    },

    async gravar(colecao, registro, usuarioId) {
      const tabela = tabelaDe(colecao);
      const linha = paraLinha(colecao, registro);
      const conflito = CONFLITO[colecao];
      if (conflito) delete linha.id;
      const consulta = conflito
        ? client.from(tabela).upsert(linha, { onConflict: conflito })
        : client.from(tabela).insert(linha);
      const { data, error } = await consulta.select().maybeSingle();
      if (error) throw falhouDados(error);
      return data ? paraModelo(colecao, data, usuarioId) : FABRICAS[colecao]({ ...registro, usuarioId });
    },

    async remover(colecao, id) {
      const { error } = await client.from(tabelaDe(colecao)).delete().eq(COLUNA_ID[colecao] || "id", id);
      if (error) throw falhouDados(error);
    },

    /* O PostgREST exige um filtro para apagar; a RLS garante que só sai o que é da pessoa. */
    async limpar(colecao) {
      const { error } = await client.from(tabelaDe(colecao)).delete().not(COLUNA_ID[colecao] || "id", "is", null);
      if (error) throw falhouDados(error);
    },

    /* Só `read_at` pode ser alterado pelo navegador: o resto do aviso é do servidor. */
    async marcarLida(id, quando) {
      const { error } = await client.from(TABELAS.notificacoes).update({ read_at: quando }).eq("id", id);
      if (error) throw falhouDados(error);
    },
  };
}
