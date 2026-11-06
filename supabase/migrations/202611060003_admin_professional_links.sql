-- Usuários e Acessos — incremento 2: vínculos profissionais pela Central, com auditoria.
--
-- Reaproveita appointment_profile_accounts (PK user_id, UNIQUE profile_id) e op_records.
-- Toda operação exige is_portal_admin() no banco; nada confia em papel enviado pelo navegador.
-- Desativar um vínculo encerra as salas abertas das consultas daquele perfil
-- (closed_at, como close_appointment_room_session): o varredor apaga a sala no LiveKit em
-- até ~1 min, o que desconecta quem estiver dentro — sem depender da expiração do JWT.
-- O status da consulta NÃO muda (não é marcada como concluída).

create table if not exists public.admin_access_events (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('link_professional', 'activate_professional_link', 'deactivate_professional_link')),
  target_user_id uuid references auth.users(id) on delete set null,
  target_profile_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.admin_access_events enable row level security;
revoke all on table public.admin_access_events from public, anon, authenticated;
create index if not exists admin_access_events_created_idx on public.admin_access_events (created_at desc);

-- Perfis profissionais disponíveis para vínculo (só leitura).
create or replace function public.admin_list_professional_profiles()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_portal_admin() then
    raise exception 'Acesso restrito à administração.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'profile_id', p.id,
      'display_name', left(coalesce(p.document ->> 'display_name', ''), 160),
      'active', coalesce((p.document ->> 'active')::boolean, true),
      'published', coalesce((p.document ->> 'published')::boolean, false),
      'linked_user_id', a.user_id,
      'link_active', a.active)
      order by p.document ->> 'display_name')
    from public.op_records p
    left join public.appointment_profile_accounts a on a.profile_id = p.id
    where p.collection = 'profiles' and coalesce(p.document -> 'roles', '[]'::jsonb) ? 'professional'
  ), '[]'::jsonb);
end;
$$;

-- Vincula uma conta EXISTENTE a um perfil profissional. Idempotente para o mesmo par ativo.
create or replace function public.admin_link_professional(p_user_id uuid, p_profile_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  atual public.appointment_profile_accounts;
  do_perfil public.appointment_profile_accounts;
  perfil jsonb;
begin
  if not public.is_portal_admin() then
    raise exception 'Acesso restrito à administração.' using errcode = '42501';
  end if;
  if p_user_id is null or coalesce(btrim(p_profile_id), '') = '' then
    raise exception 'Conta e perfil são obrigatórios.' using errcode = '22023';
  end if;
  -- Serializa operações concorrentes sobre a mesma conta e o mesmo perfil.
  perform pg_advisory_xact_lock(hashtextextended('potala-vinculo-conta:' || p_user_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('potala-vinculo-perfil:' || p_profile_id, 0));

  if not exists (select 1 from auth.users u where u.id = p_user_id and u.deleted_at is null) then
    raise exception 'Conta não encontrada.' using errcode = 'P0002';
  end if;
  select o.document into perfil from public.op_records o
    where o.collection = 'profiles' and o.id = p_profile_id for update;
  if perfil is null or not (coalesce(perfil -> 'roles', '[]'::jsonb) ? 'professional') then
    raise exception 'Perfil profissional não encontrado.' using errcode = 'P0002';
  end if;
  if not coalesce((perfil ->> 'active')::boolean, true) then
    raise exception 'O perfil profissional está desativado.' using errcode = '22023';
  end if;

  select * into atual from public.appointment_profile_accounts where user_id = p_user_id for update;
  select * into do_perfil from public.appointment_profile_accounts where profile_id = p_profile_id for update;

  if atual.user_id is not null and atual.profile_id = p_profile_id then
    if atual.active then return jsonb_build_object('linked', true, 'changed', false); end if;
    raise exception 'O vínculo existe e está desativado: use reativar.' using errcode = '22023';
  end if;
  if atual.user_id is not null then
    raise exception 'Esta conta já tem vínculo operacional com outro perfil.' using errcode = '23505';
  end if;
  if do_perfil.user_id is not null then
    raise exception 'Este perfil já está vinculado a outra conta.' using errcode = '23505';
  end if;

  insert into public.appointment_profile_accounts (user_id, profile_id, active) values (p_user_id, p_profile_id, true);
  insert into public.admin_access_events (actor_id, action, target_user_id, target_profile_id, before, after)
    values ((select auth.uid()), 'link_professional', p_user_id, p_profile_id, null, jsonb_build_object('active', true));
  return jsonb_build_object('linked', true, 'changed', true);
end;
$$;

-- Ativa/desativa um vínculo profissional existente. Desativar encerra as salas abertas.
create or replace function public.admin_set_professional_link(p_user_id uuid, p_profile_id text, p_active boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  atual public.appointment_profile_accounts;
  perfil jsonb;
  fechadas integer := 0;
begin
  if not public.is_portal_admin() then
    raise exception 'Acesso restrito à administração.' using errcode = '42501';
  end if;
  if p_user_id is null or coalesce(btrim(p_profile_id), '') = '' or p_active is null then
    raise exception 'Conta, perfil e estado são obrigatórios.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('potala-vinculo-conta:' || p_user_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('potala-vinculo-perfil:' || p_profile_id, 0));

  select * into atual from public.appointment_profile_accounts
    where user_id = p_user_id and profile_id = p_profile_id for update;
  if atual.user_id is null then
    raise exception 'Vínculo não encontrado.' using errcode = 'P0002';
  end if;
  select o.document into perfil from public.op_records o where o.collection = 'profiles' and o.id = p_profile_id;
  if perfil is null or not (coalesce(perfil -> 'roles', '[]'::jsonb) ? 'professional') then
    raise exception 'Somente vínculos profissionais são geridos aqui.' using errcode = '22023';
  end if;
  if p_active and not coalesce((perfil ->> 'active')::boolean, true) then
    raise exception 'Reative o perfil profissional antes de reativar o vínculo.' using errcode = '22023';
  end if;

  if atual.active is distinct from p_active then
    update public.appointment_profile_accounts set active = p_active, updated_at = now()
      where user_id = p_user_id and profile_id = p_profile_id;
  end if;

  if not p_active then
    -- Encerra salas ainda abertas das consultas deste perfil; o varredor revoga no LiveKit.
    update public.appointment_room_sessions s
       set closed_at = clock_timestamp(), closed_by = (select auth.uid())
      from public.appointment_requests r
     where r.id = s.request_id and r.professional_profile_id = p_profile_id
       and s.closed_at is null and s.revoked_at is null;
    get diagnostics fechadas = row_count;
  end if;

  if atual.active is distinct from p_active or fechadas > 0 then
    insert into public.admin_access_events (actor_id, action, target_user_id, target_profile_id, before, after)
      values ((select auth.uid()),
        case when p_active then 'activate_professional_link' else 'deactivate_professional_link' end,
        p_user_id, p_profile_id, jsonb_build_object('active', atual.active),
        jsonb_build_object('active', p_active, 'rooms_closed', fechadas));
  end if;
  return jsonb_build_object('active', p_active, 'changed', atual.active is distinct from p_active, 'rooms_closed', fechadas);
end;
$$;

revoke all on function public.admin_list_professional_profiles() from public, anon;
revoke all on function public.admin_link_professional(uuid, text) from public, anon;
revoke all on function public.admin_set_professional_link(uuid, text, boolean) from public, anon;
grant execute on function public.admin_list_professional_profiles() to authenticated;
grant execute on function public.admin_link_professional(uuid, text) to authenticated;
grant execute on function public.admin_set_professional_link(uuid, text, boolean) to authenticated;
