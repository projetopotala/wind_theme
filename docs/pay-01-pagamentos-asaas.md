# PAY-01 — Base de pagamentos de atendimentos (Asaas)

Estado: **código e migration preparados; nada aplicado, nada publicado, nenhuma cobrança real**. Produção do Asaas está bloqueada no código.

## 1. Diagnóstico do fluxo atual de atendimentos (main `2713724`)
- A solicitação nasce em `appointment_requests` (`recebida` → `em_contato` → `encerrada`/`cancelada`), com chave de idempotência única.
- O cliente escolhe um horário de `appointment_slots`; `submit_appointment_slot_request` põe o slot em `held` (reservado), preso à solicitação por índice único (`appointment_requests_active_slot_uidx`). **A reserva hoje não expira.**
- Quem confirma é o profissional/Owner (`confirm_appointment_request_reservation`): a solicitação vira `encerrada` e o slot `booked`. Cancelar libera o slot.
- As ofertas ficam em `op_records` (`activity_offerings`); **não existe preço em nenhum lugar** para atendimentos.
- Reaproveitado: solicitações, slots, índice único do horário, `requester_user_id` e `appointment_slot_id`. Nada foi alterado.
- Referência (não tocada): PR #79 (cursos via Asaas Sandbox, Checkout) e recebimento manual de cursos (migration 202611160008).

## 2. Arquitetura escolhida
Módulo financeiro **isolado e aditivo**, com estado financeiro separado do agendamento.

| Peça | Arquivo |
|---|---|
| Máquina de estados (única fonte no código) | `supabase/functions/_shared/pagamentos/estados.ts` |
| Configuração (Sandbox; produção bloqueada) | `.../_shared/pagamentos/config.ts` |
| Cliente HTTP Asaas (fetch injetado, timeout, correlation id) | `.../_shared/pagamentos/asaas-client.ts` |
| Webhook (token, idempotência, normalização) | `.../_shared/pagamentos/webhook.ts` + `asaas-appointment-webhook/` |
| Criação do Pix | `create-appointment-payment/` |
| Banco | `supabase/migrations/202611250002_pay01_pagamentos_atendimento.sql` (+ rollback em `supabase/rollbacks/`) |
| Textos do Meu Potala (não ligado a telas) | `outputs/js/conta/pagamentos/apresentacao.js` |

Por que Pix cobrado por `/payments` + QR e não Checkout hospedado: o requisito é QR Code e Copia e Cola **no portal**, e evita dados de cartão nos nossos servidores (cartão fica para fase própria, com mecanismo PCI).

Decisões de segurança:
- Preço só no servidor (`appointment_service_prices`, nasce **vazia e inativa**; nenhum preço real foi cadastrado). O navegador envia só `request_id` e `idempotency_key`; qualquer outro campo é recusado.
- Toda função financeira (`pay_*`) é `SECURITY DEFINER`, `search_path` fixo e executável **somente por `service_role`**. Nada para `anon`/`authenticated`.
- Cliente lê só as próprias cobranças (RLS por `auth.uid()`), em colunas sem ids internos do provedor; não escreve.
- Valor, moeda, vínculo e id do provedor são imutáveis (gatilho). Eventos: trilha append-only com id único.
- Nenhuma chave no banco nem no frontend (teste varre `outputs/`).

## 3. Estados financeiros e equivalência com o Asaas
Estados: `criando`, `aguardando_pagamento`, `em_processamento`, `confirmado`, `recebido`, `vencido`, `cancelado`, `estornado`, `em_contestacao`, `divergente`.

| Evento Asaas | Estado |
|---|---|
| PAYMENT_CREATED / RESTORED | aguardando_pagamento |
| AWAITING_RISK_ANALYSIS / APPROVED_BY_RISK_ANALYSIS / AUTHORIZED | em_processamento |
| PAYMENT_CONFIRMED | confirmado (pago, saldo ainda indisponível) |
| PAYMENT_RECEIVED | recebido |
| PAYMENT_OVERDUE | vencido |
| PAYMENT_DELETED / REPROVED_BY_RISK_ANALYSIS / CREDIT_CARD_CAPTURE_REFUSED | cancelado |
| PAYMENT_REFUNDED | estornado |
| CHARGEBACK_REQUESTED / DISPUTE / AWAITING_CHARGEBACK_REVERSAL | em_contestacao |
| PARTIALLY_REFUNDED / RECEIVED_IN_CASH_UNDONE | divergente |
| demais (visualizações, split, negativação, antecipação…) | só registrados |

Regras: nunca uma flag única "pago"; evento antigo/duplicado **não reverte** estado mais adiantado (precedência, não "último evento vence"); dinheiro chegando em cobrança cancelada, salto impossível, estorno parcial e valor diferente viram `divergente` (reconciliação manual). A mesma tabela existe em TypeScript e em SQL (`pay_next_state`); um teste compara as duas em **todas** as combinações.

## 4. Webhook
Autenticação: header `asaas-access-token` comparado em tempo constante com `ASAAS_WEBHOOK_TOKEN` (32–255 caracteres, nunca igual à API Key). Entrega "at least once": o id do evento (`evt_…`) é único no banco e a aplicação é transacional (trava por evento + trava da cobrança). Respostas: 401 sem token; 400/413 corpo inválido; **200** para evento gravado (inclusive duplicado, obsoleto, sem cobrança correspondente ou divergente); 503 em falha do banco ou integração desligada (o Asaas reenvia). A cobrança é localizada pelo id do Asaas ou por `externalReference` (`appointment:<id>`); valor, meio e referência são conferidos contra o que o servidor gravou (juros/multa aceitos só se `originalValue` for o esperado). Nenhum webhook foi cadastrado em conta alguma.

## 5. Agendamento (propostas e o que já está feito)
Feito na PAY-01 (sem alterar o agendamento): prazo da reserva por cobrança (`hold_expires_at`, limitado ao início do horário); `reservation_outcome` (`elegivel` / `pagamento_tardio` / `revisao`); `pay_list_expired_holds()` (somente leitura); `pay_payment_allows_confirmation(request)` (só `recebido` + reserva válida).
Regra inicial adotada: **só `recebido` libera a confirmação** (decisão pendente para `confirmado`).
Fica para a PAY-02, atrás de flag: exigir o pagamento na confirmação, liberar o horário vencido (cancelar solicitação + cancelar a cobrança no Asaas), reembolso de pagamento tardio, falha de confirmação após pagamento. Atendimentos gratuitos, fluxo com aprovação profissional e usuários reais **não foram tocados**.

## 5.1 Criação da cobrança sem duplicidade (correção B1)
Ordem: (1) reserva interna idempotente (`criando`, sem id externo); (2) POST da cobrança no Asaas; (3) **grava na hora o `provider_payment_id`** (2 tentativas); (4) só então busca o QR Code. Falha no QR (4xx, 5xx, timeout) **preserva** a cobrança: a linha fica `aguardando_pagamento` com `pix_ready = false` e repetir a chamada (mesma chave ou outra) **só recupera o QR**, sem novo POST.

| Situação | Estado/efeito |
|---|---|
| Criando, sem id externo | `criando`. Também é o estado de **resultado inconclusivo** (timeout/5xx/408/resposta ruim no POST, id não gravado). Bloqueia nova cobrança (índice) até reconciliação. |
| Cobrança criada, QR indisponível | `aguardando_pagamento` + `pix_ready = false` (sem estado novo). |
| Aguardando pagamento | `aguardando_pagamento` + `pix_ready = true`. |
| Divergência | `divergente` (terminal até reconciliação manual). |

Cancelamento interno (`pay_fail_creation`) só com **prova de que nada foi criado**: falha antes de enviar o POST da cobrança, ou 4xx conclusivo (exceto 408) do próprio POST. O banco recusa cancelar linha que já tem id externo. O índice de "cobrança aberta" inclui `vencido` (um Pix vencido ainda pode ser pago): só `PAYMENT_DELETED` confirmado pelo Asaas ou o cancelamento comprovado o libera.

**Janela que continua existindo:** entre a resposta do Asaas e a gravação interna do id (queda do processo, falha do banco). Nada a elimina por completo. O que existe: a linha permanece `criando` e **bloqueia** nova cobrança; o webhook `PAYMENT_CREATED` vincula o id por `externalReference` (o webhook do Sandbox **deve assinar `PAYMENT_CREATED`**); o id é registrado em log (`pay_id_externo_nao_persistido`) quando a falha é detectada. Reconciliação ativa (`GET` por `externalReference`) fica para a PAY-02 e é **pré-requisito para ativar pagamentos**.

## 5.2 Estorno em andamento (R4) e eventos de outras famílias (R8)
- `PAYMENT_REFUND_IN_PROGRESS` não muda o estado financeiro nem o histórico, mas move `reservation_outcome` para `revisao`: `pay_payment_allows_confirmation` passa a falso. `PAYMENT_REFUND_DENIED` não devolve a elegibilidade sozinho. Nenhuma política de reembolso foi decidida.
- Evento autenticado e válido de outra família (`event` sem prefixo `PAYMENT_`, ex.: transferência) responde 200 `{resultado:"ignorado"}` e registra só tipo e id no log. Malformado, sem token ou `PAYMENT_*` sem `payment` continuam recusados (400/401).

## 5.3 Data do pagamento (R2) — pendência do Sandbox
A documentação oficial mostra no objeto `payment` os campos `confirmedDate`, `paymentDate`, `clientPaymentDate` e `creditDate` com exemplos **só de data** (AAAA-MM-DD) e o envelope traz `dateCreated` (data e hora do evento). Como o prazo da reserva é de minutos, a data sem hora não decide "pago dentro do prazo". **Nada foi alterado:** a política continua usando o momento do processamento. Validar no Sandbox o que o Pix realmente envia (granularidade e fuso) antes de qualquer mudança, que exige aprovação do Owner. A documentação oficial descreve o fluxo do Pix como `PAYMENT_CREATED → PAYMENT_RECEIVED` (com atraso: `→ PAYMENT_OVERDUE → PAYMENT_RECEIVED`), sem `PAYMENT_CONFIRMED`.

## 6. Variáveis de ambiente (nomes; nenhum valor aqui)
`PAYMENTS_ENABLED` (padrão desligado), `ASAAS_ENV` (`sandbox`), `ASAAS_API_KEY` (Sandbox), `ASAAS_WEBHOOK_TOKEN`, `PAYMENT_HOLD_MINUTES` (30; 5–1440), `PAYMENT_ALLOWED_ORIGINS`. Somente como secrets das Edge Functions.

## 7. Pendências para o Sandbox
- Conta e chave **Sandbox** (não fornecidas); conferir campos exatos de `POST /customers` e `POST /payments` e os nomes dos status em `GET /payments/{id}` (a página de status não abriu durante a PAY-01; o mapa `STATUS_ASAAS_PARA_ESTADO` está marcado "a confirmar").
- Cliente Asaas exige CPF/CNPJ: **decisão LGPD** de onde coletar e guardar (hoje `dadosCliente` retorna vazio e a função responde 422 pedindo o cadastro).
- Chave Pix da conta Sandbox; cadastrar o webhook no Sandbox com `authToken`; testar fila, reentrega e ordem real dos eventos.
- Validar que `value` inclui juros/multa e `originalValue` o valor original.

## 8. Pendências para ativar a chave real (nada disso foi feito)
Decisão do Owner sobre: preços reais por oferta; política de reembolso e de pagamento tardio; se `confirmado` libera ou só `recebido`; prazo da reserva; CPF/LGPD e termos; conta de produção, chave Pix e webhook de produção; liberar produção no código (hoje bloqueada) em PR própria; aplicar a migration manualmente (SQL Editor, uma transação; **sem `db push` nem `migration repair`**, histórico divergente) e registrá-la em regularização separada.

## 9. Plano da PAY-02
1. Sandbox real ponta a ponta (cliente → Pix → webhook → `recebido`).
2. Tela no Meu Potala usando `apresentacao.js`, atrás de flag, com leitura via RLS e QR.
3. Job de expiração (`pay_list_expired_holds`) liberando horário e cancelando cobrança.
4. Ligar `pay_payment_allows_confirmation` à confirmação, atrás de flag.
5. Reconciliação (`GET /payments`) e painel do Owner para `divergente`/`pagamento_tardio`/estornos.
6. Cartão (mecanismo PCI) e admin de preços.

## 10. Limites desta entrega
Testes rodam em PGlite (sem concorrência real entre conexões; a serialização usa lock de transação, validado só por leitura do código) e com `fetch` simulado (nenhuma resposta real do Asaas foi vista nem inventada). Nenhuma requisição foi feita a nenhuma API do Asaas.
