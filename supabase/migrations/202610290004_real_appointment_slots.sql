-- Frente C do Marco 2: horários reais e ciclo autenticado de atendimentos.
-- Reutiliza profissionais/ofertas em op_records, solicitações existentes e a
-- confirmação operacional que materializa a reserva em schedule_items.
begin;

do $preflight$
begin
  if to_regclass('public.appointment_requests') is null
    or to_regclass('public.op_records') is null
    or to_regprocedure('public.submit_authenticated_appointment_request(uuid,text,text,date,text)') is null
    or to_regprocedure('public.confirm_appointment_request_reservation(uuid,timestamp with time zone,text,jsonb)') is null
    or to_regprocedure('public.is_portal_admin()') is null then
    raise exception 'Dependências das Frentes A, B e do fluxo de atendimentos não instaladas.';
  end if;
  if to_regprocedure('gen_random_uuid()') is null then
    raise exception 'A extensão de UUID exigida para os horários não está instalada.';
  end if;
end;
$preflight$;

create table public.appointment_slots (
  id uuid primary key default gen_random_uuid(),
  offering_id text not null check (char_length(btrim(offering_id)) between 1 and 160),
  professional_profile_id text not null check (char_length(btrim(professional_profile_id)) between 1 and 160),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  room_id text,
  status text not null default 'available' check (status in ('available','held','booked','cancelled')),
  held_by_request_id uuid unique references public.appointment_requests(id) on delete set null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointment_slots_time_check check (ends_at > starts_at),
  constraint appointment_slots_future_span_check check (ends_at - starts_at <= interval '12 hours'),
  constraint appointment_slots_state_check check (
    (status in ('available','cancelled') and held_by_request_id is null)
    or (status in ('held','booked') and held_by_request_id is not null)
  )
);

create unique index appointment_slots_professional_time_uidx
  on public.appointment_slots(professional_profile_id, starts_at, ends_at)
  where status <> 'cancelled';
create index appointment_slots_public_idx
  on public.appointment_slots(offering_id, starts_at)
  where status = 'available';

alter table public.appointment_slots enable row level security;
revoke all on table public.appointment_slots from public, anon, authenticated;
grant select on table public.appointment_slots to authenticated;
create policy appointment_slots_admin_read on public.appointment_slots
  for select to authenticated using ((select public.is_portal_admin()));

alter table public.appointment_requests
  add column appointment_slot_id uuid references public.appointment_slots(id),
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references auth.users(id) on delete set null;
create unique index appointment_requests_active_slot_uidx
  on public.appointment_requests(appointment_slot_id)
  where appointment_slot_id is not null and status in ('recebida','em_contato','encerrada');

create table public.appointment_request_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.appointment_requests(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('requested','confirmed','rejected','cancelled')),
  from_status text,
  to_status text not null,
  created_at timestamptz not null default now()
);
create index appointment_request_events_request_idx
  on public.appointment_request_events(request_id, created_at);
alter table public.appointment_request_events enable row level security;
revoke all on table public.appointment_request_events from public, anon, authenticated;
grant select on table public.appointment_request_events to authenticated;
create policy appointment_request_events_owner_read on public.appointment_request_events
  for select to authenticated using (exists (
    select 1 from public.appointment_requests r
    where r.id = request_id and r.requester_user_id = (select auth.uid())
  ));
create policy appointment_request_events_admin_read on public.appointment_request_events
  for select to authenticated using ((select public.is_portal_admin()));

create function public.list_available_appointment_slots(p_offering_id text default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when (select auth.uid()) is null then '[]'::jsonb else coalesce(jsonb_agg(
    jsonb_build_object('id', s.id, 'offering_id', s.offering_id,
      'professional_profile_id', s.professional_profile_id,
      'starts_at', s.starts_at, 'ends_at', s.ends_at)
    order by s.starts_at
  ), '[]'::jsonb) end
  from public.appointment_slots s
  join public.op_records o on o.collection = 'activity_offerings' and o.id = s.offering_id
  join public.op_records p on p.collection = 'profiles' and p.id = s.professional_profile_id
  where s.status = 'available' and s.starts_at > now()
    and (p_offering_id is null or s.offering_id = p_offering_id)
    and coalesce((o.document ->> 'active')::boolean, true)
    and coalesce((p.document ->> 'active')::boolean, true)
    and coalesce((p.document ->> 'published')::boolean, false)
    and coalesce(p.document -> 'roles', '[]'::jsonb) ? 'professional';
$$;

create function public.create_appointment_slot(p_details jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  offering public.op_records%rowtype;
  room jsonb;
  professional_id text := nullif(btrim(p_details ->> 'professional_profile_id'), '');
  start_at timestamptz;
  end_at timestamptz;
  slot public.appointment_slots%rowtype;
begin
  if actor is null or not public.is_portal_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
  if jsonb_typeof(p_details) is distinct from 'object' then raise exception 'Dados do horário inválidos.' using errcode='22023'; end if;
  begin start_at := (p_details ->> 'starts_at')::timestamptz; end_at := (p_details ->> 'ends_at')::timestamptz;
  exception when others then raise exception 'Datas do horário inválidas.' using errcode='22023'; end;
  if start_at <= now() or end_at <= start_at or end_at-start_at > interval '12 hours' then
    raise exception 'Período do horário inválido.' using errcode='22023';
  end if;
  select * into offering from public.op_records where collection='activity_offerings'
    and id=nullif(btrim(p_details ->> 'offering_id'),'') and coalesce((document->>'active')::boolean,true);
  if not found or professional_id is null or coalesce(offering.document->>'professional_id',professional_id) is distinct from professional_id then
    raise exception 'Oferta e profissional incompatíveis.' using errcode='22023';
  end if;
  if coalesce(offering.document->>'mode','presencial') = 'online' and nullif(btrim(p_details->>'room_id'),'') is not null then
    raise exception 'Atendimento online não aceita sala física.' using errcode='22023';
  end if;
  if coalesce(offering.document->>'mode','presencial') = 'presencial' then
    if nullif(btrim(p_details->>'room_id'),'') is null then
      raise exception 'Selecione uma sala para o atendimento presencial.' using errcode='22023';
    end if;
    select document into room from public.op_records where collection='rooms' and id=nullif(btrim(p_details->>'room_id'),'');
    if room is null or room->>'status' <> 'available' or coalesce((room->>'capacity')::integer,0) < 1 then
      raise exception 'Sala indisponível.' using errcode='23514';
    end if;
    if coalesce(room->>'opens_at','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or coalesce(room->>'closes_at','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      raise exception 'Horário de funcionamento da sala inválido.' using errcode='22023';
    end if;
    if (start_at at time zone 'America/Sao_Paulo')::date <> (end_at at time zone 'America/Sao_Paulo')::date
      or (start_at at time zone 'America/Sao_Paulo')::time < (room->>'opens_at')::time
      or (end_at at time zone 'America/Sao_Paulo')::time > (room->>'closes_at')::time then
      raise exception 'Horário fora do funcionamento da sala.' using errcode='22023';
    end if;
  end if;
  if not exists(select 1 from public.op_records p where p.collection='profiles' and p.id=professional_id
    and coalesce((p.document->>'active')::boolean,true) and coalesce((p.document->>'published')::boolean,false)
    and coalesce(p.document->'roles','[]'::jsonb) ? 'professional') then
    raise exception 'Profissional indisponível.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('appointment-slot:' || professional_id, 0));
  if exists(select 1 from public.appointment_slots s where s.professional_profile_id=professional_id
    and s.status <> 'cancelled' and s.starts_at < end_at and start_at < s.ends_at) then
    raise exception 'O profissional já possui horário sobreposto.' using errcode='PT409';
  end if;
  if exists(select 1 from public.op_records schedule where schedule.collection='schedule_items'
    and coalesce(schedule.document->>'status','booked') = 'booked'
    and (schedule.document->>'starts_at')::timestamptz < end_at
    and start_at < (schedule.document->>'ends_at')::timestamptz
    and (schedule.document->>'professional_id'=professional_id
      or (nullif(btrim(p_details->>'room_id'),'') is not null and schedule.document->>'room_id'=nullif(btrim(p_details->>'room_id'),'')))) then
    raise exception 'O horário conflita com a agenda operacional.' using errcode='PT409';
  end if;
  insert into public.appointment_slots(offering_id,professional_profile_id,starts_at,ends_at,room_id,created_by)
    values(offering.id,professional_id,start_at,end_at,nullif(btrim(p_details->>'room_id'),''),actor)
    returning * into slot;
  return jsonb_build_object('id',slot.id,'status',slot.status,'starts_at',slot.starts_at,'ends_at',slot.ends_at);
exception when unique_violation then raise exception 'Já existe horário para o profissional neste período.' using errcode='PT409';
end;
$$;

create function public.submit_appointment_slot_request(p_idempotency_key uuid, p_slot_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  slot public.appointment_slots%rowtype;
  prior public.appointment_requests%rowtype;
  offering public.op_records%rowtype;
  receipt jsonb;
  request_id uuid;
  period text;
begin
  if actor is null then raise exception 'Entre no Meu Potala para solicitar atendimento.' using errcode = '42501'; end if;
  if p_idempotency_key is null or p_slot_id is null then raise exception 'Escolha um horário válido.' using errcode = '22023'; end if;

  select * into prior from public.appointment_requests where idempotency_key = p_idempotency_key;
  if found then
    if prior.requester_user_id is distinct from actor or prior.appointment_slot_id is distinct from p_slot_id then
      raise exception 'Chave reutilizada com outro horário.' using errcode = 'PT409';
    end if;
    return jsonb_build_object('id', prior.id, 'status', prior.status, 'replayed', true);
  end if;

  select * into slot from public.appointment_slots where id = p_slot_id for update;
  if not found or slot.status <> 'available' or slot.starts_at <= now() then
    raise exception 'Horário não está mais disponível.' using errcode = 'PT409';
  end if;
  select * into offering from public.op_records
    where collection = 'activity_offerings' and id = slot.offering_id
      and coalesce((document ->> 'active')::boolean, true);
  if not found or coalesce(offering.document ->> 'professional_id', slot.professional_profile_id)
      is distinct from slot.professional_profile_id then
    raise exception 'Serviço indisponível para este profissional.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.op_records p where p.collection = 'profiles'
      and p.id = slot.professional_profile_id
      and coalesce((p.document ->> 'active')::boolean, true)
      and coalesce((p.document ->> 'published')::boolean, false)
      and coalesce(p.document -> 'roles', '[]'::jsonb) ? 'professional') then
    raise exception 'Profissional indisponível.' using errcode = '22023';
  end if;

  period := case when extract(hour from slot.starts_at at time zone 'America/Sao_Paulo') < 12 then 'manha'
                 when extract(hour from slot.starts_at at time zone 'America/Sao_Paulo') < 18 then 'tarde' else 'noite' end;
  receipt := public.submit_authenticated_appointment_request(p_idempotency_key, slot.offering_id,
    coalesce(offering.document ->> 'mode', 'presencial'),
    (slot.starts_at at time zone 'America/Sao_Paulo')::date, period);
  request_id := (receipt ->> 'id')::uuid;
  update public.appointment_requests set appointment_slot_id = slot.id where id = request_id;
  update public.appointment_slots set status = 'held', held_by_request_id = request_id, updated_at = now() where id = slot.id;
  insert into public.appointment_request_events(request_id, actor_id, event_type, to_status)
    values(request_id, actor, 'requested', 'recebida');
  return jsonb_build_object('id', request_id, 'status', 'recebida', 'replayed', false);
exception when unique_violation then
  raise exception 'Horário não está mais disponível.' using errcode = 'PT409';
end;
$$;

create function public.cancel_my_appointment_request(p_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare r public.appointment_requests%rowtype;
begin
  select * into r from public.appointment_requests where id = p_request_id for update;
  if not found or r.requester_user_id is distinct from (select auth.uid()) then
    raise exception 'Solicitação inexistente ou inacessível.' using errcode = '42501';
  end if;
  if r.status not in ('recebida','em_contato') or r.reservation_schedule_id is not null then
    raise exception 'Esta solicitação não pode mais ser cancelada por aqui.' using errcode = '22023';
  end if;
  update public.appointment_requests set status='cancelada', cancelled_at=now(), cancelled_by=(select auth.uid()) where id=r.id;
  update public.appointment_slots set status='available', held_by_request_id=null, updated_at=now()
    where id=r.appointment_slot_id and status='held' and held_by_request_id=r.id;
  insert into public.appointment_request_events(request_id,actor_id,event_type,from_status,to_status)
    values(r.id,(select auth.uid()),'cancelled',r.status,'cancelada');
  return jsonb_build_object('id',r.id,'status','cancelada');
end;
$$;

create function public.list_my_appointment_requests()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'service', r.service, 'modality', r.modality,
    'preferred_date', r.preferred_date, 'preferred_period', r.preferred_period,
    'status', r.status, 'created_at', r.created_at, 'updated_at', r.updated_at,
    'slot_id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at,
    'reservation_schedule_id', r.reservation_schedule_id
  ) order by r.created_at desc), '[]'::jsonb)
  from public.appointment_requests r
  left join public.appointment_slots s on s.id = r.appointment_slot_id
  where r.requester_user_id = (select auth.uid());
$$;

-- Mantém o horário sincronizado mesmo quando a Central usa as RPCs já
-- existentes para confirmar ou rejeitar uma solicitação.
create function public.sync_appointment_slot_state()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.appointment_slot_id is null then return new; end if;
  if new.reservation_schedule_id is not null and new.status = 'encerrada' then
    update public.appointment_slots set status='booked', updated_at=now()
      where id=new.appointment_slot_id and held_by_request_id=new.id;
    if old.reservation_schedule_id is null then
      insert into public.appointment_request_events(request_id,actor_id,event_type,from_status,to_status)
        values(new.id,(select auth.uid()),'confirmed',old.status,new.status);
    end if;
  elsif new.status = 'cancelada' and old.status is distinct from new.status then
    update public.appointment_slots set status='available', held_by_request_id=null, updated_at=now()
      where id=new.appointment_slot_id and status='held' and held_by_request_id=new.id;
    if (select public.is_portal_admin()) then
      insert into public.appointment_request_events(request_id,actor_id,event_type,from_status,to_status)
        values(new.id,(select auth.uid()),'rejected',old.status,new.status);
    end if;
  end if;
  return new;
end;
$$;

create function public.validate_appointment_request_transition()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status in ('cancelada','encerrada') and new.status is distinct from old.status then
    raise exception 'Solicitações canceladas ou encerradas preservam o histórico.' using errcode='22023';
  end if;
  if new.status='encerrada' and new.reservation_schedule_id is null then
    raise exception 'Uma solicitação só pode ser encerrada com reserva confirmada.' using errcode='22023';
  end if;
  if old.reservation_schedule_id is not null and new.reservation_schedule_id is distinct from old.reservation_schedule_id then
    raise exception 'O vínculo da reserva não pode ser removido ou trocado.' using errcode='23503';
  end if;
  return new;
end;
$$;
create trigger appointment_requests_validate_transition
  before update of status,reservation_schedule_id on public.appointment_requests
  for each row execute function public.validate_appointment_request_transition();
create trigger appointment_requests_sync_slot
  after update of status,reservation_schedule_id on public.appointment_requests
  for each row execute function public.sync_appointment_slot_state();

revoke all on function public.list_available_appointment_slots(text) from public, anon;
revoke all on function public.create_appointment_slot(jsonb) from public, anon;
revoke all on function public.submit_appointment_slot_request(uuid,uuid) from public, anon;
revoke all on function public.cancel_my_appointment_request(uuid) from public, anon;
revoke all on function public.list_my_appointment_requests() from public, anon;
grant execute on function public.list_available_appointment_slots(text) to authenticated;
grant execute on function public.create_appointment_slot(jsonb) to authenticated;
grant execute on function public.submit_appointment_slot_request(uuid,uuid) to authenticated;
grant execute on function public.cancel_my_appointment_request(uuid) to authenticated;
grant execute on function public.list_my_appointment_requests() to authenticated;
-- A Central existente chama estas rotinas, cujas próprias guardas exigem admin.
grant execute on function public.confirm_appointment_request_reservation(uuid,timestamptz,text,jsonb) to authenticated;

revoke all on function public.sync_appointment_slot_state() from public, anon, authenticated;
revoke all on function public.validate_appointment_request_transition() from public, anon, authenticated;

commit;
