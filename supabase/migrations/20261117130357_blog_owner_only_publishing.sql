-- Aprovação editorial final exclusiva do único Owner ativo.
--
-- Preserva rascunhos, autoria, notas, versões e o nível legado "editor". O
-- can_publish antigo continua armazenado para não reescrever o histórico, mas
-- deixa de autorizar publicar, agendar, despublicar, arquivar, moderar ou
-- administrar conteúdo institucional. Todas essas decisões consultam o papel
-- ativo em public.users a cada chamada; tokens antigos não mantêm o privilégio.

begin;

create or replace function public.has_portal_permission(p_module text, p_action text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  papel text;
  permitido boolean;
begin
  if p_module is null or p_action is null or p_action not in ('read', 'edit', 'publish') then
    return false;
  end if;

  select u.role into papel
  from public.users u
  where u.id = (select auth.uid()) and u.active = true;

  -- Regra institucional: publicar e administrar o Blog é exclusivo do Owner.
  if p_module = 'blog' and p_action = 'publish' then
    return papel = 'owner';
  end if;

  if papel in ('owner', 'admin') then
    return true;
  end if;
  if papel is distinct from 'blog_editor' or p_module <> 'blog' then
    return false;
  end if;

  select case p_action
    when 'read' then can_read
    when 'edit' then can_edit
    else false
  end into permitido
  from public.portal_module_permissions
  where user_id = (select auth.uid()) and module = p_module and active = true;

  return coalesce(permitido, false);
end;
$$;
revoke all on function public.has_portal_permission(text, text) from public, anon;
grant execute on function public.has_portal_permission(text, text) to authenticated;

-- Caminho legado: também precisa consultar o Owner, nunca apenas admin/editor.
create or replace function public.save_blog_post(post jsonb)
returns public.blog_posts
language plpgsql volatile security definer set search_path = ''
as $$
declare
  salvo public.blog_posts;
  destaque boolean := coalesce((post ->> 'featured')::boolean, false);
begin
  if not public.has_portal_permission('blog', 'publish') then
    raise exception 'Somente o Owner pode publicar no Blog.' using errcode = '42501';
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

-- As políticas antigas usavam o helper administrativo, que inclui admin. As ações
-- editoriais passam a reutilizar a mesma decisão Owner-only da RPC.
drop policy if exists "administracao le todos os textos" on public.blog_posts;
create policy "administracao le todos os textos" on public.blog_posts
  for select to authenticated
  using ((select public.has_portal_permission('blog', 'publish')));

drop policy if exists "administracao apaga textos" on public.blog_posts;
create policy "administracao apaga textos" on public.blog_posts
  for delete to authenticated
  using ((select public.has_portal_permission('blog', 'publish')));

drop policy if exists "administracao altera a configuracao do blog" on public.blog_settings;
create policy "administracao altera a configuracao do blog" on public.blog_settings
  for update to authenticated
  using ((select public.has_portal_permission('blog', 'publish')))
  with check ((select public.has_portal_permission('blog', 'publish')));

drop policy if exists "administracao le todos os comentarios" on public.blog_comments;
create policy "administracao le todos os comentarios" on public.blog_comments
  for select to authenticated
  using ((select public.has_portal_permission('blog', 'publish')));

drop policy if exists "administracao modera comentarios" on public.blog_comments;
create policy "administracao modera comentarios" on public.blog_comments
  for update to authenticated
  using ((select public.has_portal_permission('blog', 'publish')))
  with check ((select public.has_portal_permission('blog', 'publish')));

drop policy if exists "administracao apaga comentarios" on public.blog_comments;
create policy "administracao apaga comentarios" on public.blog_comments
  for delete to authenticated
  using ((select public.has_portal_permission('blog', 'publish')));

commit;
