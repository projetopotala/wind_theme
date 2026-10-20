-- Limites de 5 por contato/24 h e 60 globais/minuto, sem persistir as linhas.
begin;
select set_config('appointment_lab.existing_minute',
  (select count(*)::text from public.appointment_requests
   where created_at >= now() - interval '1 minute'), true);
-- Teste de limites pelo administrador local, sem conceder EXECUTE a anon.
do $$
declare day date := (now() at time zone 'America/Sao_Paulo')::date + 1;
  i integer; existing integer := current_setting('appointment_lab.existing_minute')::integer;
begin
  if existing > 55 then raise exception 'Base não está em condição estável para teste de volume'; end if;
  for i in 1..5 loop
    perform public.submit_appointment_request(gen_random_uuid(),'Reiki','online','Carga Fictícia',
      'email','mesmo@example.invalid',day,'tarde');
  end loop;
  begin
    perform public.submit_appointment_request(gen_random_uuid(),'Reiki','online','Carga Fictícia',
      'email','mesmo@example.invalid',day,'tarde');
    raise exception 'Limite por contato não aplicado';
  exception when sqlstate 'PT429' then null; end;
  -- Completar 60 no minuto com contatos únicos; independe da idade da fixture.
  for i in 1..(55-existing) loop
    perform public.submit_appointment_request(gen_random_uuid(),'Reiki','online','Carga Fictícia',
      'email',format('volume%s@example.invalid',i),day,'tarde');
  end loop;
  begin
    perform public.submit_appointment_request(gen_random_uuid(),'Reiki','online','Carga Fictícia',
      'email','sessentaum@example.invalid',day,'tarde');
    raise exception 'Limite global não aplicado';
  exception when sqlstate 'PT429' then null; end;
end;
$$;
rollback;
