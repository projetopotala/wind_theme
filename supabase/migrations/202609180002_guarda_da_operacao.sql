-- ÚLTIMA BARREIRA PARA OS DOCUMENTOS DA OPERAÇÃO.
--
-- O navegador continua responsável pelas mensagens detalhadas e pelas regras
-- completas do domínio. Este gatilho repete no banco apenas invariantes que não
-- podem depender de um cliente honesto: forma mínima, sala válida, capacidade
-- e sobreposição de sala/profissional. Assim uma chamada manual a op_apply não
-- contorna as proteções mais importantes da agenda.

begin;

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

drop trigger if exists op_records_validate_before_write on public.op_records;
create trigger op_records_validate_before_write
  before insert or update or delete on public.op_records
  for each row execute function public.validate_op_record();

commit;
