-- Editar site: conteudo institucional com rascunho, publicacao, historico e auditoria.
--
-- Tres estados separados: PUBLICADO (site_pages_published, unica tabela legivel pelo publico),
-- RASCUNHO (site_page_drafts) e HISTORICO (site_page_revisions). Nenhuma tabela aceita escrita direta do
-- navegador: tudo passa por funcoes SECURITY DEFINER que exigem a conta Owner ativa (nao basta ser admin,
-- nem editor do Blog). Publicar e restaurar sao atomicos e conferem a versao esperada (duas abas).
-- O conteudo guarda so o que difere do original: o HTML da pagina continua sendo o fallback.
begin;

create table if not exists public.site_pages_published (
  page_slug text primary key check (page_slug ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  version integer not null check (version > 0),
  content jsonb not null,
  published_at timestamptz not null default now(),
  published_by uuid references auth.users (id) on delete set null
);

create table if not exists public.site_page_drafts (
  page_slug text primary key check (page_slug ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  base_version integer not null check (base_version >= 0),
  revision integer not null default 1 check (revision > 0),
  content jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table if not exists public.site_page_revisions (
  id bigint generated always as identity primary key,
  page_slug text not null check (page_slug ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  version integer not null check (version > 0),
  content jsonb not null,
  action text not null check (action in ('publish', 'restore')),
  restored_from integer,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  unique (page_slug, version)
);

create table if not exists public.site_edit_events (
  id bigint generated always as identity primary key,
  page_slug text not null,
  action text not null check (action in ('draft_save', 'draft_discard', 'publish', 'restore')),
  version_from integer,
  version_to integer,
  elements text[] not null default '{}',
  actor uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.site_pages_published enable row level security;
alter table public.site_page_drafts enable row level security;
alter table public.site_page_revisions enable row level security;
alter table public.site_edit_events enable row level security;

revoke all on public.site_pages_published, public.site_page_drafts, public.site_page_revisions, public.site_edit_events
  from public, anon, authenticated;
-- O publico le somente o publicado. Rascunho, historico e auditoria nao tem concessao nem politica.
-- Somente as colunas necessarias: quem publicou (published_by) nao e exposto ao publico.
grant select (page_slug, version, content, published_at) on public.site_pages_published to anon, authenticated;
drop policy if exists "todos leem o site publicado" on public.site_pages_published;
create policy "todos leem o site publicado" on public.site_pages_published
  for select to anon, authenticated using (true);

create or replace function public.site_is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.users where id = (select auth.uid()) and role = 'owner' and active = true
  )
$$;
revoke all on function public.site_is_owner() from public, anon;
grant execute on function public.site_is_owner() to authenticated;

-- Valida o conteudo inteiro: so campos conhecidos, tamanhos limitados, destinos seguros. Texto nunca vira HTML.
create or replace function public.site_validate_content(p_content jsonb) returns void
language plpgsql immutable set search_path = '' as $$
declare
  k text;
  v jsonb;
  f text;
  s text;
begin
  if p_content is null or jsonb_typeof(p_content) <> 'object' then
    raise exception 'Conteudo invalido.' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_object_keys(p_content)) > 150 then
    raise exception 'Alteracoes demais em uma pagina.' using errcode = '22023';
  end if;
  if char_length(p_content::text) > 200000 then
    raise exception 'Conteudo grande demais.' using errcode = '22023';
  end if;
  for k, v in select * from jsonb_each(p_content) loop
    if k !~ '^[a-z0-9][a-z0-9-]{0,63}$' or jsonb_typeof(v) <> 'object' then
      raise exception 'Elemento invalido.' using errcode = '22023';
    end if;
    for f in select jsonb_object_keys(v) loop
      if f not in ('text', 'href', 'src', 'alt', 'pos') or jsonb_typeof(v -> f) <> 'string' then
        raise exception 'Campo nao permitido.' using errcode = '22023';
      end if;
      s := v ->> f;
      if s ~ '[[:cntrl:]]' then
        raise exception 'Caracteres de controle nao sao permitidos.' using errcode = '22023';
      end if;
      if f = 'text' and char_length(s) not between 1 and 2000 then
        raise exception 'Texto vazio ou longo demais.' using errcode = '22023';
      elsif f = 'alt' and char_length(s) > 300 then
        raise exception 'Texto alternativo longo demais.' using errcode = '22023';
      elsif f = 'href' and (char_length(s) > 500
        or s !~* '^(https://[^[:space:]"<>]+|[a-z0-9][a-z0-9._/-]*[.]html([?#][^[:space:]"<>]*)?|#[a-z0-9_-]+)$') then
        raise exception 'Link invalido: use https://, uma pagina do Portal ou um trecho da pagina.' using errcode = '22023';
      elsif f = 'src' and (char_length(s) > 500
        or s !~* '^(https://[^[:space:]"<>]+|[a-z0-9][a-z0-9._/-]*[.](avif|jpe?g|png|webp))$'
        or s ~ '(^|/)[.][.](/|$)') then
        raise exception 'Imagem invalida.' using errcode = '22023';
      elsif f = 'pos' and s !~ '^[0-9]{1,3}% [0-9]{1,3}%$' then
        raise exception 'Enquadramento invalido.' using errcode = '22023';
      end if;
    end loop;
  end loop;
end;
$$;
revoke all on function public.site_validate_content(jsonb) from public, anon, authenticated;

create or replace function public.site_require_owner() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not public.site_is_owner() then
    raise exception 'Somente a conta Owner pode editar o site.' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;
revoke all on function public.site_require_owner() from public, anon, authenticated;

create or replace function public.site_check_page(p_page text) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_page is null or p_page !~ '^[a-z0-9][a-z0-9-]{0,63}$' then
    raise exception 'Pagina invalida.' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.site_check_page(text) from public, anon, authenticated;

-- Carrega o necessario para abrir uma pagina no editor: publicado, rascunho e historico recente.
create or replace function public.site_editor_load(p_page text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  pub public.site_pages_published%rowtype;
  dr public.site_page_drafts%rowtype;
  hist jsonb;
begin
  perform public.site_require_owner();
  perform public.site_check_page(p_page);
  select * into pub from public.site_pages_published where page_slug = p_page;
  select * into dr from public.site_page_drafts where page_slug = p_page;
  select coalesce(jsonb_agg(q.h order by (q.h ->> 'version')::int desc), '[]'::jsonb) into hist from (
    select jsonb_build_object('version', r.version, 'action', r.action, 'restored_from', r.restored_from,
      'at', r.created_at, 'elements', (select count(*) from jsonb_object_keys(r.content))) as h
    from public.site_page_revisions r where r.page_slug = p_page order by r.version desc limit 30
  ) q;
  return jsonb_build_object(
    'published', jsonb_build_object('version', coalesce(pub.version, 0), 'content', coalesce(pub.content, '{}'::jsonb),
      'at', pub.published_at),
    'draft', case when dr.page_slug is null then null else jsonb_build_object(
      'revision', dr.revision, 'base_version', dr.base_version, 'content', dr.content, 'at', dr.updated_at) end,
    'history', hist
  );
end;
$$;

-- Conteudo de uma versao antiga (para visualizar antes de restaurar).
create or replace function public.site_revision_content(p_page text, p_version integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c jsonb;
begin
  perform public.site_require_owner();
  perform public.site_check_page(p_page);
  select content into c from public.site_page_revisions where page_slug = p_page and version = p_version;
  if c is null then raise exception 'Versao nao encontrada.' using errcode = 'PT404'; end if;
  return c;
end;
$$;

create or replace function public.site_save_draft(p_page text, p_content jsonb, p_expected_revision integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.site_require_owner();
  dr public.site_page_drafts%rowtype;
  pub_version integer;
  new_revision integer;
begin
  perform public.site_check_page(p_page);
  perform public.site_validate_content(p_content);
  perform pg_advisory_xact_lock(hashtextextended('site:' || p_page, 0));
  select coalesce(max(version), 0) into pub_version from public.site_pages_published where page_slug = p_page;
  select * into dr from public.site_page_drafts where page_slug = p_page;
  if found then
    if coalesce(p_expected_revision, -1) <> dr.revision then
      raise exception 'O rascunho foi alterado em outra aba ou janela.' using errcode = 'PT409';
    end if;
    new_revision := dr.revision + 1;
    update public.site_page_drafts set content = p_content, revision = new_revision, updated_at = now(), updated_by = uid
      where page_slug = p_page;
  else
    if coalesce(p_expected_revision, -1) <> 0 then
      raise exception 'O rascunho foi descartado ou publicado em outra aba ou janela.' using errcode = 'PT409';
    end if;
    new_revision := 1;
    insert into public.site_page_drafts (page_slug, base_version, revision, content, updated_by)
      values (p_page, pub_version, 1, p_content, uid);
  end if;
  insert into public.site_edit_events (page_slug, action, version_from, version_to, elements, actor)
    values (p_page, 'draft_save', pub_version, null, coalesce(array(select jsonb_object_keys(p_content)), '{}'), uid);
  return jsonb_build_object('revision', new_revision, 'base_version', pub_version);
end;
$$;

create or replace function public.site_discard_draft(p_page text, p_expected_revision integer) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.site_require_owner();
  dr public.site_page_drafts%rowtype;
begin
  perform public.site_check_page(p_page);
  perform pg_advisory_xact_lock(hashtextextended('site:' || p_page, 0));
  select * into dr from public.site_page_drafts where page_slug = p_page;
  if not found then return; end if;
  if coalesce(p_expected_revision, -1) <> dr.revision then
    raise exception 'O rascunho foi alterado em outra aba ou janela.' using errcode = 'PT409';
  end if;
  delete from public.site_page_drafts where page_slug = p_page;
  insert into public.site_edit_events (page_slug, action, version_from, elements, actor)
    values (p_page, 'draft_discard', dr.base_version, coalesce(array(select jsonb_object_keys(dr.content)), '{}'), uid);
end;
$$;

-- Publica o rascunho: nova versao, historico e auditoria na mesma transacao.
create or replace function public.site_publish(p_page text, p_expected_version integer, p_expected_revision integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.site_require_owner();
  dr public.site_page_drafts%rowtype;
  cur integer;
  nxt integer;
begin
  perform public.site_check_page(p_page);
  perform pg_advisory_xact_lock(hashtextextended('site:' || p_page, 0));
  select * into dr from public.site_page_drafts where page_slug = p_page;
  if not found then raise exception 'Nao ha rascunho para publicar.' using errcode = 'PT404'; end if;
  select coalesce(max(version), 0) into cur from public.site_pages_published where page_slug = p_page;
  if coalesce(p_expected_revision, -1) <> dr.revision or coalesce(p_expected_version, -1) <> cur or dr.base_version <> cur then
    raise exception 'A pagina mudou desde que voce abriu. Recarregue antes de publicar.' using errcode = 'PT409';
  end if;
  perform public.site_validate_content(dr.content);
  nxt := cur + 1;
  insert into public.site_pages_published (page_slug, version, content, published_at, published_by)
    values (p_page, nxt, dr.content, now(), uid)
    on conflict (page_slug) do update set version = excluded.version, content = excluded.content,
      published_at = excluded.published_at, published_by = excluded.published_by;
  insert into public.site_page_revisions (page_slug, version, content, action, created_by)
    values (p_page, nxt, dr.content, 'publish', uid);
  delete from public.site_page_drafts where page_slug = p_page;
  insert into public.site_edit_events (page_slug, action, version_from, version_to, elements, actor)
    values (p_page, 'publish', cur, nxt, coalesce(array(select jsonb_object_keys(dr.content)), '{}'), uid);
  return jsonb_build_object('version', nxt);
end;
$$;

-- Restaura uma versao anterior como NOVA versao publicada (o historico nunca e reescrito).
-- Com rascunho em aberto, so restaura se quem chamou concordar em descarta-lo.
create or replace function public.site_restore(p_page text, p_version integer, p_expected_version integer,
  p_discard_draft boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.site_require_owner();
  c jsonb;
  cur integer;
  nxt integer;
  had_draft boolean;
begin
  perform public.site_check_page(p_page);
  perform pg_advisory_xact_lock(hashtextextended('site:' || p_page, 0));
  select content into c from public.site_page_revisions where page_slug = p_page and version = p_version;
  if c is null then raise exception 'Versao nao encontrada.' using errcode = 'PT404'; end if;
  select coalesce(max(version), 0) into cur from public.site_pages_published where page_slug = p_page;
  if coalesce(p_expected_version, -1) <> cur then
    raise exception 'A pagina mudou desde que voce abriu. Recarregue antes de restaurar.' using errcode = 'PT409';
  end if;
  select exists (select 1 from public.site_page_drafts where page_slug = p_page) into had_draft;
  if had_draft and not coalesce(p_discard_draft, false) then
    raise exception 'Ha um rascunho em aberto. Descarte-o ou publique antes de restaurar.' using errcode = 'PT409';
  end if;
  nxt := cur + 1;
  insert into public.site_pages_published (page_slug, version, content, published_at, published_by)
    values (p_page, nxt, c, now(), uid)
    on conflict (page_slug) do update set version = excluded.version, content = excluded.content,
      published_at = excluded.published_at, published_by = excluded.published_by;
  insert into public.site_page_revisions (page_slug, version, content, action, restored_from, created_by)
    values (p_page, nxt, c, 'restore', p_version, uid);
  delete from public.site_page_drafts where page_slug = p_page;
  insert into public.site_edit_events (page_slug, action, version_from, version_to, elements, actor)
    values (p_page, 'restore', cur, nxt, coalesce(array(select jsonb_object_keys(c)), '{}'), uid);
  return jsonb_build_object('version', nxt);
end;
$$;

revoke all on function public.site_editor_load(text), public.site_revision_content(text, integer),
  public.site_save_draft(text, jsonb, integer), public.site_discard_draft(text, integer),
  public.site_publish(text, integer, integer), public.site_restore(text, integer, integer, boolean)
  from public, anon;
grant execute on function public.site_editor_load(text), public.site_revision_content(text, integer),
  public.site_save_draft(text, jsonb, integer), public.site_discard_draft(text, integer),
  public.site_publish(text, integer, integer), public.site_restore(text, integer, integer, boolean)
  to authenticated;

-- Imagens do editor: bucket proprio, leitura publica, envio so pela conta Owner (nao pela administracao em geral).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-editor-media', 'site-editor-media', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "owner envia imagens do site" on storage.objects;
create policy "owner envia imagens do site" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'site-editor-media' and (select public.site_is_owner()));

commit;
