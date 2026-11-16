-- Profissional nao pode solicitar o proprio horario de atendimento.
--
-- Defeito encontrado em Production em 16/11: a conta Profissional dona de um horario publicado conseguiu
-- solicitar esse mesmo horario. O pedido reteve o horario (status held) e ele sumiu da lista do Cliente,
-- que passou a ver "Nenhum horario disponivel".
--
-- Correcao minima, sem tabela, coluna, politica ou dado novo:
--   * list_available_appointment_slots: deixa de oferecer a uma conta os horarios do perfil profissional
--     vinculado a ela (appointment_profile_accounts ativo). Para as demais contas nada muda.
--   * submit_appointment_slot_request: recusa (42501) quando o perfil vinculado a quem pede e o profissional
--     do horario. O resto do corpo e identico ao de Production (202610290004/202610300826).
-- Pedidos e horarios existentes nao sao alterados. Reaplicar e seguro (create or replace).
-- Reversao: supabase/rollbacks/202611160002_rollback_horario_proprio_profissional.sql.

begin;

create or replace function public.list_available_appointment_slots(p_offering_id text default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
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
    and coalesce(p.document -> 'roles', '[]'::jsonb) ? 'professional'
    and not exists (
      select 1 from public.appointment_profile_accounts a
      where a.user_id = (select auth.uid()) and a.active and a.profile_id = s.professional_profile_id
    );
$$;

create or replace function public.submit_appointment_slot_request(p_idempotency_key uuid, p_slot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
  if exists (select 1 from public.appointment_profile_accounts a
      where a.user_id = actor and a.active and a.profile_id = slot.professional_profile_id) then
    raise exception 'Este horário é seu como profissional; ele fica disponível para os clientes.' using errcode = '42501';
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

revoke all on function public.list_available_appointment_slots(text) from public, anon;
grant execute on function public.list_available_appointment_slots(text) to authenticated;
revoke all on function public.submit_appointment_slot_request(uuid, uuid) from public, anon;
grant execute on function public.submit_appointment_slot_request(uuid, uuid) to authenticated;

commit;
