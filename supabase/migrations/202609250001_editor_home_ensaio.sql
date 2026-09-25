begin;

-- Conteúdo da Home editorial. home_blocks continua pertencendo à Home clássica.
create table if not exists public.page_elements (
  page_slug text not null,
  element_key text not null,
  kind text not null check (kind in ('text', 'media')),
  value text not null check (char_length(value) between 1 and 4000),
  media_type text check (media_type in ('image', 'video')),
  alt_text text not null default '' check (char_length(alt_text) <= 300),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (page_slug, element_key),
  constraint page_elements_media_shape check (
    (kind = 'text' and media_type is null and alt_text = '') or
    (kind = 'media' and media_type is not null)
  )
);

alter table public.page_elements enable row level security;
revoke all on public.page_elements from anon, authenticated;
grant select on public.page_elements to anon, authenticated;
grant insert, update on public.page_elements to authenticated;

drop policy if exists "todos leem elementos publicados" on public.page_elements;
create policy "todos leem elementos publicados" on public.page_elements
  for select to anon, authenticated using (true);
drop policy if exists "administradores criam elementos" on public.page_elements;
create policy "administradores criam elementos" on public.page_elements
  for insert to authenticated with check ((select public.is_portal_admin()) and updated_by = (select auth.uid()));
drop policy if exists "administradores atualizam elementos" on public.page_elements;
create policy "administradores atualizam elementos" on public.page_elements
  for update to authenticated using ((select public.is_portal_admin()))
  with check ((select public.is_portal_admin()) and updated_by = (select auth.uid()));

-- A conta já existe no Auth; o papel fica na fonte de verdade usada por is_portal_admin().
insert into public.users (id, email, name, role, active)
select id, email, coalesce(raw_user_meta_data ->> 'full_name', ''), 'owner', true
from auth.users
where lower(email) = 'projetopotala@gmail.com'
on conflict (id) do update set
  email = excluded.email,
  role = 'owner',
  active = true,
  updated_at = now();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'portal-editor-media', 'portal-editor-media', true, 52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4', 'video/webm']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "administradores enviam midia editorial" on storage.objects;
create policy "administradores enviam midia editorial" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'portal-editor-media' and (select public.is_portal_admin()));
drop policy if exists "administradores atualizam midia editorial" on storage.objects;
create policy "administradores atualizam midia editorial" on storage.objects
  for update to authenticated
  using (bucket_id = 'portal-editor-media' and (select public.is_portal_admin()))
  with check (bucket_id = 'portal-editor-media' and (select public.is_portal_admin()));

commit;
