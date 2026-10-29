# Frente C — registro de execução no laboratório

Projeto: `hmspabllgxqfzzricijv`. Produção: não acessada para escrita.

| Etapa | Migration | SHA-256 | Resultado |
|---|---|---|---|
| 1 | `202610230001_restore_operational_guard.sql` | `36B2604B9FD1747BC2EB118AC615C8DEAA949DC23E51BD07E60856109C045659` | PASS informado pelo responsável, pós-teste aprovado antes desta execução |
| 2 | `202610160001_appointment_requests.sql` | `2EA88EA245B368AC9516C25653767840B580B25D1045CEE7BEDDE528DB7659E6` | PASS informado pelo responsável, pós-teste aprovado antes desta execução |
| 3 | `202610200001_appointment_intake_edge_execute.sql` | `5435B167050D53C99B3219034071B4E753B9884EADA5AA6495E1AA11DA4D576D` | PASS; executada no SQL Editor autenticado do Chrome em 2026-10-29 ~20:40 America/Sao_Paulo; `Success. No rows returned` |
| 4 | `202610210001_authenticated_appointment_requests.sql` | `0BBEED2E357CF07356B6393A3E525529B9D2C2490A5308364B92A37FE312C0EF` | PASS via integração Supabase; 3 colunas, `appointment_profile_accounts` com RLS e 4 policies; RPC autenticada sem EXECUTE para anon/authenticated |
| 5 | `202610220001_appointment_request_reservations.sql` | `FD4234692E3203C51D12C879332501DD8CF5C6B60BCC7BF0CD1BA5F7C76BB5B2` | PASS via integração Supabase; 3 colunas, trigger de vínculo e índice único ativos; RPC de confirmação bloqueada antes da etapa 6 |
| 6 | `202610290004_real_appointment_slots.sql` | `BEEF23F5DBA5E5424DE1AD377C3D8DFE84993E97CB8CDAE2A7BDA29D3FE0CC88` | PASS via integração Supabase; slots/eventos com RLS, 2 triggers de transição, RPCs de horário e cancelamento presentes; confirmação authenticated=true, anon=false |
| Correção | `202610290005_appointment_event_owner_column_access.sql` | `A1519276AF1623882A8B7A52F0AA32AD98A90AF07DFF3686417FD84E0B9B8963` | PASS após autorização específica; SELECT apenas na coluna `requester_user_id` para authenticated; RLS preservada; anon sem acesso |

Pós-teste da etapa 3: `anon_execute=false`, `authenticated_execute=false`, `service_role_execute=true`, `public_execute=false`. Antes da etapa 3, a RPC base já apresentava esses privilégios efetivos; o SQL da etapa 3 formalizou a concessão. Não há tabela `supabase_migrations.schema_migrations` no laboratório; nenhuma tabela de histórico foi criada ou alterada.

Após conexão da integração oficial Supabase, as etapas 4–6 foram executadas separadamente com os SQLs originais. `execute_sql` não registra automaticamente o histórico interno. A consulta anterior indicou ausência de `supabase_migrations.schema_migrations`; nenhuma tabela interna de histórico foi criada ou alterada.

Homologação HTTP real: `scripts/run-m2c-lab.mjs` concluiu 31 verificações PASS na execução `1793318064376-7bf0a8`, incluindo horários online e presencial com sala sintética, solicitação, replay idempotente, concorrência (um vencedor e PT409 para o outro), confirmação vinculada a `schedule_items`, cancelamento, Meu Potala, histórico isolado e profissional desativado (22023). Rodadas anteriores produziram falhas de fixture e `42501` na leitura do histórico; a primeira foi corrigida no runner e a segunda na migration pontual. Dados sintéticos permanecem identificáveis no laboratório. Houve um timeout de rede em uma tentativa anterior à criação de contas; nova tentativa concluiu PASS.

Regressão local: `npm run test:portal` 1278/1278 PASS; 21 testes direcionados PASS; `npm run lint`, `npm run build` e `npm run validate:portal` PASS. `npm test` terminou FAIL em 2 testes do esqueleto de preview (`app/_sites-preview/SkeletonPreview.tsx` ausente e meta `codex-preview` ausente); o build interno desse comando passou. Essa falha não foi classificada como homologação da Frente C.
