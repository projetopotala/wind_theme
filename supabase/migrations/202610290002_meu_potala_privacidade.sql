begin;

create table if not exists public.user_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label text not null default 'Principal' check (char_length(label) between 1 and 40),
  recipient_name text not null check (char_length(recipient_name) between 1 and 120),
  postal_code text not null check (postal_code ~ '^\d{5}-?\d{3}$'),
  street text not null check (char_length(street) between 1 and 160),
  number text not null check (char_length(number) between 1 and 20),
  complement text not null default '' check (char_length(complement) <= 80),
  district text not null check (char_length(district) between 1 and 80),
  city text not null check (char_length(city) between 1 and 80),
  state text not null check (state ~ '^[A-Z]{2}$'),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_addresses_one_primary_idx
  on public.user_addresses(user_id) where is_primary;
create index if not exists user_addresses_user_idx on public.user_addresses(user_id, created_at);

alter table public.user_addresses enable row level security;
revoke all on table public.user_addresses from public, anon, authenticated;
grant select, insert, update, delete on table public.user_addresses to authenticated;

drop policy if exists "pessoa le os proprios enderecos" on public.user_addresses;
create policy "pessoa le os proprios enderecos" on public.user_addresses
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "pessoa cria o proprio endereco" on public.user_addresses;
create policy "pessoa cria o proprio endereco" on public.user_addresses
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "pessoa altera o proprio endereco" on public.user_addresses;
create policy "pessoa altera o proprio endereco" on public.user_addresses
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "pessoa remove o proprio endereco" on public.user_addresses;
create policy "pessoa remove o proprio endereco" on public.user_addresses
  for delete to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.privacy_preferences (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  history_enabled boolean not null default true,
  personalization_enabled boolean not null default true,
  analytics_consent boolean not null default false,
  commercial_communications boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.privacy_preferences enable row level security;
revoke all on table public.privacy_preferences from public, anon, authenticated;
grant select, insert, update on table public.privacy_preferences to authenticated;

drop policy if exists "pessoa le a propria privacidade" on public.privacy_preferences;
create policy "pessoa le a propria privacidade" on public.privacy_preferences
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "pessoa cria a propria privacidade" on public.privacy_preferences;
create policy "pessoa cria a propria privacidade" on public.privacy_preferences
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "pessoa altera a propria privacidade" on public.privacy_preferences;
create policy "pessoa altera a propria privacidade" on public.privacy_preferences
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create table if not exists public.account_activity (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('account_created', 'profile_updated', 'address_created', 'address_updated', 'address_deleted', 'privacy_updated', 'password_changed')),
  occurred_at timestamptz not null default now()
);
create index if not exists account_activity_user_idx on public.account_activity(user_id, occurred_at desc);

alter table public.account_activity enable row level security;
revoke all on table public.account_activity from public, anon, authenticated;
grant select on table public.account_activity to authenticated;
drop policy if exists "pessoa le a propria atividade" on public.account_activity;
create policy "pessoa le a propria atividade" on public.account_activity
  for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.log_own_account_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  activity text;
begin
  if tg_table_name = 'profiles' then actor := new.id; activity := 'profile_updated';
  elsif tg_table_name = 'privacy_preferences' then actor := new.user_id; activity := 'privacy_updated';
  elsif tg_table_name = 'user_addresses' and tg_op = 'INSERT' then actor := new.user_id; activity := 'address_created';
  elsif tg_table_name = 'user_addresses' and tg_op = 'UPDATE' then actor := new.user_id; activity := 'address_updated';
  elsif tg_table_name = 'user_addresses' and tg_op = 'DELETE' then actor := old.user_id; activity := 'address_deleted';
  else return case when tg_op = 'DELETE' then old else new end;
  end if;
  insert into public.account_activity(user_id, action) values (actor, activity);
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke execute on function public.log_own_account_activity() from public, anon, authenticated;

drop trigger if exists profiles_account_activity on public.profiles;
create trigger profiles_account_activity after update on public.profiles
  for each row execute function public.log_own_account_activity();
drop trigger if exists addresses_account_activity on public.user_addresses;
create trigger addresses_account_activity after insert or update or delete on public.user_addresses
  for each row execute function public.log_own_account_activity();
drop trigger if exists privacy_account_activity on public.privacy_preferences;
create trigger privacy_account_activity after update on public.privacy_preferences
  for each row execute function public.log_own_account_activity();

create or replace function public.handle_new_visitor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 80))
  on conflict (id) do nothing;
  insert into public.privacy_preferences(user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.account_activity(user_id, action) values (new.id, 'account_created');
  return new;
end;
$$;
revoke execute on function public.handle_new_visitor() from public, anon, authenticated;

insert into public.privacy_preferences(user_id)
select id from auth.users on conflict (user_id) do nothing;

commit;
