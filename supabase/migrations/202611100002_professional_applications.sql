-- "Quero atender": solicitação de acesso profissional, com aprovação exclusiva do Owner.
--
-- Fluxo: a pessoa (conta do Meu Potala, e-mail confirmado) envia UMA solicitação; o Owner
-- analisa, aprova ou recusa. A aprovação NÃO publica nada: cria (ou reaproveita) o cadastro
-- operacional em op_records com o papel "professional", vincula a conta em
-- appointment_profile_accounts e grava a decisão em admin_access_events. Ofertas, serviços,
-- preços, publicação e horários continuam com o Owner.
--
-- Segurança
-- * A tabela não tem nenhum privilégio direto para anon/authenticated e tem RLS ligada sem
--   políticas: todo acesso passa por funções SECURITY DEFINER que usam auth.uid() do banco.
--   O navegador nunca envia user_id, status, e-mail ou papel como autoridade.
-- * Só a conta com users.role = 'owner' (ativa) lista, aprova e recusa. is_portal_admin()
--   também aceita 'admin' e por isso NÃO é usado aqui.
-- * Uma solicitação pendente por conta (índice único parcial) e no máximo 3 envios por 24 h.
-- * Aprovação atômica e idempotente: trava a linha da solicitação e usa os mesmos advisory
--   locks de admin_link_professional (conta e perfil); repetir ou competir não duplica nada.
-- * Respeita vínculos existentes: vínculo desativado ou cadastro desativado NÃO são
--   reativados pela aprovação (o Owner reativa em Usuários e acessos). Uma conta que já tem
--   cadastro operacional ganha o papel nele, em vez de um segundo cadastro.
-- * Nenhuma permissão administrativa ou editorial (users, portal_module_permissions,
--   blog_editor) é tocada.

begin;

do $$
begin
  if to_regclass('public.op_records') is null
    or to_regclass('public.appointment_profile_accounts') is null
    or to_regclass('public.admin_access_events') is null
    or to_regclass('public.users') is null
    or to_regclass('auth.users') is null then
    raise exception 'Dependências do cadastro de profissionais não instaladas (op_records, appointment_profile_accounts, admin_access_events, users).';
  end if;
end;
$$;

-- admin_access_events.action passa a aceitar as duas decisões novas. O nome do CHECK pode
-- variar entre ambientes; remove-se o que referencia a coluna action e recria-se com o conjunto completo.
do $$
declare
  v_nome text;
begin
  for v_nome in
    select c.conname
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.admin_access_events'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%action%'
  loop
    execute format('alter table public.admin_access_events drop constraint %I', v_nome);
  end loop;
end;
$$;

alter table public.admin_access_events
  add constraint admin_access_events_action_check check (action in (
    'link_professional', 'activate_professional_link', 'deactivate_professional_link', 'professional_role_revoked',
    'professional_application_approved', 'professional_application_rejected'));

create table if not exists public.professional_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  applicant_email text not null,
  display_name text not null check (char_length(display_name) between 3 and 120),
  specialty text not null check (char_length(specialty) between 2 and 120),
  presentation text not null check (char_length(presentation) between 20 and 1500),
  contact_phone text check (contact_phone is null or char_length(contact_phone) between 8 and 30),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  profile_id text,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 500),
  created_at timestamptz not null default clock_timestamp(),
  constraint professional_applications_decision_consistent check ((status = 'pending') = (decided_at is null))
);

create unique index if not exists professional_applications_one_pending_idx
  on public.professional_applications (user_id) where status = 'pending';
create index if not exists professional_applications_status_created_idx
  on public.professional_applications (status, created_at);

alter table public.professional_applications enable row level security;
revoke all on table public.professional_applications from public, anon, authenticated;

-- Estado da PRÓPRIA solicitação mais recente (auth.uid() decide; nada vem do navegador).
create or replace function public.my_professional_application()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Entre no Meu Potala para ver sua solicitação.' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'id', a.id,
      'status', a.status,
      'display_name', a.display_name,
      'specialty', a.specialty,
      'created_at', a.created_at,
      'decided_at', a.decided_at,
      'decision_note', a.decision_note)
    from public.professional_applications a
    where a.user_id = v_uid
    order by a.created_at desc
    limit 1);
end;
$$;

-- Envia a solicitação. Identidade e e-mail vêm do banco; o navegador só envia texto.
create or replace function public.submit_professional_application(
  p_display_name text,
  p_specialty text,
  p_presentation text,
  p_phone text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_confirmado timestamptz;
  v_nome text := btrim(coalesce(p_display_name, ''));
  v_especialidade text := btrim(coalesce(p_specialty, ''));
  v_apresentacao text := btrim(coalesce(p_presentation, ''));
  v_telefone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Entre no Meu Potala para enviar a solicitação.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('potala-solicitacao-profissional:' || v_uid::text, 0));

  select u.email, u.email_confirmed_at into v_email, v_confirmado
    from auth.users u where u.id = v_uid and u.deleted_at is null;
  if v_email is null then
    raise exception 'Conta não encontrada.' using errcode = '42501';
  end if;
  if v_confirmado is null then
    raise exception 'Confirme seu e-mail antes de pedir para atender.' using errcode = '42501';
  end if;

  if char_length(v_nome) not between 3 and 120
    or char_length(v_especialidade) not between 2 and 120
    or char_length(v_apresentacao) not between 20 and 1500
    or (v_telefone is not null and (char_length(v_telefone) not between 8 and 30 or v_telefone !~ '^[0-9+()\s.-]+$')) then
    raise exception 'Confira os campos: nome, especialidade, apresentação (mínimo 20 caracteres) e telefone.' using errcode = '22023';
  end if;
  if v_nome ~ '[\x01-\x1f\x7f]' or v_especialidade ~ '[\x01-\x1f\x7f]'
    or v_apresentacao ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]' then
    raise exception 'O texto contém caracteres não permitidos.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.appointment_profile_accounts c
    join public.op_records p on p.collection = 'profiles' and p.id = c.profile_id
    where c.user_id = v_uid and c.active
      and coalesce(p.document -> 'roles', '[]'::jsonb) ? 'professional') then
    raise exception 'Esta conta já tem acesso profissional.' using errcode = '23505';
  end if;
  if exists (select 1 from public.professional_applications a where a.user_id = v_uid and a.status = 'pending') then
    raise exception 'Você já tem uma solicitação em análise.' using errcode = '23505';
  end if;
  if (select count(*) from public.professional_applications a
        where a.user_id = v_uid and a.created_at > clock_timestamp() - interval '24 hours') >= 3 then
    raise exception 'Muitas solicitações em pouco tempo. Tente novamente mais tarde.' using errcode = 'PT429';
  end if;

  begin
    insert into public.professional_applications (user_id, applicant_email, display_name, specialty, presentation, contact_phone)
      values (v_uid, lower(v_email), v_nome, v_especialidade, v_apresentacao, v_telefone)
      returning id into v_id;
  exception when unique_violation then
    raise exception 'Você já tem uma solicitação em análise.' using errcode = '23505';
  end;
  return jsonb_build_object('id', v_id, 'status', 'pending');
end;
$$;

-- Lista para o Owner (somente leitura). p_status: pending (padrão), approved, rejected ou all.
create or replace function public.admin_list_professional_applications(p_status text default 'pending')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role = 'owner' and u.active) then
    raise exception 'Somente a conta owner gerencia solicitações de profissionais.' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('pending', 'approved', 'rejected', 'all') then
    raise exception 'Filtro inválido.' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id,
      'user_id', a.user_id,
      'email', a.applicant_email,
      'display_name', a.display_name,
      'specialty', a.specialty,
      'presentation', a.presentation,
      'contact_phone', a.contact_phone,
      'status', a.status,
      'profile_id', a.profile_id,
      'created_at', a.created_at,
      'decided_at', a.decided_at,
      'decision_note', a.decision_note)
      order by a.created_at desc)
    from (
      select * from public.professional_applications x
      where p_status = 'all' or x.status = p_status
      order by x.created_at desc
      limit 200) a
  ), '[]'::jsonb);
end;
$$;

-- Aprova: cria ou reaproveita o cadastro, vincula a conta, audita. Não publica o perfil.
create or replace function public.admin_approve_professional_application(p_application_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_app public.professional_applications;
  v_confirmado timestamptz;
  v_conta_existe boolean;
  v_vinculo public.appointment_profile_accounts;
  v_perfil_id text;
  v_doc jsonb;
  v_email text;
  v_iguais text[];
  v_criado boolean := false;
  v_papel_novo boolean := false;
begin
  if not exists (select 1 from public.users u where u.id = v_caller and u.role = 'owner' and u.active) then
    raise exception 'Somente a conta owner gerencia solicitações de profissionais.' using errcode = '42501';
  end if;
  if p_application_id is null then
    raise exception 'Solicitação obrigatória.' using errcode = '22023';
  end if;

  select * into v_app from public.professional_applications a where a.id = p_application_id for update;
  if not found then
    raise exception 'Solicitação não encontrada.' using errcode = 'P0002';
  end if;
  if v_app.status = 'approved' then
    return jsonb_build_object('status', 'approved', 'changed', false, 'profile_id', v_app.profile_id);
  end if;
  if v_app.status <> 'pending' then
    raise exception 'Esta solicitação já foi recusada.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('potala-vinculo-conta:' || v_app.user_id::text, 0));

  select true, u.email_confirmed_at into v_conta_existe, v_confirmado
    from auth.users u where u.id = v_app.user_id and u.deleted_at is null;
  if v_conta_existe is not true then
    raise exception 'Conta não encontrada.' using errcode = 'P0002';
  end if;
  if v_confirmado is null then
    raise exception 'A conta ainda não confirmou o e-mail.' using errcode = '22023';
  end if;

  select * into v_vinculo from public.appointment_profile_accounts c where c.user_id = v_app.user_id for update;
  if found then
    v_perfil_id := v_vinculo.profile_id;
    perform pg_advisory_xact_lock(hashtextextended('potala-vinculo-perfil:' || v_perfil_id, 0));
    select o.document into v_doc from public.op_records o
      where o.collection = 'profiles' and o.id = v_perfil_id for update;
    if v_doc is null then
      raise exception 'O vínculo desta conta aponta para um cadastro inexistente.' using errcode = '23503';
    end if;
    if not v_vinculo.active then
      raise exception 'O vínculo desta conta está desativado: reative em Usuários e acessos antes de aprovar.' using errcode = '22023';
    end if;
  else
    v_email := lower(btrim(v_app.applicant_email));
    select coalesce(array_agg(o.id order by o.id), '{}') into v_iguais
      from public.op_records o
      where o.collection = 'profiles' and lower(btrim(coalesce(o.document ->> 'email', ''))) = v_email;
    if cardinality(v_iguais) > 1 then
      raise exception 'Há mais de um cadastro com este e-mail em Pessoas. Resolva antes de aprovar.' using errcode = '23505';
    end if;
    if cardinality(v_iguais) = 1 then
      v_perfil_id := v_iguais[1];
      perform pg_advisory_xact_lock(hashtextextended('potala-vinculo-perfil:' || v_perfil_id, 0));
      select o.document into v_doc from public.op_records o
        where o.collection = 'profiles' and o.id = v_perfil_id for update;
      if exists (select 1 from public.appointment_profile_accounts c where c.profile_id = v_perfil_id) then
        raise exception 'O cadastro com este e-mail já está vinculado a outra conta.' using errcode = '23505';
      end if;
    else
      v_perfil_id := 'prof-' || replace(gen_random_uuid()::text, '-', '');
      perform pg_advisory_xact_lock(hashtextextended('potala-vinculo-perfil:' || v_perfil_id, 0));
      v_doc := jsonb_build_object(
        'id', v_perfil_id,
        'display_name', v_app.display_name,
        'email', v_email,
        'phone', coalesce(v_app.contact_phone, ''),
        'roles', jsonb_build_array('client', 'professional'),
        'active', true,
        'published', false,
        'professional_title', v_app.specialty,
        'presentation', v_app.presentation,
        'origin', 'professional_application');
      insert into public.op_records (collection, id, document) values ('profiles', v_perfil_id, v_doc);
      v_criado := true;
      v_papel_novo := true;
    end if;
  end if;

  if not v_criado then
    if not coalesce((v_doc ->> 'active')::boolean, true) then
      raise exception 'O cadastro desta pessoa está desativado: reative em Pessoas antes de aprovar.' using errcode = '22023';
    end if;
    if not (case when jsonb_typeof(v_doc -> 'roles') = 'array' then v_doc -> 'roles' else '[]'::jsonb end) ? 'professional' then
      v_papel_novo := true;
      v_doc := jsonb_set(v_doc, '{roles}',
        (case when jsonb_typeof(v_doc -> 'roles') = 'array' then v_doc -> 'roles' else '[]'::jsonb end) || '"professional"'::jsonb);
    end if;
    -- Preenche só o que está vazio; nunca sobrescreve dados que o Owner já mantém em Pessoas.
    if coalesce(btrim(v_doc ->> 'professional_title'), '') = '' then
      v_doc := jsonb_set(v_doc, '{professional_title}', to_jsonb(v_app.specialty));
    end if;
    if coalesce(btrim(v_doc ->> 'presentation'), '') = '' then
      v_doc := jsonb_set(v_doc, '{presentation}', to_jsonb(v_app.presentation));
    end if;
    update public.op_records o set document = v_doc, updated_at = now()
      where o.collection = 'profiles' and o.id = v_perfil_id;
  end if;

  if v_vinculo.user_id is null then
    insert into public.appointment_profile_accounts (user_id, profile_id, active)
      values (v_app.user_id, v_perfil_id, true);
  end if;

  update public.professional_applications a
     set status = 'approved', profile_id = v_perfil_id, decided_by = v_caller, decided_at = clock_timestamp()
   where a.id = v_app.id;
  insert into public.admin_access_events (actor_id, action, target_user_id, target_profile_id, before, after)
    values (v_caller, 'professional_application_approved', v_app.user_id, v_perfil_id,
      jsonb_build_object('status', 'pending'),
      jsonb_build_object('status', 'approved', 'application_id', v_app.id, 'profile_created', v_criado,
        'professional_role_added', v_papel_novo, 'published', coalesce((v_doc ->> 'published')::boolean, false)));
  return jsonb_build_object('status', 'approved', 'changed', true, 'profile_id', v_perfil_id,
    'profile_created', v_criado, 'published', coalesce((v_doc ->> 'published')::boolean, false));
end;
$$;

create or replace function public.admin_reject_professional_application(p_application_id uuid, p_note text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_app public.professional_applications;
  v_nota text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not exists (select 1 from public.users u where u.id = v_caller and u.role = 'owner' and u.active) then
    raise exception 'Somente a conta owner gerencia solicitações de profissionais.' using errcode = '42501';
  end if;
  if p_application_id is null then
    raise exception 'Solicitação obrigatória.' using errcode = '22023';
  end if;
  if v_nota is not null and (char_length(v_nota) > 500 or v_nota ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]') then
    raise exception 'A observação deve ter até 500 caracteres, sem caracteres de controle.' using errcode = '22023';
  end if;

  select * into v_app from public.professional_applications a where a.id = p_application_id for update;
  if not found then
    raise exception 'Solicitação não encontrada.' using errcode = 'P0002';
  end if;
  if v_app.status = 'rejected' then
    return jsonb_build_object('status', 'rejected', 'changed', false);
  end if;
  if v_app.status <> 'pending' then
    raise exception 'Esta solicitação já foi aprovada.' using errcode = '22023';
  end if;

  update public.professional_applications a
     set status = 'rejected', decided_by = v_caller, decided_at = clock_timestamp(), decision_note = v_nota
   where a.id = v_app.id;
  insert into public.admin_access_events (actor_id, action, target_user_id, target_profile_id, before, after)
    values (v_caller, 'professional_application_rejected', v_app.user_id, null,
      jsonb_build_object('status', 'pending'),
      jsonb_build_object('status', 'rejected', 'application_id', v_app.id));
  return jsonb_build_object('status', 'rejected', 'changed', true);
end;
$$;

revoke all on function public.my_professional_application() from public, anon;
revoke all on function public.submit_professional_application(text, text, text, text) from public, anon;
revoke all on function public.admin_list_professional_applications(text) from public, anon;
revoke all on function public.admin_approve_professional_application(uuid) from public, anon;
revoke all on function public.admin_reject_professional_application(uuid, text) from public, anon;
grant execute on function public.my_professional_application() to authenticated;
grant execute on function public.submit_professional_application(text, text, text, text) to authenticated;
grant execute on function public.admin_list_professional_applications(text) to authenticated;
grant execute on function public.admin_approve_professional_application(uuid) to authenticated;
grant execute on function public.admin_reject_professional_application(uuid, text) to authenticated;

commit;
