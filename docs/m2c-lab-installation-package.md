# Frente C: instalação manual no laboratório

Destino exclusivo: `hmspabllgxqfzzricijv`. Executar `docs/m2c-lab-final-preflight.sql` no SQL Editor e guardar a saída. Os seis arquivos abaixo são as fontes integrais: abrir e executar **um arquivo por vez**, sem concatenar. Confirmar o Project ID no Dashboard antes de cada execução. Não usar `db push`.

| Etapa | Arquivo em `supabase/migrations/` | SHA-256 |
|---|---|---|
| 1 | `202610230001_restore_operational_guard.sql` | `36B2604B9FD1747BC2EB118AC615C8DEAA949DC23E51BD07E60856109C045659` |
| 2 | `202610160001_appointment_requests.sql` | `2EA88EA245B368AC9516C25653767840B580B25D1045CEE7BEDDE528DB7659E6` |
| 3 | `202610200001_appointment_intake_edge_execute.sql` | `5435B167050D53C99B3219034071B4E753B9884EADA5AA6495E1AA11DA4D576D` |
| 4 | `202610210001_authenticated_appointment_requests.sql` | `0BBEED2E357CF07356B6393A3E525529B9D2C2490A5308364B92A37FE312C0EF` |
| 5 | `202610220001_appointment_request_reservations.sql` | `FD4234692E3203C51D12C879332501DD8CF5C6B60BCC7BF0CD1BA5F7C76BB5B2` |
| 6 | `202610290004_real_appointment_slots.sql` | `BEEF23F5DBA5E5424DE1AD377C3D8DFE84993E97CB8CDAE2A7BDA29D3FE0CC88` |

## Condições e verificações

1. `op_records`, `op_meta`, `op_requests`, `op_apply`, `is_portal_admin` e colunas operacionais compatíveis presentes. A guarda original `202609180002` tem corpo de função idêntico ao da restauração. Depois: `validate_op_record()` presente; trigger `op_records_validate_before_write` ativo; `op_records_document_size` presente como `NOT VALID`; nenhum EXECUTE para `anon`/`authenticated`.
2. `is_portal_admin()` e `gen_random_uuid()` presentes; `appointment_requests` e RPC base ausentes. Depois: tabela com RLS, políticas administrativas, trigger `appointment_requests_touch`, RPC base com EXECUTE revogado para `anon` e `authenticated`.
3. RPC base com assinatura exata presente. Depois: EXECUTE efetivo para `service_role=true`, `anon=false`, `authenticated=false`. Conferir também ausência de EXECUTE para PUBLIC na ACL.
4. `profiles`, `op_records`, `is_portal_admin()` e RPC base presentes; tabela de pedidos sem colunas da etapa 4. Depois: colunas `requester_user_id`, `offering_id`, `professional_profile_id`; `appointment_profile_accounts` com RLS; catálogo presente; RPC autenticada presente, sem EXECUTE para `anon`/`authenticated`.
5. Função de guarda e trigger operacional ativos; objetos e três colunas da etapa 4 presentes. Depois: colunas de reserva, índices e trigger `op_records_validate_appointment_reservation`; RPC `confirm_appointment_request_reservation(uuid,timestamptz,text,jsonb)` presente, sem EXECUTE para `anon`/`authenticated`.
6. RPCs autenticada e de confirmação presentes; `gen_random_uuid()` presente; `appointment_slots` ausente. Depois: `appointment_slots` e `appointment_request_events` com RLS; triggers de transição e sincronização; RPCs de horário, solicitação, cancelamento e listagem. Confirmar que `create_appointment_slot` e a confirmação exigem `is_portal_admin()` internamente.

Para verificar após cada etapa, executar apenas a parte pertinente do preflight novamente. Qualquer resultado inesperado, erro SQL, objeto homônimo com assinatura divergente ou mudança de hash interrompe a sequência. Cada migration contém `BEGIN`/`COMMIT`: erro antes do commit reverte a etapa. Não reexecutar uma etapa que tenha confirmado commit; investigar catálogo e histórico primeiro. Não excluir ou corrigir documentos operacionais para contornar a guarda.

## Histórico

O SQL Editor manual não equivale a uma aplicação pelo Supabase CLI. Após cada commit, conferir `supabase_migrations.schema_migrations` e anotar versão, hash, horário, projeto e resultado. Se a versão não aparecer no histórico, registrar a divergência na ata de homologação. **Não inserir diretamente no histórico e não usar `migration repair` nesta instalação** sem revisão separada do estado efetivo, pois isso pode marcar como aplicada uma etapa que falhou. O preflight mostra as seis versões registradas, quando a tabela de histórico existir.

## Riscos e homologação posterior

A constraint `NOT VALID` não varre documentos antigos, mas o trigger pode rejeitar futuras alterações de `rooms` e `schedule_items` com status, capacidade, horários, sala ou conflitos inválidos. O preflight apresenta contagens de formato, não prova a ausência de todos os conflitos temporais; uma mudança operacional deve ser testada no laboratório. O índice único da etapa 5 pode falhar se houver `appointment_request_id` duplicado em documentos operacionais. A etapa 6 acrescenta grants de EXECUTE apenas para `authenticated` nas RPCs de horários; as rotinas administrativas verificam `is_portal_admin()` dentro da função. O frontend usa `submit_appointment_slot_request`, `list_available_appointment_slots`, `cancel_my_appointment_request`, `list_my_appointment_requests`, `create_appointment_slot` e `confirm_appointment_request_reservation`. Também há caminho legado que chama `submit_authenticated_appointment_request`: permanece bloqueado após as migrations; qualquer grant adicional precisa de revisão específica do fluxo e autorização.

Após as seis etapas, executar `scripts/run-m2c-lab.mjs` com credenciais e URL exclusivamente do laboratório; ele cobre concorrência, idempotência, confirmação, cancelamento e isolamento. Rodar a regressão local antes do commit. Não fazer push, merge ou deploy.
