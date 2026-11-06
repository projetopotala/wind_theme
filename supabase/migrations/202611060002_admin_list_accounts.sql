-- Usuários e Acessos — incremento 1: listagem administrativa SOMENTE LEITURA.
--
-- admin_list_accounts(): uma linha por conta do Supabase Auth, com os vínculos que já
-- existem (public.users, portal_module_permissions, appointment_profile_accounts).
-- Só responde a quem is_portal_admin() aprova; para qualquer outra conta, erro 42501.
-- Não devolve senha, hash, token, telefone nem metadados de autenticação; o nome vem
-- de public.profiles (exibição apenas — nunca usado para autorizar nada).
-- Nenhuma escrita, nenhuma alteração de dados existentes.

create or replace function public.admin_list_accounts()
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
    select jsonb_agg(conta order by conta ->> 'email')
    from (
      select jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'name', left(coalesce(nullif(p.display_name, ''), ''), 120),
        'created_at', u.created_at,
        'email_confirmed', u.email_confirmed_at is not null,
        'last_sign_in_at', u.last_sign_in_at,
        'status', case
          when u.banned_until is not null and u.banned_until > now() then 'bloqueada'
          when u.email_confirmed_at is null then 'pendente_confirmacao'
          when u.last_sign_in_at is null then 'nunca_entrou'
          else 'ativa' end,
        'portal_role', pu.role,
        'portal_active', pu.active,
        'blog', case when bp.user_id is null then null else jsonb_build_object(
          'read', bp.can_read, 'edit', bp.can_edit, 'publish', bp.can_publish, 'active', bp.active) end,
        'links', coalesce((
          select jsonb_agg(jsonb_build_object(
            'profile_id', a.profile_id,
            'display_name', left(coalesce(op.document ->> 'display_name', ''), 160),
            'roles', coalesce(op.document -> 'roles', '[]'::jsonb),
            'link_active', a.active,
            'profile_active', coalesce((op.document ->> 'active')::boolean, true),
            'published', coalesce((op.document ->> 'published')::boolean, false))
            order by a.profile_id)
          from public.appointment_profile_accounts a
          left join public.op_records op on op.collection = 'profiles' and op.id = a.profile_id
          where a.user_id = u.id), '[]'::jsonb)
      ) as conta
      from auth.users u
      left join public.profiles p on p.id = u.id
      left join public.users pu on pu.id = u.id
      left join public.portal_module_permissions bp on bp.user_id = u.id and bp.module = 'blog'
      where u.deleted_at is null
      limit 1000
    ) contas
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_list_accounts() from public, anon;
grant execute on function public.admin_list_accounts() to authenticated;
