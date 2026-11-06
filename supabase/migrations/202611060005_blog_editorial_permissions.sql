-- PROD-03: escritores e editores do Blog, concedidos somente pela conta owner.
--
-- Modelo (sem criar papéis globais novos):
--   Sem permissão : sem linha ativa em users/portal_module_permissions.
--   Escritor      : portal_module_permissions(blog) read+edit, sem publish.
--   Editor        : read+edit+publish.
--   Owner         : acesso total (is_portal_admin), único que concede ou revoga.
-- O papel global usado é o já existente 'blog_editor' em public.users, que NÃO dá acesso a nada
-- administrativo: Pessoas, Agendamentos, Salas e Financeiro continuam exigindo is_portal_admin()
-- (owner/admin). Esta migration nunca cria nem altera owner/admin.
--
-- O que muda no banco:
--   1. blog_posts.created_by (autoria real). Textos antigos ficam com created_by nulo: só
--      editor/owner os alteram.
--   2. admin_set_blog_access(uuid, text): concede/revoga, owner ativo apenas, idempotente, auditada
--      em admin_access_events (nova ação 'blog_access_changed').
--   3. admin_list_blog_events(integer): histórico para o owner.
--   4. mesa_salvar_post: escritor só altera texto próprio, nunca publica, nem desarquiva.
--   5. mesa_listar_posts: escritor vê só os próprios textos e os públicos (sem pendências alheias).
--   6. Políticas: versões do texto só para quem publica ou para o próprio autor; categorias só
--      para quem publica; trocar/apagar mídia só para quem publica ou para quem enviou o arquivo.
-- A revogação vale na próxima chamada: todas as checagens leem o banco a cada operação.
--
-- Rollback (manual): reaplicar mesa_salvar_post/mesa_listar_posts/mesa_post_json de
-- 202610280001, recriar as políticas de versões e categorias dessa migration, derrubar as duas
-- funções admin_*_blog_*, restaurar a constraint de ações e, se desejado, remover created_by.

begin;

alter table public.blog_posts
  add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.admin_access_events drop constraint if exists admin_access_events_action_check;
alter table public.admin_access_events add constraint admin_access_events_action_check
  check (action in ('link_professional', 'activate_professional_link', 'deactivate_professional_link',
                    'professional_role_revoked', 'blog_access_changed'));

-- Nível efetivo da conta no Blog: 'none' | 'writer' | 'editor'. Uso interno (sem grants).
create or replace function public.blog_access_level(p_user_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case
      when p.can_publish and p.can_edit and p.can_read then 'editor'
      when p.can_edit and p.can_read then 'writer'
      else 'none' end
    from public.users u
    join public.portal_module_permissions p on p.user_id = u.id and p.module = 'blog' and p.active
    where u.id = p_user_id and u.active and u.role = 'blog_editor'
  ), 'none');
$$;
revoke all on function public.blog_access_level(uuid) from public, anon, authenticated;

create or replace function public.admin_set_blog_access(p_user_id uuid, p_level text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_email text;
  v_nome text;
  v_role text;
  v_antes text;
  v_depois text;
begin
  -- Somente o owner ativo; admin comum e blog_editor não concedem nada.
  if v_caller is null or not exists (
    select 1 from public.users where id = v_caller and role = 'owner' and active
  ) then
    raise exception 'Somente a conta owner pode alterar permissões do Blog.' using errcode = '42501';
  end if;
  if p_user_id is null or p_level is null or p_level not in ('none', 'writer', 'editor') then
    raise exception 'Pedido inválido.' using errcode = '22023';
  end if;
  if p_user_id = v_caller then
    raise exception 'A conta owner já tem acesso total ao Blog.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('blog_access:' || p_user_id::text, 0));

  select a.email, coalesce(nullif(btrim(a.raw_user_meta_data ->> 'full_name'), ''), split_part(a.email, '@', 1))
    into v_email, v_nome
  from auth.users a
  where a.id = p_user_id and a.deleted_at is null;
  if v_email is null then
    raise exception 'Conta não encontrada.' using errcode = '22023';
  end if;

  select role into v_role from public.users where id = p_user_id;
  if found and v_role is distinct from 'blog_editor' then
    raise exception 'Contas administrativas não são geridas por este fluxo.' using errcode = '42501';
  end if;

  v_antes := public.blog_access_level(p_user_id);

  if p_level = 'none' then
    update public.users set active = false, updated_at = now()
      where id = p_user_id and role = 'blog_editor' and active;
    update public.portal_module_permissions
      set can_read = false, can_edit = false, can_publish = false, active = false, updated_at = now()
      where user_id = p_user_id and module = 'blog'
        and (can_read or can_edit or can_publish or active);
  else
    insert into public.users (id, email, name, role, active)
      values (p_user_id, v_email, left(v_nome, 160), 'blog_editor', true)
      on conflict (id) do update set active = true, updated_at = now()
      where public.users.role = 'blog_editor' and not public.users.active;
    insert into public.portal_module_permissions (user_id, module, can_read, can_edit, can_publish, active)
      values (p_user_id, 'blog', true, true, p_level = 'editor', true)
      on conflict (user_id, module) do update
        set can_read = true, can_edit = true, can_publish = excluded.can_publish, active = true, updated_at = now()
        where (public.portal_module_permissions.can_read, public.portal_module_permissions.can_edit,
               public.portal_module_permissions.can_publish, public.portal_module_permissions.active)
              is distinct from (true, true, excluded.can_publish, true);
  end if;

  v_depois := public.blog_access_level(p_user_id);

  if v_antes is distinct from v_depois then
    insert into public.admin_access_events (actor_id, action, target_user_id, before, after)
      values (v_caller, 'blog_access_changed', p_user_id,
              jsonb_build_object('level', v_antes), jsonb_build_object('level', v_depois));
  end if;

  return jsonb_build_object('changed', v_antes is distinct from v_depois, 'before', v_antes, 'level', v_depois);
end;
$$;
revoke all on function public.admin_set_blog_access(uuid, text) from public, anon;
grant execute on function public.admin_set_blog_access(uuid, text) to authenticated;

create or replace function public.admin_list_blog_events(p_limit integer default 50)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.users where id = (select auth.uid()) and role = 'owner' and active
  ) then
    raise exception 'Somente a conta owner consulta o histórico do Blog.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id, 'at', e.created_at,
      'actor_name', coalesce(nullif(btrim(au.name), ''), 'Owner'),
      'target_id', e.target_user_id,
      'target_name', coalesce(nullif(btrim(tu.name), ''), tu.email, ''),
      'before', e.before ->> 'level', 'after', e.after ->> 'level') order by e.id desc)
    from (
      select * from public.admin_access_events
      where action = 'blog_access_changed'
      order by id desc limit least(greatest(coalesce(p_limit, 50), 1), 200)
    ) e
    left join public.users au on au.id = e.actor_id
    left join public.users tu on tu.id = e.target_user_id
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_list_blog_events(integer) from public, anon;
grant execute on function public.admin_list_blog_events(integer) to authenticated;

create or replace function public.mesa_post_json(linha public.blog_posts)
returns jsonb
language sql immutable set search_path = ''
as $$
  select jsonb_build_object(
    'id', linha.id, 'slug', linha.slug, 'status', linha.status, 'featured', linha.featured,
    'publish_at', linha.publish_at, 'document', linha.document,
    'pending_document', linha.pending_document, 'pending_updated_at', linha.pending_updated_at,
    'created_at', linha.created_at, 'updated_at', linha.updated_at, 'updated_by_name', linha.updated_by_name,
    'created_by', linha.created_by
  );
$$;

-- Quem publica (editor/owner) vê tudo. Escritor vê os próprios textos e os já públicos, sem as
-- alterações pendentes de outras pessoas.
create or replace function public.mesa_listar_posts()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_publica boolean;
begin
  if not public.has_portal_permission('blog', 'read') then
    raise exception 'Seu acesso não permite abrir a mesa do Blog.' using errcode = '42501';
  end if;
  v_publica := public.has_portal_permission('blog', 'publish');
  return coalesce((
    select jsonb_agg(
      case when v_publica or post.created_by = v_uid then public.mesa_post_json(post)
           else public.mesa_post_json(post) - 'pending_document' - 'pending_updated_at' end
      order by post.updated_at desc)
    from public.blog_posts as post
    where v_publica
       or post.created_by = v_uid
       or post.status = 'published'
       or (post.status = 'scheduled' and post.publish_at <= now())
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.mesa_listar_posts() from public, anon;
grant execute on function public.mesa_listar_posts() to authenticated;

-- Mesmo contrato de 202610280001, com autoria: sem permissão de publicar, só altera texto próprio.
create or replace function public.mesa_salvar_post(
  p_post jsonb, p_acao text, p_quando timestamptz default null,
  p_registrar boolean default true, p_resumo text default ''
)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  atual public.blog_posts; existe boolean; autor text; novo_status text;
  nova_data timestamptz; documento jsonb; destaque boolean; salvo public.blog_posts;
  v_uid uuid := (select auth.uid()); v_publica boolean;
begin
  if not public.has_portal_permission('blog', 'edit') then
    raise exception 'Seu acesso não permite alterar o Blog.' using errcode = '42501';
  end if;
  v_publica := public.has_portal_permission('blog', 'publish');
  if p_acao in ('publicar', 'agendar', 'despublicar', 'arquivar') and not v_publica then
    raise exception 'Sua conta não possui permissão de publicação.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_post) is distinct from 'object' or coalesce(btrim(p_post ->> 'id'), '') = '' then
    raise exception 'Texto inválido.' using errcode = '22023';
  end if;
  if p_acao not in ('rascunho','pendente','revisao','publicar','agendar','despublicar','arquivar') then
    raise exception 'Ação desconhecida.' using errcode = '22023';
  end if;
  select * into atual from public.blog_posts where id = p_post ->> 'id' for update; existe := found;
  if existe and not v_publica then
    if atual.created_by is distinct from v_uid then
      raise exception 'Você só pode alterar textos de sua autoria.' using errcode = '42501';
    end if;
    if atual.status = 'archived' then
      raise exception 'Este texto está arquivado: peça a um editor para reabri-lo.' using errcode = '42501';
    end if;
  end if;
  if p_acao = 'revisao' and existe and atual.status in ('published','scheduled') and not v_publica then
    raise exception 'Sua conta não possui permissão para alterar o estado público.' using errcode = '42501';
  end if;
  select coalesce(nullif(btrim(u.name), ''), u.email) into autor from public.users u where u.id = v_uid;
  autor := coalesce(autor, 'Administração Potala');
  if p_acao = 'pendente' then
    if existe and atual.status in ('published','scheduled') then
      update public.blog_posts set pending_document=p_post,pending_updated_at=now(),updated_by_name=autor
        where id=atual.id returning * into salvo;
      if p_registrar then insert into public.blog_post_versions(post_id,acao,status,titulo,documento,autor_id,autor_nome,resumo)
        values(salvo.id,'pendente',salvo.status,coalesce(p_post->>'title',''),p_post,v_uid,autor,left(coalesce(p_resumo,''),500)); end if;
      return public.mesa_post_json(salvo);
    end if;
    p_acao := 'rascunho';
  end if;
  if p_acao = 'rascunho' and existe and atual.status in ('published','scheduled') then
    raise exception 'Este texto está no ar: as alterações ficam pendentes até você atualizar.' using errcode='22023';
  end if;
  novo_status := case p_acao when 'rascunho' then case when existe and atual.status='review' then 'review' else 'draft' end when 'revisao' then 'review' when 'publicar' then 'published' when 'agendar' then 'scheduled' when 'despublicar' then 'draft' when 'arquivar' then 'archived' end;
  nova_data := case when p_acao='publicar' then case when existe and atual.status='published' then coalesce(atual.publish_at,now()) else now() end when p_acao='agendar' then p_quando else null end;
  if p_acao='agendar' and (p_quando is null or p_quando <= now()) then raise exception 'Escolha uma data e um horário no futuro para agendar.' using errcode='22023'; end if;
  documento := p_post || jsonb_build_object('status',novo_status);
  destaque := coalesce((documento->>'featured')::boolean,false) and novo_status <> 'archived';
  documento := documento || jsonb_build_object('featured',destaque);
  if destaque and not v_publica then
    raise exception 'Sua conta não possui permissão para destacar textos publicados.' using errcode = '42501';
  end if;
  if destaque then update public.blog_posts set featured=false,document=document||'{"featured":false}'::jsonb where featured and id<>documento->>'id'; end if;
  insert into public.blog_posts(id,slug,status,featured,published_at,publish_at,document,pending_document,pending_updated_at,updated_at,updated_by_name,created_by)
    values(documento->>'id',documento->>'slug',novo_status,destaque,coalesce(documento->>'publishedAt',''),nova_data,documento,null,null,now(),autor,v_uid)
    on conflict(id) do update set slug=excluded.slug,status=excluded.status,featured=excluded.featured,published_at=excluded.published_at,publish_at=excluded.publish_at,document=excluded.document,pending_document=null,pending_updated_at=null,updated_at=excluded.updated_at,updated_by_name=excluded.updated_by_name
    where v_publica or public.blog_posts.created_by = v_uid
    returning * into salvo;
  -- Corrida: dois pedidos criando o mesmo id; quem não é dono (e não publica) não sobrescreve.
  if salvo.id is null then
    raise exception 'Você só pode alterar textos de sua autoria.' using errcode = '42501';
  end if;
  if p_registrar then insert into public.blog_post_versions(post_id,acao,status,titulo,documento,autor_id,autor_nome,resumo)
    values(salvo.id,p_acao,salvo.status,coalesce(documento->>'title',''),documento,v_uid,autor,left(coalesce(p_resumo,''),500)); end if;
  return public.mesa_post_json(salvo);
end;
$$;
revoke all on function public.mesa_salvar_post(jsonb,text,timestamptz,boolean,text) from public, anon;
grant execute on function public.mesa_salvar_post(jsonb,text,timestamptz,boolean,text) to authenticated;

-- Versões: só quem publica, ou o autor da própria versão.
drop policy if exists "administracao le as versoes" on public.blog_post_versions;
create policy "administracao le as versoes" on public.blog_post_versions
  for select to authenticated using (
    (select public.has_portal_permission('blog','publish'))
    or ((select public.has_portal_permission('blog','read')) and autor_id = (select auth.uid()))
  );

-- Categorias são compartilhadas: alterar exige permissão de publicar (editor).
drop policy if exists "administracao cria categorias" on public.blog_categories;
create policy "administracao cria categorias" on public.blog_categories for insert to authenticated
  with check ((select public.has_portal_permission('blog','publish')));
drop policy if exists "administracao altera categorias" on public.blog_categories;
create policy "administracao altera categorias" on public.blog_categories for update to authenticated
  using ((select public.has_portal_permission('blog','publish')))
  with check ((select public.has_portal_permission('blog','publish')));
drop policy if exists "administracao apaga categorias" on public.blog_categories;
create policy "administracao apaga categorias" on public.blog_categories for delete to authenticated
  using ((select public.has_portal_permission('blog','publish')));

-- Midia: enviar continua exigindo 'edit'. Trocar ou apagar: quem publica (editor/owner) em qualquer
-- arquivo; o escritor apenas nos arquivos que ele mesmo enviou (owner_id gravado pelo Storage).
drop policy if exists "mesa troca midia do blog" on storage.objects;
create policy "mesa troca midia do blog" on storage.objects for update to authenticated
  using (bucket_id = 'blog-midia' and (
    (select public.has_portal_permission('blog','publish'))
    or ((select public.has_portal_permission('blog','edit')) and owner_id = (select auth.uid())::text)))
  with check (bucket_id = 'blog-midia' and (
    (select public.has_portal_permission('blog','publish'))
    or ((select public.has_portal_permission('blog','edit')) and owner_id = (select auth.uid())::text)));
drop policy if exists "mesa remove midia do blog" on storage.objects;
create policy "mesa remove midia do blog" on storage.objects for delete to authenticated
  using (bucket_id = 'blog-midia' and (
    (select public.has_portal_permission('blog','publish'))
    or ((select public.has_portal_permission('blog','edit')) and owner_id = (select auth.uid())::text)));

commit;
