# D4 - Ativação controlada do banco no LAB (2026-11-03)

Projeto: `hmspabllgxqfzzricijv` (LAB). Branch `feat/d4-salas-privadas`, HEAD de partida `71daf82`.

## Migration aplicada
- `supabase/migrations/202611020001_appointment_private_rooms.sql`
- SHA-256 `A746513A2E3B02FEF9CD82856420053D9F6574A2DEC2D76AFEE3C5BE686D4ABB` (conferido antes de aplicar).
- Aplicada uma vez com `db query` e registrada com `migration repair --status applied` somente depois da execução. Sem `db push`.
- Histórico remoto: `202611020001` no topo, seguido de `20261030203000`, `20261030195903`, `20261030082641`, `20261030043536`.
- Estrutura real conferida contra o SQL aprovado: 3 tabelas, índices, 6 funções SECURITY DEFINER com `search_path=''`.

## Grants e RLS
- Tabelas com RLS ativo, 0 policies, sem privilégio para `anon`/`authenticated`.
- Nenhum EXECUTE para PUBLIC/`anon` nas 6 funções; `authenticated` apenas nas funções de sala, com autorização interna.
- Advisors de segurança: nenhum alerta `anon` nas funções D4. Avisos D4: `rls_enabled_no_policy` (INFO, intencional) e `authenticated_security_definer_function_executable` (WARN, intencional, autorização dentro da função).

## Matriz real (72 casos, usuários sintéticos com autenticação real)
Resultado: 72 de 72. Cobre cliente/profissional vinculados, terceiros, outro profissional, admin não participante, anônimo, presencial, cancelado, não confirmado, antes da janela, após vencimento, isolamento entre salas, chat ilegível após encerrar, parâmetros de identidade forjados, mensagens inválidas, acesso direto às tabelas (SELECT/INSERT/UPDATE/DELETE), encerramento (só profissional vinculado), limpeza (só admin).

Concorrência (ondas de 8 a 9 chamadas simultâneas, sessões independentes): 16 emissões de token por dois usuários resultaram em 12 aceitas e 4 limitadas (54000), 1 sessão de sala; 45 mensagens do mesmo usuário resultaram em 30 aceitas e 15 limitadas. Sem duplicação nem deadlock. Uma primeira rodada com 16/45 chamadas simultâneas sem ondas gerou `fetch failed` no cliente Node (saturação de sockets local); o banco manteve os limites.

Limitações: "vencida" foi simulada alterando o horário de um slot sintético (relógio não alterado). Cancelar atendimento já encerrado é bloqueado pelo guard existente e não foi alcançável.

## Limpeza
`pg_cron` não está instalado. A rotina `purge_expired_appointment_room_messages()` foi testada (admin remove mensagens de sala vencida; usuário comum, profissional e anônimo negados). Para produção é necessário agendar execução periódica (sugestão: a cada 15 min) por Edge Function agendada, scheduler externo ou habilitando `pg_cron`; pendente.
Dados sintéticos removidos por manifesto. Snapshot posterior idêntico ao anterior (md5/contagens de appointment_requests, slots, eventos, profile_accounts, op_records, public.users, auth.users); `f5039cab` segue `recebida`.

## Regressão
D4 focado 23/23; `test:portal` 1406/1406; lint, build, `validate:portal` e `git diff --check` limpos.

## Pendências de integração (não homologadas)
- Edge Function `issue-appointment-room-token` não publicada (`verify_jwt = true` mantido). Após publicar: verificar preflight CORS OPTIONS com `verify_jwt = true`, e identidade validada pelo JWT do usuário independentemente de chave de API.
- Daily: chave (`DAILY_API_KEY`), domínio (`DAILY_DOMAIN`), origens autorizadas (`ROOM_ALLOWED_ORIGINS`), expulsão de participantes já conectados em caso de cancelamento (tokens emitidos não são revogáveis), teste real de áudio/vídeo.
- Teste com SDK simulado não equivale a chamada real.
