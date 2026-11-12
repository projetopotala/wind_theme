/*
 * CONHECIMENTO PÚBLICO DO ASSISTENTE POTALA (IA-01).
 *
 * O assistente só conhece o que o visitante já pode ler no portal:
 *   1. o texto das páginas públicas listadas abaixo (gerado por script em
 *      outputs/ia/conhecimento.json, versionado e conferido por teste);
 *   2. os artigos publicados do Blog e os perfis visíveis dos escritores, lidos
 *      pelo backend com a chave publicável (a política do banco só devolve o que
 *      está no ar).
 * Nada de contas, agendamentos, turmas internas, rascunhos ou painel.
 *
 * As mesmas regras de normalização, pontuação e links existem no backend
 * (supabase/functions/assistente-potala/conhecimento.ts); um teste roda os dois
 * lados com as mesmas perguntas e exige o mesmo resultado.
 */
import { extrairTextoDaPagina } from "../home/busca-indice.js";

/* Páginas públicas que o assistente pode citar e recomendar. Fora desta lista, nenhum link é aceito. */
export const PAGINAS_DO_ASSISTENTE = Object.freeze([
  "transcender.html",
  "travessia.html",
  "quem-somos.html",
  "recepcao.html",
  "atendimentos.html",
  "atendimentos-conceito.html",
  "saude-integrativa.html",
  "especialistas.html",
  "profissionais.html",
  "cursos.html",
  "atividades.html",
  "programacao.html",
  "workshops.html",
  "mentorias.html",
  "grupos-de-estudo.html",
  "eventos.html",
  "cultura.html",
  "experiencias-culturais.html",
  "inspiracao.html",
  "revista.html",
  "blog.html",
  "escritor.html",
  "marketplace.html",
  "palacio.html",
]);

/* Destinos que podem ser indicados, mas cujo conteúdo é pessoal (não entra no conhecimento). */
export const DESTINOS_SEM_CONTEUDO = Object.freeze({
  "meu-potala.html": { titulo: "Meu Potala", descricao: "Área pessoal do visitante, com login: inscrições, itens salvos e acompanhamento." },
});

/* Mesmo teto do índice de busca: páginas longas (Atividades) têm conteúdo importante no fim. */
export const LIMITE_TEXTO_PAGINA = 9000;

const entidade = (texto) => String(texto ?? "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();

/* Título, descrição e texto visível de uma página pública. */
export function extrairPagina(url, html) {
  const fonte = String(html ?? "");
  const titulo = entidade((fonte.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || url).replace(/\s+[—-]\s+Instituto Potala$/i, "");
  const descricao = entidade((fonte.match(/<meta\s+name="description"\s+content="([^"]*)"/i) || [])[1] || "");
  const corpo = (fonte.match(/<body[\s\S]*<\/body>/i) || [fonte])[0];
  const texto = extrairTextoDaPagina(corpo).slice(0, LIMITE_TEXTO_PAGINA);
  return { url, titulo, descricao, texto };
}

/* Minúsculas, sem acentos, só letras e números. */
export const normalizar = (texto) => String(texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const VAZIAS = new Set("a o as os de da do das dos e em no na nos nas um uma uns umas para por com sem que qual quais como onde quando eu voce voces me te se ao aos ha tem ter sobre mais menos muito pouco isso esse essa este esta ola oi bom boa dia tarde noite quero queria gostaria saber posso pode podem algum alguma".split(" "));

export function termos(texto) {
  return [...new Set(normalizar(texto).split(" ").filter((t) => t.length > 2 && !VAZIAS.has(t)))].slice(0, 24);
}

/*
 * Relevância simples e previsível: cada termo da pergunta vale mais no título e na
 * descrição do que no corpo, e um prefixo de 5 letras pega flexões
 * ("meditação"/"meditar", "curso"/"cursos"). Empate: ordem original da lista.
 */
export function pontuar(pergunta, documentos = []) {
  const busca = termos(pergunta);
  if (!busca.length) return [];
  return documentos
    .map((doc, ordem) => {
      const cabeca = normalizar(`${doc.titulo} ${doc.descricao} ${doc.autor || ""} ${doc.categoria || ""}`);
      const corpo = normalizar(doc.texto);
      let pontos = 0;
      for (const termo of busca) {
        const raiz = termo.length > 5 ? termo.slice(0, 5) : termo;
        if (cabeca.includes(raiz)) pontos += 3;
        if (corpo.includes(raiz)) pontos += 1;
      }
      return { doc, pontos, ordem };
    })
    .filter((x) => x.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos || a.ordem - b.ordem)
    .map((x) => x.doc);
}

/* Endereço interno aceito como link do assistente (páginas da lista, artigo e escritor com slug). */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function linkPermitido(url) {
  const texto = String(url ?? "").trim().replace(/^\/+/, "");
  const [caminho, consulta = "", ...resto] = texto.split("?");
  if (resto.length) return "";
  if (!PAGINAS_DO_ASSISTENTE.includes(caminho) && !(caminho in DESTINOS_SEM_CONTEUDO) && caminho !== "artigo.html") return "";
  if (!consulta) return caminho === "artigo.html" ? "" : caminho;
  const m = consulta.match(/^(post|nome)=([a-z0-9-]{1,140})$/);
  if (!m || !SLUG.test(m[2])) return "";
  if ((caminho === "artigo.html" && m[1] === "post") || (caminho === "escritor.html" && m[1] === "nome")) return `${caminho}?${m[1]}=${m[2]}`;
  return "";
}
