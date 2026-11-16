-- Ativa o pedido de atendimento SEM horario e SEM profissional pre-atribuido, para contas autenticadas.
--
-- Regra do Instituto: o cliente pede o servico; o Owner decide depois quem atende e quando.
-- 202610210001 deixou submit_authenticated_appointment_request sem EXECUTE para authenticated e registrou que
-- a ativacao exige uma migration especifica e revisada. Esta e essa migration. Ela:
--   1. list_appointment_offerings: passa a listar o servico de atendimento ativo mesmo sem profissional definido
--      ("professional" vem nulo). Se houver profissional definido, ele continua precisando do papel professional.
--   2. submit_authenticated_appointment_request: aceita o pedido sem profissional (professional_profile_id nulo).
--      So o profissional fixado na propria oferta acompanha o pedido (validado como antes); os ligados por
--      offering_professionals deixam de ser escolhidos automaticamente e viram opcoes do Owner na confirmacao.
--   3. concede EXECUTE de submit_authenticated_appointment_request a authenticated (anon continua sem acesso).
-- O resto dos dois corpos e o texto de 202610210001. Continuam valendo: identidade por auth.uid(); nome e contato da
-- conta; e-mail confirmado (42501); limite de frequencia (PT429, em submit_appointment_request); oferta ativa do tipo
-- atendimento com a mesma modalidade; idempotencia pela chave; pedido nasce "recebida", sem horario nem consulta.
-- A confirmacao do Owner (confirm_appointment_request_reservation) ja exige escolher o profissional quando o pedido
-- nao tem um, e valida o vinculo dele com a oferta. Nenhuma tabela, politica ou dado e alterado.
-- Reversao: supabase/rollbacks/202611160003_rollback_atendimento_sem_horario.sql.

begin;

create or replace function public.list_appointment_offerings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when (select auth.uid()) is null then '[]'::jsonb else coalesce(jsonb_agg(
    jsonb_build_object(
      'id', oferta.id,
      'service', coalesce(definicao.document ->> 'title', oferta.document ->> 'title'),
      'professional', profissional.document ->> 'display_name',
      'modality', coalesce(oferta.document ->> 'mode', 'presencial')
    ) order by coalesce(definicao.document ->> 'title', oferta.document ->> 'title'), oferta.id
  ), '[]'::jsonb) end
  from public.op_records as oferta
  join public.op_records as definicao
    on definicao.collection = 'activity_definitions'
   and definicao.id = oferta.document ->> 'definition_id'
  left join lateral (
    select coalesce(
      oferta.document ->> 'professional_id',
      (select vinculo.document ->> 'professional_id'
       from public.op_records as vinculo
       where vinculo.collection = 'offering_professionals'
         and vinculo.document ->> 'offering_id' = oferta.id
         and coalesce((vinculo.document ->> 'active')::boolean, true)
       order by vinculo.ordem limit 1)
    ) as id
  ) as responsavel on true
  left join public.op_records as profissional
    on profissional.collection = 'profiles' and profissional.id = responsavel.id
  where oferta.collection = 'activity_offerings'
    and definicao.document ->> 'kind' = 'appointment'
    and coalesce((oferta.document ->> 'active')::boolean, true)
    and (responsavel.id is null or coalesce(profissional.document -> 'roles', '[]'::jsonb) ? 'professional');
$$;

create or replace function public.submit_authenticated_appointment_request(
  p_idempotency_key uuid,
  p_offering_id text,
  p_modality text,
  p_preferred_date date,
  p_preferred_period text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
  offering public.op_records%rowtype;
  definition public.op_records%rowtype;
  professional_id text;
  requester_name text;
  requester_email text;
  receipt jsonb;
  request_id uuid;
  existing public.appointment_requests%rowtype;
  already_existed boolean := false;
begin
  if requester_id is null then
    raise exception 'Entre no Meu Potala para solicitar atendimento.' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_offering_id is null or btrim(p_offering_id) = '' then
    raise exception 'Revise os campos da solicitação.' using errcode = '22023';
  end if;

  select * into offering from public.op_records
   where collection = 'activity_offerings' and id = p_offering_id
     and coalesce((document ->> 'active')::boolean, true);
  if not found then
    raise exception 'Serviço indisponível.' using errcode = '22023';
  end if;
  if p_modality is distinct from coalesce(offering.document ->> 'mode', 'presencial') then
    raise exception 'Modalidade indisponivel para esta oferta.' using errcode = '22023';
  end if;

  select * into definition from public.op_records
   where collection = 'activity_definitions' and id = offering.document ->> 'definition_id';
  if not found then
    raise exception 'Serviço indisponível.' using errcode = '22023';
  end if;

  if definition.document ->> 'kind' is distinct from 'appointment' then
    raise exception 'Esta oferta nao e um atendimento.' using errcode = '22023';
  end if;

  -- Somente o profissional fixado na propria oferta acompanha o pedido. Os ligados por offering_professionals
  -- sao opcoes do Owner na confirmacao (que valida o vinculo); assim o Owner decide quem atende.
  professional_id := offering.document ->> 'professional_id';
  if professional_id is not null and not exists (
    select 1 from public.op_records as perfil
    where perfil.collection = 'profiles' and perfil.id = professional_id
      and coalesce(perfil.document -> 'roles', '[]'::jsonb) ? 'professional'
  ) then
    raise exception 'Serviço sem profissional habilitado.' using errcode = '22023';
  end if;

  select left(coalesce(nullif(btrim(perfil.display_name), ''), nullif(btrim(usuario.raw_user_meta_data ->> 'full_name'), ''), split_part(usuario.email, '@', 1)), 100),
         lower(usuario.email)
    into requester_name, requester_email
  from auth.users as usuario
  left join public.profiles as perfil on perfil.id = usuario.id
  where usuario.id = requester_id;
  if not exists (
    select 1 from auth.users as usuario
    where usuario.id = requester_id
      and usuario.email_confirmed_at is not null
  ) then
    raise exception 'Confirme seu e-mail antes de solicitar atendimento.' using errcode = '42501';
  end if;

  if requester_email is null then
    raise exception 'Conta sem contato confirmado.' using errcode = '22023';
  end if;

  select * into existing from public.appointment_requests
    where idempotency_key = p_idempotency_key;
  already_existed := found;
  if found and (existing.requester_user_id is distinct from requester_id
    or existing.offering_id is distinct from offering.id
    or existing.professional_profile_id is distinct from professional_id) then
    raise exception 'Chave de solicitação reutilizada com outros dados.' using errcode = 'PT409';
  end if;

  receipt := public.submit_appointment_request(
    p_idempotency_key,
    coalesce(definition.document ->> 'title', offering.document ->> 'title'),
    p_modality,
    requester_name,
    'email',
    requester_email,
    p_preferred_date,
    p_preferred_period
  );
  request_id := (receipt ->> 'id')::uuid;

  -- Uma repetição idempotente não toca updated_at nem muda a associação.
  if already_existed then
    return receipt;
  end if;

  update public.appointment_requests as request
     set requester_user_id = requester_id,
         offering_id = offering.id,
         professional_profile_id = professional_id
   where request.id = request_id
     and (request.requester_user_id is null or request.requester_user_id = requester_id)
     and (request.offering_id is null or request.offering_id = offering.id)
     and (request.professional_profile_id is null or request.professional_profile_id = professional_id);
  if not found then
    raise exception 'A solicitação mudou. Tente novamente.' using errcode = 'PT409';
  end if;
  return receipt;
end;
$$;

revoke all on function public.list_appointment_offerings() from public, anon;
grant execute on function public.list_appointment_offerings() to authenticated;
revoke all on function public.submit_authenticated_appointment_request(uuid,text,text,date,text) from public, anon;
grant execute on function public.submit_authenticated_appointment_request(uuid,text,text,date,text) to authenticated;

commit;
