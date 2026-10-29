-- Frente C — preflight SOMENTE LEITURA das migrations predecessoras.
-- Executar exclusivamente no laboratório hmspabllgxqfzzricijv antes de cada Run.

select
  current_database() as database_name,
  version() as postgres_version,
  to_regclass('public.appointment_requests') is not null as appointment_requests_exists,
  to_regclass('public.appointment_profile_accounts') is not null as appointment_profile_accounts_exists,
  to_regclass('public.op_records') is not null as op_records_exists,
  to_regclass('public.op_meta') is not null as op_meta_exists,
  to_regclass('public.op_requests') is not null as op_requests_exists,
  to_regprocedure('public.submit_appointment_request(uuid,text,text,text,text,text,date,text)') is not null as public_request_rpc_exists,
  to_regprocedure('public.submit_authenticated_appointment_request(uuid,text,text,date,text)') is not null as authenticated_request_rpc_exists,
  to_regprocedure('public.confirm_appointment_request_reservation(uuid,timestamp with time zone,text,jsonb)') is not null as reservation_confirmation_rpc_exists,
  to_regprocedure('public.is_portal_admin()') is not null as admin_guard_exists,
  to_regprocedure('public.validate_op_record()') is not null as op_record_guard_exists;

select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('appointment_requests', 'appointment_profile_accounts')
order by table_name, ordinal_position;

select p.proname as routine_name,
       pg_get_function_identity_arguments(p.oid) as signature,
       p.prosecdef as security_definer,
       coalesce(array_to_string(p.proconfig, ', '), '') as function_settings
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'submit_appointment_request',
    'submit_authenticated_appointment_request',
    'confirm_appointment_request_reservation',
    'is_appointment_professional',
    'is_portal_admin',
    'validate_op_record'
  )
order by p.proname, signature;

select routine_name, grantee, privilege_type
from information_schema.role_routine_grants
where routine_schema = 'public'
  and routine_name in (
    'submit_appointment_request',
    'submit_authenticated_appointment_request',
    'confirm_appointment_request_reservation',
    'is_appointment_professional'
  )
order by routine_name, grantee, privilege_type;

select relname as table_name, relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('appointment_requests', 'appointment_profile_accounts', 'op_records', 'op_meta', 'op_requests')
order by relname;

select tablename, policyname, cmd, roles::text, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('appointment_requests', 'appointment_profile_accounts')
order by tablename, policyname;

select c.conname, pg_get_constraintdef(c.oid) as definition
from pg_constraint c
join pg_class r on r.oid = c.conrelid
join pg_namespace n on n.oid = r.relnamespace
where n.nspname = 'public'
  and r.relname in ('appointment_requests', 'appointment_profile_accounts')
order by r.relname, c.conname;
