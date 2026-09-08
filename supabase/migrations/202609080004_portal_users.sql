begin;

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text not null default '',
  role text not null check (role in ('owner', 'admin')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists users_email_lower_idx
  on public.users (lower(email));

alter table public.users enable row level security;

revoke all on table public.users from anon, authenticated;
grant select on table public.users to authenticated;

drop policy if exists "admins can read their own portal user" on public.users;
create policy "admins can read their own portal user"
on public.users
for select
to authenticated
using (id = (select auth.uid()));

insert into public.users (id, email, name, role, active)
select
  admin_users.user_id,
  auth_users.email,
  '',
  admin_users.role,
  true
from public.admin_users
join auth.users as auth_users on auth_users.id = admin_users.user_id
on conflict (id) do update
set
  email = excluded.email,
  role = excluded.role,
  active = true,
  updated_at = now();

create or replace function public.is_portal_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.users
      where id = (select auth.uid())
        and role in ('owner', 'admin')
        and active = true
    );
$$;

revoke all on function public.is_portal_admin() from public;
grant execute on function public.is_portal_admin() to authenticated;

commit;
