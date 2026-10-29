-- Executar somente no SQL Editor do laboratorio hmspabllgxqfzzricijv.
-- Nenhuma instrucao deste arquivo altera o banco.
begin transaction read only;

select current_database() as database_name, current_user as database_role,
       inet_server_addr() as server_address, inet_server_port() as server_port;

-- Todas as sobrecargas; assinatura completa, retorno e seguranca.
select n.nspname as schema_name, p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       pg_get_function_result(p.oid) as result_type,
       p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in (
  'submit_appointment_request','submit_authenticated_appointment_request',
  'confirm_appointment_request_reservation','list_appointment_offerings',
  'create_appointment_slot','list_available_appointment_slots',
  'submit_appointment_slot_request','cancel_my_appointment_request',
  'list_my_appointment_requests','validate_op_record')
order by p.proname, arguments;

select to_regprocedure('gen_random_uuid()') is not null as has_gen_random_uuid,
       to_regclass('public.admin_users') is not null as has_admin_users,
       to_regclass('public.users') is not null as has_users,
       to_regclass('public.profiles') is not null as has_profiles,
       to_regclass('public.op_records') is not null as has_op_records,
       to_regclass('public.op_meta') is not null as has_op_meta,
       to_regclass('public.op_requests') is not null as has_op_requests,
       to_regprocedure('public.is_portal_admin()') is not null as has_admin_guard,
       to_regprocedure('public.op_snapshot()') is not null as has_op_snapshot,
       to_regprocedure('public.op_apply(bigint,text,text,jsonb,jsonb,jsonb)') is not null as has_op_apply;

select column_name, data_type, is_nullable, is_identity
from information_schema.columns
where table_schema='public' and table_name='op_records'
order by ordinal_position;
select conname, contype, convalidated, pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid=to_regclass('public.op_records')
order by conname;
select tgname, tgenabled, pg_get_triggerdef(oid) as definition
from pg_trigger where tgrelid=to_regclass('public.op_records') and not tgisinternal
order by tgname;

-- Dados operacionais: somente quantidades; casts protegidos por regex.
with r as (
 select collection,id,document,
        document->>'status' as status, document->>'mode' as mode,
        document->>'room_id' as room_id,
        document->>'professional_id' as professional_id,
        case when document->>'starts_at' ~ '^\d{4}-\d\d-\d\dT' then document->>'starts_at' end as start_text,
        case when document->>'ends_at' ~ '^\d{4}-\d\d-\d\dT' then document->>'ends_at' end as end_text
 from public.op_records where collection in ('rooms','schedule_items')
)
select collection, count(*) as total,
 count(*) filter (where collection='rooms' and
   (nullif(btrim(document->>'code'),'') is null or nullif(btrim(document->>'name'),'') is null)) as rooms_missing_identity,
 count(*) filter (where collection='rooms' and
   coalesce(status,'unconfirmed') not in ('available','unconfirmed','maintenance','unavailable')) as rooms_bad_status,
 count(*) filter (where collection='rooms' and document ? 'capacity' and
   jsonb_typeof(document->'capacity') not in ('number','null')) as rooms_bad_capacity_type,
 count(*) filter (where collection='rooms' and status='available' and
   (jsonb_typeof(document->'capacity') <> 'number' or
    case when jsonb_typeof(document->'capacity')='number' then (document->>'capacity')::numeric < 1 else true end)) as rooms_available_bad_capacity,
 count(*) filter (where collection='schedule_items' and
   coalesce(status,'booked') not in ('booked','completed','cancelled')) as schedules_bad_status,
 count(*) filter (where collection='schedule_items' and
   coalesce(mode,'presencial') not in ('presencial','online')) as schedules_bad_mode,
 count(*) filter (where collection='schedule_items' and
   (jsonb_typeof(document->'starts_at') <> 'string' or jsonb_typeof(document->'ends_at') <> 'string'
    or start_text is null or end_text is null)) as schedules_bad_time_shape,
 count(*) filter (where collection='schedule_items' and
   (document->>'participants') is not null and
   (document->>'participants') !~ '^[0-9]+$') as schedules_bad_participants_shape,
 count(*) filter (where collection='schedule_items' and
   coalesce(mode,'presencial')='online' and nullif(room_id,'') is not null) as online_with_room,
 count(*) filter (where collection='schedule_items' and
   coalesce(mode,'presencial')='presencial' and nullif(room_id,'') is null) as presencial_without_room,
 count(*) filter (where collection='schedule_items' and
   coalesce(mode,'presencial')='presencial' and nullif(room_id,'') is not null
   and not exists (select 1 from public.op_records room
     where room.collection='rooms' and room.id=r.room_id)) as missing_room,
 count(*) filter (where pg_column_size(document)>1000000) as oversized_documents
from r group by collection order by collection;

select c.relname as object_name, c.relkind, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in
 ('appointment_requests','appointment_profile_accounts','appointment_slots',
  'appointment_request_events','op_records') order by c.relname;
select table_name,column_name,data_type from information_schema.columns
where table_schema='public' and table_name in
 ('appointment_requests','appointment_profile_accounts','appointment_slots','appointment_request_events')
order by table_name,ordinal_position;
select tgrelid::regclass as table_name,tgname,tgenabled
from pg_trigger where not tgisinternal and tgrelid in
 (to_regclass('public.appointment_requests'),to_regclass('public.appointment_slots'))
order by 1,2;

-- O historico pode estar ausente ou conter versoes registradas manualmente.
do $history$
declare v jsonb;
begin
 if to_regclass('supabase_migrations.schema_migrations') is null then
   raise notice 'migration_history=ABSENT';
 else
   execute 'select coalesce(jsonb_agg(version order by version),''[]''::jsonb)
            from supabase_migrations.schema_migrations
            where version in (''202610230001'',''202610160001'',''202610200001'',
                              ''202610210001'',''202610220001'',''202610290004'')' into v;
   raise notice 'migration_versions=%',v;
 end if;
end;
$history$;
rollback;
