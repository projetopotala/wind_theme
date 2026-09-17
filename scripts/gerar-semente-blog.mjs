/*
 * Gera a migração que leva os textos empacotados do Blog para public.blog_posts.
 *
 * Os textos de outputs/js/blog/blog-data.js eram o acervo inicial guardado no
 * navegador. Levá-los ao banco uma vez faz o editor abrir com o que o site já
 * mostra, em vez de uma mesa vazia. `on conflict do nothing`: rodar de novo
 * nunca sobrescreve um texto que a equipe já editou.
 *
 *   node scripts/gerar-semente-blog.mjs > supabase/migrations/202609170003_semente_do_blog.sql
 */
import { DEFAULT_BLOG_POSTS } from "../outputs/js/blog/blog-data.js";
import { normalizePosts } from "../outputs/js/blog/blog-model.js";

const literal = (valor) => `'${String(valor).replace(/'/g, "''")}'`;

export function sementeDoBlog(posts = DEFAULT_BLOG_POSTS) {
  const linhas = normalizePosts(posts).map((post) => `  (${[
    literal(post.id),
    literal(post.slug),
    literal(post.status),
    post.featured ? "true" : "false",
    literal(post.publishedAt),
    `${literal(JSON.stringify(post))}::jsonb`,
  ].join(", ")})`);

  return `-- Acervo inicial do Blog. Gerado por scripts/gerar-semente-blog.mjs; não editar à mão.

begin;

insert into public.blog_posts (id, slug, status, featured, published_at, document)
values
${linhas.join(",\n")}
on conflict do nothing;

commit;
`;
}

if (process.argv[1]?.endsWith("gerar-semente-blog.mjs")) {
  process.stdout.write(sementeDoBlog());
}
