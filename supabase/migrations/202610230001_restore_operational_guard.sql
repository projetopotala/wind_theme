-- RESTAURAÇÃO PONTUAL DA GUARDA DOS DOCUMENTOS OPERACIONAIS.
--
-- A estrutura operacional existe no ambiente oficial, mas a função e o gatilho
-- de 202609180002 não foram instalados. Esta migration restaura somente essa
-- barreira, sem alterar documentos existentes nem reconciliar o histórico antigo.

begin;

do $migration$
declare
  constraint_expression text;
begin
  if to_regclass('public.op_records') is null
    or to_regclass('public.op_meta') is null
    or to_regclass('public.op_requests') is null
    or to_regprocedure('public.op_apply(bigint,text,text,jsonb,jsonb,jsonb)') is null
    or to_regprocedure('public.is_portal_admin()') is null then
    raise exception 'Dependências da operação do Instituto não instaladas.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'op_records'
      and (column_name, data_type) in (
        ('collection', 'text'),
        ('id', 'text'),
        ('document', 'jsonb'),
        ('updated_at', 'timestamp with time zone')
      )
    group by table_schema, table_name
    having count(*) = 4
  ) then
    raise exception 'Estrutura de public.op_records incompatível.';
  end if;

  select regexp_replace(pg_get_expr(c.conbin, c.conrelid), '\s+', '', 'g')
    into constraint_expression
  from pg_catalog.pg_constraint as c
  where c.conname = 'op_records_document_size'
    and c.conrelid = 'public.op_records'::regclass
    and c.contype = 'c';

  if found and constraint_expression not in (
    '(pg_column_size(document)<=1000000)',
    'pg_column_size(document)<=1000000'
  ) then
    raise exception 'Constraint op_records_document_size possui definição incompatível.';
  end if;
end;
$migration$;

do $migration$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'op_records_document_size'
      and conrelid = 'public.op_records'::regclass
  ) then
    alter table public.op_records
      add constraint op_records_document_size
      check (pg_column_size(document) <= 1000000) not valid;
  end if;
end;
$migration$;

create or replace function public.validate_op_record()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  sala jsonb;
  situacao text;
  modo text;
  sala_id text;
  profissional_id text;
  participantes integer;
  inicio timestamptz;
  fim timestamptz;
  inicio_com_preparo timestamptz;
  fim_com_preparo timestamptz;
begin
  if tg_op = 'DELETE' then
    if old.collection = 'rooms' and exists (
      select 1 from public.op_records as registro
      where registro.collection = 'schedule_items'
        and registro.document ->> 'room_id' = old.id
    ) then
      raise exception 'Sala com agenda não pode ser removida.' using errcode = '23503';
    end if;
    return old;
  end if;

  if new.collection = 'rooms' then
    if coalesce(btrim(new.document ->> 'code'), '') = ''
      or coalesce(btrim(new.document ->> 'name'), '') = '' then
      raise exception 'Sala sem nome ou código.' using errcode = '22023';
    end if;
    situacao := coalesce(new.document ->> 'status', 'unconfirmed');
    if situacao not in ('available', 'unconfirmed', 'maintenance', 'unavailable') then
      raise exception 'Situação da sala inválida.' using errcode = '22023';
    end if;
    if new.document -> 'capacity' is not null
      and jsonb_typeof(new.document -> 'capacity') <> 'null'
      and (jsonb_typeof(new.document -> 'capacity') <> 'number'
        or (new.document ->> 'capacity')::numeric < 1) then
      raise exception 'Capacidade da sala inválida.' using errcode = '22023';
    end if;
    if situacao = 'available' and coalesce((new.document ->> 'capacity')::numeric, 0) < 1 then
      raise exception 'Sala disponível precisa de capacidade.' using errcode = '22023';
    end if;
    if situacao <> 'available' and exists (
      select 1 from public.op_records as registro
      where registro.collection = 'schedule_items'
        and registro.document ->> 'room_id' = new.id
        and coalesce(registro.document ->> 'status', 'booked') = 'booked'
        and (registro.document ->> 'ends_at')::timestamptz > now()
    ) then
      raise exception 'Sala com reserva futura precisa continuar disponível.' using errcode = '23514';
    end if;
    if exists (
      select 1 from public.op_records as registro
      where registro.collection = 'schedule_items'
        and registro.document ->> 'room_id' = new.id
        and coalesce(registro.document ->> 'status', 'booked') = 'booked'
        and (registro.document ->> 'ends_at')::timestamptz > now()
        and coalesce((registro.document ->> 'participants')::integer, 1)
          > coalesce((new.document ->> 'capacity')::integer, 0)
    ) then
      raise exception 'Capacidade inferior a uma reserva existente.' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.collection <> 'schedule_items' then
    return new;
  end if;

  situacao := coalesce(new.document ->> 'status', 'booked');
  modo := coalesce(new.document ->> 'mode', 'presencial');
  sala_id := nullif(new.document ->> 'room_id', '');
  profissional_id := nullif(new.document ->> 'professional_id', '');

  if situacao not in ('booked', 'completed', 'cancelled') then
    raise exception 'Situação da ocorrência inválida.' using errcode = '22023';
  end if;
  if modo not in ('presencial', 'online') then
    raise exception 'Modalidade da ocorrência inválida.' using errcode = '22023';
  end if;
  if jsonb_typeof(new.document -> 'starts_at') <> 'string'
    or jsonb_typeof(new.document -> 'ends_at') <> 'string' then
    raise exception 'Horário da ocorrência inválido.' using errcode = '22023';
  end if;

  begin
    inicio := (new.document ->> 'starts_at')::timestamptz;
    fim := (new.document ->> 'ends_at')::timestamptz;
    participantes := coalesce((new.document ->> 'participants')::integer, 1);
  exception when invalid_text_representation or datetime_field_overflow then
    raise exception 'Horário da ocorrência inválido.' using errcode = '22023';
  end;
  if inicio >= fim or participantes < 1 then
    raise exception 'Horário da ocorrência inválido.' using errcode = '22023';
  end if;

  if modo = 'online' then
    if sala_id is not null then
      raise exception 'Atendimento online não pode ter sala física.' using errcode = '22023';
    end if;
  elsif sala_id is null then
    raise exception 'Sala inexistente.' using errcode = '23503';
  else
    select registro.document into sala
    from public.op_records as registro
    where registro.collection = 'rooms' and registro.id = sala_id;
    if sala is null then
      raise exception 'Sala inexistente.' using errcode = '23503';
    end if;
    if situacao = 'booked' and coalesce(sala ->> 'status', '') <> 'available' then
      raise exception 'Sala indisponível.' using errcode = '23514';
    end if;
    if situacao = 'booked' and coalesce((sala ->> 'capacity')::integer, 0) < participantes then
      raise exception 'Capacidade da sala excedida.' using errcode = '23514';
    end if;
  end if;

  inicio_com_preparo := inicio - coalesce((new.document ->> 'setup_minutes')::numeric, 0) * interval '1 minute';
  fim_com_preparo := fim + coalesce((new.document ->> 'teardown_minutes')::numeric, 0) * interval '1 minute';

  if situacao <> 'cancelled' and sala_id is not null and exists (
    select 1
    from public.op_records as registro
    where registro.collection = 'schedule_items'
      and registro.id <> new.id
      and coalesce(registro.document ->> 'status', 'booked') <> 'cancelled'
      and registro.document ->> 'room_id' = sala_id
      and tstzrange(
        (registro.document ->> 'starts_at')::timestamptz
          - coalesce((registro.document ->> 'setup_minutes')::numeric, 0) * interval '1 minute',
        (registro.document ->> 'ends_at')::timestamptz
          + coalesce((registro.document ->> 'teardown_minutes')::numeric, 0) * interval '1 minute',
        '[)'
      ) && tstzrange(inicio_com_preparo, fim_com_preparo, '[)')
  ) then
    raise exception 'Conflito de sala.' using errcode = '23P01';
  end if;

  if situacao <> 'cancelled' and profissional_id is not null and exists (
    select 1
    from public.op_records as registro
    where registro.collection = 'schedule_items'
      and registro.id <> new.id
      and coalesce(registro.document ->> 'status', 'booked') <> 'cancelled'
      and registro.document ->> 'professional_id' = profissional_id
      and tstzrange(
        (registro.document ->> 'starts_at')::timestamptz
          - coalesce((registro.document ->> 'setup_minutes')::numeric, 0) * interval '1 minute',
        (registro.document ->> 'ends_at')::timestamptz
          + coalesce((registro.document ->> 'teardown_minutes')::numeric, 0) * interval '1 minute',
        '[)'
      ) && tstzrange(inicio_com_preparo, fim_com_preparo, '[)')
  ) then
    raise exception 'Conflito de profissional.' using errcode = '23P01';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_op_record() from public, anon, authenticated;

do $migration$
declare
  trigger_definition text;
begin
  select pg_get_triggerdef(t.oid)
    into trigger_definition
  from pg_catalog.pg_trigger as t
  where t.tgrelid = 'public.op_records'::regclass
    and t.tgname = 'op_records_validate_before_write'
    and not t.tgisinternal;

  if not found then
    create trigger op_records_validate_before_write
      before insert or update or delete on public.op_records
      for each row execute function public.validate_op_record();
  elsif trigger_definition !~* '^CREATE TRIGGER op_records_validate_before_write BEFORE (INSERT OR DELETE OR UPDATE|INSERT OR UPDATE OR DELETE) ON public\.op_records FOR EACH ROW EXECUTE FUNCTION (public\.)?validate_op_record\(\)$' then
    raise exception 'Trigger op_records_validate_before_write possui definição incompatível.';
  end if;
end;
$migration$;

do $migration$
begin
  if not exists (
    select 1
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'validate_op_record'
      and p.prorettype = 'pg_catalog.trigger'::regtype
      and not p.prosecdef
      and p.proconfig = array['search_path=""']
  ) then
    raise exception 'Função validate_op_record instalada com configuração insegura.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger as t
    where t.tgrelid = 'public.op_records'::regclass
      and t.tgname = 'op_records_validate_before_write'
      and not t.tgisinternal
      and t.tgenabled <> 'D'
      and t.tgfoid = 'public.validate_op_record()'::regprocedure
  ) then
    raise exception 'Trigger op_records_validate_before_write não ficou ativo.';
  end if;

  if has_function_privilege('anon', 'public.validate_op_record()', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.validate_op_record()', 'EXECUTE') then
    raise exception 'Privilégios indevidos em validate_op_record.';
  end if;
end;
$migration$;

commit;
