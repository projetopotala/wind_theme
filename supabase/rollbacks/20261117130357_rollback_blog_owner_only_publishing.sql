-- Reverte somente a exclusividade Owner da migration 20261117130357.
-- Restaura a semântica anterior: owner/admin e blog_editor com can_publish.
begin;

create or replace function public.has_portal_permission(p_module text, p_action text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  papel text;
  permitido boolean;
begin
  if p_module is null or p_action is null or p_action not in ('read', 'edit', 'publish') then return false; end if;
  select u.role into papel from public.users u
    where u.id = (select auth.uid()) and u.active = true;
  if papel in ('owner', 'admin') then return true; end if;
  if papel is distinct from 'blog_editor' or p_module <> 'blog' then return false; end if;
  select case p_action when 'read' then can_read when 'edit' then can_edit when 'publish' then can_publish end
    into permitido from public.portal_module_permissions
    where user_id = (select auth.uid()) and module = p_module and active = true;
  return coalesce(permitido, false);
end;
$$;
revoke all on function public.has_portal_permission(text, text) from public, anon;
grant execute on function public.has_portal_permission(text, text) to authenticated;

create or replace function public.save_blog_post(post jsonb)
returns public.blog_posts
language plpgsql volatile security definer set search_path = ''
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
  values (post ->> 'id', post ->> 'slug', coalesce(post ->> 'status', 'draft'),
          destaque, coalesce(post ->> 'publishedAt', ''), post, now())
  on conflict (id) do update set
    slug = excluded.slug, status = excluded.status, featured = excluded.featured,
    published_at = excluded.published_at, document = excluded.document,
    updated_at = excluded.updated_at
  returning * into salvo;

  return salvo;
end;
$$;
revoke all on function public.save_blog_post(jsonb) from public, anon;
grant execute on function public.save_blog_post(jsonb) to authenticated;

drop policy if exists "administracao le todos os textos" on public.blog_posts;
create policy "administracao le todos os textos" on public.blog_posts
  for select to authenticated using ((select public.is_portal_admin()));
drop policy if exists "administracao apaga textos" on public.blog_posts;
create policy "administracao apaga textos" on public.blog_posts
  for delete to authenticated using ((select public.is_portal_admin()));
drop policy if exists "administracao altera a configuracao do blog" on public.blog_settings;
create policy "administracao altera a configuracao do blog" on public.blog_settings
  for update to authenticated using ((select public.is_portal_admin())) with check ((select public.is_portal_admin()));
drop policy if exists "administracao le todos os comentarios" on public.blog_comments;
create policy "administracao le todos os comentarios" on public.blog_comments
  for select to authenticated using ((select public.is_portal_admin()));
drop policy if exists "administracao modera comentarios" on public.blog_comments;
create policy "administracao modera comentarios" on public.blog_comments
  for update to authenticated using ((select public.is_portal_admin())) with check ((select public.is_portal_admin()));
drop policy if exists "administracao apaga comentarios" on public.blog_comments;
create policy "administracao apaga comentarios" on public.blog_comments
  for delete to authenticated using ((select public.is_portal_admin()));

commit;
