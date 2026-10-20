-- Substitutos de laboratório; não representam Supabase Auth/JWT.
begin;
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise exception 'Papéis locais anon/authenticated ausentes; não criar papéis globais automaticamente';
  end if;
  if to_regclass('public.users') is not null or to_regclass('auth.users') is not null then
    raise exception 'Base F2.2.4 não está vazia';
  end if;
end;
$$;
create schema auth;
create table auth.users (id uuid primary key, email text not null unique);
create function auth.uid() returns uuid language sql stable set search_path = '' as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  role text not null check (role in ('owner', 'admin')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.users enable row level security;
revoke all on table public.users from public, anon, authenticated;
grant select (id, email, name, role, active) on public.users to authenticated;
create policy appointment_lab_own_user on public.users
  for select to authenticated using (id = (select auth.uid()));
create function public.is_portal_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.users
    where id = (select auth.uid()) and role in ('owner', 'admin') and active = true
  );
$$;
revoke all on function public.is_portal_admin() from public, anon, authenticated;
grant execute on function public.is_portal_admin() to authenticated;
grant usage on schema public to anon, authenticated;
commit;
