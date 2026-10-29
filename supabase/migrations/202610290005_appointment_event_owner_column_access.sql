-- Permite que a politica de historico avalie a propriedade da solicitacao.
-- O acesso a linhas continua limitado pelas politicas RLS existentes.
begin;

do $$
begin
  if to_regclass('public.appointment_requests') is null
    or to_regclass('public.appointment_request_events') is null
    or not (select relrowsecurity from pg_class
            where oid = 'public.appointment_requests'::regclass)
    or not (select relrowsecurity from pg_class
            where oid = 'public.appointment_request_events'::regclass)
    or not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'appointment_request_events'
        and policyname = 'appointment_request_events_owner_read'
    ) then
    raise exception 'Dependencias ou RLS do historico de agendamentos ausentes.';
  end if;
end;
$$;

grant select (requester_user_id) on public.appointment_requests to authenticated;

do $$
begin
  if not has_column_privilege('authenticated',
      'public.appointment_requests', 'requester_user_id', 'SELECT')
    or has_table_privilege('anon', 'public.appointment_request_events', 'SELECT')
    or not (select relrowsecurity from pg_class
            where oid = 'public.appointment_request_events'::regclass) then
    raise exception 'Privilegios ou RLS inesperados no historico de agendamentos.';
  end if;
end;
$$;

commit;
