/*
 * OS DADOS DE DEMONSTRAÇÃO.
 *
 * Existem para que o Meu Potala possa ser visto e avaliado antes de as tabelas
 * pessoais existirem no banco. Ficam neste arquivo e só aqui: nenhuma regra, tela
 * ou adaptador real importa este módulo. Quem o usa é o adaptador de
 * demonstração, e ele só entra em cena quando o banco diz que as tabelas não
 * existem, ou quando alguém abre a página com ?demo=conta.
 *
 * As datas são RELATIVAS a agora. Com datas fixas, a "próxima aula" viraria
 * passado em uma semana e a demonstração pareceria quebrada justamente para
 * quem a abrisse depois.
 *
 * Os links apontam para páginas que existem. Os nomes de professores são os
 * mesmos, fictícios, que o Portal já apresenta em Especialistas.
 */

import { catalogoDoPortal } from "./catalogo.js";
import {
  criarAcompanhado,
  criarCompromisso,
  criarHistorico,
  criarInscricao,
  criarNotificacao,
  criarProgresso,
  criarSalvo,
} from "./modelos.js";

export function sementeDeDemonstracao({ usuarioId, agora = new Date() } = {}) {
  const base = new Date(agora);
  const em = (dias, horas, minutos = 0) => {
    const data = new Date(base);
    data.setDate(data.getDate() + dias);
    data.setHours(horas, minutos, 0, 0);
    return data.toISOString();
  };
  const ha = (horas) => new Date(base.getTime() - horas * 3_600_000).toISOString();

  const catalogo = catalogoDoPortal();
  const textos = catalogo.filter((item) => item.tipo === "blog");
  const texto = (ref, reserva = 0) => catalogo.find((item) => item.ref === ref) || textos[reserva] || textos[0];
  const ansiedade = texto("ansiedade-corpo", 0);
  const oraculo = texto("oraculo-de-hoje", 1);
  const cinema = texto("cinema-quinta", 2);

  const inscricoes = [
    criarInscricao({ id: "demo-insc-meditacao", usuarioId, cursoRef: "meditacao-iniciantes", curso: "Meditação para iniciantes", professor: "Paulo Renato Miquelin", modalidade: "Online", status: "em_andamento", proximaAula: em(1, 19), conteudoHref: "/inspiracao.html", inscritoEm: ha(24 * 26) }),
    criarInscricao({ id: "demo-insc-taichi", usuarioId, cursoRef: "tai-chi-chuan", curso: "Tai chi chuan", professor: "Lu Chen Nakagawa", modalidade: "Presencial", status: "proximo_encontro", proximaAula: em(2, 8), conteudoHref: "/atividades.html", imagem: "/media/atividades-pratica.webp", inscritoEm: ha(24 * 14) }),
    criarInscricao({ id: "demo-insc-desenho", usuarioId, cursoRef: "desenho-observacao", curso: "Desenho de observação", professor: "Tiago Mendes Sobral", modalidade: "Presencial", status: "aguardando_turma", conteudoHref: "/cursos.html", inscritoEm: ha(24 * 3) }),
    criarInscricao({ id: "demo-insc-escrita", usuarioId, cursoRef: "caderno-como-pratica", curso: "O caderno como prática", professor: "Ruth Nogueira Sampaio", modalidade: "Workshop", status: "concluido", conteudoHref: "/workshops.html", inscritoEm: ha(24 * 34) }),
  ];

  const progressos = [
    criarProgresso({ inscricaoId: "demo-insc-meditacao", total: 12, concluidas: 7, ultimaAulaRef: "aula-7", ultimoAcesso: ha(20) }),
    criarProgresso({ inscricaoId: "demo-insc-taichi", total: 16, concluidas: 5, ultimaAulaRef: "aula-5", ultimoAcesso: ha(72) }),
    criarProgresso({ inscricaoId: "demo-insc-escrita", total: 1, concluidas: 1, ultimoAcesso: ha(24 * 30) }),
  ];

  const agenda = [
    criarCompromisso({ id: "demo-ag-meditacao", usuarioId, tipo: "aula", titulo: "Meditação para iniciantes — aula 8", inicio: em(1, 19), fim: em(1, 20), local: "Online", origem: "instituto", fonteRef: "demo-insc-meditacao", fonteHref: "/inspiracao.html" }),
    criarCompromisso({ id: "demo-ag-taichi", usuarioId, tipo: "aula", titulo: "Tai chi chuan", inicio: em(2, 8), fim: em(2, 9, 15), local: "Sala do jardim", origem: "instituto", fonteRef: "demo-insc-taichi", fonteHref: "/atividades.html" }),
    criarCompromisso({ id: "demo-ag-roda", usuarioId, tipo: "atividade", titulo: "Roda de conversa", inicio: em(4, 10), fim: em(4, 11, 30), local: "Biblioteca Potala", origem: "instituto", fonteHref: "/atividades.html" }),
    criarCompromisso({ id: "demo-ag-cinema", usuarioId, tipo: "palestra", titulo: "Cinema e escuta", inicio: em(6, 19), fim: em(6, 22), local: "Cine Potala", origem: "instituto", fonteHref: "/cultura.html" }),
    criarCompromisso({ id: "demo-ag-consulta", usuarioId, tipo: "consulta", titulo: "Atendimento de acolhimento", inicio: em(9, 15), fim: em(9, 16), local: "Sala 2", origem: "pessoal", fonteHref: "/atendimentos.html" }),
    criarCompromisso({ id: "demo-ag-workshop", usuarioId, tipo: "workshop", titulo: "Fotografar o cotidiano", inicio: em(12, 9), fim: em(12, 16), local: "Saída a campo", origem: "instituto", fonteHref: "/workshops.html" }),
  ];

  const salvos = [
    criarSalvo({ id: "demo-salvo-ansiedade", usuarioId, tipo: ansiedade.tipo, ref: ansiedade.ref, titulo: ansiedade.titulo, href: ansiedade.href, imagem: ansiedade.imagem, salvoEm: ha(2) }),
    criarSalvo({ id: "demo-salvo-marina", usuarioId, tipo: "profissional", ref: "marina-okabe", titulo: "Marina Sayuri Okabe", href: "/especialistas.html", salvoEm: ha(30) }),
    criarSalvo({ id: "demo-salvo-retiro", usuarioId, tipo: "evento", ref: "retiro-silencio", titulo: "Retiro de silêncio de um dia", href: "/eventos.html", salvoEm: ha(50) }),
    criarSalvo({ id: "demo-salvo-formacoes", usuarioId, tipo: "curso", ref: "formacoes", titulo: "Formações profissionais", href: "/cursos.html", salvoEm: ha(80) }),
    criarSalvo({ id: "demo-salvo-respiracao", usuarioId, tipo: "video", ref: "respiracao-guiada", titulo: "Respiração guiada de cinco minutos", href: "/inspiracao.html", salvoEm: ha(120) }),
    criarSalvo({ id: "demo-salvo-cinema", usuarioId, tipo: cinema.tipo, ref: cinema.ref, titulo: cinema.titulo, href: cinema.href, imagem: cinema.imagem, salvoEm: ha(200) }),
  ];

  const historico = [
    criarHistorico({ id: "demo-hist-oraculo", usuarioId, tipo: oraculo.tipo, ref: oraculo.ref, titulo: oraculo.titulo, href: oraculo.href, progresso: 0.6, visitadoEm: ha(0.4) }),
    criarHistorico({ id: "demo-hist-especialistas", usuarioId, tipo: "pagina", ref: "especialistas", titulo: "Especialistas", href: "/especialistas.html", visitadoEm: ha(0.3) }),
    criarHistorico({ id: "demo-hist-atividades", usuarioId, tipo: "pagina", ref: "atividades", titulo: "Atividades", href: "/atividades.html", visitadoEm: em(-1, 18) }),
    criarHistorico({ id: "demo-hist-workshops", usuarioId, tipo: "pagina", ref: "workshops", titulo: "Workshops", href: "/workshops.html", visitadoEm: em(-3, 11) }),
    criarHistorico({ id: "demo-hist-ansiedade", usuarioId, tipo: ansiedade.tipo, ref: ansiedade.ref, titulo: ansiedade.titulo, href: ansiedade.href, progresso: 1, visitadoEm: em(-12, 20) }),
  ];

  const acompanhando = [
    criarAcompanhado({ id: "demo-segue-meditacao", usuarioId, tipo: "tema", ref: "meditacao", rotulo: "Meditação", desde: ha(24 * 20) }),
    criarAcompanhado({ id: "demo-segue-heloisa", usuarioId, tipo: "profissional", ref: "heloisa-camargo", rotulo: "Heloísa Braz Camargo", desde: ha(24 * 9) }),
    criarAcompanhado({ id: "demo-segue-pintura", usuarioId, tipo: "turma", ref: "turma-pintura", rotulo: "Novas turmas de pintura", desde: ha(24 * 5) }),
  ];

  const notificacoes = [
    criarNotificacao({ id: "demo-aviso-aula", usuarioId, tipo: "proxima_aula", titulo: "Sua aula de meditação é amanhã, às 19h", corpo: "Aula 8 de 12, online. O link aparece aqui meia hora antes.", href: "/meu-potala/agenda", criadaEm: ha(2) }),
    criarNotificacao({ id: "demo-aviso-turma", usuarioId, tipo: "nova_turma", titulo: "Abriu turma de pintura aos sábados", corpo: "Você acompanha novas turmas de pintura.", href: "/cursos.html", criadaEm: ha(30) }),
    criarNotificacao({ id: "demo-aviso-inscricao", usuarioId, tipo: "inscricao_confirmada", titulo: "Inscrição confirmada em Desenho de observação", corpo: "Avisaremos quando a turma estiver formada.", href: "/meu-potala/cursos", criadaEm: ha(72), lidaEm: ha(70) }),
  ];

  return { inscricoes, progressos, agenda, salvos, historico, acompanhando, notificacoes, preferencias: [] };
}
