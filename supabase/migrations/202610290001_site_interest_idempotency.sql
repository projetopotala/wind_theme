/* P4.1 — um reenvio da mesma tentativa não cria recebimentos duplicados. */
begin;

alter table public.site_interests add column if not exists submission_key text;

alter table public.site_interests drop constraint if exists site_interests_submission_key_format;
alter table public.site_interests add constraint site_interests_submission_key_format
  check (submission_key is null or (
    char_length(submission_key) between 16 and 120
    and submission_key ~ '^[A-Za-z0-9._:-]+$'
  ));

create unique index if not exists site_interests_submission_key_idx
  on public.site_interests (submission_key)
  where submission_key is not null;

create or replace function public.submit_site_interest(
  p_kind text,
  p_subject text default '',
  p_details jsonb default '{}'::jsonb,
  p_page text default '',
  p_submission_key text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  existente record;
begin
  if p_kind is null or p_kind not in ('curso', 'experiencia-cultural', 'retorno-recepcao') then
    raise exception 'Tipo de interesse inválido.' using errcode = '22023';
  end if;
  if p_submission_key is null
     or char_length(p_submission_key) not between 16 and 120
     or p_submission_key !~ '^[A-Za-z0-9._:-]+$' then
    raise exception 'Identificador de envio inválido.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_subject, '')) > 160 or char_length(coalesce(p_page, '')) > 200 then
    raise exception 'Conteúdo do interesse excede o limite.' using errcode = '22023';
  end if;
  if p_details is null or jsonb_typeof(p_details) is distinct from 'object' or pg_column_size(p_details) > 4000 then
    raise exception 'Detalhes do interesse inválidos.' using errcode = '22023';
  end if;

  insert into public.site_interests (kind, subject, details, page, submission_key)
  values (p_kind, coalesce(p_subject, ''), p_details, coalesce(p_page, ''), p_submission_key)
  on conflict (submission_key) where submission_key is not null do nothing;
  if found then return; end if;

  select kind, subject, details, page into existente
    from public.site_interests where submission_key = p_submission_key;
  if not found or existente.kind is distinct from p_kind
     or existente.subject is distinct from coalesce(p_subject, '')
     or existente.details is distinct from p_details
     or existente.page is distinct from coalesce(p_page, '') then
    raise exception 'Identificador de envio já utilizado para outro interesse.' using errcode = '23505';
  end if;
end;
$$;

revoke insert on table public.site_interests from anon, authenticated;
revoke insert (kind, subject, details, page) on table public.site_interests from anon, authenticated;
revoke all on function public.submit_site_interest(text, text, jsonb, text, text) from public;
grant execute on function public.submit_site_interest(text, text, jsonb, text, text) to anon, authenticated;

commit;
