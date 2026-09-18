/*
 * Gera as migrações que levam os textos empacotados do Blog para public.blog_posts.
 *
 * Os textos de outputs/js/blog/blog-data.js eram o acervo inicial guardado no
 * navegador. Levá-los ao banco faz o editor abrir com o que o site já mostra,
 * em vez de uma mesa vazia. `on conflict do nothing`: rodar de novo nunca
 * sobrescreve um texto que a equipe já editou.
 *
 * Cada leva é uma migração própria, porque migração aplicada não se edita:
 *
 *   node scripts/gerar-semente-blog.mjs --leva 1 > supabase/migrations/202609170003_semente_do_blog.sql
 *   node scripts/gerar-semente-blog.mjs --leva 2 > supabase/migrations/202609180003_mais_textos_do_blog.sql
 */
import { DEFAULT_BLOG_POSTS } from "../outputs/js/blog/blog-data.js";
import { normalizePosts } from "../outputs/js/blog/blog-model.js";

const literal = (valor) => `'${String(valor).replace(/'/g, "''")}'`;

/* A primeira leva são os oito textos que existiam antes do banco; a segunda, os que vieram depois. */
export const LEVAS = Object.freeze({
  1: { titulo: "Acervo inicial do Blog.", ids: DEFAULT_BLOG_POSTS.slice(0, 8).map(({ id }) => id) },
  2: { titulo: "Segunda leva de textos do Blog.", ids: DEFAULT_BLOG_POSTS.slice(8, 20).map(({ id }) => id) },
});

export function sementeDoBlog(posts = DEFAULT_BLOG_POSTS.slice(0, 8), { titulo = LEVAS[1].titulo } = {}) {
  const linhas = normalizePosts(posts).map((post) => `  (${[
    literal(post.id),
    literal(post.slug),
    literal(post.status),
    post.featured ? "true" : "false",
    literal(post.publishedAt),
    `${literal(JSON.stringify(post))}::jsonb`,
  ].join(", ")})`);

  return `-- ${titulo} Gerado por scripts/gerar-semente-blog.mjs; não editar à mão.

begin;

insert into public.blog_posts (id, slug, status, featured, published_at, document)
values
${linhas.join(",\n")}
on conflict do nothing;

commit;
`;
}

export function levaDoBlog(numero) {
  const leva = LEVAS[numero];
  if (!leva) throw new Error(`Leva desconhecida: ${numero}`);
  const posts = leva.ids.map((id) => DEFAULT_BLOG_POSTS.find((post) => post.id === id));
  return sementeDoBlog(posts, { titulo: leva.titulo });
}

if (process.argv[1]?.endsWith("gerar-semente-blog.mjs")) {
  const indice = process.argv.indexOf("--leva");
  process.stdout.write(levaDoBlog(indice > 0 ? Number(process.argv[indice + 1]) : 1));
}
