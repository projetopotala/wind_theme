-- Completa o privilégio de coluna exigido pela projeção administrativa.
-- A política RLS existente continua decidindo quais linhas cada sessão lê.

begin;

do $$
begin
  if to_regclass('public.appointment_requests') is null
    or not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'appointment_requests'
        and column_name = 'appointment_slot_id'
    ) then
    raise exception 'A coluna appointment_requests.appointment_slot_id não está instalada.';
  end if;
end;
$$;

grant select (appointment_slot_id)
  on public.appointment_requests to authenticated;

do $$
begin
  if not has_column_privilege(
    'authenticated',
    'public.appointment_requests',
    'appointment_slot_id',
    'SELECT'
  ) then
    raise exception 'O privilégio de leitura de appointment_slot_id não foi aplicado.';
  end if;
end;
$$;

commit;
