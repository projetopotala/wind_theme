-- Reverte 202611160003: restaura as duas funcoes exatamente como estavam em Production em 16/11 (copia do banco)
-- e volta a fechar o pedido sem horario para authenticated. md5(prosrc) antes: list=2f741b40… submit=3ea2c4d1…
-- Pedidos ja feitos nao sao alterados. Nao mexe no historico de migrations.
begin;
CREATE OR REPLACE FUNCTION public.list_appointment_offerings()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  join lateral (
    select coalesce(
      oferta.document ->> 'professional_id',
      (select vinculo.document ->> 'professional_id'
       from public.op_records as vinculo
       where vinculo.collection = 'offering_professionals'
         and vinculo.document ->> 'offering_id' = oferta.id
         and coalesce((vinculo.document ->> 'active')::boolean, true)
       order by vinculo.ordem limit 1)
    ) as id
  ) as responsavel on responsavel.id is not null
  join public.op_records as profissional
    on profissional.collection = 'profiles' and profissional.id = responsavel.id
  where oferta.collection = 'activity_offerings'
    and definicao.document ->> 'kind' = 'appointment'
    and coalesce((oferta.document ->> 'active')::boolean, true)
    and coalesce(profissional.document -> 'roles', '[]'::jsonb) ? 'professional';
$function$;

CREATE OR REPLACE FUNCTION public.submit_authenticated_appointment_request(p_idempotency_key uuid, p_offering_id text, p_modality text, p_preferred_date date, p_preferred_period text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  professional_id := offering.document ->> 'professional_id';
  if professional_id is null then
    select vinculo.document ->> 'professional_id' into professional_id
    from public.op_records as vinculo
    where vinculo.collection = 'offering_professionals'
      and vinculo.document ->> 'offering_id' = offering.id
      and coalesce((vinculo.document ->> 'active')::boolean, true)
    order by vinculo.ordem limit 1;
  end if;
  if professional_id is null or not exists (
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
$function$;

revoke all on function public.list_appointment_offerings() from public, anon;
grant execute on function public.list_appointment_offerings() to authenticated;
revoke all on function public.submit_authenticated_appointment_request(uuid,text,text,date,text) from public, anon, authenticated;
commit;
