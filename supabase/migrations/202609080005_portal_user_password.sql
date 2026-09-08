begin;

create extension if not exists pgcrypto with schema extensions;

alter table public.users
  add column if not exists password_hash text;

revoke select on table public.users from authenticated;
grant select (id, email, name, role, active, created_at, updated_at)
  on public.users to authenticated;

create or replace function public.verify_portal_password(p_email text, p_password text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  stored text;
begin
  if p_email is null or btrim(p_email) = '' or p_password is null or p_password = '' then
    return false;
  end if;

  select users.password_hash
    into stored
  from public.users
  where lower(users.email) = lower(btrim(p_email))
    and users.active = true
    and users.role in ('owner', 'admin')
  limit 1;

  if stored is null or stored = '' then
    return false;
  end if;

  return stored = extensions.crypt(p_password, stored);
end;
$$;

revoke all on function public.verify_portal_password(text, text) from public;
grant execute on function public.verify_portal_password(text, text) to anon, authenticated;

create or replace function public.set_portal_user_password(p_email text, p_password text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  auth_id uuid;
  hashed text;
begin
  if p_email is null or btrim(p_email) = '' or p_password is null or p_password = '' then
    raise exception 'portal_password_required' using errcode = '22023';
  end if;

  select auth_users.id
    into auth_id
  from auth.users as auth_users
  where lower(auth_users.email) = lower(btrim(p_email));

  if auth_id is null then
    raise exception 'auth_user_missing' using errcode = 'P0002';
  end if;

  hashed := extensions.crypt(p_password, extensions.gen_salt('bf'));

  update auth.users
  set
    encrypted_password = hashed,
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    updated_at = now()
  where id = auth_id;

  insert into public.users (id, email, name, role, active, password_hash)
  values (auth_id, btrim(p_email), '', 'owner', true, hashed)
  on conflict (id) do update
  set
    email = excluded.email,
    password_hash = excluded.password_hash,
    active = true,
    updated_at = now();
end;
$$;

revoke all on function public.set_portal_user_password(text, text) from public;

commit;
