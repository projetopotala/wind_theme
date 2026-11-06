# D4 — Relatório de implementação (local)

Branch `feat/d4-salas-privadas`, base `a0a6204`. Nada foi aplicado no Supabase, nada foi publicado, sem push.

## Etapas

| Etapa | Entrega | Estado |
|---|---|---|
| A | `outputs/sala-atendimento.html`, `css/sala.css`, `js/sala/pagina-sala.js` | feito, responsivo por CSS (não verificado em navegador) |
| B | `supabase/migrations/202611020001_appointment_private_rooms.sql` | escrito, **não aplicado**, sem execução em Postgres |
| C | Porta de vídeo + adaptador Daily; Edge Function `issue-appointment-room-token` | feito; teste com Daily real **BLOCKED** (sem conta/chave) |
| D | Chat por `textContent`, polling, perda/recuperação de conexão, estados | feito |
| E | Link em Meu Potala (atendimentos confirmados online) e na Central Operacional | feito |
| F | 17 testes novos; regressão completa | unitários OK; teste real de banco/navegador **pendente** |

## Verificação

- `npm run test:portal`: 1400/1400. `npm run lint`, `validate:portal`, `build`, `git diff --check`: limpos.
- Cobertos por teste automatizado: estados da sala, URL do provedor, XSS no chat, sessão sem token fora de `open`, borda (sem JWT, corpo extra, negação do banco, token preso a sala/participante, não-dono, sem gravação, 503 sem credencial), SQL estático (RLS sem policy, sem grant de tabela, `SECURITY DEFINER` com `search_path` vazio, regras de autorização), varredura de segredos nos artefatos servidos.

## Não comprovado (exige o LAB, com autorização)

- Comportamento real das RPCs: não participante negado, cancelamento bloqueando entrada, janela, limite de taxa, encerramento apagando o chat. Só há verificação estática do SQL.
- Edge Function implantada, secrets (`DAILY_API_KEY`, `DAILY_DOMAIN`, `ROOM_ALLOWED_ORIGINS`) e vídeo real.
- Responsividade e acessibilidade em navegador.

## Decisões de produto pendentes (padrões adotados)

Janela 15 min antes / 30 min depois; chat apagado ao encerrar (purga por admin para salas vencidas); só o profissional encerra para todos; sem gravação; só atendimento online. Anexo I não está no repositório: gravação, histórico e retenção contratuais ficam como dependência externa.

## Próximo passo (precisa de autorização)

Aplicar a migration no LAB `hmspabllgxqfzzricijv`, configurar os secrets, implantar a função e rodar a matriz de segurança com contas sintéticas.
