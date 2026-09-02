begin;

select plan(10);

select has_table('public', 'home_blocks', 'home_blocks exists');
select has_table('public', 'admin_users', 'admin_users exists');
select is(
  (select relrowsecurity from pg_class where oid = 'public.home_blocks'::regclass),
  true,
  'home_blocks has RLS enabled'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.admin_users'::regclass),
  true,
  'admin_users has RLS enabled'
);
select has_function('public', 'is_portal_admin', array[]::text[], 'admin predicate exists');
select has_function('public', 'replace_home_blocks', array['jsonb'], 'atomic replace RPC exists');
select policies_are(
  'public',
  'home_blocks',
  array[
    'admins can delete home blocks',
    'admins can insert home blocks',
    'admins can read all home blocks',
    'admins can update home blocks',
    'public can read published home blocks',
    'signed in visitors can read published home blocks'
  ],
  'home_blocks policies are explicit'
);
select policies_are(
  'public',
  'admin_users',
  array['admins can read their own portal role'],
  'admin_users exposes only the current role'
);
select table_privs_are(
  'public', 'home_blocks', 'anon', array['SELECT'],
  'anonymous visitors can only select home blocks'
);
select table_privs_are(
  'public', 'admin_users', 'anon', array[]::text[],
  'anonymous visitors cannot access admin membership'
);

select * from finish();
rollback;
