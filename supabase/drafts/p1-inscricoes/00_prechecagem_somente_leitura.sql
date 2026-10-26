-- =====================================================================
-- P1 inscrições — PRÉ-CHECAGEM SOMENTE LEITURA (um único SELECT).
-- NÃO EXECUTADA. Só rodar no banco oficial com autorização explícita.
-- Não lê nome, e-mail, contato nem texto de pedidos: só contagens e
-- identificadores técnicos do painel.
--
-- Resultado: uma grade (verificacao | quantidade | amostra | como_ler).
-- =====================================================================
with insc as (
  select r.id, r.document
  from public.op_records r
  where r.collection = 'enrollments'
)
select * from (
  -- A. Formato: inscrições sem pessoa ou sem turma
  select 'A. inscrição sem pessoa/turma' as verificacao,
         count(*)::text as quantidade,
         string_agg(id, ', ' order by id) as amostra,
         'Esperado 0. Se >0: o índice único não as protege. Corrigir no painel antes.' as como_ler
  from insc
  where coalesce(document ->> 'profile_id', '') = '' or coalesce(document ->> 'offering_id', '') = ''
  union all
  -- B. Situações fora do conjunto que o painel produz
  select 'B. situação desconhecida', count(*)::text,
         string_agg(id || '=' || coalesce(document ->> 'status', 'null'), ', '),
         'Esperado 0. Valores aceitos: active, waitlist, completed, cancelled. Se >0: a cópia registraria falha.'
  from insc
  where coalesce(document ->> 'status', '') not in ('active', 'waitlist', 'completed', 'cancelled')
  union all
  -- C. Duplicidade pessoa+turma (impede a PARTE 1)
  select 'C. pessoa e turma duplicadas', count(*)::text,
         string_agg(par, ', '),
         'Esperado 0. Se >0: a PARTE 1 para sozinha. Decidir com a secretaria qual inscrição fica.'
  from (
    select (document ->> 'profile_id') || '/' || (document ->> 'offering_id') as par
    from insc group by 1 having count(*) > 1
  ) d
  union all
  -- D. Referências quebradas
  select 'D. inscrição apontando para pessoa ou turma inexistente', count(*)::text,
         string_agg(i.id, ', '),
         'Esperado 0. Se >0: a cópia usaria título genérico ou registraria falha.'
  from insc i
  where not exists (select 1 from public.op_records p where p.collection = 'profiles' and p.id = i.document ->> 'profile_id')
     or not exists (select 1 from public.op_records o where o.collection = 'activity_offerings' and o.id = i.document ->> 'offering_id')
  union all
  -- E. Volume que a PARTE 2 copiaria (apenas informativo)
  select 'E. inscrições por situação', count(*)::text,
         string_agg(distinct coalesce(document ->> 'status', 'null'), ', '),
         'Informativo: nada é copiado sem vínculo de conta.'
  from insc
  union all
  -- F. public.enrollments já existentes (de outra origem)
  select 'F. linhas em public.enrollments', (select count(*) from public.enrollments)::text, null,
         'Informativo. Linhas de outra origem nunca são sobrescritas pela cópia.'
  union all
  -- G. Pedidos de curso no site (sem conteúdo)
  select 'G. pedidos de curso em site_interests', (select count(*) from public.site_interests where kind = 'curso')::text, null,
         'Informativo. Pedidos antigos não têm conta: não servem para vínculo.'
  union all
  -- H. Objetos da P1 já existentes (esperado: nenhum)
  select 'H. objetos da P1 já presentes',
         (  (to_regclass('public.op_profile_accounts') is not null)::int
          + (to_regclass('public.enrollment_projection_issues') is not null)::int
          + (select count(*) from information_schema.columns
             where table_schema = 'public'
               and ((table_name = 'site_interests' and column_name = 'user_id')
                 or (table_name = 'enrollments' and column_name in ('op_enrollment_id', 'hidden_at', 'hidden_reason'))))::int
         )::text,
         null,
         'Esperado 0 antes da PARTE 1.'
) resultado
order by verificacao;
