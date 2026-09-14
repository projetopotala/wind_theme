/*
 * OS MODELOS DA CONTA PESSOAL.
 *
 * Cada coisa que a pessoa guarda no Potala — um salvo, uma visita, um curso, um
 * compromisso — tem aqui uma forma única. Os adaptadores (Supabase e
 * demonstração) traduzem para esta forma, e as telas só conhecem esta forma:
 * nenhuma vista lê uma linha do banco, e trocar o backend não obriga a reescrever
 * tela nenhuma.
 *
 * A validação daqui NÃO é autorização. Quem decide o que cada pessoa pode ler e
 * gravar é o banco, pelas políticas de RLS. O que se valida aqui é integridade e
 * segurança de exibição — sobretudo os endereços, que viram links na tela e não
 * podem carregar "javascript:".
 */

export const TIPOS_DE_ITEM = Object.freeze({
  artigo: "Artigo",
  blog: "Caderno de Travessia",
  revista: "Revista",
  video: "Vídeo",
  meditacao: "Meditação",
  curso: "Curso",
  atividade: "Atividade",
  profissional: "Profissional",
  evento: "Evento",
  livro: "Livro",
  produto: "Produto",
  pagina: "Página do Portal",
});

export const FILTROS_DE_SALVOS = Object.freeze([
  Object.freeze({ id: "tudo", rotulo: "Tudo", tipos: null }),
  Object.freeze({ id: "conteudos", rotulo: "Conteúdos", tipos: ["artigo", "blog", "revista", "meditacao", "livro", "pagina"] }),
  Object.freeze({ id: "cursos", rotulo: "Cursos", tipos: ["curso", "atividade"] }),
  Object.freeze({ id: "profissionais", rotulo: "Profissionais", tipos: ["profissional"] }),
  Object.freeze({ id: "eventos", rotulo: "Eventos", tipos: ["evento"] }),
  Object.freeze({ id: "videos", rotulo: "Vídeos", tipos: ["video"] }),
]);

export const STATUS_DE_INSCRICAO = Object.freeze({
  inscrito: "Inscrição confirmada",
  em_andamento: "Em andamento",
  proximo_encontro: "Próximo encontro",
  concluido: "Concluído",
  aguardando_turma: "Aguardando formação de turma",
});

export const TIPOS_DE_COMPROMISSO = Object.freeze({
  aula: "Aula",
  atividade: "Atividade",
  workshop: "Workshop",
  palestra: "Palestra",
  evento: "Evento",
  consulta: "Consulta",
  outro: "Compromisso",
});

export const TIPOS_DE_ACOMPANHAMENTO = Object.freeze({
  tema: "Tema",
  profissional: "Profissional",
  curso: "Curso",
  atividade: "Atividade",
  evento: "Evento",
  turma: "Novas turmas",
});

/*
 * Os tipos de aviso, e quais já nascem ligados.
 *
 * Dois nascem DESLIGADOS de propósito — novos conteúdos e lembretes de
 * atividade. São os que mais crescem com o uso, e um portal contemplativo que
 * chama a atenção a toda hora contradiz o que promete. Quem quiser, liga.
 */
export const TIPOS_DE_NOTIFICACAO = Object.freeze([
  Object.freeze({ id: "proxima_aula", rotulo: "Próxima aula", descricao: "Um lembrete na véspera de cada encontro.", padrao: true }),
  Object.freeze({ id: "horario_alterado", rotulo: "Mudança de horário", descricao: "Quando uma aula ou atividade sua muda de dia ou hora.", padrao: true }),
  Object.freeze({ id: "nova_turma", rotulo: "Novas turmas", descricao: "Quando abre turma de algo que você acompanha.", padrao: true }),
  Object.freeze({ id: "curso_disponivel", rotulo: "Curso disponível", descricao: "Quando um curso que você acompanha abre inscrições.", padrao: true }),
  Object.freeze({ id: "evento_proximo", rotulo: "Evento salvo chegando", descricao: "Alguns dias antes de um evento que você salvou.", padrao: true }),
  Object.freeze({ id: "novo_conteudo", rotulo: "Novos conteúdos", descricao: "Quando alguém que você acompanha publica algo.", padrao: false }),
  Object.freeze({ id: "lembrete", rotulo: "Lembretes de atividade", descricao: "Um aviso antes das atividades da sua agenda.", padrao: false }),
  Object.freeze({ id: "inscricao_confirmada", rotulo: "Inscrição confirmada", descricao: "A confirmação de cada inscrição.", padrao: true }),
]);

const NOTIFICACOES_POR_ID = Object.freeze(Object.fromEntries(TIPOS_DE_NOTIFICACAO.map((tipo) => [tipo.id, tipo])));

/* ------------------------------------------------------------------
 * Pequenas garantias
 * ------------------------------------------------------------------ */

export function semAcento(valor) {
  return String(valor ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function texto(valor, maximo) {
  const limpo = String(valor ?? "").trim();
  return maximo ? limpo.slice(0, maximo) : limpo;
}

function obrigatorio(valor, campo, maximo) {
  const limpo = texto(valor, maximo);
  if (!limpo) throw new TypeError(`${campo} é obrigatório.`);
  return limpo;
}

function umDe(valor, opcoes, campo) {
  if (!Object.hasOwn(opcoes, valor)) throw new TypeError(`${campo} inválido: ${valor}`);
  return valor;
}

function inteiro(valor, minimo) {
  const numero = Math.trunc(Number(valor));
  return Number.isFinite(numero) && numero >= minimo ? numero : minimo;
}

export function paraData(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const data = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

export function novoId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/*
 * O ENDEREÇO DE UM ITEM, SÓ SE FOR SEGURO VIRAR LINK.
 *
 * Tudo que se salva ou se visita reaparece como <a href> na área pessoal. Um
 * endereço "javascript:" gravado no banco — por erro, por uma importação mal
 * feita, por alguém tentando — executaria código no clique. Aqui só passam
 * caminhos do próprio Portal e endereços https.
 *
 * Os caminhos relativos viram absolutos ("/artigo.html"), e isso não é
 * cosmético: a área pessoal é uma SPA em /meu-potala/salvos, e ali um link
 * relativo "artigo.html" apontaria para /meu-potala/artigo.html, que não existe.
 *
 * "/\" é recusado porque os navegadores o tratam como "//", que leva para
 * outro domínio.
 */
export function hrefSeguro(valor) {
  const endereco = String(valor ?? "").trim();
  if (!endereco || endereco.includes("\\") || /\s/.test(endereco)) return null;
  if ([...endereco].some((letra) => letra.charCodeAt(0) < 32)) return null;
  if (endereco.startsWith("//")) return null;
  if (/^https:\/\//i.test(endereco)) return endereco;
  if (/^[a-z][a-z\d+.-]*:/i.test(endereco)) return null;
  return endereco.startsWith("/") ? endereco : `/${endereco.replace(/^\.\//, "")}`;
}

function hrefObrigatorio(valor, campo) {
  const seguro = hrefSeguro(valor);
  if (!seguro) throw new TypeError(`${campo} precisa ser um endereço do Portal ou https.`);
  return seguro;
}

const hrefOpcional = (valor) => (valor ? hrefSeguro(valor) : null);
const usuarioOpcional = (valor) => texto(valor) || null;

/* ------------------------------------------------------------------
 * Pessoa
 * ------------------------------------------------------------------ */

export function criarUsuario(dados = {}) {
  return Object.freeze({
    id: obrigatorio(dados.id, "O id do usuário"),
    email: obrigatorio(dados.email, "O e-mail do usuário", 254),
    nome: texto(dados.nome, 80),
    emailVerificadoEm: paraData(dados.emailVerificadoEm),
    criadoEm: paraData(dados.criadoEm),
  });
}

export function criarPerfil(dados = {}) {
  const vistos = new Set();
  const interesses = (Array.isArray(dados.interesses) ? dados.interesses : [])
    .map((interesse) => texto(interesse, 40))
    .filter((interesse) => {
      const chave = semAcento(interesse).toLowerCase();
      if (!interesse || vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    })
    .slice(0, 12);

  return Object.freeze({
    usuarioId: obrigatorio(dados.usuarioId, "O id do perfil"),
    nome: texto(dados.nome, 80),
    avatarUrl: hrefOpcional(dados.avatarUrl),
    cidade: texto(dados.cidade, 80),
    bio: texto(dados.bio, 400),
    interesses: Object.freeze(interesses),
    atualizadoEm: paraData(dados.atualizadoEm),
  });
}

/* ------------------------------------------------------------------
 * O que a pessoa guarda e percorre
 * ------------------------------------------------------------------ */

export function criarSalvo(dados = {}) {
  return Object.freeze({
    id: texto(dados.id) || novoId(),
    usuarioId: usuarioOpcional(dados.usuarioId),
    tipo: umDe(dados.tipo, TIPOS_DE_ITEM, "O tipo do salvo"),
    ref: obrigatorio(dados.ref, "A referência do salvo", 200),
    titulo: obrigatorio(dados.titulo, "O título do salvo", 240),
    href: hrefObrigatorio(dados.href, "O endereço do salvo"),
    imagem: hrefOpcional(dados.imagem),
    salvoEm: paraData(dados.salvoEm) || new Date().toISOString(),
  });
}

export function criarHistorico(dados = {}) {
  const progresso = dados.progresso === null || dados.progresso === undefined || dados.progresso === ""
    ? null
    : Math.min(1, Math.max(0, Number(dados.progresso) || 0));
  return Object.freeze({
    id: texto(dados.id) || novoId(),
    usuarioId: usuarioOpcional(dados.usuarioId),
    tipo: umDe(dados.tipo, TIPOS_DE_ITEM, "O tipo da visita"),
    ref: obrigatorio(dados.ref, "A referência da visita", 200),
    titulo: obrigatorio(dados.titulo, "O título da visita", 240),
    href: hrefObrigatorio(dados.href, "O endereço da visita"),
    progresso,
    visitadoEm: paraData(dados.visitadoEm) || new Date().toISOString(),
  });
}

export function criarAcompanhado(dados = {}) {
  return Object.freeze({
    id: texto(dados.id) || novoId(),
    usuarioId: usuarioOpcional(dados.usuarioId),
    tipo: umDe(dados.tipo, TIPOS_DE_ACOMPANHAMENTO, "O tipo do acompanhamento"),
    ref: obrigatorio(dados.ref, "A referência acompanhada", 200),
    rotulo: obrigatorio(dados.rotulo, "O nome do que se acompanha", 120),
    desde: paraData(dados.desde) || new Date().toISOString(),
  });
}

/* ------------------------------------------------------------------
 * Cursos e agenda
 * ------------------------------------------------------------------ */

export function criarInscricao(dados = {}) {
  return Object.freeze({
    id: texto(dados.id) || novoId(),
    usuarioId: usuarioOpcional(dados.usuarioId),
    cursoRef: obrigatorio(dados.cursoRef, "A referência do curso", 200),
    curso: obrigatorio(dados.curso, "O nome do curso", 160),
    professor: texto(dados.professor, 120),
    modalidade: texto(dados.modalidade, 40),
    status: umDe(dados.status, STATUS_DE_INSCRICAO, "O status da inscrição"),
    proximaAula: paraData(dados.proximaAula),
    conteudoHref: hrefOpcional(dados.conteudoHref),
    imagem: hrefOpcional(dados.imagem),
    inscritoEm: paraData(dados.inscritoEm) || new Date().toISOString(),
  });
}

export function criarProgresso(dados = {}) {
  const total = inteiro(dados.total, 0);
  return Object.freeze({
    inscricaoId: obrigatorio(dados.inscricaoId, "A inscrição do progresso"),
    total,
    concluidas: Math.min(total, inteiro(dados.concluidas, 0)),
    ultimaAulaRef: texto(dados.ultimaAulaRef) || null,
    ultimoAcesso: paraData(dados.ultimoAcesso),
  });
}

export function criarCompromisso(dados = {}) {
  const inicio = paraData(dados.inicio);
  if (!inicio) throw new TypeError("O início do compromisso é obrigatório.");
  const fim = paraData(dados.fim);
  return Object.freeze({
    id: texto(dados.id) || novoId(),
    usuarioId: usuarioOpcional(dados.usuarioId),
    tipo: umDe(dados.tipo, TIPOS_DE_COMPROMISSO, "O tipo do compromisso"),
    titulo: obrigatorio(dados.titulo, "O título do compromisso", 160),
    inicio,
    fim: fim && fim >= inicio ? fim : null,
    local: texto(dados.local, 120),
    origem: dados.origem === "instituto" ? "instituto" : "pessoal",
    fonteRef: texto(dados.fonteRef) || null,
    fonteHref: hrefOpcional(dados.fonteHref),
  });
}

/* ------------------------------------------------------------------
 * Avisos
 * ------------------------------------------------------------------ */

export function criarNotificacao(dados = {}) {
  return Object.freeze({
    id: texto(dados.id) || novoId(),
    usuarioId: usuarioOpcional(dados.usuarioId),
    tipo: umDe(dados.tipo, NOTIFICACOES_POR_ID, "O tipo da notificação"),
    titulo: obrigatorio(dados.titulo, "O título da notificação", 160),
    corpo: texto(dados.corpo, 400),
    href: hrefOpcional(dados.href),
    criadaEm: paraData(dados.criadaEm) || new Date().toISOString(),
    lidaEm: paraData(dados.lidaEm),
  });
}

export function criarPreferencia(dados = {}) {
  return Object.freeze({
    usuarioId: usuarioOpcional(dados.usuarioId),
    tipo: umDe(dados.tipo, NOTIFICACOES_POR_ID, "O tipo da preferência"),
    ativa: dados.ativa === true,
  });
}

/*
 * Uma fábrica por coleção.
 *
 * É a lista que o resto do sistema consulta para saber que coleções existem: a
 * sessão, os dois adaptadores e os testes leem daqui. Uma coleção nova começa
 * nesta linha, e quem esquecer de tratá-la em algum adaptador descobre pelo
 * teste, não pela tela.
 */
export const FABRICAS = Object.freeze({
  salvos: criarSalvo,
  historico: criarHistorico,
  acompanhando: criarAcompanhado,
  inscricoes: criarInscricao,
  progressos: criarProgresso,
  agenda: criarCompromisso,
  notificacoes: criarNotificacao,
  preferencias: criarPreferencia,
});

/* ------------------------------------------------------------------
 * Como chamar a pessoa
 * ------------------------------------------------------------------ */

export function nomeDeExibicao(usuario, perfil) {
  return texto(perfil?.nome) || texto(usuario?.nome) || texto(usuario?.email).split("@")[0] || "visitante";
}

export function primeiroNome(usuario, perfil) {
  return nomeDeExibicao(usuario, perfil).split(/\s+/)[0];
}

/*
 * As iniciais do botão da conta.
 *
 * Primeira e última palavra do nome, e não as duas primeiras: "Maria de Souza"
 * vira "MS", e não "MD" — ninguém se reconhece pela preposição.
 */
export function iniciaisDe(nome, email) {
  const partes = texto(nome).split(/\s+/).filter(Boolean);
  if (partes.length) {
    const primeira = partes[0][0];
    const ultima = partes.length > 1 ? partes.at(-1)[0] : "";
    return `${primeira}${ultima}`.toLocaleUpperCase("pt-BR");
  }
  const local = texto(email).split("@")[0];
  return local ? local[0].toLocaleUpperCase("pt-BR") : "P";
}
