/*
 * O CATÁLOGO QUE ALIMENTA "PARA VOCÊ".
 *
 * Recomendação precisa de algo para recomendar, e aqui esse algo é o que o
 * Portal JÁ publica: os textos do Caderno de Travessia e as páginas de seção. Não
 * é catálogo de mentira — cada item existe e cada link abre.
 *
 * Quando houver uma tabela de conteúdos no banco, é esta função que passa a
 * lê-la. A regra de recomendação, em `leituras.js`, não muda.
 */

import { DEFAULT_BLOG_POSTS } from "../blog/blog-data.js";
import { normalizePosts } from "../blog/blog-model.js";
import { hrefSeguro } from "./modelos.js";

const PAGINAS_DO_PORTAL = Object.freeze([
  { tipo: "curso", ref: "cursos", titulo: "Cursos livres e formações", href: "/cursos.html", temas: ["cursos", "formação", "estudo"] },
  { tipo: "atividade", ref: "atividades", titulo: "Atividades que cabem na rotina", href: "/atividades.html", temas: ["corpo", "movimento", "meditação", "tai chi", "yoga"] },
  { tipo: "profissional", ref: "especialistas", titulo: "Quem ensina no Potala", href: "/especialistas.html", temas: ["profissionais", "especialistas"] },
  { tipo: "evento", ref: "eventos", titulo: "Eventos futuros", href: "/eventos.html", temas: ["eventos", "retiro", "sarau", "silêncio"] },
  { tipo: "atividade", ref: "workshops", titulo: "Workshops de fim de semana", href: "/workshops.html", temas: ["oficina", "escrita", "desenho", "fotografia"] },
  { tipo: "atividade", ref: "grupos-de-estudo", titulo: "Grupos de estudo", href: "/grupos-de-estudo.html", temas: ["leitura", "estudo", "meditação", "cinema"] },
  { tipo: "meditacao", ref: "inspiracao", titulo: "Pausas para respirar", href: "/inspiracao.html", temas: ["meditação", "respiração", "silêncio"] },
  { tipo: "revista", ref: "revista", titulo: "Revista Potala", href: "/revista.html", temas: ["saúde", "cultura", "sociedade"] },
]);

export function catalogoDoPortal() {
  const textos = normalizePosts(DEFAULT_BLOG_POSTS)
    .filter((post) => post.status === "published")
    .map((post) => ({
      tipo: "blog",
      ref: post.id,
      titulo: post.title,
      href: `/artigo.html?post=${encodeURIComponent(post.slug)}`,
      imagem: hrefSeguro(post.cover),
      temas: [post.category, ...(Array.isArray(post.tags) ? post.tags : [])].filter(Boolean),
    }));
  return [...textos, ...PAGINAS_DO_PORTAL.map((pagina) => ({ ...pagina, imagem: null }))];
}
