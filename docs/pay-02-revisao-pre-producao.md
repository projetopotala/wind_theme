# PAY-01 + PAY-02 — Revisão pré-produção (25/11/2026)

Revisão técnica do fluxo único PAY-01 (#116) + PAY-02 (#117). Nada foi aplicado em Supabase, nenhuma chave real foi usada,
nenhuma cobrança ou webhook reais foram criados. Complementa `docs/pay-02-integracao-asaas-real.md`.

## 1. Correções feitas nesta revisão (comprovadas)

| # | Problema comprovado | Correção | Prova |
|---|---|---|---|
| C1 | A conta Asaas do Instituto é compartilhada com cobranças alheias aos atendimentos. O gatilho `pay_review_on_event` abria `orfa_no_provedor` para **todo** recebimento sem correspondência, inundando a fila de revisão do Owner | Gatilho não abre mais revisão para `sem_correspondencia` (evento segue registrado). Órfãs **nossas** (`appointment:`) continuam detectadas pelo reconciliador (filtra o prefixo) e o webhook registra `webhook_possivel_orfa` (só ids) | `pay02-banco` (recebimento alheio: 0 revisões) e `pay02-pagador-config` (log só para referência `appointment:`) |
| C2 | Runbook mandava **remover `PAYMENTS_ENABLED`** na reversão: isso derruba webhook e reconciliador (503) e abandona cobranças existentes | Parada de emergência em dois níveis (seção 4). Nível 1 só bloqueia criação | Teste "parada de emergência": com a chave desligada, webhook, estorno e liberação de reserva seguem funcionando |
| C3 | Painel Pix sem CSS (QR/textarea podiam estourar em 320 px) | Regras mobile-first em `outputs/css/conta.css` (somente acréscimo) | Revisão de CSS; validação visual em dispositivo fica para a etapa controlada |

## 2. Contratos do Asaas (documentação oficial consultada em 25/11/2026)

| Ponto | Situação |
|---|---|
| Header de autenticação `access_token`; `GET` não pode ter corpo (403) | Documentado. Nosso cliente envia `GET` sem corpo |
| `GET /customers`: filtros `externalReference`, `cpfCnpj`, `name`, `email`, `offset`, `limit` (máx. 100) | Documentado |
| `GET /payments`: filtros `externalReference`, `customer`, `status`, `billingType`, `dateCreated[ge]/[le]`, `offset`, `limit` (máx. 100) | Documentado. **Formato da data não especificado** (usamos `YYYY-MM-DD`) |
| Listagem: campos `hasMore`, `totalCount`, `limit`, `offset` | Documentado. O envelope completo (`data`) **não** aparece na página; implementamos `data[]` e tratamos resposta sem `data` como inconclusiva |
| `DELETE /payments/{id}`: remove a cobrança do fluxo ativo; gera `PAYMENT_DELETED`; pode ser restaurada (`PAYMENT_RESTORED`) | Documentado. **Corpo da resposta 200 e estados não excluíveis não documentados**: nosso cliente exige `deleted:true`; qualquer outra resposta é inconclusiva e **não libera o horário** (falha fechada) |
| Cobrança excluída ainda aparece em `GET /payments/{id}`? | **Não documentado**; a etapa controlada deve registrar a resposta real |
| `GET /payments/{id}/pixQrCode`: imagem Base64, payload, data de expiração | Documentado em prosa; **nomes dos campos não confirmados** (usamos `encodedImage`, `payload`, `expirationDate`) |
| QR sem chave Pix cadastrada no Asaas só vale até 23:59 do mesmo dia (comportamento a ser descontinuado) | **Pré-requisito**: chave Pix cadastrada na conta antes de qualquer teste |
| Webhook: `id` do evento (`evt_…`) no topo, `event`, `dateCreated`, objeto `payment` (inclui `externalReference`, `value`, `originalValue`, `interestValue`, `deleted`, `status`) | Documentado. Usamos o `id` como id único do evento |
| Webhook: ordem de entrega **não garantida**; recomenda idempotência; campos novos não devem gerar exceção | Documentado. Já tratado (eventos fora de ordem, `eventId` único, normalização tolerante) |
| Webhook: header `asaas-access-token`, expectativa de HTTP 200, política de penalização/pausa da fila | **Não confirmados nas páginas lidas** (estão em páginas separadas: "Penalização de filas", "Fila pausada", "Logs de Webhooks"). O comentário do código sobre "15 falhas" deve ser reconfirmado |
| Evento `PAYMENT_RESTORED` | Existe na doc; é aceito pelo normalizador. **Efeito no nosso estado: a validar** (cobrança excluída por nós e restaurada manualmente no painel do Asaas) |

Campos a registrar com respostas reais na validação controlada: envelope das listagens, resposta do `DELETE`, nomes do
QR, formato do filtro de data, comportamento de `GET` após exclusão, header e penalização do webhook, juros/multa
(`interestValue`) em pagamento após o vencimento.

## 3. Reconciliação periódica — proposta (NÃO ativada)

Segurança do desenho atual: toda escrita é idempotente (`registrarId`, `recon:<cob>:<status>`, revisão com dedupe,
`pay_release_expired_hold` revalida sob trava de linha). Duas execuções simultâneas não geram cobrança nem liberação
dupla; apenas chamadas redundantes.

| Tema | Proposta |
|---|---|
| Frequência | A cada 5 min (tráfego baixo; hold mínimo 5 min). Intervalo maior à noite é opcional |
| Agendador | `pg_cron` + `pg_net` (POST com `x-reconcile-token` guardado no Vault) ou agendador externo. **Nada foi criado** |
| Concorrência | Antes de ativar: lease em tabela (`pay_reconcile_lease`, 1 linha, expira em 4 min) — pular a execução se vigente. Hoje é segura, mas desperdiça chamadas |
| Limite de tentativas / backoff | Hoje só limite por execução (50 itens, 5 páginas de órfãs). Antes de ativar: contador `recon_attempts` e `next_attempt_at` por cobrança (backoff 5→15→60 min, teto em 24 h → revisão `falha_conciliacao`). **Não implementado** |
| Monitoramento | Resposta da função traz contadores (`erros`, `revisoes_abertas`, `reservas_liberadas`, `orfas`); alarme quando `erros>0` por 3 execuções seguidas ou `pay_open_reviews()` tem item com >30 min |
| Alertas | Uma verificação agendada que envie e-mail/push ao Owner quando houver revisão aberta. **Não implementado** |
| Logs | Só evento, tipo de erro, ids internos e do provedor. Nunca documento, nome, e-mail, chave ou token (testado) |
| Recuperação | `pay_open_reviews()` → conferir no painel do Asaas → `pay_resolve_review(id, nota)`. Nunca criar cobrança manualmente para o mesmo atendimento sem antes excluir/confirmar a anterior |

## 4. Parada de emergência e desativação sem abandonar cobranças

| Nível | Ação | Efeito | Quando |
|---|---|---|---|
| 1 | `update public.pay_runtime_settings set charges_enabled = false` (como `postgres`) | Nenhuma cobrança nova (SQLSTATE `PT503`). Replay das existentes, webhook, estorno, expiração e conciliação seguem | Qualquer anomalia |
| 2 | Remover `PAYMENTS_ENABLED` e/ou excluir o webhook no Asaas | Webhook e conciliação passam a responder 503 | **Só** com zero cobranças abertas (aguardando, em processamento, confirmado) e revisões resolvidas |
| 3 | Rotacionar API Key / tokens | Invalida o acesso | Suspeita de vazamento; antes, executar nível 1 e conferir cobranças abertas no painel do Asaas |

Pós-parada: desligar a chave do front (`PAGAMENTOS_PIX_ATIVO`) só esconde o painel; não substitui o nível 1.

## 5. Interface Pix — verificações

- `PAGAMENTOS_PIX_ATIVO = false`; desligada não lê pagamentos nem chama o servidor (teste de leitura do código-fonte).
- A única chamada que pode gerar cobrança é o envio do formulário por clique; abrir a página nunca chama.
- O navegador envia apenas `request_id`, `idempotency_key` e `payer`; **valor, serviço e status vêm do servidor**.
- Serviço, horário e valor aparecem no painel; **profissional ainda não** (o pedido não traz o profissional no modelo
  atual). Ajuste pendente, não bloqueante para o teste controlado de uma cobrança.
- Sem chaves privadas no navegador (teste de varredura); confirmação só pelo estado gravado pelo servidor.
- Múltiplos cliques: botão fica `disabled` durante o envio (via `agir`) e a chave de idempotência é reaproveitada até o
  Pix chegar; recarregar a página devolve a cobrança aberta (índice único "uma aberta por solicitação").
- Móvel: CSS adicionado; **validação visual real em celular fica para a etapa controlada**.

## 6. Migrations (PAY-01 + PAY-02 + SEC-04)

Ordem: `202611250001` (SEC-04, privilégios) → `202611250002` (PAY-01) → `202611250003` (PAY-02). A PAY-02 aborta se os
objetos da PAY-01 não existirem. SEC-04 só revoga `EXECUTE` de `anon` em `is_portal_admin()` e `MAINTAIN` em
`home_block_drafts`; não toca em objetos de pagamento. Integrando #115 + #117 localmente (sem commit): **345/345** testes
de PAY, SEC-04 e isolamento RLS. Rollbacks por migration. **Histórico do Supabase oficial está divergente:** nenhuma
migration deve ser aplicada via `db push`/`migration repair`; a aplicação futura será manual, uma a uma, no LAB primeiro.

## 7. Ordem segura de merge (aguarda autorização)

1. Merge da #116 em `main` (a main não avançou desde a base; sem conflito).
2. Retargetar a #117 para `main` (`gh pr edit 117 --base main`, ou automático se a branch da #116 for removida) — **o CI só
   roda quando a base é `main`**; aguardar CI verde.
3. Merge da #117. A #115 (SEC-04) é independente e pode entrar antes ou depois (testado em conjunto).
4. Merge **não** ativa nada: sem segredos, sem migrations aplicadas e com `PAGAMENTOS_PIX_ATIVO=false`, o Portal se comporta
   como hoje. Aplicação das migrations e segredos são etapas separadas.

Alternativa sem merge para obter CI na #117 agora: retargetar a #117 para `main` (reversível; o diff passa a incluir os
commits da #116) — pendente de autorização.

## 8. Checklist de ativação (todas as travas começam desligadas)

Pré: PRs aprovadas e mergeadas; política de privacidade cita o Asaas; chave Pix cadastrada no Asaas; serviço de teste com
preço mínimo definido pelo Owner em `appointment_service_prices` (não alterar preços reais).

- [ ] LAB: aplicar migrations 0002 e 0003; rodar suíte de banco; `charges_enabled=false`.
- [ ] Oficial (autorização própria): aplicar 0002 e 0003 manualmente, conferindo ACLs; `charges_enabled` segue false.
- [ ] Segredos no painel Supabase (Owner, sem passar por chat): `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `PAYMENTS_RECONCILE_TOKEN` (três valores distintos, ≥ 32 caracteres), `ASAAS_ENV=production`, `PAYMENT_HOLD_MINUTES`, `PAYMENT_ALLOWED_ORIGINS`. Sem `PAYMENTS_ENABLED`.
- [ ] Publicar as 3 funções (`create-appointment-payment`, `asaas-appointment-webhook`, `reconcile-appointment-payments`). Webhook com `verify_jwt=false`.
- [ ] Cadastrar o webhook no Asaas (autorização própria) com token exclusivo; conferir 401 com token errado.
- [ ] Limites: um cliente de teste; um serviço; valor mínimo; sem agendador.
- [ ] Abrir travas na ordem `PAYMENTS_ENABLED` → `PAYMENTS_PRODUCTION_ACK` → `charges_enabled`; `PAGAMENTOS_PIX_ATIVO` só em pré-visualização restrita.
- [ ] Monitorar logs e `pay_open_reviews()` durante todo o teste; nível 1 de parada pronto.

## 9. Critérios para autorizar UMA cobrança real controlada

1. #116 e #117 mergeadas com CI verde na `main`; migrations aplicadas no LAB e no oficial sob autorização.
2. Segredos e webhook configurados pelo Owner; `pay_open_reviews()` vazia.
3. Chave Pix cadastrada; valor de teste e cliente de teste definidos pelo Owner por escrito.
4. Plano de parada (nível 1) ensaiado no LAB; alguém acompanhando em tempo real.
5. Itens "a registrar" da seção 2 prontos para anotar respostas reais.
6. Autorização expressa do Owner para esta única cobrança.

## 10. Decisão GO / NO-GO

| PR | Decisão | Motivo |
|---|---|---|
| #116 (PAY-01) | **GO para merge** (após autorização do Owner) | CI verde, mergeável, nada ativo por padrão |
| #117 (PAY-02) | **GO para merge após retarget para `main` e CI verde** | Local: tudo verde; sem CI por causa da base empilhada |
| Cobrança real | **NO-GO** até cumprir a seção 9 | Contratos reais não homologados; reconciliação não agendada, sem backoff/alerta |
| Ativação para clientes | **NO-GO** | Depende do relatório da cobrança controlada |
