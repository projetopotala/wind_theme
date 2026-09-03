begin;

-- Os três campos que o editor ganha. Padrões seguros: um banco já povoado
-- continua válido sem que ninguém precise preencher nada.
alter table public.home_blocks
  add column if not exists title_scale text not null default 'normal',
  add column if not exists allow_panel boolean not null default true,
  add column if not exists meta_description text not null default '';

-- A tabela espelho dos rascunhos.
--
-- Espelho, e não uma coluna JSONB dentro de home_blocks, para que o rascunho
-- carregue as MESMAS restrições do publicado. Um rascunho inválido é recusado
-- na hora de salvar, e não na hora de publicar, quando já é tarde para avisar
-- quem escreveu.
create table if not exists public.home_block_drafts (
  id text primary key,
  slug text not null unique,
  category text not null default '',
  title text not null,
  summary text not null default '',
  body text not null default '',
  image text not null default '',
  icon text not null default '',
  tags text[] not null default '{}',
  href text not null default '#',
  side text not null check (side in ('left', 'right')),
  position integer not null check (position >= 0),
  published boolean not null default true,
  title_scale text not null default 'normal',
  allow_panel boolean not null default true,
  meta_description text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.home_block_drafts enable row level security;

-- anon não aparece aqui, e é de propósito. Rascunho é texto não publicado do
-- instituto; um grant de leitura o entregaria por uma URL do Supabase, sem
-- login, para quem soubesse o endereço do projeto.
grant select, insert, update, delete on table public.home_block_drafts to authenticated;

create policy "admins can read drafts"
  on public.home_block_drafts
  for select
  to authenticated
  using (public.is_portal_admin());

create policy "admins can insert drafts"
  on public.home_block_drafts
  for insert
  to authenticated
  with check (public.is_portal_admin());

create policy "admins can update drafts"
  on public.home_block_drafts
  for update
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());

create policy "admins can delete drafts"
  on public.home_block_drafts
  for delete
  to authenticated
  using (public.is_portal_admin());

-- Publicar é uma transação só: ou todos os rascunhos sobem, ou nenhum. Metade
-- dos blocos publicados é um estado que ninguém pediu e que ninguém desfaz
-- olhando a tela.
create or replace function public.publish_home_block_drafts()
returns setof public.home_blocks
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_portal_admin() then
    raise exception 'portal_admin_required' using errcode = '42501';
  end if;

  insert into public.home_blocks (
    id, slug, category, title, summary, body, image, icon, tags, href,
    side, position, published, title_scale, allow_panel, meta_description, updated_at
  )
  select
    drafts.id, drafts.slug, drafts.category, drafts.title, drafts.summary,
    drafts.body, drafts.image, drafts.icon, drafts.tags, drafts.href,
    drafts.side, drafts.position, drafts.published, drafts.title_scale,
    drafts.allow_panel, drafts.meta_description, now()
  from public.home_block_drafts as drafts
  on conflict (id) do update set
    slug = excluded.slug,
    category = excluded.category,
    title = excluded.title,
    summary = excluded.summary,
    body = excluded.body,
    image = excluded.image,
    icon = excluded.icon,
    tags = excluded.tags,
    href = excluded.href,
    side = excluded.side,
    position = excluded.position,
    published = excluded.published,
    title_scale = excluded.title_scale,
    allow_panel = excluded.allow_panel,
    meta_description = excluded.meta_description,
    updated_at = excluded.updated_at;

  -- O WHERE é exigência do safe-update das conexões da API, não uma escolha:
  -- um DELETE sem predicado é recusado antes de rodar.
  delete from public.home_block_drafts where true;

  return query
    select blocks.*
    from public.home_blocks as blocks
    order by blocks.position, blocks.id;
end;
$$;

revoke all on function public.publish_home_block_drafts() from public;
grant execute on function public.publish_home_block_drafts() to authenticated;

commit;
