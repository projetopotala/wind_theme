-- Frente C: somente condicoes restantes. Uma linha JSON; sem escrita nem dados pessoais.
-- Executar no SQL Editor de hmspabllgxqfzzricijv.
begin transaction read only;
with
expected(version) as (values
 ('202610230001'),('202610160001'),('202610200001'),
 ('202610210001'),('202610220001'),('202610290004')),
functions as (
 select p.proname, pg_get_function_identity_arguments(p.oid) as signature
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in (
  'validate_op_record','submit_appointment_request',
  'submit_authenticated_appointment_request',
  'confirm_appointment_request_reservation','create_appointment_slot',
  'list_available_appointment_slots','submit_appointment_slot_request',
  'cancel_my_appointment_request','list_my_appointment_requests')),
op as (
 select collection,id,document,document->>'room_id' as room_id,
        document->>'professional_id' as professional_id,
        coalesce(document->>'status',case when collection='rooms' then 'unconfirmed' else 'booked' end) as state,
        coalesce(document->>'mode','presencial') as mode,
        case when pg_input_is_valid(document->>'starts_at','timestamp with time zone')
             then (document->>'starts_at')::timestamptz end as starts_at,
        case when pg_input_is_valid(document->>'ends_at','timestamp with time zone')
             then (document->>'ends_at')::timestamptz end as ends_at,
        case when pg_input_is_valid(document->>'participants','integer')
             then (document->>'participants')::integer end as participants,
        case when pg_input_is_valid(document->>'setup_minutes','numeric')
             then (document->>'setup_minutes')::numeric end as setup_minutes,
        case when pg_input_is_valid(document->>'teardown_minutes','numeric')
             then (document->>'teardown_minutes')::numeric end as teardown_minutes,
        case when pg_input_is_valid(document->>'capacity','integer')
             then (document->>'capacity')::integer end as capacity
 from public.op_records where collection in ('rooms','schedule_items')),
schedule as (
 select s.*, room.document as room_document, room.state as room_state,
        room.capacity as room_capacity
 from op s left join op room on room.collection='rooms' and room.id=s.room_id
 where s.collection='schedule_items'),
operational_counts as (
 select jsonb_build_object(
  'rooms_total',(select count(*) from op where collection='rooms'),
  'rooms_missing_code_or_name',(select count(*) from op where collection='rooms' and
    (nullif(btrim(document->>'code'),'') is null or nullif(btrim(document->>'name'),'') is null)),
  'rooms_bad_status',(select count(*) from op where collection='rooms' and
    state not in ('available','unconfirmed','maintenance','unavailable')),
  'rooms_bad_capacity',(select count(*) from op where collection='rooms' and
    ((document ? 'capacity' and jsonb_typeof(document->'capacity') not in ('number','null'))
     or (document ? 'capacity' and jsonb_typeof(document->'capacity')='number' and
         (capacity is null or capacity < 1))
     or (state='available' and coalesce(capacity,0)<1))),
  'schedules_total',(select count(*) from schedule),
  'schedules_bad_status_or_mode',(select count(*) from schedule where
    state not in ('booked','completed','cancelled') or mode not in ('presencial','online')),
  'schedules_bad_time_or_participants',(select count(*) from schedule where
    jsonb_typeof(document->'starts_at') is distinct from 'string' or
    jsonb_typeof(document->'ends_at') is distinct from 'string' or
    starts_at is null or ends_at is null or starts_at>=ends_at or
    (document ? 'participants' and participants is null) or coalesce(participants,1)<1),
  'schedules_bad_buffers',(select count(*) from schedule where
    ((document ? 'setup_minutes') and setup_minutes is null) or
    ((document ? 'teardown_minutes') and teardown_minutes is null)),
  'schedules_bad_room',(select count(*) from schedule where
    (mode='online' and nullif(room_id,'') is not null) or
    (mode='presencial' and (nullif(room_id,'') is null or room_document is null or
      (state='booked' and (room_state<>'available' or room_capacity<coalesce(participants,1)))))),
  'rooms_with_future_bookings_not_available',(select count(*) from op room
    where room.collection='rooms' and room.state<>'available' and exists
    (select 1 from schedule s where s.room_id=room.id and s.state='booked' and s.ends_at>now())),
  'rooms_with_future_bookings_over_capacity',(select count(*) from op room
    where room.collection='rooms' and exists
    (select 1 from schedule s where s.room_id=room.id and s.state='booked' and s.ends_at>now()
      and coalesce(s.participants,1)>coalesce(room.capacity,0))),
  'oversized_documents',(select count(*) from op where pg_column_size(document)>1000000),
  'duplicate_appointment_request_links',(select count(*) from
    (select document->>'appointment_request_id' as request_id from public.op_records
      where collection='schedule_items' and document->>'appointment_request_id' is not null
      group by 1 having count(*)>1) d),
  'overlapping_room_pairs',(select count(*) from schedule a join schedule b
      on a.id<b.id and a.room_id=b.room_id and a.room_id is not null
      and a.state<>'cancelled' and b.state<>'cancelled'
      where a.starts_at is not null and a.ends_at is not null
        and b.starts_at is not null and b.ends_at is not null
        and tstzrange(a.starts_at-coalesce(a.setup_minutes,0)*interval '1 minute',
          a.ends_at+coalesce(a.teardown_minutes,0)*interval '1 minute','[)') &&
            tstzrange(b.starts_at-coalesce(b.setup_minutes,0)*interval '1 minute',
          b.ends_at+coalesce(b.teardown_minutes,0)*interval '1 minute','[)')),
  'overlapping_professional_pairs',(select count(*) from schedule a join schedule b
      on a.id<b.id and a.professional_id=b.professional_id and a.professional_id is not null
      and a.state<>'cancelled' and b.state<>'cancelled'
      where a.starts_at is not null and a.ends_at is not null
        and b.starts_at is not null and b.ends_at is not null
        and tstzrange(a.starts_at-coalesce(a.setup_minutes,0)*interval '1 minute',
          a.ends_at+coalesce(a.teardown_minutes,0)*interval '1 minute','[)') &&
            tstzrange(b.starts_at-coalesce(b.setup_minutes,0)*interval '1 minute',
          b.ends_at+coalesce(b.teardown_minutes,0)*interval '1 minute','[)'))
 ) as counts),
history as (
 select case when to_regclass('supabase_migrations.schema_migrations') is null
    then null::text[]
    else array(select x::text from unnest(xpath('//version/text()',
      query_to_xml('select version from supabase_migrations.schema_migrations where version in (' ||
        quote_literal('202610230001') || ',' || quote_literal('202610160001') || ',' ||
        quote_literal('202610200001') || ',' || quote_literal('202610210001') || ',' ||
        quote_literal('202610220001') || ',' || quote_literal('202610290004') ||
        ') order by version',true,false,''))) x)
  end as recorded_versions)
select jsonb_build_object(
 'rpc_names_and_signatures',(select coalesce(jsonb_agg(jsonb_build_object('name',proname,'signature',signature)
   order by proname,signature),'[]'::jsonb) from functions),
 'operational_shape',(select jsonb_build_object(
   'required_columns',count(*) filter (where (column_name,data_type) in
     (('collection','text'),('id','text'),('document','jsonb'),('updated_at','timestamp with time zone'))),
   'rls_enabled',(select relrowsecurity from pg_class where oid=to_regclass('public.op_records')))
   from information_schema.columns where table_schema='public' and table_name='op_records'),
 'operational_counts',(select counts from operational_counts),
 'migration_history',(select recorded_versions from history),
 'history_table_exists',to_regclass('supabase_migrations.schema_migrations') is not null
) as remaining_preflight;
rollback;
