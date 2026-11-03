# D4 — migração do vídeo de Daily para LiveKit Cloud (2026-11-03)

Branch `feat/d4-livekit` (a partir de `feat/d4-salas-privadas` @ 9429b8c). Nada aplicado, publicado ou enviado ainda.

## Por que mudou
O Daily bloqueia a entrada em chamadas sem método de pagamento ("Missing payment method"), o que impediu provar vídeo, áudio e revogação reais. O LiveKit Cloud (plano gratuito) cobre o caso sem cartão.

## O que mudou (e o que não mudou)
| Parte | Situação |
|---|---|
| Banco (estados, janela −15 min/+30 min, RLS sem policy, limites de taxa, chat próprio, apagar chat ao encerrar) | **Inalterado.** Só a migration incremental abaixo. |
| `issue-appointment-room-token` | Emite JWT LiveKit (SDK oficial `livekit-server-sdk@2.19.2`), cria a sala com `maxParticipants: 2`, revalida o estado depois do provedor e compensa. Mantém `verify_jwt = true`. |
| `close-appointment-room` | Banco autoriza → remove participantes conhecidos → apaga a sala → **confirma que ela não existe** → marca `revoked_at`. Mantém `verify_jwt = true`. |
| `sweep-appointment-rooms` (nova) | Varredor para quem ninguém encerrou (consulta vencida) e para execuções interrompidas. Só a chave de serviço chama. **Ainda não agendada.** |
| `outputs/js/sala/video-sala.js` | Adaptador LiveKit (`livekit-client@2.23.0`, servido de `/vendor/livekit-client.umd.js`, sem CDN): conexão, câmera, microfone, quedas. |
| `sessao-sala.js` | Reconexão com **token novo** (3 tentativas), saída por identidade duplicada, encerramento. |
| Chat | Inalterado (banco + polling). Sem canal de dados do LiveKit. |
| Daily | Código removido do repositório; segredos `DAILY_*` e funções antigas **não** foram tocados. Sessões Daily antigas continuam no banco e só são fechadas (sem chamar provedor). |

## Migration `202611030001_appointment_rooms_livekit.sql`
SHA-256 `ECAD542D25E9AF2047D85C359A21BECA2EB63684B3589B0E5C8BF5EA5B94CAF4`.
- aceita `provider in ('daily','livekit')` e passa o padrão para `livekit`;
- `revoked_at` (revogação confirmada no provedor);
- `appointment_rooms_pending_revocation(limit)` e `mark_appointment_room_revoked(uuid)`, só `service_role`.

Provada em PGlite: 20/20 (histórico Daily preservado, constraint, padrão, fila, privilégios, emissão cria sessão `livekit`). Com a migration combinada, a matriz antiga fica 58/59: a única diferença é a contagem de funções `SECURITY DEFINER` (agora 8, não 6), esperada.

## Revogação: o que o LiveKit permite e o que não
LiveKit **não revoga JWT**. Um token continua válido até expirar, e (premissa a confirmar na homologação) entrar com ele numa sala inexistente a cria de novo. Por isso apagar a sala não é revogação, e o desenho é em camadas:
1. **Banco**: depois de encerrar/vencer, nenhum token novo é emitido (409), nem para o profissional.
2. **Token curto**: 90 s (`TTL_TOKEN_SEGUNDOS`), nunca além do fim da janela. Só serve para *entrar*.
3. **Encerramento**: remove cada identidade conhecida, apaga a sala e **só declara `revoked` se a sala deixa de existir** (verificação independente). Sala ainda existente = alguém reentrou = não revogado, tenta de novo.
4. **Varredura final** 95 s depois (fim do TTL): apaga de novo quem reentrou com token ainda válido.
5. **Varredor agendado** (`sweep-appointment-rooms`, a cada minuto): cobre consulta vencida sem encerramento e funções interrompidas (`waitUntil` não é durável).
6. Reconexão do front pede token novo; se o banco recusa, a pessoa sai.

**Janela residual honesta**: tokens que o próprio LiveKit renova para clientes já conectados podem viver mais que 90 s; o limite real é o que a homologação mostrar (teste L16–L19). Sem o varredor agendado, a expiração da consulta depende do profissional ou do navegador — por isso o varredor é condição de GO para produção.

## Limite de duas pessoas
Sala criada com `maxParticipants: 2`, e só duas identidades (os `user_id` do cliente e do profissional) recebem token. Terceiros recebem 403 do banco. A mesma identidade em outro dispositivo derruba a conexão anterior.

## Testes locais
| Suíte | Resultado | Tipo |
|---|---|---|
| Claims do token com o SDK oficial real | 9/9 | real (sem rede) |
| Encerramento, revogação, varredor, reconexão (modelo LiveKit) | 30/30 | **simulado** |
| Corrida emissão × encerramento com barreiras | 11/11 | **simulado** |
| `d4-sala.test.mjs` (adaptador, sessão, borda, SQL, CSS) | 25/25 | simulado |
| Portal completo (`node --test tests/potala/*.test.mjs`) | 1460/1460 | — |
| Migration em PGlite | 20/20 | Postgres real |
| Navegador (Edge), SDK de vídeo falso, 320/375/390/768/1366/1920 px + fluxos | 40/40 | layout/lógica reais, mídia simulada |
| Deno: `deno check` dos handlers; token gerado com `npm:livekit-server-sdk` em Deno | OK | real |
| lint, build, validate:portal, `git diff --check` | limpos | — |

Bugs antigos achados e corrigidos no caminho: `sala-atendimento.html` apontava para `/js/vendor/supabase.js` (inexistente; o correto é `/vendor/supabase.js`) e botões com `hidden` apareciam por causa do `display` de `.mp-botao`.

## Roteiro curto, só no LAB (`hmspabllgxqfzzricijv`) — cada passo exige sua autorização
Segredos `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` e `ROOM_ALLOWED_ORIGINS` já presentes (conferido por nome).
1. **Migration**: aplicar `202611030001` pelo mesmo procedimento da 202611020001 (arquivo + registro da versão); conferir o hash acima.
2. **Funções**: `npx supabase functions deploy <fn> --remote=hmspabllgxqfzzricijv --use-api --yes` para `issue-appointment-room-token`, `close-appointment-room` e `sweep-appointment-rooms`.
3. **Preview protegida nova** (o front mudou): comando padrão de Preview, sem alias.
4. **Agendar o varredor** (decisão sua: pg_cron + pg_net ou agendador do painel), `POST` a cada minuto com `Authorization: Bearer <service role>`.
5. **Teste real**: `C:\Users\vicel\frente-c-artefatos\lk-real\lk-real.mjs` (fora do repo; cria marca `d4lk…` com manifesto; duas contas sintéticas; Edge com câmera/microfone de teste; L1–L19 acima). Depois, pela página da Preview, o mesmo fluxo com login sintético.
6. **Limpeza** pelo manifesto (mesma transação ordenada de antes) e conferência dos totais do snapshot; apagar salas Daily antigas no painel da Daily.
7. Só então: remover segredos e funções Daily (não feito).

## GO / NO-GO
- **GO** para o deploy de homologação do LiveKit no LAB (passos 1–5): código e testes locais verdes, segredos presentes, nada de produção envolvido.
- **NO-GO** para declarar a D4 concluída: vídeo, áudio, expulsão e a janela de token antigo só contam depois do teste real. O varredor agendado é pré-requisito de produção.

## Ativacao controlada no LAB (2026-11-03)

- Migration `202611030001` aplicada somente no LAB `hmspabllgxqfzzricijv` e registrada no historico (checks SQL: constraint aceita daily/livekit, default livekit, `revoked_at` e fila de revogacao presentes, registros Daily intactos, sem acesso anonimo novo).
- Funcoes publicadas no LAB: `issue-appointment-room-token` v9 (verify_jwt=true), `close-appointment-room` v6 (verify_jwt=true), `sweep-appointment-rooms` v4 (verify_jwt=false + credencial de servico conferida no handler, `_shared/credencial-servico.ts`). `submit-appointment-request` nao foi tocada (v8).
- Varredor: 401 sem credencial, invalida, anon e JWT de usuario; o runtime aceita a chave de servico do proprio projeto (autoteste interno). Agendamento (pg_cron/pg_net) NAO ativado. A `sb_secret` listada pela CLI foi recusada pelo gateway (UNAUTHORIZED_INVALID_API_KEY): o teste positivo externo exige a chave do painel.
- RemoveParticipant usa `revokeTokenTs` (agora+5 s) antes de DeleteRoom; a sala so e dada como revogada apos `findRoom` confirmar ausencia.
- Pendente para o teste real (Preview protegido + 2 contas): persistencia do `revokeTokenTs` depois de DeleteRoom, auto-criacao de sala por token antigo, janela residual de tokens renovados pelo cliente LiveKit, limite de 2 participantes com conexoes reais, audio e video.
