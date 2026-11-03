# D4 - Integração Daily: preparação e revogação (2026-11-03)

Estado confirmado: LAB `hmspabllgxqfzzricijv`, migration `202611020001` registrada, única função publicada é `submit-appointment-request`; `issue-appointment-room-token` e `close-appointment-room` ainda não publicadas. Secrets existentes: apenas os `SUPABASE_*` automáticos. Faltam `DAILY_API_KEY`, `DAILY_DOMAIN`, `ROOM_ALLOWED_ORIGINS`.

## Conta Daily (decisão sua, sem custo automático)
1. Criar conta Daily própria do Instituto (https://dashboard.daily.co). Não foi contratado nenhum plano. O plano gratuito costuma bastar para a homologação; confirmar limites e preços atuais no painel antes de qualquer upgrade.
2. O **domínio** (`DAILY_DOMAIN`, só o subdomínio, ex.: `institutopotala`) e a **chave de API** devem ser da mesma conta/ambiente (Developers > API keys).
3. Gravação, transcrição e chat do provedor permanecem desligados (a função não envia `enable_recording`; `enable_chat:false`).
4. Configurar os secrets direto no Supabase LAB, sem passar pelo chat, repositório ou frontend. Pelo painel (Edge Functions > Secrets) ou pelo terminal local:
   `npx supabase secrets set DAILY_API_KEY=... DAILY_DOMAIN=... ROOM_ALLOWED_ORIGINS=https://<origens-separadas-por-virgula> --project-ref hmspabllgxqfzzricijv`
   `ROOM_ALLOWED_ORIGINS` deve listar apenas o domínio protegido da Preview (e `http://localhost:<porta>` do teste local). Sem barra final.

## Revogação no encerramento (resolvido no código)
- Expirar o token não derruba quem já está conectado por si só; por isso os tokens levam `eject_at_token_exp` e a sala `eject_at_room_exp`, e o encerramento manual é ativo.
- Nova função `close-appointment-room` (`verify_jwt = true`): o banco autoriza (`close_appointment_room_session` com o JWT do usuário, só profissional vinculado). Só depois a função lê, com a chave de serviço, o nome da sala e os participantes que receberam token, chama a API do Daily `POST /rooms/{sala}/eject` com `user_ids` e `ban:true` (expulsa e impede reentrada com tokens já emitidos) e `DELETE /rooms/{sala}`.
- Falha do provedor não desfaz o fechamento no banco (novas entradas já ficam bloqueadas). A resposta traz `revoked:false` e a chamada pode ser repetida pelo profissional.
- Não precisa de migration, nova tabela nem novo segredo além dos três acima (a chave de serviço é injetada pela plataforma).
- Cancelamento: um atendimento confirmado (`encerrada`) não pode ser cancelado pelo guard existente, então o único caminho de encerramento antecipado é o do profissional. Se no futuro houver cancelamento de confirmados, ele deverá chamar a mesma revogação.
- Reuso de token: preso a `user_id` do participante e à sala, máx. 2 participantes, expira no fim da janela, emissão limitada a 6/min por usuário. Risco residual: um token vazado pode ocupar a vaga enquanto o titular não entrou. Mitigação: encerramento com ban e expiração.
- A confirmação de que `DELETE /rooms` e `eject` derrubam conexões ativas acontece no teste de vídeo real; a documentação do Daily não detalha o efeito do DELETE em conectados, por isso o eject explícito.

## Testes
`tests/potala/d4-encerramento.test.mjs` (6 casos): sem JWT/corpo inválido/método não chegam ao banco; banco nega => Daily não é chamado; autorizado expulsa+bane e apaga; falha do provedor sinaliza `revoked:false` sem vazar detalhe; 404 conta como revogado; front chama a função com o JWT.
