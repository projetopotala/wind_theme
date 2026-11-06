-- Reconhecimento do profissional pelo vínculo, não pela existência de consultas.
--
-- 1. my_appointment_professional_profiles(): devolve só os perfis profissionais ATIVOS
--    ligados à conta autenticada (auth.uid()). Não recebe ID do navegador; não expõe
--    contatos nem perfis de terceiros. Somente leitura.
-- 2. is_appointment_professional(p_profile_id): passa a exigir também perfil ativo.
--    Antes, um perfil desativado (document.active = false) com vínculo ativo continuava
--    recebendo acesso de profissional (agenda, appointment_room_context, sala LiveKit).
--    Assinatura, retorno e demais condições inalterados.

create or replace function public.my_appointment_professional_profiles()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when (select auth.uid()) is null then '[]'::jsonb else coalesce(jsonb_agg(
    jsonb_build_object('profile_id', conta.profile_id,
      'display_name', left(coalesce(perfil.document ->> 'display_name', ''), 160))
    order by conta.profile_id), '[]'::jsonb) end
  from public.appointment_profile_accounts as conta
  join public.op_records as perfil
    on perfil.collection = 'profiles' and perfil.id = conta.profile_id
  where conta.user_id = (select auth.uid())
    and conta.active = true
    and coalesce(perfil.document -> 'roles', '[]'::jsonb) ? 'professional'
    and coalesce((perfil.document ->> 'active')::boolean, true);
$$;

revoke all on function public.my_appointment_professional_profiles() from public, anon;
grant execute on function public.my_appointment_professional_profiles() to authenticated;

create or replace function public.is_appointment_professional(p_profile_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.appointment_profile_accounts as conta
    join public.op_records as perfil
      on perfil.collection = 'profiles' and perfil.id = conta.profile_id
    where conta.user_id = (select auth.uid())
      and conta.profile_id = p_profile_id
      and conta.active = true
      and coalesce(perfil.document -> 'roles', '[]'::jsonb) ? 'professional'
      and coalesce((perfil.document ->> 'active')::boolean, true)
  );
$$;
