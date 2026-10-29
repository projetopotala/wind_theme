-- Frente B do Marco 2: projeção pública segura dos profissionais já mantidos
-- pela Central Operacional. Nenhuma tabela paralela de pessoas é criada.
begin;

create or replace function public.list_published_professionals()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', record.id,
      'display_name', record.document ->> 'display_name',
      'professional_title', record.document ->> 'professional_title',
      'photo_url', record.document ->> 'photo_url',
      'presentation', record.document ->> 'presentation',
      'education', record.document ->> 'education',
      'specialties', coalesce(record.document -> 'specialties', '[]'::jsonb),
      'practice_areas', coalesce(record.document -> 'practice_areas', '[]'::jsonb),
      'modalities', coalesce(record.document -> 'modalities', '[]'::jsonb),
      'price_cents', case when (record.document ->> 'price_cents') ~ '^\d+$' then (record.document ->> 'price_cents')::bigint else null end,
      'availability', record.document ->> 'availability',
      'services', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', offering.id,
          'title', offering.document ->> 'title',
          'mode', offering.document ->> 'mode',
          'price_cents', case when (offering.document ->> 'price_cents') ~ '^\d+$' then (offering.document ->> 'price_cents')::bigint else null end
        ) order by lower(offering.document ->> 'title'))
        from public.op_records as offering
        where offering.collection = 'activity_offerings'
          and offering.document ->> 'professional_id' = record.id
          and coalesce((offering.document ->> 'active')::boolean, true)
      ), '[]'::jsonb)
    ) order by lower(record.document ->> 'display_name')
  ), '[]'::jsonb)
  from public.op_records as record
  where record.collection = 'profiles'
    and record.document @> '{"roles":["professional"]}'::jsonb
    and coalesce((record.document ->> 'active')::boolean, true)
    and coalesce((record.document ->> 'published')::boolean, false)
$$;

revoke all on function public.list_published_professionals() from public;
grant execute on function public.list_published_professionals() to anon, authenticated;

commit;
