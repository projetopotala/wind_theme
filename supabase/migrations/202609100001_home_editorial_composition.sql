begin;

-- Requer as migrações de conteúdo e rascunhos anteriores.
-- Preserva conteúdo, grants e RLS existentes. Não reorganiza a capa publicada.
alter table public.home_blocks
  add column if not exists editorial_variant text not null default 'standard' check (editorial_variant in ('standard', 'feature', 'portrait', 'reflection')),
  add column if not exists related_mode text not null default 'automatic' check (related_mode in ('automatic', 'manual')),
  add column if not exists related_content text[] not null default '{}';

alter table public.home_block_drafts
  add column if not exists editorial_variant text not null default 'standard' check (editorial_variant in ('standard', 'feature', 'portrait', 'reflection')),
  add column if not exists related_mode text not null default 'automatic' check (related_mode in ('automatic', 'manual')),
  add column if not exists related_content text[] not null default '{}';

create or replace function public.replace_home_blocks_editorial(payload jsonb)
returns setof public.home_blocks
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_portal_admin() then
    raise exception 'portal_admin_required' using errcode = '42501';
  end if;

  if payload is null or jsonb_typeof(payload) <> 'array' then
    raise exception 'home_blocks_payload_must_be_an_array' using errcode = '22023';
  end if;

  if jsonb_array_length(payload) > 200 then
    raise exception 'home_blocks_payload_too_large' using errcode = '22023';
  end if;

  create temporary table if not exists pg_temp.portal_home_blocks_editorial_input (
    id text primary key,
    slug text not null unique,
    category text not null,
    title text not null,
    summary text not null,
    body text not null,
    image text not null,
    icon text not null,
    tags text[] not null,
    href text not null,
    side text not null check (side in ('left', 'right')),
    position integer not null check (position >= 0),
    published boolean not null,
    title_scale text not null,
    allow_panel boolean not null,
    meta_description text not null,
    editorial_variant text not null,
    related_mode text not null,
    related_content text[] not null,
    updated_at timestamptz not null
  ) on commit drop;

  -- API connections enable safe-update, which rejects an unqualified DELETE.
  -- This is a private temporary table, so the explicit predicate still means
  -- "clear this request's staging rows" without touching published content.
  delete from pg_temp.portal_home_blocks_editorial_input where true;

  insert into pg_temp.portal_home_blocks_editorial_input (
    id, slug, category, title, summary, body, image, icon,
    tags, href, side, position, published, title_scale, allow_panel, meta_description, editorial_variant, related_mode, related_content, updated_at
  )
  select
    nullif(btrim(record.id), ''),
    nullif(btrim(record.slug), ''),
    coalesce(record.category, ''),
    nullif(btrim(record.title), ''),
    coalesce(record.summary, ''),
    coalesce(record.body, ''),
    coalesce(record.image, ''),
    coalesce(record.icon, ''),
    coalesce(record.tags, '{}'),
    coalesce(nullif(btrim(record.href), ''), '#'),
    record.side,
    record.position,
    coalesce(record.published, true),
    coalesce(record.title_scale, 'normal'),
    coalesce(record.allow_panel, true),
    coalesce(record.meta_description, ''),
    coalesce(record.editorial_variant, 'standard'),
    coalesce(record.related_mode, 'automatic'),
    coalesce(record.related_content, '{}'),
    coalesce(record.updated_at, now())
  from jsonb_to_recordset(payload) as record (
    id text,
    slug text,
    category text,
    title text,
    summary text,
    body text,
    image text,
    icon text,
    tags text[],
    href text,
    side text,
    position integer,
    published boolean,
    title_scale text,
    allow_panel boolean,
    meta_description text,
    editorial_variant text,
    related_mode text,
    related_content text[],
    updated_at timestamptz
  );

  insert into public.home_blocks (
    id, slug, category, title, summary, body, image, icon,
    tags, href, side, position, published, title_scale, allow_panel, meta_description, editorial_variant, related_mode, related_content, updated_at
  )
  select
    id, slug, category, title, summary, body, image, icon,
    tags, href, side, position, published, title_scale, allow_panel, meta_description, editorial_variant, related_mode, related_content, updated_at
  from pg_temp.portal_home_blocks_editorial_input
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
    editorial_variant = excluded.editorial_variant,
    related_mode = excluded.related_mode,
    related_content = excluded.related_content,
    updated_at = excluded.updated_at;

  delete from public.home_blocks
  where not exists (
    select 1
    from pg_temp.portal_home_blocks_editorial_input incoming
    where incoming.id = home_blocks.id
  );

  return query
  select blocks.*
  from public.home_blocks blocks
  order by blocks.position, blocks.id;
end;
$$;

revoke all on function public.replace_home_blocks_editorial(jsonb) from public;
grant execute on function public.replace_home_blocks_editorial(jsonb) to authenticated;

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
    side, position, published, title_scale, allow_panel, meta_description, editorial_variant, related_mode, related_content, updated_at
  )
  select
    drafts.id, drafts.slug, drafts.category, drafts.title, drafts.summary,
    drafts.body, drafts.image, drafts.icon, drafts.tags, drafts.href,
    drafts.side, drafts.position, drafts.published, drafts.title_scale,
    drafts.allow_panel, drafts.meta_description, drafts.editorial_variant, drafts.related_mode, drafts.related_content, now()
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
    editorial_variant = excluded.editorial_variant,
    related_mode = excluded.related_mode,
    related_content = excluded.related_content,
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
