-- Confirmação atômica de uma solicitação como reserva operacional.
-- A função reutiliza a agenda existente e nunca cria lançamentos financeiros.

begin;

do $migration$
begin
  if to_regclass('public.appointment_requests') is null
    or to_regclass('public.op_records') is null
    or to_regclass('public.op_meta') is null
    or to_regclass('public.op_requests') is null
    or to_regclass('public.users') is null
    or to_regprocedure('public.is_portal_admin()') is null
    or to_regprocedure('public.validate_op_record()') is null
    or not exists (
      select 1 from pg_catalog.pg_trigger
      where tgrelid = 'public.op_records'::regclass
        and tgname = 'op_records_validate_before_write'
        and tgenabled <> 'D'
        and not tgisinternal
    )
    or not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'appointment_requests'
        and column_name in ('requester_user_id', 'offering_id', 'professional_profile_id')
      group by table_schema, table_name having count(*) = 3
    ) then
    raise exception 'Dependências de solicitações e operação não instaladas.';
  end if;
end;
$migration$;

alter table public.appointment_requests
  add column reservation_schedule_id text,
  add column reservation_confirmed_at timestamptz,
  add column reservation_confirmed_by uuid references auth.users (id) on delete set null;

-- A listagem continua sujeita às políticas RLS existentes. O cliente comum só
-- alcança sua própria solicitação e o profissional somente as atribuídas a ele;
-- estes grants apenas completam os privilégios de coluna usados pelo painel.
grant select (offering_id, professional_profile_id, reservation_schedule_id, reservation_confirmed_at)
  on public.appointment_requests to authenticated;

create unique index appointment_requests_reservation_schedule_uidx
  on public.appointment_requests (reservation_schedule_id)
  where reservation_schedule_id is not null;

create unique index op_records_schedule_appointment_request_uidx
  on public.op_records ((document ->> 'appointment_request_id'))
  where collection = 'schedule_items' and document ->> 'appointment_request_id' is not null;

create or replace function public.validate_appointment_reservation_link()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  linked public.appointment_requests%rowtype;
  request_id uuid;
begin
  if tg_op = 'DELETE' then
    if old.collection = 'schedule_items' and old.document ->> 'appointment_request_id' is not null
      and exists (select 1 from public.appointment_requests where reservation_schedule_id = old.id) then
      raise exception 'Reserva vinculada a uma solicitação não pode ser removida.' using errcode = '23503';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.collection = 'schedule_items'
    and old.document ->> 'appointment_request_id' is not null
    and exists (select 1 from public.appointment_requests where reservation_schedule_id = old.id)
    and (new.collection is distinct from old.collection
      or new.document ->> 'appointment_request_id' is distinct from old.document ->> 'appointment_request_id') then
    raise exception 'O vínculo da reserva com a solicitação não pode ser alterado.' using errcode = '23503';
  end if;
  if new.collection <> 'schedule_items' or new.document ->> 'appointment_request_id' is null then
    return new;
  end if;
  begin
    request_id := (new.document ->> 'appointment_request_id')::uuid;
  exception when invalid_text_representation then
    raise exception 'Vínculo da solicitação inválido.' using errcode = '22023';
  end;
  select * into linked from public.appointment_requests where id = request_id;
  if not found or linked.reservation_schedule_id is distinct from new.id
    or linked.status <> 'encerrada'
    or linked.offering_id is distinct from new.document ->> 'offering_id'
    or linked.professional_profile_id is distinct from new.document ->> 'professional_id'
    or linked.modality is distinct from new.document ->> 'mode' then
    raise exception 'Reserva sem vínculo confirmado com a solicitação.' using errcode = '23503';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_appointment_reservation_link() from public, anon, authenticated;
create trigger op_records_validate_appointment_reservation
  before insert or update or delete on public.op_records
  for each row execute function public.validate_appointment_reservation_link();

create or replace function public.confirm_appointment_request_reservation(
  p_request_id uuid,
  p_expected_updated_at timestamptz,
  p_idempotency_key text,
  p_schedule jsonb
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_name text;
  request public.appointment_requests%rowtype;
  previous public.op_requests%rowtype;
  current_revision bigint;
  digest text;
  schedule_id text;
  start_at timestamptz;
  end_at timestamptz;
  room_id text;
  client_id text;
  selected_offering_id text;
  selected_professional_id text;
  selected_client_id text;
  client_matches integer := 0;
  offering jsonb;
  professional jsonb;
  room jsonb;
  schedule_document jsonb;
  event jsonb;
  response jsonb;
begin
  if actor_id is null or not public.is_portal_admin() then
    raise exception 'Seu acesso não permite confirmar reservas.' using errcode = '42501';
  end if;
  if p_request_id is null or p_expected_updated_at is null
    or p_idempotency_key is null or char_length(p_idempotency_key) not between 3 and 160
    or jsonb_typeof(p_schedule) is distinct from 'object' then
    raise exception 'Dados da confirmação inválidos.' using errcode = '22023';
  end if;

  select coalesce(nullif(btrim(usuario.name), ''), usuario.email)
    into actor_name from public.users as usuario where usuario.id = actor_id;
  digest := md5(jsonb_build_object(
    'type', 'appointment.confirm_reservation',
    'request_id', p_request_id,
    'expected_updated_at', p_expected_updated_at,
    'schedule', p_schedule,
    'actor', actor_id
  )::text);

  -- A mesma trava usada por op_apply serializa reservas e torna a verificação
  -- de conflitos do trigger segura também entre sessões simultâneas.
  select revision into current_revision
    from public.op_meta where id = 1 for update;
  if current_revision is null then
    raise exception 'Operação do Instituto não inicializada.' using errcode = '55000';
  end if;

  select * into previous from public.op_requests where id = p_idempotency_key;
  if found then
    if previous.digest <> digest then
      raise exception 'Identificador reutilizado para outra operação.' using errcode = '22023';
    end if;
    return previous.result;
  end if;

  select * into request from public.appointment_requests
    where id = p_request_id for update;
  if not found then
    raise exception 'Solicitação inexistente ou inacessível.' using errcode = 'P0002';
  end if;
  if request.updated_at is distinct from p_expected_updated_at then
    raise exception 'A solicitação mudou. Recarregue antes de confirmar.' using errcode = 'PT409';
  end if;
  if request.reservation_schedule_id is not null then
    raise exception 'Esta solicitação já possui reserva.' using errcode = 'PT409';
  end if;
  if request.status not in ('recebida', 'em_contato') then
    raise exception 'O estado da solicitação não permite reserva.' using errcode = '22023';
  end if;
  selected_offering_id := nullif(btrim(p_schedule ->> 'offering_id'), '');
  selected_professional_id := nullif(btrim(p_schedule ->> 'professional_profile_id'), '');
  selected_client_id := nullif(btrim(p_schedule ->> 'client_profile_id'), '');
  if request.offering_id is not null then
    if selected_offering_id is not null and selected_offering_id is distinct from request.offering_id then
      raise exception 'A oferta selecionada diverge da solicitação autenticada.' using errcode = '22023';
    end if;
    selected_offering_id := request.offering_id;
  end if;
  if request.professional_profile_id is not null then
    if selected_professional_id is not null and selected_professional_id is distinct from request.professional_profile_id then
      raise exception 'O profissional selecionado diverge da solicitação autenticada.' using errcode = '22023';
    end if;
    selected_professional_id := request.professional_profile_id;
  end if;
  if selected_offering_id is null or selected_professional_id is null then
    raise exception 'Selecione oferta e profissional operacionais.' using errcode = '22023';
  end if;

  select document into offering from public.op_records
    where collection = 'activity_offerings' and id = selected_offering_id;
  select document into professional from public.op_records
    where collection = 'profiles' and id = selected_professional_id;
  if offering is null or coalesce((offering ->> 'active')::boolean, true) is not true
    or professional is null
    or coalesce((professional ->> 'active')::boolean, true) is not true
    or not coalesce(professional -> 'roles', '[]'::jsonb) ? 'professional' then
    raise exception 'Oferta ou profissional indisponível.' using errcode = '22023';
  end if;
  if coalesce(offering ->> 'mode', 'presencial') is distinct from request.modality then
    raise exception 'Modalidade incompatível com a oferta.' using errcode = '22023';
  end if;
  if offering ->> 'professional_id' is not null
    and offering ->> 'professional_id' is distinct from selected_professional_id then
    raise exception 'Profissional incompatível com a oferta.' using errcode = '22023';
  end if;
  if offering ->> 'professional_id' is null and not exists (
    select 1 from public.op_records as link
    where link.collection = 'offering_professionals'
      and link.document ->> 'offering_id' = selected_offering_id
      and link.document ->> 'professional_id' = selected_professional_id
      and coalesce((link.document ->> 'active')::boolean, true)
  ) then
    raise exception 'Profissional não vinculado à oferta.' using errcode = '22023';
  end if;

  begin
    start_at := (p_schedule ->> 'starts_at')::timestamptz;
    end_at := (p_schedule ->> 'ends_at')::timestamptz;
  exception when invalid_text_representation or datetime_field_overflow then
    raise exception 'Horário da reserva inválido.' using errcode = '22023';
  end;
  if start_at is null or end_at is null or start_at <= clock_timestamp()
    or end_at <= start_at or end_at - start_at > interval '24 hours' then
    raise exception 'Horário da reserva inválido.' using errcode = '22023';
  end if;
  room_id := nullif(btrim(p_schedule ->> 'room_id'), '');
  if request.modality = 'online' and room_id is not null then
    raise exception 'Atendimento online não pode ter sala física.' using errcode = '22023';
  end if;
  if request.modality = 'presencial' and room_id is null then
    raise exception 'Escolha uma sala para o atendimento presencial.' using errcode = '22023';
  end if;
  if room_id is not null then
    select document into room from public.op_records
      where collection = 'rooms' and id = room_id;
    if room is null or room ->> 'status' <> 'available'
      or coalesce((room ->> 'capacity')::integer, 0) < 1 then
      raise exception 'Sala indisponível.' using errcode = '23514';
    end if;
    if coalesce(room ->> 'opens_at', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or coalesce(room ->> 'closes_at', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      raise exception 'Horário de funcionamento da sala inválido.' using errcode = '22023';
    end if;
    if (start_at at time zone 'America/Sao_Paulo')::date
        <> (end_at at time zone 'America/Sao_Paulo')::date
      or (start_at at time zone 'America/Sao_Paulo')::time < (room ->> 'opens_at')::time
      or (end_at at time zone 'America/Sao_Paulo')::time > (room ->> 'closes_at')::time then
      raise exception 'Reserva fora do horário de funcionamento da sala.' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.op_records as maintenance
      where maintenance.collection = 'maintenance_orders'
        and maintenance.document ->> 'room_id' = room_id
        and maintenance.document ->> 'status' = 'open'
    ) then
      raise exception 'Sala em manutenção.' using errcode = '23514';
    end if;
  end if;

  if request.requester_user_id is not null then
    select id into client_id from public.op_records
      where collection = 'profiles' and id = request.requester_user_id::text
        and coalesce(document -> 'roles', '[]'::jsonb) ? 'client';
  end if;
  if client_id is null and request.contact_type = 'email' then
    select min(id), count(*)::integer into client_id, client_matches
    from public.op_records
    where collection = 'profiles'
      and lower(document ->> 'email') = lower(request.contact)
      and coalesce(document -> 'roles', '[]'::jsonb) ? 'client';
    if client_matches > 1 or (request.requester_user_id is not null and client_matches <> 1) then
      raise exception 'Solicitante sem cadastro operacional inequívoco.' using errcode = '22023';
    end if;
    if client_matches = 0 then client_id := null; end if;
  end if;
  if client_id is not null and selected_client_id is not null and selected_client_id is distinct from client_id then
    raise exception 'O cliente selecionado diverge da identidade da solicitação.' using errcode = '22023';
  end if;
  if client_id is null then
    if selected_client_id is null then
      raise exception 'Selecione o cliente operacional da solicitação pública.' using errcode = '22023';
    end if;
    select id into client_id from public.op_records
      where collection = 'profiles' and id = selected_client_id
        and coalesce(document -> 'roles', '[]'::jsonb) ? 'client'
        and coalesce((document ->> 'active')::boolean, true);
    if client_id is null then
      raise exception 'Cliente operacional inválido.' using errcode = '22023';
    end if;
  end if;
  schedule_id := gen_random_uuid()::text;
  schedule_document := jsonb_strip_nulls(jsonb_build_object(
    'id', schedule_id,
    'title', request.service,
    'kind', 'appointment',
    'origin', 'appointment_request',
    'appointment_request_id', request.id,
    'offering_id', selected_offering_id,
    'professional_id', selected_professional_id,
    'client_id', client_id,
    'mode', request.modality,
    'room_id', room_id,
    'starts_at', to_char(start_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'ends_at', to_char(end_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'participants', 1,
    'setup_minutes', 0,
    'teardown_minutes', 0,
    'status', 'booked',
    'notes', nullif(left(btrim(p_schedule ->> 'notes'), 1000), ''),
    'created_at', to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updated_at', to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ));

  update public.appointment_requests
    set offering_id = selected_offering_id,
        professional_profile_id = selected_professional_id,
        reservation_schedule_id = schedule_id,
        reservation_confirmed_at = clock_timestamp(),
        reservation_confirmed_by = actor_id,
        status = 'encerrada'
    where id = request.id and reservation_schedule_id is null;
  if not found then
    raise exception 'Esta solicitação já possui reserva.' using errcode = 'PT409';
  end if;

  insert into public.op_records (collection, id, document, updated_at)
    values ('schedule_items', schedule_id, schedule_document, clock_timestamp());

  event := jsonb_build_object(
    'id', gen_random_uuid()::text,
    'actor', coalesce(actor_name, 'Administração Potala'),
    'at', to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'action', 'appointment.confirm_reservation',
    'reason', '',
    'changes', jsonb_build_array(
      jsonb_build_object('table', 'schedule_items', 'id', schedule_id, 'before', null, 'after', schedule_document),
      jsonb_build_object('table', 'appointment_requests', 'id', request.id, 'reservation_schedule_id', schedule_id)
    )
  );
  insert into public.op_records (collection, id, document, updated_at)
    values ('audit_events', event ->> 'id', event, clock_timestamp());
  update public.op_meta set revision = current_revision + 1 where id = 1;

  response := jsonb_build_object(
    'result', jsonb_build_object('request_id', request.id, 'schedule_id', schedule_id, 'status', 'encerrada'),
    'revision', current_revision + 1
  );
  insert into public.op_requests (id, digest, result)
    values (p_idempotency_key, digest, response);
  return response;
end;
$$;

-- Ordem de homologação: instalar e validar objetos/privilégios com a RPC
-- bloqueada; depois, em uma migration separada e explicitamente autorizada,
-- conceder EXECUTE a authenticated para o teste real pela interface. A
-- ativação da flag do painel é uma terceira decisão, posterior à homologação.
revoke all on function public.confirm_appointment_request_reservation(uuid,timestamptz,text,jsonb)
  from public, anon, authenticated;

commit;
