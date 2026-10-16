-- PREPARADO, NÃO EXECUTADO. Somente banco NOVO e descartável, fora do laboratório existente.
-- Pré-requisitos: schema equivalente de Auth/public.users/is_portal_admin,
-- papéis anon/authenticated, migration 202610160001 já aplicada por etapa autorizada.
-- Executar futuramente com psql -X -v ON_ERROR_STOP=1; nunca no SQL Editor de produção.
\set ON_ERROR_STOP on
begin;
do $$
begin
  if inet_server_addr() is distinct from '127.0.0.1'::inet
    or inet_server_port() is distinct from 55433
    or current_database() <> 'potala_appointments_test'
    or current_setting('server_version_num')::integer / 10000 <> 17 then
    raise exception 'Destino de testes não autorizado';
  end if;
  if exists (select 1 from public.appointment_requests) then
    raise exception 'A base de solicitações deve estar vazia';
  end if;
end;
$$;

set local role anon;
do $$
declare
  first_receipt jsonb;
  repeated jsonb;
  key uuid := '10000000-0000-4000-8000-000000000001';
  day date := (now() at time zone 'America/Sao_Paulo')::date + 1;
begin
  first_receipt := public.submit_appointment_request(key, 'Reiki', 'presencial', 'Pessoa Fictícia',
    'email', 'ficticio@example.invalid', day, 'tarde');
  repeated := public.submit_appointment_request(key, 'Reiki', 'presencial', 'Pessoa Fictícia',
    'email', 'ficticio@example.invalid', day, 'tarde');
  if first_receipt is distinct from repeated or first_receipt->>'status' <> 'recebida'
    or (select count(*) from jsonb_object_keys(first_receipt)) <> 2 then
    raise exception 'Contrato/idempotência inválidos';
  end if;
  begin
    perform public.submit_appointment_request(key, 'Outro serviço', 'presencial', 'Pessoa Fictícia',
      'email', 'ficticio@example.invalid', day, 'tarde');
    raise exception 'Deveria rejeitar chave com outro conteúdo';
  exception when sqlstate 'PT409' then null; end;
  begin
    perform public.submit_appointment_request(gen_random_uuid(), '', 'online', 'Pessoa Fictícia',
      'email', 'ficticio@example.invalid', day, 'tarde');
    raise exception 'Deveria rejeitar campo inválido';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.submit_appointment_request(gen_random_uuid(), 'Reiki', 'online', 'Pessoa Fictícia',
      'email', 'ficticio@example.invalid', day - 2, 'tarde');
    raise exception 'Deveria rejeitar data passada';
  exception when invalid_parameter_value then null; end;
  begin
    perform id from public.appointment_requests;
    raise exception 'Leitura anônima deveria falhar';
  exception when insufficient_privilege then null; end;
  begin
    update public.appointment_requests set status = 'encerrada';
    raise exception 'Escrita anônima deveria falhar';
  exception when insufficient_privilege then null; end;
  for i in 2..5 loop
    perform public.submit_appointment_request(gen_random_uuid(), 'Reiki', 'online', 'Pessoa Fictícia',
      'email', 'ficticio@example.invalid', day, 'tarde');
  end loop;
  begin
    perform public.submit_appointment_request(gen_random_uuid(), 'Reiki', 'online', 'Pessoa Fictícia',
      'email', 'ficticio@example.invalid', day, 'tarde');
    raise exception 'Limite por contato deveria recusar';
  exception when sqlstate 'PT429' then null; end;
end;
$$;
reset role;

-- Conta comum sem associação administrativa: leitura vazia e zero updates.
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$
declare affected bigint;
begin
  if public.is_portal_admin() then raise exception 'Fixture comum tornou-se admin'; end if;
  if exists(select id from public.appointment_requests) then raise exception 'RLS expôs solicitação'; end if;
  update public.appointment_requests set status = 'encerrada';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'RLS permitiu alteração indevida'; end if;
  begin
    insert into public.appointment_requests default values;
    raise exception 'INSERT direto deveria falhar';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
do $$
begin
  if (select count(*) from public.appointment_requests) <> 5 then
    raise exception 'Duplicação ou gravação parcial inesperada';
  end if;
end;
$$;
rollback;
