-- Solicitações públicas; não cria reservas nem altera a agenda operacional.
-- Depende de is_portal_admin() da migration 202609080004.
begin;

create table public.appointment_requests (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  service text not null check (char_length(service) between 3 and 120),
  modality text not null check (modality in ('presencial', 'online')),
  requester_name text not null check (char_length(requester_name) between 2 and 100),
  contact_type text not null check (contact_type in ('email', 'telefone')),
  contact text not null check (char_length(contact) between 8 and 254),
  preferred_date date not null,
  preferred_period text not null check (preferred_period in ('manha', 'tarde', 'noite')),
  status text not null default 'recebida'
    check (status in ('recebida', 'em_contato', 'encerrada', 'cancelada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointment_requests_contact_format check (
    (contact_type = 'email' and contact ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')
    or (contact_type = 'telefone' and contact ~ '^[+]?[0-9]{10,15}$')
  )
);
create index appointment_requests_created_idx on public.appointment_requests (created_at desc);
create index appointment_requests_contact_idx on public.appointment_requests (contact, created_at);

alter table public.appointment_requests enable row level security;
revoke all on table public.appointment_requests from public, anon, authenticated;
grant select (id, service, modality, requester_name, contact_type, contact,
  preferred_date, preferred_period, status, created_at, updated_at)
  on public.appointment_requests to authenticated;
grant update (status) on public.appointment_requests to authenticated;
create policy appointment_requests_admin_read on public.appointment_requests
  for select to authenticated using ((select public.is_portal_admin()));
create policy appointment_requests_admin_update on public.appointment_requests
  for update to authenticated using ((select public.is_portal_admin()))
  with check ((select public.is_portal_admin()));

create function public.touch_appointment_request() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.touch_appointment_request() from public, anon, authenticated;
create trigger appointment_requests_touch before update on public.appointment_requests
  for each row execute function public.touch_appointment_request();

create function public.submit_appointment_request(
  p_idempotency_key uuid, p_service text, p_modality text, p_requester_name text,
  p_contact_type text, p_contact text, p_preferred_date date, p_preferred_period text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  previous public.appointment_requests%rowtype;
  request_id uuid;
  today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  p_service := btrim(p_service);
  p_requester_name := btrim(p_requester_name);
  p_contact := lower(btrim(p_contact));
  if p_idempotency_key is null or p_service is null or char_length(p_service) not between 3 and 120
    or p_requester_name is null or char_length(p_requester_name) not between 2 and 100
    or p_modality is null or p_modality not in ('presencial', 'online')
    or p_preferred_period is null or p_preferred_period not in ('manha', 'tarde', 'noite')
    or p_preferred_date is null or not isfinite(p_preferred_date)
    or p_contact_type is null or p_contact_type not in ('email', 'telefone')
    or p_contact is null or char_length(p_contact) not between 8 and 254
    or (p_contact_type = 'email' and p_contact !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')
    or (p_contact_type = 'telefone' and p_contact !~ '^[+]?[0-9]{10,15}$') then
    raise exception 'Revise os campos da solicitação.' using errcode = '22023';
  end if;
  -- Serializa recebimentos para impedir corrida na idempotência e nos limites.
  -- Recusa rapidamente sob carga, em vez de acumular sessões esperando.
  if not pg_try_advisory_xact_lock(178904, 1) then
    raise exception 'Recebimento ocupado. Tente novamente com a mesma chave.' using errcode = 'PT429';
  end if;
  select * into previous from public.appointment_requests where idempotency_key = p_idempotency_key;
  if found then
    if row(previous.service, previous.modality, previous.requester_name, previous.contact_type,
      previous.contact, previous.preferred_date, previous.preferred_period)
      is distinct from row(p_service, p_modality, p_requester_name, p_contact_type,
      p_contact, p_preferred_date, p_preferred_period) then
      raise exception 'Chave de solicitação reutilizada com outros dados.' using errcode = 'PT409';
    end if;
    -- Não expõe o estado administrativo, contato ou qualquer outro dado.
    return jsonb_build_object('id', previous.id, 'status', 'recebida');
  end if;
  if p_preferred_date < today or p_preferred_date > today + 365 then
    raise exception 'Escolha uma preferência de data nos próximos 365 dias.' using errcode = '22023';
  end if;
  if (select count(*) from public.appointment_requests where contact = p_contact
      and created_at >= now() - interval '24 hours') >= 5
    or (select count(*) from public.appointment_requests where created_at >= now() - interval '1 minute') >= 60 then
    raise exception 'Limite de recebimento atingido. Tente mais tarde.' using errcode = 'PT429';
  end if;
  insert into public.appointment_requests
    (idempotency_key, service, modality, requester_name, contact_type, contact, preferred_date, preferred_period)
    values (p_idempotency_key, p_service, p_modality, p_requester_name, p_contact_type, p_contact, p_preferred_date, p_preferred_period)
    returning id into request_id;
  return jsonb_build_object('id', request_id, 'status', 'recebida');
end;
$$;
revoke all on function public.submit_appointment_request(uuid,text,text,text,text,text,date,text) from public, anon, authenticated;
grant execute on function public.submit_appointment_request(uuid,text,text,text,text,text,date,text) to anon, authenticated;

revoke execute on function public.submit_appointment_request(uuid,text,text,text,text,text,date,text) from public, anon, authenticated;

commit;
