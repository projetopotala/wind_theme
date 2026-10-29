-- Frente C — consulta SOMENTE LEITURA antes de aplicar 202610290004.
-- Execute somente depois de confirmar visualmente o projeto hmspabllgxqfzzricijv.
select
  version() as postgres_version,
  current_database() as database_name,
  to_regclass('public.appointment_requests') is not null as appointment_requests_exists,
  to_regclass('public.op_records') is not null as op_records_exists,
  to_regclass('public.op_meta') is not null as op_meta_exists,
  to_regprocedure('public.submit_authenticated_appointment_request(uuid,text,text,date,text)') is not null as authenticated_request_rpc_exists,
  to_regprocedure('public.confirm_appointment_request_reservation(uuid,timestamp with time zone,text,jsonb)') is not null as confirm_reservation_rpc_exists,
  to_regprocedure('public.is_portal_admin()') is not null as admin_guard_exists,
  to_regprocedure('gen_random_uuid()') is not null as uuid_generator_exists,
  to_regclass('public.appointment_slots') is null as appointment_slots_absent,
  to_regprocedure('public.submit_appointment_slot_request(uuid,uuid)') is null as slot_request_rpc_absent;

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public' and table_name='appointment_requests'
  and column_name in ('id','idempotency_key','requester_user_id','offering_id','professional_profile_id','status','reservation_schedule_id','updated_at')
order by column_name;

select routine_schema, routine_name, pg_get_function_identity_arguments(p.oid) as signature,
  p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('submit_authenticated_appointment_request','confirm_appointment_request_reservation','is_portal_admin')
order by routine_name, signature;

select grantee, privilege_type
from information_schema.role_routine_grants
where routine_schema='public' and routine_name in ('submit_authenticated_appointment_request','confirm_appointment_request_reservation')
order by routine_name, grantee, privilege_type;

select relname as table_name, relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('appointment_requests','op_records','op_meta','op_requests')
order by relname;

select policyname, tablename, cmd, roles::text, qual, with_check
from pg_policies
where schemaname='public' and tablename='appointment_requests'
order by policyname;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid='public.appointment_requests'::regclass
order by conname;

select count(*) as existing_appointment_requests,
  count(*) filter (where status in ('recebida','em_contato','encerrada')) as active_or_confirmed
from public.appointment_requests;
