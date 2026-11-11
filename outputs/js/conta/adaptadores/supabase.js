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
  atendimentos: "appointment_requests",
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
  atendimentos: { id: "id", servico: "service", modalidade: "modality", dataPreferida: "preferred_date", periodoPreferido: "preferred_period", status: "status", horarioId: "slot_id", inicio: "starts_at", fim: "ends_at", reservaId: "reservation_schedule_id", criadaEm: "created_at", atualizadaEm: "updated_at" },
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
  atendimentos: ["created_at", false],
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
/* O mesmo formato que o envio público aceita como recibo (shared/appointment-requests.js). */
const UUID_DO_RECIBO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/* Teto de consultas lidas na agenda de quem atende: cada uma custa uma checagem de papel no banco. */
const LIMITE_AGENDA_PROFISSIONAL = 30;

/*
 * Inscrições do Meu Potala. A fonte é a operação do Instituto (op_records), lida pela
 * função my_course_enrollments(), que só devolve as inscrições da conta logada. A tabela
 * antiga public.enrollments continua sendo lida (somente leitura) e seus registros são
 * mantidos, sem duplicar quando a mesma turma já veio da operação. Se a função ainda não
 * existir no banco, a leitura segue só com a tabela antiga: publicar o front antes da
 * migration não quebra a tela.
 */
const FUNCAO_AUSENTE = new Set(["PGRST202", "42883"]);

export function unirInscricoes(daOperacao = [], antigas = []) {
  const vistos = new Set(daOperacao.map((inscricao) => inscricao.cursoRef));
  return [...daOperacao, ...antigas.filter((inscricao) => !vistos.has(inscricao.cursoRef))];
}

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

  const baseDeRetorno = String(config.siteUrl || origem || "").replace(/\/+$/, "");
  const retorno = (caminho) => {
    if (!baseDeRetorno) throw new ErroDeConta("CONFIGURACAO", new Error("A URL pública do portal não foi configurada."));
    return new URL(caminho, `${baseDeRetorno}/`).href;
  };

  return {
    demonstracao: false,

    async sessaoAtual() {
      const { data, error } = await client.auth.getSession();
      if (error) throw falhouAuth(error);
      return { usuario: usuarioDoSupabase(data?.session?.user) };
    },

    async papelPortal(usuario) {
      if (!usuario?.id) return null;
      const { data, error } = await client
        .from("users")
        .select("role, active")
        .eq("id", usuario.id)
        .maybeSingle();
      if (error) throw falhouDados(error);
      if (data?.active !== true) return null;
      return ["owner", "admin", "blog_editor"].includes(data.role) ? data.role : null;
    },

    async entrar({ email, senha }) {
      const { data, error } = await client.auth.signInWithPassword({ email, password: senha });
      if (error) throw falhouAuth(error);
      return { usuario: usuarioDoSupabase(data?.user) };
    },

    /*
     * O link de confirmação volta para a tela pública dedicada.
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
        options: { data: { full_name: nome }, emailRedirectTo: retorno("confirmar-conta") },
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
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: retorno("redefinir-senha") });
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
      const caminhoAtual = globalThis.location?.pathname?.replace(/^\/+/, "") || "meu-potala";
      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: retorno(caminhoAtual) },
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
      if (colecao === "atendimentos") {
        const { data, error } = await client.rpc("list_my_appointment_requests");
        if (error) throw falhouDados(error);
        return (Array.isArray(data) ? data : []).map((linha) => paraModelo(colecao, linha, usuarioId));
      }
      const [coluna, ascendente] = ORDEM[colecao] || ["id", true];
      const { data, error } = await client.from(tabelaDe(colecao)).select("*").order(coluna, { ascending: ascendente });
      if (error) throw falhouDados(error);
      const modelos = (data || []).map((linha) => paraModelo(colecao, linha, usuarioId));
      if (colecao !== "inscricoes") return modelos;
      const { data: daOperacao, error: erroOperacao } = await client.rpc("my_course_enrollments");
      if (erroOperacao && !FUNCAO_AUSENTE.has(String(erroOperacao.code))) throw falhouDados(erroOperacao);
      const operacao = erroOperacao ? [] : (Array.isArray(daOperacao) ? daOperacao : []).map((linha) => paraModelo(colecao, linha, usuarioId));
      return unirInscricoes(operacao, modelos);
    },

    async gravar(colecao, registro, usuarioId) {
      if (colecao === "atendimentos") throw new TypeError("Solicitações são criadas somente pela RPC autenticada.");
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
      if (colecao === "atendimentos") throw new TypeError("Solicitações de atendimento não podem ser removidas pelo navegador.");
      const { error } = await client.from(tabelaDe(colecao)).delete().eq(COLUNA_ID[colecao] || "id", id);
      if (error) throw falhouDados(error);
    },

    /* O PostgREST exige um filtro para apagar; a RLS garante que só sai o que é da pessoa. */
    async limpar(colecao) {
      if (colecao === "atendimentos") throw new TypeError("Solicitações de atendimento não podem ser apagadas pelo navegador.");
      const { error } = await client.from(tabelaDe(colecao)).delete().not(COLUNA_ID[colecao] || "id", "is", null);
      if (error) throw falhouDados(error);
    },

    /* Só `read_at` pode ser alterado pelo navegador: o resto do aviso é do servidor. */
    async marcarLida(id, quando) {
      const { error } = await client.from(TABELAS.notificacoes).update({ read_at: quando }).eq("id", id);
      if (error) throw falhouDados(error);
    },

    async opcoesAtendimento() {
      const { data, error } = await client.rpc("list_appointment_offerings");
      if (error) throw falhouDados(error);
      return Array.isArray(data) ? data : [];
    },

    async horariosAtendimento() {
      const { data, error } = await client.rpc("list_available_appointment_slots", { p_offering_id: null });
      if (error) throw falhouDados(error);
      return Array.isArray(data) ? data : [];
    },

    /*
     * Perfis profissionais ATIVOS da própria conta, decididos no banco pelo vínculo
     * (my_appointment_professional_profiles usa auth.uid(); nenhum ID sai daqui).
     * Enquanto a função não existir no banco (PGRST202/42883), volta vazio: a página
     * mantém o comportamento anterior sem acusar falha.
     */
    async perfisProfissionais() {
      const { data, error } = await client.rpc("my_appointment_professional_profiles");
      if (error) {
        if (["PGRST202", "42883"].includes(error.code)) return [];
        throw falhouDados(error);
      }
      return (Array.isArray(data) ? data : [])
        .filter((p) => p && typeof p.profile_id === "string" && p.profile_id)
        .map((p) => ({ id: p.profile_id, nome: String(p.display_name || "") }));
    },

    /*
     * Agenda de quem atende. `list_my_appointment_requests` só devolve o que a
     * pessoa pediu como cliente; quem atende não pede, então aparecia sem nada.
     *
     * A leitura usa só as colunas já liberadas e a RLS já existente
     * (appointment_requests_professional_read). Como a RLS também abre linhas a
     * quem administra, cada linha passa por appointment_room_context, que diz o
     * papel real de quem chama: fica só o que o banco chama de "professional".
     * Nada aqui concede acesso — a sala continua perguntando ao banco e à função.
     */
    async agendaProfissional(usuarioId) {
      const { data, error } = await client.from("appointment_requests")
        .select("id,service,modality,requester_name,status,requester_user_id,reservation_confirmed_at")
        .not("professional_profile_id", "is", null)
        .not("reservation_schedule_id", "is", null)
        .eq("status", "encerrada")
        .order("reservation_confirmed_at", { ascending: false })
        .limit(LIMITE_AGENDA_PROFISSIONAL);
      if (error) throw falhouDados(error);
      const candidatos = (Array.isArray(data) ? data : [])
        .filter((linha) => linha.requester_user_id !== usuarioId && UUID_DO_RECIBO.test(String(linha.id || "")));
      const consultas = await Promise.all(candidatos.map(async (linha) => {
        const { data: contexto, error: erro } = await client.rpc("appointment_room_context", { p_request_id: linha.id });
        if (erro || !contexto || contexto.role !== "professional") return null;
        return {
          id: String(linha.id).toLowerCase(),
          servico: contexto.service || linha.service || "Atendimento",
          modalidade: linha.modality === "online" ? "online" : "presencial",
          cliente: contexto.requester_name || linha.requester_name || "",
          estado: contexto.state,
          inicio: contexto.starts_at || null,
          fim: contexto.ends_at || null,
          abre: contexto.opens_at || null,
          fecha: contexto.closes_at || null,
        };
      }));
      return consultas.filter(Boolean);
    },

    async solicitarAtendimento({ idempotencia, ofertaId, modalidade, dataPreferida, periodoPreferido }) {
      const { data, error } = await client.rpc("submit_authenticated_appointment_request", {
        p_idempotency_key: idempotencia,
        p_offering_id: ofertaId,
        p_modality: modalidade,
        p_preferred_date: dataPreferida,
        p_preferred_period: periodoPreferido,
      });
      /*
       * Só há "Solicitação recebida" com recibo: um id e o estado "recebida".
       * Resposta vazia ou inesperada é falha — a tela não pode anunciar um
       * pedido que o banco não confirmou. As recusas conhecidas da RPC têm
       * frase própria, em vez do genérico "algo não saiu como esperado".
       */
      if (error) {
        if (error.code === "PT409") throw new ErroDeConta("ATENDIMENTO_ALTERADO", error);
        if (error.code === "22023") throw new ErroDeConta("ATENDIMENTO_RECUSADO", error);
        /* A RPC chama submit_appointment_request, que limita e serializa (PT429), e
         * exige sessão com e-mail confirmado (42501). */
        if (error.code === "PT429") throw new ErroDeConta("ATENDIMENTO_LIMITE", error);
        if (error.code === "42501") throw new ErroDeConta("ATENDIMENTO_SEM_PERMISSAO", error);
        throw falhouDados(error);
      }
      if (!data || typeof data.id !== "string" || !UUID_DO_RECIBO.test(data.id) || data.status !== "recebida") {
        throw new ErroDeConta("ATENDIMENTO_SEM_RECIBO");
      }
      return { id: data.id, status: "recebida" };
    },

    async solicitarHorarioAtendimento({ idempotencia, horarioId }) {
      const { data, error } = await client.rpc("submit_appointment_slot_request", {
        p_idempotency_key: idempotencia, p_slot_id: horarioId,
      });
      if (error) {
        if (error.code === "PT409") throw new ErroDeConta("ATENDIMENTO_ALTERADO", error);
        if (error.code === "42501") throw new ErroDeConta("ATENDIMENTO_SEM_PERMISSAO", error);
        throw falhouDados(error);
      }
      if (!data || !UUID_DO_RECIBO.test(String(data.id || "")) || data.status !== "recebida") {
        throw new ErroDeConta("ATENDIMENTO_SEM_RECIBO");
      }
      return { id: data.id, status: data.status };
    },

    async cancelarAtendimento(id) {
      const { data, error } = await client.rpc("cancel_my_appointment_request", { p_request_id: id });
      if (error) throw falhouDados(error);
      if (data?.id !== id || data?.status !== "cancelada") throw new ErroDeConta("ATENDIMENTO_SEM_RECIBO");
      return data;
    },
  };
}
