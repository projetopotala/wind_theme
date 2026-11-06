-- PROD-03: rollback INCREMENTAL da migration 202611060005 (comportamento).
-- Reverte mesa_listar_posts, mesa_salvar_post e as politicas de versoes, categorias e midia para
-- o texto exato de 202610280001. NAO apaga dados produzidos depois da aplicacao: mantem
-- blog_posts.created_by (autoria), as linhas de admin_access_events (auditoria), a constraint de
-- acoes que as aceita, as concessoes em users/portal_module_permissions e as funcoes
-- admin_set_blog_access / admin_list_blog_events (so o owner as executa). mesa_post_json segue
-- devolvendo created_by (inofensivo). Para tambem retirar as concessoes, revogue-as antes pelo painel.

begin;
create or replace function public.mesa_listar_posts()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.has_portal_permission('blog', 'read') then
    raise exception 'Seu acesso não permite abrir a mesa do Blog.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(public.mesa_post_json(post) order by post.updated_at desc)
    from public.blog_posts as post), '[]'::jsonb);
end;
$$;
revoke all on function public.mesa_listar_posts() from public, anon;
grant execute on function public.mesa_listar_posts() to authenticated;

/* Mantém o contrato original e acrescenta a autorização por ação. */
create or replace function public.mesa_salvar_post(
  p_post jsonb, p_acao text, p_quando timestamptz default null,
  p_registrar boolean default true, p_resumo text default ''
)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  atual public.blog_posts; existe boolean; autor text; novo_status text;
  nova_data timestamptz; documento jsonb; destaque boolean; salvo public.blog_posts;
begin
  if not public.has_portal_permission('blog', 'edit') then
    raise exception 'Seu acesso não permite alterar o Blog.' using errcode = '42501';
  end if;
  if p_acao in ('publicar', 'agendar', 'despublicar', 'arquivar') and not public.has_portal_permission('blog', 'publish') then
    raise exception 'Sua conta não possui permissão de publicação.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_post) is distinct from 'object' or coalesce(btrim(p_post ->> 'id'), '') = '' then
    raise exception 'Texto inválido.' using errcode = '22023';
  end if;
  if p_acao not in ('rascunho','pendente','revisao','publicar','agendar','despublicar','arquivar') then
    raise exception 'Ação desconhecida.' using errcode = '22023';
  end if;
  select * into atual from public.blog_posts where id = p_post ->> 'id' for update; existe := found;
  if p_acao = 'revisao' and existe and atual.status in ('published','scheduled')
     and not public.has_portal_permission('blog', 'publish') then
    raise exception 'Sua conta não possui permissão para alterar o estado público.' using errcode = '42501';
  end if;
  select coalesce(nullif(btrim(u.name), ''), u.email) into autor from public.users u where u.id = (select auth.uid());
  autor := coalesce(autor, 'Administração Potala');
  if p_acao = 'pendente' then
    if existe and atual.status in ('published','scheduled') then
      update public.blog_posts set pending_document=p_post,pending_updated_at=now(),updated_by_name=autor
        where id=atual.id returning * into salvo;
      if p_registrar then insert into public.blog_post_versions(post_id,acao,status,titulo,documento,autor_id,autor_nome,resumo)
        values(salvo.id,'pendente',salvo.status,coalesce(p_post->>'title',''),p_post,(select auth.uid()),autor,left(coalesce(p_resumo,''),500)); end if;
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
  if destaque and not public.has_portal_permission('blog', 'publish') then
    raise exception 'Sua conta não possui permissão para destacar textos publicados.' using errcode = '42501';
  end if;
  if destaque then update public.blog_posts set featured=false,document=document||'{"featured":false}'::jsonb where featured and id<>documento->>'id'; end if;
  insert into public.blog_posts(id,slug,status,featured,published_at,publish_at,document,pending_document,pending_updated_at,updated_at,updated_by_name)
    values(documento->>'id',documento->>'slug',novo_status,destaque,coalesce(documento->>'publishedAt',''),nova_data,documento,null,null,now(),autor)
    on conflict(id) do update set slug=excluded.slug,status=excluded.status,featured=excluded.featured,published_at=excluded.published_at,publish_at=excluded.publish_at,document=excluded.document,pending_document=null,pending_updated_at=null,updated_at=excluded.updated_at,updated_by_name=excluded.updated_by_name
    returning * into salvo;
  if p_registrar then insert into public.blog_post_versions(post_id,acao,status,titulo,documento,autor_id,autor_nome,resumo)
    values(salvo.id,p_acao,salvo.status,coalesce(documento->>'title',''),documento,(select auth.uid()),autor,left(coalesce(p_resumo,''),500)); end if;
  return public.mesa_post_json(salvo);
end;
$$;
revoke all on function public.mesa_salvar_post(jsonb,text,timestamptz,boolean,text) from public, anon;
grant execute on function public.mesa_salvar_post(jsonb,text,timestamptz,boolean,text) to authenticated;

drop policy if exists "administracao cria categorias" on public.blog_categories;
create policy "administracao cria categorias" on public.blog_categories for insert to authenticated
  with check ((select public.has_portal_permission('blog','edit')));
drop policy if exists "administracao altera categorias" on public.blog_categories;
create policy "administracao altera categorias" on public.blog_categories for update to authenticated
  using ((select public.has_portal_permission('blog','edit')))
  with check ((select public.has_portal_permission('blog','edit')));
drop policy if exists "administracao apaga categorias" on public.blog_categories;
create policy "administracao apaga categorias" on public.blog_categories for delete to authenticated
  using ((select public.has_portal_permission('blog','edit')));

drop policy if exists "administracao le as versoes" on public.blog_post_versions;
create policy "administracao le as versoes" on public.blog_post_versions
  for select to authenticated using ((select public.has_portal_permission('blog','read')));

drop policy if exists "mesa lista a midia do blog" on storage.objects;
create policy "mesa lista a midia do blog" on storage.objects for select to authenticated
  using (bucket_id='blog-midia' and (select public.has_portal_permission('blog','read')));
drop policy if exists "mesa envia midia do blog" on storage.objects;
create policy "mesa envia midia do blog" on storage.objects for insert to authenticated
  with check (bucket_id='blog-midia' and (select public.has_portal_permission('blog','edit')));
drop policy if exists "mesa troca midia do blog" on storage.objects;
create policy "mesa troca midia do blog" on storage.objects for update to authenticated
  using (bucket_id='blog-midia' and (select public.has_portal_permission('blog','edit')))
  with check (bucket_id='blog-midia' and (select public.has_portal_permission('blog','edit')));
drop policy if exists "mesa remove midia do blog" on storage.objects;
create policy "mesa remove midia do blog" on storage.objects for delete to authenticated
  using (bucket_id='blog-midia' and (select public.has_portal_permission('blog','edit')));


commit;
