-- Assertivas transacionais: as linhas de teste não persistem.
begin;
do $$
begin
  if not exists (select 1 from pg_class where oid = 'public.appointment_requests'::regclass and relrowsecurity)
     or has_function_privilege('anon',
       'public.submit_appointment_request(uuid,text,text,text,text,text,date,text)', 'EXECUTE')
     or has_function_privilege('authenticated',
       'public.submit_appointment_request(uuid,text,text,text,text,text,date,text)', 'EXECUTE')
     or exists (select 1 from pg_proc p
       cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       where p.oid = 'public.submit_appointment_request(uuid,text,text,text,text,text,date,text)'::regprocedure
         and a.grantee = 0 and a.privilege_type = 'EXECUTE')
     or has_table_privilege('anon', 'public.appointment_requests', 'SELECT')
     or has_table_privilege('anon', 'public.appointment_requests', 'UPDATE')
     or not has_column_privilege('authenticated','public.appointment_requests','status','UPDATE')
     or has_column_privilege('authenticated','public.appointment_requests','contact','UPDATE') then
    raise exception 'Grants ou RLS diferentes do contrato';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.appointment_requests'::regclass
     and tgname = 'appointment_requests_touch' and not tgisinternal and tgenabled = 'O') then
    raise exception 'Trigger de revisão ausente ou desativado';
  end if;
end;
$$;

-- Lógica da função testada pelo administrador local; não equivale a acesso anon.
do $$
declare r jsonb; replay jsonb; k uuid := '30000000-0000-4000-8000-000000000002';
  day date := (now() at time zone 'America/Sao_Paulo')::date + 1;
begin
  r := public.submit_appointment_request(k,'Acupuntura','online','Outra Pessoa Fictícia',
    'email','outra@example.invalid',day,'manha');
  replay := public.submit_appointment_request(k,'Acupuntura','online','Outra Pessoa Fictícia',
    'email','outra@example.invalid',day,'manha');
  if r is distinct from replay or r->>'status' <> 'recebida'
     or (select count(*) from jsonb_object_keys(r)) <> 2 or r ? 'contact'
     or r ? 'confirmada' then raise exception 'Resposta pública ou idempotência inválida'; end if;
  begin
    perform public.submit_appointment_request(k,'Reiki','online','Outra Pessoa Fictícia',
      'email','outra@example.invalid',day,'manha');
    raise exception 'Chave reutilizada com payload diferente';
  exception when sqlstate 'PT409' then null; end;
  begin
    perform public.submit_appointment_request(gen_random_uuid(),'', 'online','Nome Fictício',
      'email','invalid@example.invalid',day,'tarde');
    raise exception 'Serviço vazio aceito';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.submit_appointment_request(gen_random_uuid(),repeat('S',121),'online','Nome Fictício',
      'email','invalid@example.invalid',day,'tarde');
    raise exception 'Serviço excessivo aceito';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.submit_appointment_request(gen_random_uuid(),'Reiki','inventada','Nome Fictício',
      'email','invalid@example.invalid',day,'tarde');
    raise exception 'Modalidade inválida aceita';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.submit_appointment_request(gen_random_uuid(),'Reiki','online','N',
      'email','invalid@example.invalid',day,'tarde');
    raise exception 'Nome curto aceito';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.submit_appointment_request(gen_random_uuid(),'Reiki','online',repeat('N',101),
      'email','invalid@example.invalid',day,'tarde');
    raise exception 'Nome excessivo aceito';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.submit_appointment_request(gen_random_uuid(),'Reiki','online','Nome Fictício',
      'email','sem-arroba',day,'tarde');
    raise exception 'Contato inválido aceito';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.submit_appointment_request(gen_random_uuid(),'Reiki','online','Nome Fictício',
      'email',repeat('x',255),day,'tarde');
    raise exception 'Contato excessivo aceito';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.submit_appointment_request(gen_random_uuid(),'Reiki','online','Nome Fictício',
      'email','invalid@example.invalid',day,'14:30');
    raise exception 'Período inválido aceito';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.submit_appointment_request(gen_random_uuid(),'Reiki','online','Nome Fictício',
      'email','invalid@example.invalid',day-2,'tarde');
    raise exception 'Data passada aceita';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.submit_appointment_request(gen_random_uuid(),'Reiki','online','Nome Fictício',
      'email','invalid@example.invalid',day+365,'tarde');
    raise exception 'Data acima de 365 dias aceita';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.submit_appointment_request(null,'Reiki','online','Nome Fictício',
      'email','invalid@example.invalid',day,'tarde');
    raise exception 'Chave nula aceita';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.submit_appointment_request(gen_random_uuid(),'Reiki',null,'Nome Fictício',
      'email','invalid@example.invalid',day,'tarde');
    raise exception 'Modalidade nula aceita';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.submit_appointment_request(gen_random_uuid(),'Reiki','online',null,
      'email','invalid@example.invalid',day,'tarde');
    raise exception 'Nome nulo aceito';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.submit_appointment_request(gen_random_uuid(),'Reiki','online','Nome Fictício',
      null,'invalid@example.invalid',day,'tarde');
    raise exception 'Tipo de contato nulo aceito';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.submit_appointment_request(gen_random_uuid(),'Reiki','online','Nome Fictício',
      'email',null,day,'tarde');
    raise exception 'Contato nulo aceito';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.submit_appointment_request(gen_random_uuid(),'Reiki','online','Nome Fictício',
      'email','invalid@example.invalid',null,'tarde');
    raise exception 'Data nula aceita';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.submit_appointment_request(gen_random_uuid(),'Reiki','online','Nome Fictício',
      'email','invalid@example.invalid',day,null);
    raise exception 'Período nulo aceito';
  exception when invalid_parameter_value then null; end;
end;
$$;
set local role anon;
do $$
declare day date := (now() at time zone 'America/Sao_Paulo')::date + 1;
begin
  begin
    perform public.submit_appointment_request('30000000-0000-4000-8000-000000000099','Reiki','online','Nome Fictício',
      'email','bloqueado@example.invalid',day,'tarde');
    raise exception 'Visitante executou a RPC bloqueada';
  exception when insufficient_privilege then null; end;
  begin
    perform id from public.appointment_requests;
    raise exception 'Visitante leu dados privados';
  exception when insufficient_privilege then null; end;
  begin
    update public.appointment_requests set status='encerrada';
    raise exception 'Visitante alterou estado';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;

select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
set local role authenticated;
do $$
declare affected integer;
begin
  begin
    perform public.submit_appointment_request('30000000-0000-4000-8000-000000000098','Reiki','online','Nome Fictício',
      'email','comum@example.invalid',(now() at time zone 'America/Sao_Paulo')::date + 1,'tarde');
    raise exception 'Usuário autenticado executou a RPC bloqueada';
  exception when insufficient_privilege then null; end;
  if public.is_portal_admin() or exists(select 1 from public.appointment_requests) then
    raise exception 'Usuário comum leu solicitações';
  end if;
  update public.appointment_requests set status='cancelada';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Usuário comum alterou solicitação'; end if;
  begin
    update public.appointment_requests set contact='intruso@example.invalid';
    raise exception 'Usuário comum alterou contato';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;

select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$
begin
  if public.is_portal_admin() or exists(select 1 from public.appointment_requests) then
    raise exception 'Administrador inativo leu solicitações';
  end if;
end;
$$;
reset role;

select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$
declare request_id uuid; revision timestamptz; next_revision timestamptz; affected integer;
  state text;
begin
  if not public.is_portal_admin() then raise exception 'Administrador ativo não autorizado'; end if;
  if (select count(*) from public.appointment_requests) <> 2 then
    raise exception 'Administrador não vê as solicitações esperadas';
  end if;
  if (select id from public.appointment_requests order by created_at desc,id desc limit 1) is null then
    raise exception 'Lista ordenada inválida';
  end if;
  select id, updated_at into request_id, revision from public.appointment_requests
    where idempotency_key='30000000-0000-4000-8000-000000000001';
  foreach state in array array['em_contato','encerrada','cancelada','recebida'] loop
    update public.appointment_requests set status=state
      where id=request_id and updated_at=revision
      returning updated_at into next_revision;
    get diagnostics affected = row_count;
    if affected <> 1 or next_revision <= revision then
      raise exception 'Atualização de estado/revisão não confirmada';
    end if;
    update public.appointment_requests set status='encerrada'
      where id=request_id and updated_at=revision;
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'Revisão antiga sobrescreveu a nova'; end if;
    revision := next_revision;
  end loop;
  begin
    update public.appointment_requests set contact='alterado@example.invalid' where id=request_id;
    raise exception 'Administrador alterou contato';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
rollback;
