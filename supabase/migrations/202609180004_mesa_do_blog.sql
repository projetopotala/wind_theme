-- A MESA DO BLOG: status editoriais, agendamento, alterações pendentes,
-- histórico de versões, categorias editáveis e imagens enviadas.
--
-- Até aqui um texto só podia estar em rascunho, publicado ou oculto, e a data
-- do texto era só um rótulo: marcar uma data futura publicava na hora. Editar
-- um texto publicado mudava o site a cada salvamento. As categorias eram uma
-- lista no código, e imagem era um caminho digitado à mão.
--
-- O que muda:
--   * status: rascunho, em revisão, agendado, publicado, arquivado;
--   * publish_at: um texto agendado aparece no site sozinho quando a hora
--     chega — a política de leitura compara com now(), sem depender de rotina;
--   * pending_document: o salvamento automático de um texto que já está no ar
--     guarda as alterações à parte; o site só muda quando alguém atualiza;
--   * blog_post_versions: cada salvamento explícito, publicação e mudança de
--     status deixa uma versão com autor tirado da sessão;
--   * blog_categories: a lista de categorias passa a ser do banco, e uma
--     categoria em uso não pode ser apagada;
--   * o bucket blog-midia recebe as imagens enviadas pela mesa.
--
-- pending_document não é legível pelo site: as colunas liberadas para anon e
-- authenticated são listadas uma a uma, e a mesa lê tudo por uma função que
-- exige administração.

begin;

-- ------------------------------------------------------------------
-- Textos
-- ------------------------------------------------------------------

update public.blog_posts set status = 'archived', document = document || '{"status":"archived"}'::jsonb
where status = 'hidden';

alter table public.blog_posts drop constraint if exists blog_posts_status_check;
alter table public.blog_posts
  add constraint blog_posts_status_check check (status in ('draft', 'review', 'scheduled', 'published', 'archived'));

alter table public.blog_posts
  add column if not exists publish_at timestamptz,
  add column if not exists pending_document jsonb check (pending_document is null or jsonb_typeof(pending_document) = 'object'),
  add column if not exists pending_updated_at timestamptz,
  add column if not exists updated_by_name text not null default '' check (char_length(updated_by_name) <= 120);

-- Um texto agendado sem data seria publicado nunca, e ninguém veria o porquê.
alter table public.blog_posts drop constraint if exists blog_posts_agendado_com_data;
alter table public.blog_posts
  add constraint blog_posts_agendado_com_data check (status <> 'scheduled' or publish_at is not null);

update public.blog_posts set publish_at = coalesce(publish_at, (nullif(published_at, '') || 'T12:00:00-03:00')::timestamptz, created_at)
where status = 'published' and publish_at is null;

revoke select on table public.blog_posts from anon, authenticated;
grant select (id, slug, status, featured, published_at, publish_at, document, created_at, updated_at)
  on table public.blog_posts to anon, authenticated;

drop policy if exists "todos leem textos publicados" on public.blog_posts;
create policy "todos leem textos publicados" on public.blog_posts
  for select to anon, authenticated
  using (status = 'published' or (status = 'scheduled' and publish_at <= now()));

create or replace function public.register_blog_view(p_slug text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.blog_posts
    where slug = p_slug and (status = 'published' or (status = 'scheduled' and publish_at <= now()))
  ) then
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
-- Versões
-- ------------------------------------------------------------------

create table if not exists public.blog_post_versions (
  id bigint generated always as identity primary key,
  post_id text not null references public.blog_posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  acao text not null check (char_length(acao) between 1 and 40),
  status text not null,
  titulo text not null default '',
  documento jsonb not null check (jsonb_typeof(documento) = 'object'),
  autor_id uuid,
  autor_nome text not null default '',
  resumo text not null default '' check (char_length(resumo) <= 500)
);

create index if not exists blog_post_versions_post_idx on public.blog_post_versions (post_id, created_at desc);

alter table public.blog_post_versions enable row level security;
revoke all on table public.blog_post_versions from anon, authenticated;
grant select on table public.blog_post_versions to authenticated;

drop policy if exists "administracao le as versoes" on public.blog_post_versions;
create policy "administracao le as versoes" on public.blog_post_versions
  for select to authenticated using ((select public.is_portal_admin()));

-- ------------------------------------------------------------------
-- A mesa lê e grava por funções
-- ------------------------------------------------------------------

create or replace function public.mesa_post_json(linha public.blog_posts)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', linha.id, 'slug', linha.slug, 'status', linha.status, 'featured', linha.featured,
    'publish_at', linha.publish_at, 'document', linha.document,
    'pending_document', linha.pending_document, 'pending_updated_at', linha.pending_updated_at,
    'created_at', linha.created_at, 'updated_at', linha.updated_at, 'updated_by_name', linha.updated_by_name
  );
$$;

revoke all on function public.mesa_post_json(public.blog_posts) from public, anon, authenticated;

create or replace function public.mesa_listar_posts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_portal_admin() then
    raise exception 'Seu acesso não permite abrir a mesa do Blog.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(public.mesa_post_json(post) order by post.updated_at desc)
    from public.blog_posts as post
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.mesa_listar_posts() from public, anon;
grant execute on function public.mesa_listar_posts() to authenticated;

/*
 * Uma função só para todas as mudanças de um texto, para que status, data,
 * destaque, pendências e histórico mudem juntos ou não mudem.
 *
 *   rascunho    grava um texto que não está no ar (rascunho ou revisão)
 *   pendente    guarda alterações de um texto no ar sem mudar o site
 *   revisao     envia para revisão
 *   publicar    publica agora, ou aplica as alterações de um texto no ar
 *   agendar     marca para publicar em p_quando (futuro)
 *   despublicar tira do ar e volta a rascunho
 *   arquivar    tira do ar e guarda
 */
create or replace function public.mesa_salvar_post(
  p_post jsonb,
  p_acao text,
  p_quando timestamptz default null,
  p_registrar boolean default true,
  p_resumo text default ''
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  atual public.blog_posts;
  existe boolean;
  autor text;
  novo_status text;
  nova_data timestamptz;
  documento jsonb;
  destaque boolean;
  salvo public.blog_posts;
begin
  if not public.is_portal_admin() then
    raise exception 'Seu acesso não permite alterar o Blog.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_post) is distinct from 'object' or coalesce(btrim(p_post ->> 'id'), '') = '' then
    raise exception 'Texto inválido.' using errcode = '22023';
  end if;
  if p_acao not in ('rascunho', 'pendente', 'revisao', 'publicar', 'agendar', 'despublicar', 'arquivar') then
    raise exception 'Ação desconhecida.' using errcode = '22023';
  end if;

  select * into atual from public.blog_posts where id = p_post ->> 'id' for update;
  existe := found;

  select coalesce(nullif(btrim(usuario.name), ''), usuario.email)
    into autor
  from public.users as usuario
  where usuario.id = (select auth.uid());
  autor := coalesce(autor, 'Administração Potala');

  -- Alterações de um texto no ar ficam à parte até alguém atualizar.
  if p_acao = 'pendente' then
    if existe and atual.status in ('published', 'scheduled') then
      update public.blog_posts
      set pending_document = p_post, pending_updated_at = now(), updated_by_name = autor
      where id = atual.id
      returning * into salvo;
      if p_registrar then
        insert into public.blog_post_versions (post_id, acao, status, titulo, documento, autor_id, autor_nome, resumo)
        values (salvo.id, 'pendente', salvo.status, coalesce(p_post ->> 'title', ''), p_post, (select auth.uid()), autor, left(coalesce(p_resumo, ''), 500));
      end if;
      return public.mesa_post_json(salvo);
    end if;
    p_acao := 'rascunho';
  end if;

  if p_acao = 'rascunho' and existe and atual.status in ('published', 'scheduled') then
    raise exception 'Este texto está no ar: as alterações ficam pendentes até você atualizar.' using errcode = '22023';
  end if;

  novo_status := case p_acao
    when 'rascunho' then case when existe and atual.status = 'review' then 'review' else 'draft' end
    when 'revisao' then 'review'
    when 'publicar' then 'published'
    when 'agendar' then 'scheduled'
    when 'despublicar' then 'draft'
    when 'arquivar' then 'archived'
  end;

  nova_data := case
    when p_acao = 'publicar' then case when existe and atual.status = 'published' then coalesce(atual.publish_at, now()) else now() end
    when p_acao = 'agendar' then p_quando
    else null
  end;

  if p_acao = 'agendar' and (p_quando is null or p_quando <= now()) then
    raise exception 'Escolha uma data e um horário no futuro para agendar.' using errcode = '22023';
  end if;

  documento := p_post || jsonb_build_object('status', novo_status);
  destaque := coalesce((documento ->> 'featured')::boolean, false) and novo_status <> 'archived';
  documento := documento || jsonb_build_object('featured', destaque);

  if destaque then
    update public.blog_posts set featured = false, document = document || '{"featured": false}'::jsonb
    where featured and id <> documento ->> 'id';
  end if;

  insert into public.blog_posts (id, slug, status, featured, published_at, publish_at, document, pending_document, pending_updated_at, updated_at, updated_by_name)
  values (
    documento ->> 'id', documento ->> 'slug', novo_status, destaque, coalesce(documento ->> 'publishedAt', ''),
    nova_data, documento, null, null, now(), autor
  )
  on conflict (id) do update set
    slug = excluded.slug,
    status = excluded.status,
    featured = excluded.featured,
    published_at = excluded.published_at,
    publish_at = excluded.publish_at,
    document = excluded.document,
    pending_document = null,
    pending_updated_at = null,
    updated_at = excluded.updated_at,
    updated_by_name = excluded.updated_by_name
  returning * into salvo;

  if p_registrar then
    insert into public.blog_post_versions (post_id, acao, status, titulo, documento, autor_id, autor_nome, resumo)
    values (salvo.id, p_acao, salvo.status, coalesce(documento ->> 'title', ''), documento, (select auth.uid()), autor, left(coalesce(p_resumo, ''), 500));
  end if;

  return public.mesa_post_json(salvo);
end;
$$;

revoke all on function public.mesa_salvar_post(jsonb, text, timestamptz, boolean, text) from public, anon;
grant execute on function public.mesa_salvar_post(jsonb, text, timestamptz, boolean, text) to authenticated;

-- ------------------------------------------------------------------
-- Categorias
-- ------------------------------------------------------------------

create table if not exists public.blog_categories (
  id text primary key check (char_length(id) between 1 and 60 and id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  rotulo text not null check (char_length(btrim(rotulo)) between 1 and 40),
  ordem integer not null default 0,
  imagem text not null default '' check (char_length(imagem) <= 500 and imagem !~* '^\s*(javascript|data|vbscript):'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.blog_categories (id, rotulo, ordem) values
  ('artigos', 'artigos', 1),
  ('oraculos', 'oráculos', 2),
  ('terapias', 'terapias', 3),
  ('cursos', 'cursos', 4),
  ('cultura', 'cultura', 5),
  ('praticas', 'práticas', 6)
on conflict (id) do nothing;

alter table public.blog_categories enable row level security;
revoke all on table public.blog_categories from anon, authenticated;
grant select on table public.blog_categories to anon, authenticated;
grant insert, update, delete on table public.blog_categories to authenticated;

drop policy if exists "todos leem as categorias" on public.blog_categories;
create policy "todos leem as categorias" on public.blog_categories
  for select to anon, authenticated using (true);

drop policy if exists "administracao cria categorias" on public.blog_categories;
create policy "administracao cria categorias" on public.blog_categories
  for insert to authenticated with check ((select public.is_portal_admin()));

drop policy if exists "administracao altera categorias" on public.blog_categories;
create policy "administracao altera categorias" on public.blog_categories
  for update to authenticated
  using ((select public.is_portal_admin()))
  with check ((select public.is_portal_admin()));

drop policy if exists "administracao apaga categorias" on public.blog_categories;
create policy "administracao apaga categorias" on public.blog_categories
  for delete to authenticated using ((select public.is_portal_admin()));

-- Apagar uma categoria em uso deixaria textos sem lugar no menu do Caderno.
create or replace function public.blog_categoria_em_uso()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.blog_posts
    where document ->> 'category' = old.id or pending_document ->> 'category' = old.id
  ) then
    raise exception 'Esta categoria ainda tem textos. Mude a categoria deles antes de apagar.' using errcode = '23503';
  end if;
  return old;
end;
$$;

revoke all on function public.blog_categoria_em_uso() from public, anon, authenticated;

drop trigger if exists blog_categoria_em_uso on public.blog_categories;
create trigger blog_categoria_em_uso
  before delete on public.blog_categories
  for each row execute function public.blog_categoria_em_uso();

-- ------------------------------------------------------------------
-- Imagens enviadas pela mesa
-- ------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('blog-midia', 'blog-midia', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "mesa lista a midia do blog" on storage.objects;
create policy "mesa lista a midia do blog" on storage.objects
  for select to authenticated
  using (bucket_id = 'blog-midia' and (select public.is_portal_admin()));

drop policy if exists "mesa envia midia do blog" on storage.objects;
create policy "mesa envia midia do blog" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'blog-midia' and (select public.is_portal_admin()));

drop policy if exists "mesa troca midia do blog" on storage.objects;
create policy "mesa troca midia do blog" on storage.objects
  for update to authenticated
  using (bucket_id = 'blog-midia' and (select public.is_portal_admin()))
  with check (bucket_id = 'blog-midia' and (select public.is_portal_admin()));

drop policy if exists "mesa remove midia do blog" on storage.objects;
create policy "mesa remove midia do blog" on storage.objects
  for delete to authenticated
  using (bucket_id = 'blog-midia' and (select public.is_portal_admin()));

commit;
