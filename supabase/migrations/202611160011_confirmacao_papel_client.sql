-- Confirmação de atendimento de conta com cadastro operacional SEM o papel 'client'.
--
-- Defeito de 16/11 (homologação real): a confirmação do pedido "Flamengo" recusava com PT422 ("vínculo operacional
-- válido"). Diagnóstico em Production (somente leitura): os pedidos bloqueados são de contas cujo cadastro vinculado em
-- appointment_profile_accounts tem papel só 'student' (criado pelo fluxo de Cursos, 202611160007) ou só 'professional';
-- os pedidos já confirmados têm cadastro 'client'. A camada 20261030082641 exigia 'client' e recusava o resto.
--
-- Correção mínima, só a função confirm_appointment_request_reservation (a _core não muda): quando a conta JÁ está vinculada,
-- o cadastro está ativo e tem o MESMO e-mail confirmado da conta, mas falta o papel 'client', o papel é ACRESCENTADO aos
-- existentes (ninguém é criado, vinculado ou perde papel) e o evento fica em audit_events (appointment.add_client_role).
-- Todas as outras recusas PT422 permanecem: e-mail não confirmado, contato diferente, vínculo inativo, cadastro inativo ou
-- com outro e-mail, cadastros duplicados, conflito de identidade, vínculo a outra conta. O caminho sem vínculo prévio
-- (cadastro achado só por e-mail) continua exigindo 'client' (não foi ampliado).
-- Reversão: supabase/rollbacks/202611160011_rollback_confirmacao_papel_client.sql

begin;

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
  request public.appointment_requests%rowtype;
  account public.appointment_profile_accounts%rowtype;
  auth_email text;
  auth_email_confirmed_at timestamptz;
  profile_id text;
  profile_matches integer := 0;
  profile_document jsonb;
  profile_created boolean := false;
  role_added boolean := false;
  profile_before jsonb;
  actor_name text;
  audit_id text;
  now_utc text;
begin
  if actor_id is null or not public.is_portal_admin() then
    raise exception 'Seu acesso não permite confirmar reservas.' using errcode = '42501';
  end if;
  if p_request_id is null or p_schedule is null
    or jsonb_typeof(p_schedule) is distinct from 'object' then
    raise exception 'Dados da confirmação inválidos.' using errcode = '22023';
  end if;

  select * into request
  from public.appointment_requests
  where id = p_request_id;
  if not found then
    raise exception 'Solicitação inexistente ou inacessível.' using errcode = 'P0002';
  end if;

  -- Solicitações públicas anteriores continuam exigindo a seleção operacional
  -- explícita já validada pela função original.
  if request.requester_user_id is null then
    return public.confirm_appointment_request_reservation_core(
      p_request_id, p_expected_updated_at, p_idempotency_key, p_schedule
    );
  end if;

  -- Serializa duas confirmações que tentem criar/vincular o mesmo cadastro.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'appointment-client:' || request.requester_user_id::text,
      0
    )
  );

  select lower(nullif(btrim(usuario.email), '')), usuario.email_confirmed_at
    into auth_email, auth_email_confirmed_at
  from auth.users as usuario
  where usuario.id = request.requester_user_id;

  if auth_email is null or auth_email_confirmed_at is null then
    raise exception 'A conta do solicitante precisa ter e-mail confirmado para ser vinculada.'
      using errcode = 'PT422';
  end if;
  if request.contact_type is distinct from 'email'
    or lower(nullif(btrim(request.contact), '')) is distinct from auth_email then
    raise exception 'O contato da solicitação não corresponde à conta autenticada.'
      using errcode = 'PT422';
  end if;

  -- Também serializa identidades distintas que, por inconsistência externa,
  -- apresentem o mesmo e-mail confirmado.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('appointment-client-email:' || auth_email, 0)
  );

  select * into account
  from public.appointment_profile_accounts
  where user_id = request.requester_user_id;

  if found then
    if account.active is not true then
      raise exception 'O vínculo operacional do solicitante está inativo.' using errcode = 'PT422';
    end if;
    select id, document into profile_id, profile_document
    from public.op_records
    where collection = 'profiles' and id = account.profile_id;
    if profile_id is null
      or coalesce((profile_document ->> 'active')::boolean, true) is not true
      or lower(nullif(btrim(profile_document ->> 'email'), '')) is distinct from auth_email then
      raise exception 'O vínculo operacional do solicitante precisa ser revisado.'
        using errcode = 'PT422';
    end if;
    -- Conta JÁ vinculada (appointment_profile_accounts), cadastro ativo e com o MESMO e-mail confirmado da conta, mas sem o
    -- papel 'client' (ex.: aluno criado pelo fluxo de Cursos, ou profissional que também pede atendimento): acrescenta
    -- 'client' aos papéis existentes. Nada é criado nem vinculado; nenhum papel é removido; fica auditado.
    if not (case when jsonb_typeof(profile_document -> 'roles') = 'array' then profile_document -> 'roles' else '[]'::jsonb end) ? 'client' then
      profile_before := profile_document;
      profile_document := jsonb_set(
        jsonb_set(
          profile_document, '{roles}',
          (case when jsonb_typeof(profile_document -> 'roles') = 'array' then profile_document -> 'roles' else '[]'::jsonb end)
            || jsonb_build_array('client'), true),
        '{updated_at}',
        to_jsonb(to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), true);
      update public.op_records
        set document = profile_document, updated_at = clock_timestamp()
        where collection = 'profiles' and id = profile_id;
      role_added := true;
    end if;
  else
    select min(id), count(*)::integer
      into profile_id, profile_matches
    from public.op_records
    where collection = 'profiles'
      and lower(nullif(btrim(document ->> 'email'), '')) = auth_email;

    if profile_matches > 1 then
      raise exception 'Existem cadastros operacionais duplicados para o solicitante.'
        using errcode = 'PT422';
    end if;

    if profile_matches = 1 then
      select document into profile_document
      from public.op_records
      where collection = 'profiles' and id = profile_id;
      if not coalesce(profile_document -> 'roles', '[]'::jsonb) ? 'client'
        or coalesce((profile_document ->> 'active')::boolean, true) is not true then
        raise exception 'O cadastro operacional encontrado não está habilitado como cliente.'
          using errcode = 'PT422';
      end if;
    else
      profile_id := request.requester_user_id::text;
      if exists (
        select 1 from public.op_records
        where collection = 'profiles' and id = profile_id
      ) then
        raise exception 'A identidade do solicitante conflita com outro cadastro operacional.'
          using errcode = 'PT422';
      end if;
      now_utc := to_char(
        clock_timestamp() at time zone 'utc',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      );
      profile_document := jsonb_build_object(
        'id', profile_id,
        'display_name', left(coalesce(nullif(btrim(request.requester_name), ''), split_part(auth_email, '@', 1)), 100),
        'email', auth_email,
        'roles', jsonb_build_array('client'),
        'active', true,
        'published', false,
        'created_at', now_utc,
        'updated_at', now_utc
      );
      insert into public.op_records (collection, id, document, updated_at)
      values ('profiles', profile_id, profile_document, clock_timestamp());
      profile_created := true;
    end if;

    begin
      insert into public.appointment_profile_accounts (user_id, profile_id, active)
      values (request.requester_user_id, profile_id, true);
    exception when unique_violation then
      raise exception 'O cadastro operacional já está vinculado a outra conta.'
        using errcode = 'PT422';
    end;
  end if;

  if nullif(btrim(p_schedule ->> 'client_profile_id'), '') is not null
    and nullif(btrim(p_schedule ->> 'client_profile_id'), '') is distinct from profile_id then
    raise exception 'O cliente selecionado diverge da identidade da solicitação.'
      using errcode = 'PT422';
  end if;

  if profile_created or role_added then
    select coalesce(nullif(btrim(usuario.name), ''), usuario.email)
      into actor_name
    from public.users as usuario
    where usuario.id = actor_id;
    audit_id := gen_random_uuid()::text;
    insert into public.op_records (collection, id, document, updated_at)
    values (
      'audit_events',
      audit_id,
      jsonb_build_object(
        'id', audit_id,
        'actor', coalesce(actor_name, 'Administração Potala'),
        'at', to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'action', case when role_added then 'appointment.add_client_role' else 'appointment.link_client_profile' end,
        'reason', case when role_added then 'Papel client acrescentado ao cadastro já vinculado da conta autenticada (e-mail confirmado)'
                       else 'Vínculo de conta autenticada com e-mail confirmado' end,
        'changes', jsonb_build_array(jsonb_build_object(
          'table', 'profiles', 'id', profile_id, 'before', profile_before, 'after', profile_document
        ))
      ),
      clock_timestamp()
    );
  end if;

  return public.confirm_appointment_request_reservation_core(
    p_request_id,
    p_expected_updated_at,
    p_idempotency_key,
    jsonb_set(p_schedule, '{client_profile_id}', to_jsonb(profile_id), true)
  );
end;
$$;

revoke all on function public.confirm_appointment_request_reservation(uuid,timestamptz,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.confirm_appointment_request_reservation(uuid,timestamptz,text,jsonb)
  to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.confirm_appointment_request_reservation(uuid,timestamptz,text,jsonb)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.confirm_appointment_request_reservation_core(uuid,timestamptz,text,jsonb)', 'EXECUTE') then
    raise exception 'Privilégios da confirmação de atendimentos estão incorretos.';
  end if;
end;
$$;

commit;
