-- O CADERNO DE TRAVESSIA E O QUE O VISITANTE ENVIA PELO SITE.
--
-- Antes desta migração o Blog guardava textos no localStorage de quem os
-- escrevia: o editor "publicava" e nenhum outro visitante via. Comentários,
-- inscrição nas inspirações, o "Monte seu curso", o "Tenho interesse" das
-- experiências culturais e o "Você encontrou o que procurava?" da Recepção
-- mostravam uma confirmação e descartavam o que a pessoa tinha escrito.
--
-- Regras que valem para tudo aqui:
--   * escrever conteúdo publicado é só de owner/admin (is_portal_admin);
--   * o visitante anônimo pode ENVIAR (comentário, interesse, inscrição), mas
--     não LÊ o que outros enviaram — só comentários aprovados;
--   * comentário nasce pendente; a coluna status nem entra no grant de insert,
--     então ninguém se autoaprova;
--   * tamanhos são limitados no próprio banco, não só no formulário.

begin;

-- ------------------------------------------------------------------
-- Textos do Blog
-- ------------------------------------------------------------------

-- O texto completo (título, blocos de conteúdo, capa…) fica em document, no
-- mesmo formato de normalizePost; as colunas soltas são o que o banco precisa
-- enxergar para filtrar e garantir unicidade.
create table if not exists public.blog_posts (
  id text primary key check (char_length(id) between 1 and 120),
  slug text not null unique check (char_length(slug) between 1 and 140 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status text not null default 'draft' check (status in ('draft', 'published', 'hidden')),
  featured boolean not null default false,
  published_at text not null default '' check (char_length(published_at) <= 32),
  document jsonb not null check (jsonb_typeof(document) = 'object' and pg_column_size(document) <= 400000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Um destaque por vez.
create unique index if not exists blog_posts_one_featured_idx
  on public.blog_posts (featured)
  where featured;

alter table public.blog_posts enable row level security;
revoke all on table public.blog_posts from anon, authenticated;
grant select on table public.blog_posts to anon, authenticated;
grant delete on table public.blog_posts to authenticated;

drop policy if exists "todos leem textos publicados" on public.blog_posts;
create policy "todos leem textos publicados" on public.blog_posts
  for select to anon, authenticated
  using (status = 'published');

drop policy if exists "administracao le todos os textos" on public.blog_posts;
create policy "administracao le todos os textos" on public.blog_posts
  for select to authenticated
  using ((select public.is_portal_admin()));

drop policy if exists "administracao apaga textos" on public.blog_posts;
create policy "administracao apaga textos" on public.blog_posts
  for delete to authenticated
  using ((select public.is_portal_admin()));

-- Salvar passa por função para trocar o destaque na mesma transação: o índice
-- único recusaria o segundo destaque antes de o primeiro ser desmarcado.
create or replace function public.save_blog_post(post jsonb)
returns public.blog_posts
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  salvo public.blog_posts;
  destaque boolean := coalesce((post ->> 'featured')::boolean, false);
begin
  if not public.is_portal_admin() then
    raise exception 'Seu acesso não permite publicar no Blog.' using errcode = '42501';
  end if;
  if jsonb_typeof(post) is distinct from 'object' or coalesce(btrim(post ->> 'id'), '') = '' then
    raise exception 'Texto inválido.' using errcode = '22023';
  end if;

  if destaque then
    update public.blog_posts set featured = false, document = document || '{"featured": false}'::jsonb
    where featured and id <> post ->> 'id';
  end if;

  insert into public.blog_posts (id, slug, status, featured, published_at, document, updated_at)
  values (
    post ->> 'id',
    post ->> 'slug',
    coalesce(post ->> 'status', 'draft'),
    destaque,
    coalesce(post ->> 'publishedAt', ''),
    post,
    now()
  )
  on conflict (id) do update set
    slug = excluded.slug,
    status = excluded.status,
    featured = excluded.featured,
    published_at = excluded.published_at,
    document = excluded.document,
    updated_at = excluded.updated_at
  returning * into salvo;

  return salvo;
end;
$$;

revoke all on function public.save_blog_post(jsonb) from public, anon;
grant execute on function public.save_blog_post(jsonb) to authenticated;

-- ------------------------------------------------------------------
-- Configuração do Blog (nome e capa)
-- ------------------------------------------------------------------

create table if not exists public.blog_settings (
  id smallint primary key default 1 check (id = 1),
  name text not null default 'Caderno de Travessia' check (char_length(btrim(name)) between 1 and 80),
  cover text not null default 'media/chegada-landscape.webp'
    check (char_length(cover) <= 500 and cover !~* '^\s*(javascript|data|vbscript):'),
  updated_at timestamptz not null default now()
);

insert into public.blog_settings (id) values (1) on conflict (id) do nothing;

alter table public.blog_settings enable row level security;
revoke all on table public.blog_settings from anon, authenticated;
grant select on table public.blog_settings to anon, authenticated;
grant update (name, cover, updated_at) on table public.blog_settings to authenticated;

drop policy if exists "todos leem a configuracao do blog" on public.blog_settings;
create policy "todos leem a configuracao do blog" on public.blog_settings
  for select to anon, authenticated using (true);

drop policy if exists "administracao altera a configuracao do blog" on public.blog_settings;
create policy "administracao altera a configuracao do blog" on public.blog_settings
  for update to authenticated
  using ((select public.is_portal_admin()))
  with check ((select public.is_portal_admin()));

-- ------------------------------------------------------------------
-- Visualizações dos textos
-- ------------------------------------------------------------------

create table if not exists public.blog_post_views (
  slug text primary key check (char_length(slug) between 1 and 140),
  views bigint not null default 0 check (views >= 0),
  updated_at timestamptz not null default now()
);

alter table public.blog_post_views enable row level security;
revoke all on table public.blog_post_views from anon, authenticated;
grant select on table public.blog_post_views to authenticated;

drop policy if exists "administracao le as visualizacoes" on public.blog_post_views;
create policy "administracao le as visualizacoes" on public.blog_post_views
  for select to authenticated using ((select public.is_portal_admin()));

-- Só conta texto que existe e está publicado, para a tabela não virar depósito
-- de endereços inventados.
create or replace function public.register_blog_view(p_slug text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.blog_posts where slug = p_slug and status = 'published') then
    return;
  end if;
  insert into public.blog_post_views (slug, views, updated_at)
  values (p_slug, 1, now())
  on conflict (slug) do update set views = public.blog_post_views.views + 1, updated_at = now();
end;
$$;

revoke all on function public.register_blog_view(text) from public;
grant execute on function public.register_blog_view(text) to anon, authenticated;

-- ------------------------------------------------------------------
-- Comentários
-- ------------------------------------------------------------------

-- post_slug nulo é a conversa geral da página do Caderno.
create table if not exists public.blog_comments (
  id uuid primary key default gen_random_uuid(),
  post_slug text check (post_slug is null or char_length(post_slug) between 1 and 140),
  author_name text not null check (char_length(btrim(author_name)) between 1 and 60),
  body text not null check (char_length(btrim(body)) between 3 and 600),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists blog_comments_post_status_idx
  on public.blog_comments (post_slug, status, created_at desc);

alter table public.blog_comments enable row level security;
revoke all on table public.blog_comments from anon, authenticated;
grant insert (post_slug, author_name, body) on table public.blog_comments to anon, authenticated;
grant select (id, post_slug, author_name, body, status, created_at, reviewed_at) on table public.blog_comments to anon, authenticated;
grant update (status, reviewed_at) on table public.blog_comments to authenticated;
grant delete on table public.blog_comments to authenticated;

drop policy if exists "visitante envia comentario" on public.blog_comments;
create policy "visitante envia comentario" on public.blog_comments
  for insert to anon, authenticated
  with check (status = 'pending' and reviewed_at is null);

drop policy if exists "todos leem comentarios aprovados" on public.blog_comments;
create policy "todos leem comentarios aprovados" on public.blog_comments
  for select to anon, authenticated using (status = 'approved');

drop policy if exists "administracao le todos os comentarios" on public.blog_comments;
create policy "administracao le todos os comentarios" on public.blog_comments
  for select to authenticated using ((select public.is_portal_admin()));

drop policy if exists "administracao modera comentarios" on public.blog_comments;
create policy "administracao modera comentarios" on public.blog_comments
  for update to authenticated
  using ((select public.is_portal_admin()))
  with check ((select public.is_portal_admin()));

drop policy if exists "administracao apaga comentarios" on public.blog_comments;
create policy "administracao apaga comentarios" on public.blog_comments
  for delete to authenticated using ((select public.is_portal_admin()));

-- ------------------------------------------------------------------
-- Inscrição nas inspirações (newsletter)
-- ------------------------------------------------------------------

create table if not exists public.newsletter_subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  source text not null default 'blog' check (char_length(source) between 1 and 40),
  created_at timestamptz not null default now()
);

create unique index if not exists newsletter_subscriptions_email_idx
  on public.newsletter_subscriptions (lower(email));

alter table public.newsletter_subscriptions enable row level security;
revoke all on table public.newsletter_subscriptions from anon, authenticated;
grant select, delete on table public.newsletter_subscriptions to authenticated;

drop policy if exists "administracao le as inscricoes" on public.newsletter_subscriptions;
create policy "administracao le as inscricoes" on public.newsletter_subscriptions
  for select to authenticated using ((select public.is_portal_admin()));

drop policy if exists "administracao remove inscricoes" on public.newsletter_subscriptions;
create policy "administracao remove inscricoes" on public.newsletter_subscriptions
  for delete to authenticated using ((select public.is_portal_admin()));

-- Por função, e não insert direto: repetir o e-mail responde igual a um e-mail
-- novo, e ninguém descobre pelo site quem já está inscrito.
create or replace function public.subscribe_newsletter(p_email text, p_source text default 'blog')
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_email is null or char_length(btrim(p_email)) > 254 or btrim(p_email) !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Informe um e-mail válido.' using errcode = '22023';
  end if;
  insert into public.newsletter_subscriptions (email, source)
  values (lower(btrim(p_email)), left(coalesce(nullif(btrim(p_source), ''), 'blog'), 40))
  on conflict ((lower(email))) do nothing;
end;
$$;

revoke all on function public.subscribe_newsletter(text, text) from public;
grant execute on function public.subscribe_newsletter(text, text) to anon, authenticated;

-- ------------------------------------------------------------------
-- Interesses e retornos enviados pelas seções
-- ------------------------------------------------------------------

create table if not exists public.site_interests (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('curso', 'experiencia-cultural', 'retorno-recepcao')),
  subject text not null default '' check (char_length(subject) <= 160),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 4000),
  page text not null default '' check (char_length(page) <= 200),
  created_at timestamptz not null default now()
);

create index if not exists site_interests_kind_created_idx
  on public.site_interests (kind, created_at desc);

alter table public.site_interests enable row level security;
revoke all on table public.site_interests from anon, authenticated;
grant insert (kind, subject, details, page) on table public.site_interests to anon, authenticated;
grant select, delete on table public.site_interests to authenticated;

drop policy if exists "visitante envia interesse" on public.site_interests;
create policy "visitante envia interesse" on public.site_interests
  for insert to anon, authenticated
  with check (kind in ('curso', 'experiencia-cultural', 'retorno-recepcao'));

drop policy if exists "administracao le os interesses" on public.site_interests;
create policy "administracao le os interesses" on public.site_interests
  for select to authenticated using ((select public.is_portal_admin()));

drop policy if exists "administracao apaga interesses" on public.site_interests;
create policy "administracao apaga interesses" on public.site_interests
  for delete to authenticated using ((select public.is_portal_admin()));

commit;
