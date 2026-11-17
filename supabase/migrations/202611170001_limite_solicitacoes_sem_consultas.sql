-- Limite de solicitacoes por contato: nao conta consultas ja marcadas.
--
-- Causa: submit_appointment_request limita a 5 pedidos por contato em 24 horas contando TODOS os pedidos, inclusive
-- os que o Owner ja atendeu e marcou na agenda. Quem teve 5 consultas marcadas no dia ficava sem poder pedir de novo
-- (a tela mostrava "Recebemos muitas solicitacoes agora" com zero pedidos aguardando).
--
-- Correcao: no limite por contato nao entram pedidos que viraram consulta marcada (reservation_schedule_id preenchido).
-- Continuam contando pedidos abertos, cancelados e encerrados sem consulta. Ficam iguais: limite de 5 por contato em 24h,
-- limite global de 60 por minuto, trava de recebimento, idempotencia, validacoes e permissoes (create or replace
-- preserva EXECUTE). Nenhum dado e alterado. Reversao: supabase/rollbacks/202611170001_rollback_limite_solicitacoes_sem_consultas.sql
begin;

create or replace function public.submit_appointment_request(
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
      and reservation_schedule_id is null
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

commit;
