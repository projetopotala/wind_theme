-- Executar somente apos o commit bem-sucedido de 202610230001 no laboratorio.
-- Uma linha de resultado, exclusivamente de leitura.
begin transaction read only;
select jsonb_build_object(
  'function_present',to_regprocedure('public.validate_op_record()') is not null,
  'function_signature',(select pg_get_function_identity_arguments(p.oid)
    from pg_proc p where p.oid=to_regprocedure('public.validate_op_record()')),
  'function_returns_trigger',(select p.prorettype='pg_catalog.trigger'::regtype
    from pg_proc p where p.oid=to_regprocedure('public.validate_op_record()')),
  'function_security_definer',(select p.prosecdef
    from pg_proc p where p.oid=to_regprocedure('public.validate_op_record()')),
  'function_search_path',(select p.proconfig
    from pg_proc p where p.oid=to_regprocedure('public.validate_op_record()')),
  'trigger_active_and_bound',exists(select 1 from pg_trigger t
    where t.tgrelid=to_regclass('public.op_records')
      and t.tgname='op_records_validate_before_write'
      and not t.tgisinternal and t.tgenabled='O'
      and t.tgfoid=to_regprocedure('public.validate_op_record()')),
  'trigger_definition',(select pg_get_triggerdef(t.oid) from pg_trigger t
    where t.tgrelid=to_regclass('public.op_records')
      and t.tgname='op_records_validate_before_write' and not t.tgisinternal),
  'constraint_definition',(select pg_get_constraintdef(c.oid) from pg_constraint c
    where c.conrelid=to_regclass('public.op_records')
      and c.conname='op_records_document_size' and c.contype='c'),
  'constraint_validated',(select c.convalidated from pg_constraint c
    where c.conrelid=to_regclass('public.op_records')
      and c.conname='op_records_document_size' and c.contype='c'),
  'public_execute',(select exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    where a.grantee=0 and a.privilege_type='EXECUTE')
    from pg_proc p where p.oid=to_regprocedure('public.validate_op_record()')),
  'anon_execute',case when to_regprocedure('public.validate_op_record()') is null then null
    else has_function_privilege('anon','public.validate_op_record()','EXECUTE') end,
  'authenticated_execute',case when to_regprocedure('public.validate_op_record()') is null then null
    else has_function_privilege('authenticated','public.validate_op_record()','EXECUTE') end,
  'op_records_rls',(select c.relrowsecurity from pg_class c
    where c.oid=to_regclass('public.op_records'))
) as guard_postcheck;
rollback;
