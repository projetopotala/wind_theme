-- A CONTA DO VISITANTE.
--
-- Até aqui o Portal só conhecia administradores (public.users, papéis owner e
-- admin). Visitantes entram pelo mesmo Supabase Auth — que guarda a senha com
-- bcrypt, emite sessões que expiram e cuida da verificação de e-mail — mas não
-- cabem em public.users: aquela tabela só aceita papel administrativo.
--
-- Cada tabela pessoal segue a mesma regra: RLS ligada, nada liberado ao
-- anônimo, e toda política compara a linha com (select auth.uid()). O navegador
-- pede; é o banco que decide. O "select" em volta de auth.uid() é a forma
-- recomendada: avaliado uma vez por consulta, e não uma vez por linha.
--
-- O que o navegador NÃO escreve: inscrições, progresso dos cursos, compromissos
-- do Instituto e avisos. Esses nascem do lado do servidor (service_role, que
-- ignora RLS). Deixar a pessoa marcar a própria inscrição como concluída, ou
-- criar para si um aviso de "inscrição confirmada", seria confiar no frontend.
--
-- Os endereços gravados (href, image_url) só aceitam caminhos do Portal ou
-- https. Eles reaparecem como links na área pessoal, e um "javascript:" gravado
-- aqui executaria código no clique.

begin;

-- ------------------------------------------------------------------
-- Perfis
-- ------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  avatar_url text check (avatar_url is null or avatar_url ~ '^(/[^/\\]|https://)'),
  city text not null default '' check (char_length(city) <= 80),
  bio text not null default '' check (char_length(bio) <= 400),
  interests text[] not null default '{}' check (cardinality(interests) <= 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on table public.profiles from anon, authenticated;
grant select, insert, update on table public.profiles to authenticated;

drop policy if exists "visitante le o proprio perfil" on public.profiles;
create policy "visitante le o proprio perfil" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "visitante cria o proprio perfil" on public.profiles;
create policy "visitante cria o proprio perfil" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);

drop policy if exists "visitante altera o proprio perfil" on public.profiles;
create policy "visitante altera o proprio perfil" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- O perfil nasce junto com a conta. O nome vem do cadastro (options.data).
-- security definer porque o gatilho roda como o Auth, que não tem permissão na
-- tabela; search_path vazio para que nenhum objeto de outro schema se passe por
-- public.profiles.
create or replace function public.handle_new_visitor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 80))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Funções em public viram RPC. Esta só existe para o gatilho.
revoke execute on function public.handle_new_visitor() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_visitor();

-- Contas que já existiam (os administradores) também ganham perfil.
insert into public.profiles (id, display_name)
select id, left(coalesce(raw_user_meta_data ->> 'full_name', ''), 80)
from auth.users
on conflict (id) do nothing;

-- ------------------------------------------------------------------
-- Salvos
-- ------------------------------------------------------------------

create table if not exists public.saved_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_type text not null check (item_type in ('artigo', 'blog', 'revista', 'video', 'meditacao', 'curso', 'atividade', 'profissional', 'evento', 'livro', 'produto', 'pagina')),
  item_ref text not null check (char_length(item_ref) between 1 and 200),
  title text not null check (char_length(title) between 1 and 240),
  href text not null check (href ~ '^(/[^/\\]|/$|https://)'),
  image_url text check (image_url is null or image_url ~ '^(/[^/\\]|https://)'),
  saved_at timestamptz not null default now(),
  unique (user_id, item_type, item_ref)
);

create index if not exists saved_items_user_saved_idx on public.saved_items (user_id, saved_at desc);

alter table public.saved_items enable row level security;
revoke all on table public.saved_items from anon, authenticated;
grant select, insert, update, delete on table public.saved_items to authenticated;

drop policy if exists "visitante le os proprios salvos" on public.saved_items;
create policy "visitante le os proprios salvos" on public.saved_items
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "visitante salva para si" on public.saved_items;
create policy "visitante salva para si" on public.saved_items
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "visitante atualiza os proprios salvos" on public.saved_items;
create policy "visitante atualiza os proprios salvos" on public.saved_items
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "visitante remove os proprios salvos" on public.saved_items;
create policy "visitante remove os proprios salvos" on public.saved_items
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ------------------------------------------------------------------
-- Histórico
-- ------------------------------------------------------------------

create table if not exists public.history_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_type text not null check (item_type in ('artigo', 'blog', 'revista', 'video', 'meditacao', 'curso', 'atividade', 'profissional', 'evento', 'livro', 'produto', 'pagina')),
  item_ref text not null check (char_length(item_ref) between 1 and 200),
  title text not null check (char_length(title) between 1 and 240),
  href text not null check (href ~ '^(/[^/\\]|/$|https://)'),
  progress numeric(4, 3) check (progress is null or progress between 0 and 1),
  visited_at timestamptz not null default now()
);

create index if not exists history_items_user_visited_idx on public.history_items (user_id, visited_at desc);

alter table public.history_items enable row level security;
revoke all on table public.history_items from anon, authenticated;
grant select, insert, update, delete on table public.history_items to authenticated;

drop policy if exists "visitante le o proprio historico" on public.history_items;
create policy "visitante le o proprio historico" on public.history_items
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "visitante registra no proprio historico" on public.history_items;
create policy "visitante registra no proprio historico" on public.history_items
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "visitante atualiza o proprio historico" on public.history_items;
create policy "visitante atualiza o proprio historico" on public.history_items
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "visitante apaga o proprio historico" on public.history_items;
create policy "visitante apaga o proprio historico" on public.history_items
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ------------------------------------------------------------------
-- Acompanhando
-- ------------------------------------------------------------------

create table if not exists public.followed_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_type text not null check (subject_type in ('tema', 'profissional', 'curso', 'atividade', 'evento', 'turma')),
  subject_ref text not null check (char_length(subject_ref) between 1 and 200),
  label text not null check (char_length(label) between 1 and 120),
  followed_at timestamptz not null default now(),
  unique (user_id, subject_type, subject_ref)
);

-- O servidor procura "quem acompanha este tema?" ao publicar algo novo.
create index if not exists followed_items_subject_idx on public.followed_items (subject_type, subject_ref);

alter table public.followed_items enable row level security;
revoke all on table public.followed_items from anon, authenticated;
grant select, insert, update, delete on table public.followed_items to authenticated;

drop policy if exists "visitante le o que acompanha" on public.followed_items;
create policy "visitante le o que acompanha" on public.followed_items
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "visitante passa a acompanhar" on public.followed_items;
create policy "visitante passa a acompanhar" on public.followed_items
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "visitante altera o que acompanha" on public.followed_items;
create policy "visitante altera o que acompanha" on public.followed_items
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "visitante deixa de acompanhar" on public.followed_items;
create policy "visitante deixa de acompanhar" on public.followed_items
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ------------------------------------------------------------------
-- Inscrições e progresso: SÓ LEITURA para o navegador
-- ------------------------------------------------------------------

create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_ref text not null check (char_length(course_ref) between 1 and 200),
  course_title text not null check (char_length(course_title) between 1 and 160),
  teacher_name text not null default '',
  modality text not null default '',
  status text not null check (status in ('inscrito', 'em_andamento', 'proximo_encontro', 'concluido', 'aguardando_turma')),
  next_session_at timestamptz,
  content_href text check (content_href is null or content_href ~ '^(/[^/\\]|https://)'),
  image_url text check (image_url is null or image_url ~ '^(/[^/\\]|https://)'),
  enrolled_at timestamptz not null default now(),
  unique (user_id, course_ref)
);

alter table public.enrollments enable row level security;
revoke all on table public.enrollments from anon, authenticated;
grant select on table public.enrollments to authenticated;

drop policy if exists "visitante le as proprias inscricoes" on public.enrollments;
create policy "visitante le as proprias inscricoes" on public.enrollments
  for select to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.course_progress (
  enrollment_id uuid primary key references public.enrollments (id) on delete cascade,
  lessons_total integer not null default 0 check (lessons_total >= 0),
  lessons_done integer not null default 0 check (lessons_done between 0 and lessons_total),
  last_lesson_ref text,
  last_access_at timestamptz
);

alter table public.course_progress enable row level security;
revoke all on table public.course_progress from anon, authenticated;
grant select on table public.course_progress to authenticated;

drop policy if exists "visitante le o proprio progresso" on public.course_progress;
create policy "visitante le o proprio progresso" on public.course_progress
  for select to authenticated
  using (exists (
    select 1
    from public.enrollments
    where enrollments.id = course_progress.enrollment_id
      and enrollments.user_id = (select auth.uid())
  ));

-- ------------------------------------------------------------------
-- Agenda: a pessoa cuida do que é dela; o do Instituto é só leitura
-- ------------------------------------------------------------------

create table if not exists public.schedule_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('aula', 'atividade', 'workshop', 'palestra', 'evento', 'consulta', 'outro')),
  title text not null check (char_length(title) between 1 and 160),
  starts_at timestamptz not null,
  ends_at timestamptz check (ends_at is null or ends_at >= starts_at),
  location text not null default '',
  origin text not null default 'pessoal' check (origin in ('pessoal', 'instituto')),
  source_ref text,
  source_href text check (source_href is null or source_href ~ '^(/[^/\\]|https://)')
);

create index if not exists schedule_items_user_starts_idx on public.schedule_items (user_id, starts_at);

alter table public.schedule_items enable row level security;
revoke all on table public.schedule_items from anon, authenticated;
grant select, insert, update, delete on table public.schedule_items to authenticated;

drop policy if exists "visitante le a propria agenda" on public.schedule_items;
create policy "visitante le a propria agenda" on public.schedule_items
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "visitante cria compromisso pessoal" on public.schedule_items;
create policy "visitante cria compromisso pessoal" on public.schedule_items
  for insert to authenticated
  with check ((select auth.uid()) = user_id and origin = 'pessoal');

drop policy if exists "visitante altera compromisso pessoal" on public.schedule_items;
create policy "visitante altera compromisso pessoal" on public.schedule_items
  for update to authenticated
  using ((select auth.uid()) = user_id and origin = 'pessoal')
  with check ((select auth.uid()) = user_id and origin = 'pessoal');

drop policy if exists "visitante apaga compromisso pessoal" on public.schedule_items;
create policy "visitante apaga compromisso pessoal" on public.schedule_items
  for delete to authenticated
  using ((select auth.uid()) = user_id and origin = 'pessoal');

-- ------------------------------------------------------------------
-- Avisos: o servidor cria; a pessoa só marca como lido
-- ------------------------------------------------------------------

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('proxima_aula', 'horario_alterado', 'nova_turma', 'curso_disponivel', 'evento_proximo', 'novo_conteudo', 'lembrete', 'inscricao_confirmada')),
  title text not null check (char_length(title) between 1 and 160),
  body text not null default '',
  href text check (href is null or href ~ '^(/[^/\\]|https://)'),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
revoke all on table public.notifications from anon, authenticated;
grant select on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;

drop policy if exists "visitante le os proprios avisos" on public.notifications;
create policy "visitante le os proprios avisos" on public.notifications
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "visitante marca o proprio aviso como lido" on public.notifications;
create policy "visitante marca o proprio aviso como lido" on public.notifications
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table if not exists public.notification_preferences (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('proxima_aula', 'horario_alterado', 'nova_turma', 'curso_disponivel', 'evento_proximo', 'novo_conteudo', 'lembrete', 'inscricao_confirmada')),
  enabled boolean not null,
  primary key (user_id, kind)
);

alter table public.notification_preferences enable row level security;
revoke all on table public.notification_preferences from anon, authenticated;
grant select, insert, update, delete on table public.notification_preferences to authenticated;

drop policy if exists "visitante le as proprias preferencias" on public.notification_preferences;
create policy "visitante le as proprias preferencias" on public.notification_preferences
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "visitante escolhe as proprias preferencias" on public.notification_preferences;
create policy "visitante escolhe as proprias preferencias" on public.notification_preferences
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "visitante altera as proprias preferencias" on public.notification_preferences;
create policy "visitante altera as proprias preferencias" on public.notification_preferences
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "visitante remove as proprias preferencias" on public.notification_preferences;
create policy "visitante remove as proprias preferencias" on public.notification_preferences
  for delete to authenticated using ((select auth.uid()) = user_id);

commit;
