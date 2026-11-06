-- Frente C — verificação SOMENTE LEITURA após cada migration da cadeia.

select
  to_regclass('public.appointment_requests') is not null as appointment_requests_exists,
  to_regclass('public.appointment_profile_accounts') is not null as appointment_profile_accounts_exists,
  to_regclass('public.appointment_slots') is not null as appointment_slots_exists,
  to_regclass('public.appointment_request_events') is not null as appointment_request_events_exists,
  to_regprocedure('public.validate_op_record()') is not null as operation_guard_exists,
  to_regprocedure('public.submit_appointment_request(uuid,text,text,text,text,text,date,text)') is not null as public_request_rpc_exists,
  to_regprocedure('public.submit_authenticated_appointment_request(uuid,text,text,date,text)') is not null as authenticated_request_rpc_exists,
  to_regprocedure('public.confirm_appointment_request_reservation(uuid,timestamp with time zone,text,jsonb)') is not null as reservation_confirmation_rpc_exists,
  to_regprocedure('public.submit_appointment_slot_request(uuid,uuid)') is not null as slot_request_rpc_exists;

select p.proname as routine_name,
       pg_get_function_identity_arguments(p.oid) as signature,
       p.prosecdef as security_definer,
       coalesce(array_to_string(p.proconfig, ', '), '') as function_settings
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'validate_op_record',
    'submit_appointment_request',
    'submit_authenticated_appointment_request',
    'confirm_appointment_request_reservation',
    'list_available_appointment_slots',
    'create_appointment_slot',
    'submit_appointment_slot_request',
    'cancel_my_appointment_request',
    'list_my_appointment_requests'
  )
order by p.proname, signature;

select routine_name, grantee, privilege_type
from information_schema.role_routine_grants
where routine_schema = 'public'
  and routine_name in (
    'submit_appointment_request',
    'submit_authenticated_appointment_request',
    'confirm_appointment_request_reservation',
    'list_available_appointment_slots',
    'create_appointment_slot',
    'submit_appointment_slot_request',
    'cancel_my_appointment_request',
    'list_my_appointment_requests'
  )
order by routine_name, grantee, privilege_type;

select c.relname as table_name, c.relrowsecurity as rls_enabled,
       coalesce(array_to_string(c.relacl, ', '), '') as relation_acl
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('appointment_requests', 'appointment_profile_accounts', 'appointment_slots', 'appointment_request_events')
order by c.relname;

select tablename, policyname, cmd, roles::text, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('appointment_requests', 'appointment_profile_accounts', 'appointment_slots', 'appointment_request_events')
order by tablename, policyname;

select r.relname as table_name, t.tgname, t.tgenabled,
       pg_get_triggerdef(t.oid) as trigger_definition
from pg_trigger t
join pg_class r on r.oid = t.tgrelid
join pg_namespace n on n.oid = r.relnamespace
where n.nspname = 'public'
  and not t.tgisinternal
  and (
    (r.relname = 'op_records' and t.tgname in ('op_records_validate_before_write', 'op_records_validate_appointment_reservation'))
    or (r.relname = 'appointment_requests' and t.tgname in ('appointment_requests_touch', 'appointment_requests_validate_transition', 'appointment_requests_sync_slot'))
  )
order by r.relname, t.tgname;
