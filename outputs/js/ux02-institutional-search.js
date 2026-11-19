import { pontuarBloco, termosDaBusca } from "./home/home-busca.js";
import { JOURNEY_REGIONS } from "./home/journey-data.js";
import { sectionResourcesFor } from "./home/section-resources.js";

const EXCLUIDOS = new Set(["marketplace"]);
const INTENCOES = {
  "quem-somos": ["conhecer instituto história missão valores filosofia propósito"],
  recepcao: ["não sei começar primeiro passo ajuda orientação contato dúvida falar alguém whatsapp telefone email"],
  atendimentos: ["atendimento técnica terapia cuidado presencial online modalidade"],
  cursos: ["curso formação oficina aprender aprendizagem professor inscrição"],
  atividades: ["atividade aula prática yoga pilates desenho dança música tai chi qi gong"],
  profissionais: ["profissional profissionais especialista especialistas terapeuta perfil trajetória atuação"],
  programacao: ["programação agenda data evento eventos horário acontece"],
  "arte-cultura": ["arte cultura cinema biblioteca sarau exposição música convivência"],
  inspiracao: ["inspiração pausa respiração meditação reflexão presença"],
  revista: ["revista ciência sociedade ambiente leitura atualidade"],
  blog: ["blog artigo artigos caderno oráculo coluna leitura"],
};

export function documentosInstitucionais() {
  return JOURNEY_REGIONS
    .filter((item) => !String(item.id).startsWith("novidade-") && !EXCLUIDOS.has(item.id))
    .map((item) => {
      const recursos = sectionResourcesFor(item);
      const detalhes = recursos.resources.flatMap((recurso) => [recurso.label, recurso.description, recurso.keywords]);
      return {
        id: item.id,
        title: item.title,
        category: item.category,
        summary: recursos.intro || item.description,
        body: [item.description, recursos.prompt, recursos.search, ...detalhes].filter(Boolean).join(" "),
        tags: [...(item.tags || []), ...(INTENCOES[item.id] || [])],
        href: item.href,
      };
    });
}

export function buscarInstituto(texto, indice = {}, limite = 5) {
  const termos = termosDaBusca(texto);
  if (!termos.length) return [];

  return documentosInstitucionais()
    .map((documento, ordem) => ({ documento, ordem, pontuacao: pontuarBloco(documento, termos, indice) }))
    .filter(({ pontuacao }) => pontuacao > 0)
    .sort((a, b) => b.pontuacao - a.pontuacao || a.ordem - b.ordem)
    .slice(0, limite)
    .map(({ documento }) => documento);
}
