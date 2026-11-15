-- Pedido de correções do Owner ao escritor, protegido no banco.
--
-- Contexto: o Owner devolve um texto em revisão com uma nota (documento.correcao). Esta migration refaz só a
-- função mesa_salvar_post (mesmo contrato e mesmas permissões da 202611060005) para que:
--   * o escritor não consiga criar, alterar nem apagar a nota por conta própria (só reenviando para revisão);
--   * um salvamento automático de uma aba desatualizada não apague a nota;
--   * publicar ou agendar nunca levem a nota ao texto público, nem a edição pendente de um texto no ar.
-- Pré-requisito: 202611060005. Sem tabelas, colunas ou políticas novas; reaplicar é seguro (create or replace).
-- Reversão: reaplicar o trecho de mesa_salvar_post da 202611060005.

begin;

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
      update public.blog_posts set pending_document=p_post - 'correcao',pending_updated_at=now(),updated_by_name=autor
        where id=atual.id returning * into salvo;
      if p_registrar then insert into public.blog_post_versions(post_id,acao,status,titulo,documento,autor_id,autor_nome,resumo)
        values(salvo.id,'pendente',salvo.status,coalesce(p_post->>'title',''),p_post - 'correcao',v_uid,autor,left(coalesce(p_resumo,''),500)); end if;
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
  -- Pedido de correções: só quem publica o escreve. Para quem só escreve, o pedido gravado no banco
  -- vale sempre (uma aba desatualizada não o apaga nem o inventa) e sai ao reenviar para revisão.
  -- Publicar ou agendar nunca levam o pedido para o texto público.
  if v_publica then
    if p_acao in ('publicar', 'agendar', 'revisao') then documento := documento - 'correcao'; end if;
  elsif p_acao = 'revisao' then
    documento := documento - 'correcao';
  elsif existe and atual.document ? 'correcao' then
    documento := documento || jsonb_build_object('correcao', atual.document -> 'correcao');
  else
    documento := documento - 'correcao';
  end if;
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

commit;
