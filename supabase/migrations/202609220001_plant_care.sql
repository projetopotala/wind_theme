-- A plantinha do encerramento pertence à pessoa, não ao dispositivo.
-- O estágio visual é derivado do total de regas para não haver duas fontes de verdade.
create table if not exists public.plant_care (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  total_waterings integer not null default 0 check (total_waterings between 0 and 36500),
  last_watered_on date,
  current_streak integer not null default 0 check (current_streak between 0 and 36500),
  watered_days date[] not null default '{}',
  updated_at timestamptz not null default now(),
  constraint plant_care_one_per_user unique (user_id)
);

alter table public.plant_care enable row level security;
revoke all on table public.plant_care from anon, authenticated;
grant select, insert, update on table public.plant_care to authenticated;

drop policy if exists "visitante le o proprio cuidado" on public.plant_care;
create policy "visitante le o proprio cuidado" on public.plant_care
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "visitante cria o proprio cuidado" on public.plant_care;
create policy "visitante cria o proprio cuidado" on public.plant_care
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "visitante atualiza o proprio cuidado" on public.plant_care;
create policy "visitante atualiza o proprio cuidado" on public.plant_care
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

comment on table public.plant_care is 'Continuidade diária da planta simbólica no encerramento do Portal.';
