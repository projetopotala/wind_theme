# PAY-02 — Integração direta com o Asaas (conta real)

Estado: **código pronto e testado com simulações; NADA ativo**. Nenhuma cobrança real foi criada, nenhum webhook foi
cadastrado, nenhuma migration foi aplicada em Supabase algum, nenhuma credencial foi usada. Mocks não substituem a
homologação real: a validação controlada (seção 10) é obrigatória antes de qualquer cliente pagar.

Base: PAY-01 (PR #116, Draft). Esta etapa é empilhada sobre ela e não toca em SEC-04 (#115), Marketplace, Assistente de IA ou #106.

## 1. Três travas independentes (todas começam fechadas)

| Trava | Onde | Como abrir | Efeito se fechada |
|---|---|---|---|
| 1. `PAYMENTS_ENABLED=true` | segredo da Edge Function | Owner, no painel Supabase | Funções respondem 503; zero chamadas ao Asaas |
| 2. `PAYMENTS_PRODUCTION_ACK=cobrancas-reais-autorizadas` | segredo da Edge Function | Owner, só com `ASAAS_ENV=production` | `producao_bloqueada`: a URL real nem é montada |
| 3. `pay_runtime_settings.charges_enabled` | banco | Owner, `UPDATE` como `postgres` | Gatilho recusa criar cobrança (SQLSTATE `PT503`) |

Proteções adicionais: a chave de sandbox (`_hmlg_`) é recusada em produção e a de produção (`_prod_`) no sandbox
(`chave_incompativel`); o cliente HTTP só aceita `https://api.asaas.com/v3` com permissão explícita
(`permitirProducao === true`) e rejeita qualquer outro host; o token do webhook e o do reconciliador precisam ser
diferentes da API Key e entre si, com ≥ 32 caracteres e sem espaços.

## 2. Segredos (somente no painel Supabase → Edge Functions → Secrets)

`ASAAS_API_KEY` · `ASAAS_WEBHOOK_TOKEN` · `PAYMENTS_RECONCILE_TOKEN` · `ASAAS_ENV` · `PAYMENTS_ENABLED` ·
`PAYMENTS_PRODUCTION_ACK` · `PAYMENT_HOLD_MINUTES` · `PAYMENT_ALLOWED_ORIGINS`.
Nunca no repositório, no front, em logs, em PR ou em chat. O log do cliente Asaas registra apenas método, caminho sem
query, status e um id de correlação. Configuração financeira é separada do deploy do Portal: publicar o site não altera
nenhuma dessas variáveis.

## 3. Fluxo de cobrança (inalterado do B1, agora com pagador)

1. Cliente clica em **Pagar com Pix** (nunca ao abrir a página). O navegador envia só `request_id`, `idempotency_key` e,
   se o servidor pedir, `payer {nome, cpf_cnpj}`. Valor, serviço e status nunca saem do navegador.
2. Servidor reserva (`pay_prepare…`), só então chama o Asaas: procura cliente por `externalReference=user:<id>`;
   reaproveita ou cria; cria a cobrança; **grava o id do provedor**; busca o QR.
3. Falha no QR nunca cancela. Só se cancela com prova de que a cobrança não existe (falha antes do POST ou 4xx ≠ 408).
   Timeout é inconclusivo: bloqueia e segue para conciliação.
4. A confirmação vem **somente** do webhook (ou da conciliação pelo status real). Voltar do navegador não confirma nada.

## 4. Pagador (LGPD)

- CPF/CNPJ validado no servidor (dígitos verificadores). O documento completo vai ao Asaas **uma vez** e **não é gravado**
  no Portal: guardam-se apenas tipo (`cpf`/`cnpj`), os 4 últimos dígitos e o id do cliente no Asaas (`pay_payer_profiles`,
  com RLS: o titular lê só a própria linha e só essas colunas).
- Nenhum e-mail é enviado ao Asaas; notificações do Asaas ao cliente ficam desligadas (`notificationDisabled`).
- Logs nunca contêm documento, nome, e-mail, chave ou token.
- Retenção: o vínculo (tipo + 4 dígitos + id Asaas) vive enquanto a conta existir e é apagado em cascata com ela. Dados
  fiscais que a lei obrigue a manter ficam no Asaas, que é o operador do pagamento. Revisar a política de privacidade
  pública antes da ativação (citar Asaas como operador e a finalidade).
- Testes usam apenas CPFs sintéticos válidos.

## 5. Conciliação (`reconcile-appointment-payments`)

Função separada, **só por POST com `x-reconcile-token`**, pensada para agendador (a cada ~5 min). **Não está agendada.**
Nunca cria cobrança (há teste que garante zero `POST` ao Asaas).

| Situação | Ação |
|---|---|
| Cobrança interna sem id do provedor | Busca por `externalReference`. 0 → abre revisão e **continua bloqueando**; >1 → revisão; 1 com valor/referência iguais → vincula e recupera QR; diferente → divergência financeira |
| Cobrança sem QR | Busca o QR com o id já gravado |
| Evento perdido | Lê o status real e aplica pela **mesma** função do webhook (`pay_apply_webhook_event`) com id determinístico `recon:<cobrança>:<status>` (idempotente) |
| Valor diferente do esperado | Revisão `divergencia_financeira` |
| Reserva vencida e não paga | Exclui a cobrança no Asaas → aplica `PAYMENT_DELETED` → só então `pay_release_expired_hold`. Exclusão recusada/timeout: confere o status real, abre revisão `falha_cancelamento_hold`, **não libera**. Sem id: revisão `hold_expirado_sem_id`, horário mantido |
| Cobrança no Asaas com nossa referência e desconhecida no banco | Revisão `orfa_no_provedor` (só registra) |

Ausência no Asaas **não** é prova de não-criação (consistência eventual, timeout), por isso nunca vira cancelamento
automático. Limites: 50 itens por etapa, 5 páginas de varredura de órfãs.

### Revisão manual do Owner

```sql
select * from public.pay_open_reviews();                       -- pendências abertas
select public.pay_resolve_review(<id numérico da pendência>, 'o que foi conferido e decidido');
```

Pagamento tardio sobre horário já ocupado, estorno em andamento e divergência financeira abrem revisão automaticamente
por gatilho. Nenhuma dessas ações libera dinheiro nem horário sozinha.

## 6. Reservas e agenda

Reserva temporária com prazo configurável (`PAYMENT_HOLD_MINUTES`); `pay_release_expired_hold` só libera se a cobrança
estiver `cancelado`, o prazo vencido, a solicitação ainda `recebida`/`em_contato` e não houver outra cobrança aberta.
Pagamento tardio nunca confirma horário ocupado: vira `pago_sem_atendimento` + revisão. O fluxo de atendimento gratuito
não foi alterado (a interface só aparece para pedidos aguardando e só com a chave de exibição ligada).

## 7. Webhook (preparado, NÃO cadastrado)

Cabeçalho `asaas-access-token` comparado em tempo constante com `ASAAS_WEBHOOK_TOKEN` (≠ API Key). Valida evento, valor e
referência; id de evento único e persistido antes de qualquer efeito; reentregas e duplicatas são inofensivas; eventos fora
de ordem não regridem estado; falhas ficam para a conciliação. Cadastro previsto (**somente com nova autorização**):
URL da função `asaas-appointment-webhook`, `sendType: SEQUENTIALLY`, eventos `PAYMENT_CREATED`, `PAYMENT_AUTHORIZED`,
`PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_DELETED`, `PAYMENT_REFUNDED`,
`PAYMENT_REFUND_IN_PROGRESS`, `PAYMENT_CHARGEBACK_REQUESTED`, `authToken` = `ASAAS_WEBHOOK_TOKEN`.

## 8. Interface no Meu Potala

`outputs/js/conta/pagamentos/painel-pix.js` (módulo puro, HTML escapado) ligado em `atendimentos.js` e `app.js`.
Chave de exibição `PAGAMENTOS_PIX_ATIVO` em `pagamentos/config.js`: **`false`**. Desligada: a tela é idêntica à anterior, não
há leitura financeira nem chamada ao servidor. Ligada: mostra atendimento, horário, valor, situação, QR Code, Pix Copia e
Cola, instruções de recuperação ("não pague de novo") e formulário de pagador só quando o servidor pede. A única porta para
gerar cobrança é o envio do formulário por clique; a mesma chave de idempotência é reaproveitada até o Pix chegar.
Ligar essa chave **não** libera cobrança: as três travas do servidor continuam valendo.

## 9. Migration e reversão (preparadas, NÃO aplicadas)

- `supabase/migrations/202611250003_pay02_pagador_reconciliacao.sql` (aborta se os objetos do PAY-01 não existirem).
- `supabase/rollbacks/202611250003_rollback_pay02_pagador_reconciliacao.sql`.
- Ordem futura: aplicar primeiro no LAB, rodar testes de RLS/privilégios, só depois no oficial, com autorização.
- Nunca `db push` nem `migration repair`.

## 10. Plano de ativação real controlada (aguarda autorização do Owner)

Pré-requisitos: PR #116 e esta PR aprovadas; política de privacidade revisada; migrations aplicadas no LAB e validadas.

1. **LAB, sem dinheiro**: aplicar as migrations do PAY-01 e PAY-02; rodar suíte de banco/RLS; `charges_enabled` segue `false`.
2. **Segredos**: Owner cadastra os segredos (seção 2) mantendo `PAYMENTS_ENABLED` ausente. Nada responde.
3. **Webhook** (autorização própria): cadastrar na conta real com o token exclusivo; conferir entrega de um evento de teste
   do painel do Asaas e a rejeição de token inválido.
4. **Janela de teste**: um único cliente controlado (conta do próprio Owner), um serviço de valor mínimo definido pelo Owner
   (R$ 5,00 ou o menor permitido pelo Asaas), `PAYMENT_HOLD_MINUTES` curto.
5. Abrir as três travas **nessa ordem**: `PAYMENTS_ENABLED`, `PAYMENTS_PRODUCTION_ACK`, `charges_enabled`; ligar
   `PAGAMENTOS_PIX_ATIVO` apenas numa publicação de pré-visualização restrita.
6. Gerar **uma** cobrança por clique, conferir: valor, `externalReference`, QR, Copia e Cola, linha no banco, ausência de
   documento em logs. Pagar. Conferir webhook `RECEIVED`, estado `recebido`, tempo de compensação e a data de pagamento
   (contrato a confirmar, ponto R2).
7. Repetir com: reentrega de evento, expiração sem pagar (exclusão da cobrança e liberação do horário), estorno do teste.
8. Rodar a conciliação manualmente (POST com token) e conferir contadores e revisões.
9. **Reversão imediata a qualquer anomalia**: `update pay_runtime_settings set charges_enabled=false`; remover
   `PAYMENTS_ENABLED`; excluir o webhook no Asaas; resolver revisões abertas. Só então investigar.
10. Só depois do relatório da validação e de nova autorização: ativar para clientes e agendar a conciliação.

Pontos do contrato do Asaas a confirmar na etapa 6/7 (foram implementados pela documentação, não por teste real):
filtros de `GET /customers` e `GET /payments` (`externalReference`, `dateCreated[ge]`), formato exato da resposta do
`DELETE /payments/{id}` (`deleted: true`), nomes de status, campo de data de pagamento, e se juros/multa alteram o valor
(o que a conciliação trataria como divergência).

## 11. Riscos remanescentes

- Janela residual: Asaas responde, mas o id não chega a ser gravado → recuperável pela conciliação (por referência) e por
  revisão manual; não elimina 100% o risco de cobrança duplicada em falha dupla.
- Concorrência foi simulada (um processo); sem teste de carga contra Postgres real com conexões paralelas.
- Conciliação ainda não agendada; sem alerta automático para revisões abertas (hoje é consulta do Owner).
- Endpoints de listagem/exclusão validados apenas por documentação.
- Política de privacidade pública ainda não cita o Asaas.
