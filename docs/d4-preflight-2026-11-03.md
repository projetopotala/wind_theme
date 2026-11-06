# D4 — Preflight final para ativação no LAB

Data: 03/11/2026. Branch `feat/d4-salas-privadas`, base `a0a6204`. Nada aplicado, publicado ou enviado.

## Migration `202611020001_appointment_private_rooms.sql`

SHA-256 (após as correções deste preflight): `A746513A2E3B02FEF9CD82856420053D9F6574A2DEC2D76AFEE3C5BE686D4ABB` (fim de linha LF).

Objetos: tabelas `appointment_room_sessions`, `appointment_room_messages`, `appointment_room_access_log`; índices `appointment_room_messages_session_idx`, `appointment_room_access_log_rate_idx`; funções `appointment_room_context`, `issue_appointment_room_access`, `list_appointment_room_messages`, `post_appointment_room_message`, `close_appointment_room_session`, `purge_expired_appointment_room_messages`. Sem trigger. Sem comando destrutivo sobre objetos existentes (só `delete` de mensagens/log das próprias tabelas novas). Transação única com bloco de verificação de privilégios no fim.

Correções feitas na auditoria:
1. Chat só é legível com a sala `open` (antes continuava legível após vencer ou cancelar).
2. Rate limit serializado por usuário com `pg_advisory_xact_lock` (antes duas chamadas simultâneas passavam juntas).
3. Mensagem com caractere de controle rejeitada no servidor (antes só o navegador filtrava).
4. A limpeza passou a apagar o log de limite de taxa com mais de 1 dia.

## Preflight remoto (LAB `hmspabllgxqfzzricijv`, somente leitura)

Sem conflito: nenhum objeto `appointment_room_*`; tabelas, `is_appointment_professional(text)`, `is_portal_admin()` e todas as colunas usadas existem; `pgcrypto` presente; histórico termina em `20261030203000`; 29 pedidos, 8 online confirmados; `f5039cab` segue `recebida`. `pg_cron` e `pg_net` não estão instalados: a limpeza de mensagens vencidas é manual (função de administrador) até haver decisão.

## Matriz de segurança em Postgres real (PGlite, em memória)

`tests/sql/d4-rooms-matrix.mjs`: 56/56. Cobre cliente/profissional vinculados, terceiro, outro profissional, admin não participante e anônimo; reserva não confirmada, presencial, slot e pedido cancelados; janela (cedo, 15 min antes, vencida); isolamento entre salas; chat (isolamento, incremental, vazio, >1000, controle); limite de taxa de token e de mensagem; encerrar (só profissional, apaga o chat, bloqueia reentrada); SELECT/DELETE/INSERT diretos negados; `anon` sem EXECUTE; funções `SECURITY DEFINER` com `search_path` vazio; RLS ligada e nenhuma policy. Limite: PGlite não é o Supabase (sem PostgREST, `auth.uid()` simulado); a execução no LAB continua necessária.

## Edge Function `issue-appointment-room-token`

- Autenticação: mudou para `verify_jwt = true` (recomendação atual do Supabase para chamadas de usuário); o banco valida de novo ao chamar a RPC com o JWT do usuário. A identidade vem de `auth.uid()`, nunca do corpo (corpo aceita só `request_id`).
- A autorização no banco acontece antes de qualquer chamada ao Daily; teste prova que negação (403/409/429) não chama o provedor.
- Token: sala e `user_id` fixos, `is_owner: false`, `eject_at_token_exp`, validade até o fim da janela; sem `enable_recording`. Sala `private`, `max_participants: 2`, chat do provedor desligado.
- Falha do banco ou do Daily responde 502 genérico, sem URL, token ou segredo (testado). CORS só ecoa origem listada em `ROOM_ALLOWED_ORIGINS`; sem a variável não há cabeçalho.
- **Risco residual:** token já emitido não é revogável pelo banco. Se o atendimento for cancelado depois da entrada, a pessoa permanece na videochamada até o fim da janela; o chat e novas entradas são bloqueados. Mitigação proposta (decisão pendente): ao cancelar, a Central Operacional chama uma função que apaga a sala no Daily.
- **A verificar no deploy:** com `verify_jwt = true`, o preflight CORS (OPTIONS, sem Authorization) precisa passar pelo gateway. Testar logo após publicar; se falhar, voltar a `false` mantendo a validação no banco.
- O Prebuilt recebe o token na query da URL do iframe (`?t=`); mitigado por `referrerpolicy=no-referrer` e token de uso restrito. Inerente ao Prebuilt.
- Sem privilégio de anfitrião para ninguém: o profissional não pode silenciar nem remover o cliente no vídeo. Decisão de produto pendente.

## Navegador (sem Daily, SDK falso por cenário; `tests/browser/d4-sala-servidor-de-teste.mjs`)

Aprovado: os 7 estados do banco, endereço sem UUID, falha de rede com "tentar de novo", 403 sem "tentar de novo", entrada com token do Edge (Authorization e corpo corretos), iframe `daily.co/potala-*` com permissões de câmera/microfone, HTML malicioso exibido como texto (0 elementos criados, 0 execução), mensagem vazia, envio, saída e reentrada, perda e recuperação de conexão do chat, encerramento remoto, botão "Encerrar para todos" só para profissional. Vídeo real, microfone e câmera: **BLOCKED**.

Defeito encontrado e corrigido: em 320, 375 e 390 px havia rolagem horizontal (o vídeo ficava com 384 px por causa de `min-height` com `aspect-ratio`) e alvos de toque de 17 a 34 px. Depois da correção, 320/375/390/768/1366/1920 sem rolagem horizontal, alvos de 44 px, layout empilhado até 899 px e lado a lado acima. Medido em iframes de largura exata; não foi feita revisão visual por captura de tela.

## Regressão

Suíte Portal 1406/1406, lint, `validate:portal`, build e `git diff --check` limpos. Testes novos de D4: 21 em `d4-sala.test.mjs` e 2 em `d4-sala-integracao.test.mjs`.

## Pendências Daily, custos e decisões

- Conta Daily, `DAILY_API_KEY`, `DAILY_DOMAIN` e `ROOM_ALLOWED_ORIGINS` como secrets da função: inexistentes.
- Custo (consulta de preço feita em 02/11, a reconfirmar): 10 000 minutos de participante grátis por mês e US$ 0,004 por minuto depois; gravação e HIPAA têm custo à parte. Não contratado.
- Não aprovadas: Daily como fornecedor definitivo, gravação, retenção do chat (padrão: apagar ao encerrar), janela (15 min antes / 30 min depois), encerramento só pelo profissional, privilégios de anfitrião, limpeza agendada. O Anexo I (07/08/2026) não foi acessível nesta sessão; a conferência contra ele continua pendente.

## GO / NO-GO

**GO** para aplicar a migration exclusivamente no LAB, conforme o SHA-256 acima e com autorização específica. **Não publicar a função** antes de configurar os secrets; sem eles ela responde 503 por desenho.
